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

async function assessmentContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  yearId: string,
) {
  const { data } = await supabase
    .schema('sqaaf')
    .from('self_assessment')
    .select('id, school_id, version_id, status')
    .eq('academic_year_id', yearId)
    .maybeSingle();
  return data as unknown as {
    id: string;
    school_id: string;
    version_id: string;
    status: string;
  } | null;
}

/** Rate one standard, with the rationale CBSE's own framing requires. */
export async function rateStandard(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId, yearId } = await context();
  if (!userId || !yearId) return fail('Not signed in, or no academic year is current.');

  const standardId = String(formData.get('standardId') ?? '');
  const levelId = String(formData.get('levelId') ?? '');
  const aspirationalId = String(formData.get('aspirationalLevelId') ?? '');
  const priority = String(formData.get('priority') ?? '');
  const rationale = String(formData.get('rationale') ?? '').trim();

  if (!standardId || !levelId) return fail('Choose the level this standard is currently at.');
  if (rationale.length < 20) {
    return fail(
      'Give a rationale of at least 20 characters. A score without its reasoning is not auditable.',
    );
  }

  const assessment = await assessmentContext(supabase, yearId);
  if (!assessment) return fail('No SQAAF self-assessment has been opened for this year.');

  const { error } = await supabase
    .schema('sqaaf')
    .from('standard_rating')
    .upsert(
      {
        school_id: assessment.school_id,
        self_assessment_id: assessment.id,
        standard_id: standardId,
        level_id: levelId,
        aspirational_level_id: aspirationalId || null,
        priority: priority || null,
        rationale,
        rated_by: userId,
        rated_at: new Date().toISOString(),
      },
      { onConflict: 'self_assessment_id,standard_id' },
    );

  if (error) return fail(error.message);

  revalidatePath('/sqaaf');
  return { ok: true, message: 'Rating recorded.' };
}

/**
 * Map an existing platform record to a SQAAF standard.
 *
 * Collect once, use twice: this creates a reference, never a copy. The CPD
 * hours, competency level or evidence file stay where they are.
 */
export async function mapEvidence(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId, yearId } = await context();
  if (!userId || !yearId) return fail('Not signed in.');

  const standardId = String(formData.get('standardId') ?? '');
  const kind = String(formData.get('kind') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  if (!standardId) return fail('No standard specified.');

  const assessment = await assessmentContext(supabase, yearId);
  if (!assessment) return fail('No SQAAF self-assessment has been opened for this year.');

  const column = {
    cpd: 'cpd_record_id',
    evidence: 'evidence_id',
    competency: 'verified_competency_id',
    kpi: 'teacher_kpi_id',
    plan_item: 'plan_item_id',
  }[kind];

  if (!column && kind !== 'aggregate') return fail('Choose what kind of record to map.');
  if (column && !targetId) return fail('Choose the record to map.');
  if (kind === 'aggregate' && note.length < 10) {
    return fail('An aggregate mapping needs a note describing what it summarises.');
  }

  const row: Record<string, unknown> = {
    school_id: assessment.school_id,
    self_assessment_id: assessment.id,
    standard_id: standardId,
    mapped_by: userId,
    note: note || null,
  };
  if (column) row[column] = targetId;
  else row.aggregate_note = note;

  const { error } = await supabase.schema('sqaaf').from('evidence_map').insert(row);
  if (error) {
    return fail(
      error.code === '23505' ? 'That record is already mapped to this standard.' : error.message,
    );
  }

  revalidatePath('/sqaaf');
  return { ok: true, message: 'Evidence mapped to the standard.' };
}

