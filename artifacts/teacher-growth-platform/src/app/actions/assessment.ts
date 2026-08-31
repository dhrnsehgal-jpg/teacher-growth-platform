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

/** Resolves a proficiency level by ordinal WITHIN a given scale. */
async function levelInScaleOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  referenceLevelId: string,
  ordinal: number,
): Promise<string | null> {
  const { data: ref } = await supabase
    .schema('competency')
    .from('proficiency_level')
    .select('scale_id')
    .eq('id', referenceLevelId)
    .maybeSingle();
  if (!ref) return null;

  const { data: level } = await supabase
    .schema('competency')
    .from('proficiency_level')
    .select('id')
    .eq('scale_id', (ref as unknown as { scale_id: string }).scale_id)
    .eq('ordinal', ordinal)
    .maybeSingle();
  return (level as unknown as { id: string } | null)?.id ?? null;
}

/** Finds or creates the teacher's assessment record for the open cycle. */
async function ensureTeacherAssessment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teacherProfileId: string,
  yearId: string,
): Promise<{ id: string; schoolId: string } | null> {
  const { data: profile } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select('school_id')
    .eq('id', teacherProfileId)
    .maybeSingle();
  if (!profile) return null;
  const schoolId = (profile as unknown as { school_id: string }).school_id;

  const { data: cycle } = await supabase
    .schema('assessment')
    .from('cycle')
    .select('id')
    .eq('academic_year_id', yearId)
    .in('status', ['open', 'in_review'])
    .order('opens_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cycle) return null;
  const cycleId = (cycle as unknown as { id: string }).id;

  const { data: existing } = await supabase
    .schema('assessment')
    .from('teacher_assessment')
    .select('id')
    .eq('cycle_id', cycleId)
    .eq('teacher_profile_id', teacherProfileId)
    .maybeSingle();
  if (existing) {
    return { id: (existing as unknown as { id: string }).id, schoolId };
  }

  const { data: created, error } = await supabase
    .schema('assessment')
    .from('teacher_assessment')
    .insert({
      school_id: schoolId,
      cycle_id: cycleId,
      teacher_profile_id: teacherProfileId,
      status: 'not_started',
    })
    .select('id')
    .single();
  if (error) return null;
  return { id: (created as unknown as { id: string }).id, schoolId };
}

/**
 * Records a rating from one source.
 *
 * Ratings are append-only, so an amendment inserts a new row and marks the
 * previous one superseded — the earlier judgement and its reasoning stay on the
 * record.
 */
async function recordRating(input: {
  teacherProfileId: string;
  competencyId: string;
  source: 'self' | 'supervisor' | 'observation';
  ordinal: number;
  rationale: string;
  observationId?: string;
}): Promise<ActionResult> {
  if (input.rationale.trim().length < 15) {
    return fail(
      'Give a reason of at least 15 characters. A rating without reasoning cannot be discussed.',
    );
  }

  const { supabase, userId, yearId } = await context();
  if (!userId || !yearId) return fail('Not signed in, or no current academic year.');

  const ta = await ensureTeacherAssessment(supabase, input.teacherProfileId, yearId);
  if (!ta) return fail('No open assessment cycle for this year.');

  // The level must come from the scale this competency is targeted on.
  const { data: targets } = await supabase.schema('competency').rpc('resolve_targets', {
    p_teacher_profile_id: input.teacherProfileId,
    p_academic_year_id: yearId,
  });
  const target = (
    targets as unknown as { competency_id: string; target_level_id: string }[] | null
  )?.find((t) => t.competency_id === input.competencyId);
  if (!target) return fail('This competency is not expected of this teacher.');

  const levelId = await levelInScaleOf(supabase, target.target_level_id, input.ordinal);
  if (!levelId) return fail('That level does not exist on this competency scale.');

  // Supersede any standing rating from the same source.
  const { data: previous } = await supabase
    .schema('assessment')
    .from('competency_rating')
    .select('id')
    .eq('teacher_assessment_id', ta.id)
    .eq('competency_id', input.competencyId)
    .eq('source', input.source)
    .is('superseded_by_id', null);

  const { data: created, error } = await supabase
    .schema('assessment')
    .from('competency_rating')
    .insert({
      school_id: ta.schoolId,
      teacher_assessment_id: ta.id,
      competency_id: input.competencyId,
      source: input.source,
      level_id: levelId,
      rationale: input.rationale.trim(),
      observation_id: input.observationId ?? null,
      rated_by: userId,
    })
    .select('id')
    .single();
  if (error) return fail(error.message);

  const newId = (created as unknown as { id: string }).id;
  for (const p of (previous ?? []) as unknown as { id: string }[]) {
    await supabase
      .schema('assessment')
      .from('competency_rating')
      .update({ superseded_by_id: newId })
      .eq('id', p.id);
  }

  const stamp =
    input.source === 'self'
      ? { status: 'self_submitted', self_submitted_at: new Date().toISOString() }
      : { status: 'supervisor_submitted', supervisor_submitted_at: new Date().toISOString() };
  await supabase.schema('assessment').from('teacher_assessment').update(stamp).eq('id', ta.id);

  revalidatePath('/self-assessment');
  revalidatePath(`/assess/${input.teacherProfileId}`);
  revalidatePath('/dashboard');
  return {
    ok: true,
    message:
      (previous ?? []).length > 0
        ? 'Rating recorded. Your previous rating is superseded but stays on the record.'
        : 'Rating recorded.',
  };
}

export async function submitSelfRating(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const { data: profile } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile) return fail('No teacher profile for this account.');

  return recordRating({
    teacherProfileId: (profile as unknown as { id: string }).id,
    competencyId: String(formData.get('competencyId') ?? ''),
    source: 'self',
    ordinal: Number(formData.get('ordinal') ?? 0),
    rationale: String(formData.get('rationale') ?? ''),
  });
}

