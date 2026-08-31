'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './growth';

function fail(message: string): ActionResult {
  return { ok: false, message };
}

async function context() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: year } = await supabase
    .schema('core')
    .from('academic_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  return {
    supabase,
    userId: auth.user?.id ?? null,
    yearId: (year as unknown as { id: string } | null)?.id ?? null,
  };
}

/**
 * Log a completed CPD activity against one's own record.
 *
 * The hours submitted are a *claim*. They become credit only when a reviewer
 * verifies the record, which is why nothing here writes `credited_hours` — the
 * database would refuse it anyway, since the status machine will not create a
 * verified record from nothing.
 */
export async function recordCpd(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId, yearId } = await context();
  if (!userId || !yearId) return fail('Not signed in, or no academic year is current.');

  const title = String(formData.get('title') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '');
  const sourceTypeId = String(formData.get('sourceTypeId') ?? '');
  const activityFrom = String(formData.get('activityFrom') ?? '');
  const activityTo = String(formData.get('activityTo') ?? '') || activityFrom;
  const activityRuleId = String(formData.get('activityRuleId') ?? '');
  const providerName = String(formData.get('providerName') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const hoursRaw = String(formData.get('hours') ?? '').trim();

  if (title.length < 3) return fail('Give the activity a title of at least 3 characters.');
  if (!categoryId || !sourceTypeId) return fail('Choose a CPD domain and a source.');
  if (!activityFrom) return fail('Enter the date the activity took place.');

  const { data: profile } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select('id, school_id')
    .eq('user_id', userId)
    .maybeSingle();
  const teacher = profile as unknown as { id: string; school_id: string } | null;
  if (!teacher) return fail('No teacher profile is linked to this account.');

  const { data: sourceType } = await supabase
    .schema('compliance')
    .from('cpd_source_type')
    .select('source_class, counts_toward_requirement, display_name')
    .eq('id', sourceTypeId)
    .maybeSingle();
  const source = sourceType as unknown as {
    source_class: string;
    counts_toward_requirement: boolean;
    display_name: string;
  } | null;
  if (!source) return fail('That CPD source is not configured.');

  // An activity rule supplies its own hour credit; the teacher does not get to
  // choose it. This is what keeps "do not invent activity-credit hours" true at
  // the point of entry rather than only in the configuration table.
  let hours: number;
  if (activityRuleId) {
    const { data: rule } = await supabase
      .schema('compliance')
      .from('cpd_activity_rule')
      .select('hour_credit')
      .eq('id', activityRuleId)
      .maybeSingle();
    const found = rule as unknown as { hour_credit: number } | null;
    if (!found) return fail('That activity rule is not configured.');
    hours = Number(found.hour_credit);
  } else {
    hours = Number(hoursRaw);
    if (!Number.isFinite(hours) || hours <= 0) return fail('Enter the hours attended.');
  }

  const { data: version } = await supabase
    .schema('compliance')
    .rpc('requirement_version_for_year', {
      p_school_id: teacher.school_id,
      p_academic_year_id: yearId,
    });
  const versionRow = (Array.isArray(version) ? version[0] : version) as { id: string } | null;

  const { error } = await supabase
    .schema('compliance')
    .from('cpd_record')
    .insert({
      school_id: teacher.school_id,
      teacher_profile_id: teacher.id,
      academic_year_id: yearId,
      title,
      description: description || null,
      category_id: categoryId,
      source_type_id: sourceTypeId,
      source_class: source.source_class,
      provider_name: providerName || source.display_name,
      activity_from: activityFrom,
      activity_to: activityTo,
      duration_hours: hours,
      claimed_hours: hours,
      hour_basis: activityRuleId ? 'activity_rule' : 'attendance',
      activity_rule_id: activityRuleId || null,
      requirement_version_id: versionRow?.id ?? null,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      created_by: userId,
    });

  if (error) return fail(error.message);

  revalidatePath('/cpd');
  revalidatePath('/compliance');
  return {
    ok: true,
    message: source.counts_toward_requirement
      ? `Submitted for verification: ${hours} hours. It counts toward the requirement once verified.`
      : `Submitted for verification: ${hours} hours. This source is not currently classified as counting toward the CBSE requirement, so the hours will be recorded but not counted.`,
  };
}

/**
 * Verify a submitted CPD record and credit hours.
 *
 * Credited hours may be reduced below the claim — a reviewer who can see only
 * four hours of attendance should credit four — but never inflated; the schema
 * enforces that.
 */
export async function verifyCpdRecord(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const recordId = String(formData.get('recordId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  const creditRaw = String(formData.get('creditedHours') ?? '').trim();

  if (!recordId) return fail('No CPD record specified.');

  const { data: record } = await supabase
    .schema('compliance')
    .from('cpd_record')
    .select('claimed_hours, status')
    .eq('id', recordId)
    .maybeSingle();
  const found = record as unknown as { claimed_hours: number; status: string } | null;
  if (!found) return fail('That CPD record is not visible to you.');
  if (found.status !== 'submitted')
    return fail(`This record is ${found.status}, not awaiting review.`);

  if (decision === 'verify') {
    const credited = creditRaw ? Number(creditRaw) : Number(found.claimed_hours);
    if (!Number.isFinite(credited) || credited < 0) return fail('Enter the hours to credit.');
    if (credited > Number(found.claimed_hours)) {
      return fail('Credited hours cannot exceed the hours claimed.');
    }
    const { error } = await supabase
      .schema('compliance')
      .from('cpd_record')
      .update({
        status: 'verified',
        credited_hours: credited,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
      })
      .eq('id', recordId);
    if (error) return fail(error.message);
    revalidatePath('/compliance');
    revalidatePath('/cpd');
    return { ok: true, message: `Verified. ${credited} hours credited.` };
  }

  if (note.length < 10) {
    return fail(
      'Returning or rejecting a record needs a written reason of at least 10 characters.',
    );
  }

  const { error } = await supabase
    .schema('compliance')
    .from('cpd_record')
    .update({
      status: decision === 'reject' ? 'rejected' : 'returned_for_clarification',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq('id', recordId);
  if (error) return fail(error.message);

  revalidatePath('/compliance');
  revalidatePath('/cpd');
  return {
    ok: true,
    message:
      decision === 'reject' ? 'Record rejected.' : 'Returned to the teacher for clarification.',
  };
}