/** Record a gap: a standard the school cannot currently evidence. */
export async function recordEvidenceGap(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId, yearId } = await context();
  if (!userId || !yearId) return fail('Not signed in.');

  const standardId = String(formData.get('standardId') ?? '');
  const description = String(formData.get('description') ?? '').trim();
  const responsible = String(formData.get('responsibleUserId') ?? '');

  if (!standardId) return fail('No standard specified.');
  if (description.length < 15) return fail('Describe the gap in at least 15 characters.');

  const assessment = await assessmentContext(supabase, yearId);
  if (!assessment) return fail('No SQAAF self-assessment has been opened for this year.');

  const { error } = await supabase
    .schema('sqaaf')
    .from('evidence_gap')
    .upsert(
      {
        school_id: assessment.school_id,
        self_assessment_id: assessment.id,
        standard_id: standardId,
        description,
        responsible_user_id: responsible || null,
        identified_by: userId,
      },
      { onConflict: 'self_assessment_id,standard_id' },
    );

  if (error) return fail(error.message);

  revalidatePath('/sqaaf');
  return { ok: true, message: 'Evidence gap recorded.' };
}

/** Create an improvement action against a standard. */
export async function createImprovementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId, yearId } = await context();
  if (!userId || !yearId) return fail('Not signed in.');

  const standardId = String(formData.get('standardId') ?? '');
  const priority = String(formData.get('priority') ?? 'medium');
  const area = String(formData.get('areaOfImprovement') ?? '').trim();
  const action = String(formData.get('proposedAction') ?? '').trim();
  const convenor = String(formData.get('convenorUserId') ?? '');
  const targetDate = String(formData.get('targetDate') ?? '');

  if (!standardId) return fail('No standard specified.');
  if (area.length < 10) return fail('Name the area of improvement in at least 10 characters.');
  if (action.length < 15) return fail('Describe the proposed action in at least 15 characters.');

  const assessment = await assessmentContext(supabase, yearId);
  if (!assessment) return fail('No SQAAF self-assessment has been opened for this year.');

  const { data: gap } = await supabase
    .schema('sqaaf')
    .from('evidence_gap')
    .select('id')
    .eq('self_assessment_id', assessment.id)
    .eq('standard_id', standardId)
    .maybeSingle();

  const { data: rating } = await supabase
    .schema('sqaaf')
    .from('standard_rating')
    .select('level_id, aspirational_level_id')
    .eq('self_assessment_id', assessment.id)
    .eq('standard_id', standardId)
    .maybeSingle();
  const levels = rating as unknown as {
    level_id: string;
    aspirational_level_id: string | null;
  } | null;

  const { error } = await supabase
    .schema('sqaaf')
    .from('improvement_action')
    .insert({
      school_id: assessment.school_id,
      self_assessment_id: assessment.id,
      standard_id: standardId,
      evidence_gap_id: (gap as unknown as { id: string } | null)?.id ?? null,
      current_level_id: levels?.level_id ?? null,
      aspirational_level_id: levels?.aspirational_level_id ?? null,
      priority,
      area_of_improvement: area,
      proposed_action: action,
      convenor_user_id: convenor || null,
      target_date: targetDate || null,
      status: 'proposed',
      created_by: userId,
    });

  if (error) return fail(error.message);

  revalidatePath('/sqaaf');
  return { ok: true, message: 'Improvement action added to the plan.' };
}

/**
 * Move an improvement action along its state machine.
 *
 * Completion needs a reviewer: the owner marking their own work done is the
 * same conflict the platform refuses everywhere else.
 */
export async function advanceImprovementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const actionId = String(formData.get('actionId') ?? '');
  const next = String(formData.get('nextStatus') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  if (!actionId || !next) return fail('No action or target status specified.');

  const update: Record<string, unknown> = { status: next };

  if (next === 'completed' || next === 'abandoned') {
    if (next === 'abandoned' && note.length < 10) {
      return fail('Abandoning an action needs a written reason of at least 10 characters.');
    }
    update.reviewed_by = userId;
    update.reviewed_at = new Date().toISOString();
    if (note) update.review_note = note;
    if (next === 'completed') update.completed_at = new Date().toISOString();
  } else if (note) {
    update.review_note = note;
  }

  const { error } = await supabase
    .schema('sqaaf')
    .from('improvement_action')
    .update(update)
    .eq('id', actionId);

  if (error) return fail(error.message);

  revalidatePath('/sqaaf');
  return { ok: true, message: `Action moved to ${next.replace(/_/g, ' ')}.` };
}