export async function submitSupervisorRating(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return recordRating({
    teacherProfileId: String(formData.get('teacherProfileId') ?? ''),
    competencyId: String(formData.get('competencyId') ?? ''),
    source: 'supervisor',
    ordinal: Number(formData.get('ordinal') ?? 0),
    rationale: String(formData.get('rationale') ?? ''),
  });
}

/** Records a classroom observation and the rating drawn from it. */
export async function recordObservation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const teacherProfileId = String(formData.get('teacherProfileId') ?? '');
  const competencyId = String(formData.get('competencyId') ?? '');
  const observedOn = String(formData.get('observedOn') ?? '');
  const narrative = String(formData.get('narrative') ?? '').trim();
  const focus = String(formData.get('focus') ?? '').trim();
  const ordinal = Number(formData.get('ordinal') ?? 0);
  const rationale = String(formData.get('rationale') ?? '').trim();

  if (narrative.length < 20) {
    return fail(
      'Record what you saw, in at least 20 characters. An observation without narrative is a number nobody can question.',
    );
  }
  if (!observedOn) return fail('Give the date observed.');

  const { supabase, userId, yearId } = await context();
  if (!userId || !yearId) return fail('Not signed in, or no current academic year.');

  const { data: profile } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select('school_id')
    .eq('id', teacherProfileId)
    .maybeSingle();
  if (!profile) return fail('Teacher not found, or outside your scope.');

  const { data: observation, error } = await supabase
    .schema('assessment')
    .from('observation')
    .insert({
      school_id: (profile as unknown as { school_id: string }).school_id,
      teacher_profile_id: teacherProfileId,
      academic_year_id: yearId,
      observer_user_id: userId,
      observed_on: observedOn,
      focus: focus || null,
      narrative,
    })
    .select('id')
    .single();
  if (error) return fail(`Could not save the observation: ${error.message}`);

  return recordRating({
    teacherProfileId,
    competencyId,
    source: 'observation',
    ordinal,
    rationale: rationale.length >= 15 ? rationale : narrative,
    observationId: (observation as unknown as { id: string }).id,
  });
}

/**
 * Records a verified competency level.
 *
 * The verified level is a human judgement, but it must be made against the
 * inputs — so every standing rating and the evidence position are snapshotted
 * onto the row, and the rationale is required. Gaps are recomputed afterwards
 * so the whole picture moves together.
 */
export async function verifyCompetencyLevel(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const teacherProfileId = String(formData.get('teacherProfileId') ?? '');
  const competencyId = String(formData.get('competencyId') ?? '');
  const ordinal = Number(formData.get('ordinal') ?? 0);
  const rationale = String(formData.get('rationale') ?? '').trim();
  const evidenceStrength = String(formData.get('evidenceStrength') ?? 'none');

  if (rationale.length < 20) {
    return fail('Give a rationale of at least 20 characters. This is what the teacher is shown.');
  }

  const { supabase, userId, yearId } = await context();
  if (!userId || !yearId) return fail('Not signed in, or no current academic year.');

  const { data: profile } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select('school_id, user_id')
    .eq('id', teacherProfileId)
    .maybeSingle();
  if (!profile) return fail('Teacher not found, or outside your scope.');
  const p = profile as unknown as { school_id: string; user_id: string };

  if (p.user_id === userId) {
    return fail('You cannot verify your own competency level.');
  }

  const { data: targets } = await supabase.schema('competency').rpc('resolve_targets', {
    p_teacher_profile_id: teacherProfileId,
    p_academic_year_id: yearId,
  });
  const target = (
    targets as unknown as { competency_id: string; target_level_id: string }[] | null
  )?.find((t) => t.competency_id === competencyId);
  if (!target) return fail('This competency is not expected of this teacher.');

  const levelId = await levelInScaleOf(supabase, target.target_level_id, ordinal);
  if (!levelId) return fail('That level does not exist on this competency scale.');

  // Snapshot the standing ratings.
  const { data: ratings } = await supabase
    .schema('assessment')
    .from('rating_detail')
    .select('source, level_id, level_ordinal, rationale')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('competency_id', competencyId);
  const rows = (ratings ?? []) as unknown as {
    source: string;
    level_id: string;
    level_ordinal: number;
  }[];
  const bySource = (s: string) => rows.find((r) => r.source === s) ?? null;

  if (rows.length === 0) {
    return fail('No ratings have been recorded for this competency yet.');
  }

  const { data: previous } = await supabase
    .schema('assessment')
    .from('current_verified_competency')
    .select('id')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('competency_id', competencyId)
    .maybeSingle();

  const { error } = await supabase
    .schema('assessment')
    .from('verified_competency')
    .insert({
      school_id: p.school_id,
      teacher_profile_id: teacherProfileId,
      competency_id: competencyId,
      academic_year_id: yearId,
      verified_level_id: levelId,
      expected_level_id: target.target_level_id,
      self_level_id: bySource('self')?.level_id ?? null,
      supervisor_level_id: bySource('supervisor')?.level_id ?? null,
      observation_level_id: bySource('observation')?.level_id ?? null,
      evidence_strength: evidenceStrength,
      evidence_count: 0,
      rationale,
      is_reassessment: Boolean(previous),
      supersedes_id: (previous as unknown as { id: string } | null)?.id ?? null,
      verified_by: userId,
      determined_from: {
        route: 'assessment_cycle',
        ratings: rows.map((r) => ({ source: r.source, ordinal: r.level_ordinal })),
        evidence_strength: evidenceStrength,
      },
    });
  if (error) return fail(`Could not record the verified level: ${error.message}`);

  await supabase
    .schema('growth')
    .rpc('compute_gaps', { p_teacher_profile_id: teacherProfileId, p_academic_year_id: yearId });
  await supabase.schema('cpd').rpc('generate_recommendations', {
    p_teacher_profile_id: teacherProfileId,
    p_academic_year_id: yearId,
    p_max_per_gap: 5,
  });

  revalidatePath(`/assess/${teacherProfileId}`);
  revalidatePath('/manager');
  revalidatePath('/dashboard');
  return {
    ok: true,
    message: `Verified at level ${ordinal}. Gaps and recommendations recomputed.`,
  };
}
