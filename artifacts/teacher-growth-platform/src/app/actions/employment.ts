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

/** The teacher's own position on their appraisal. Nobody else may record it. */
export async function respondToAppraisal(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const appraisalId = String(formData.get('appraisalId') ?? '');
  const status = String(formData.get('status') ?? '');
  const comment = String(formData.get('comment') ?? '').trim();

  if (!appraisalId || !status) return fail('Choose a response.');
  if (['comments_submitted', 'clarification_requested'].includes(status) && comment.length < 10) {
    return fail('Say what you want recorded, in at least 10 characters. It stays on your file.');
  }

  const { data: row } = await supabase
    .schema('appraisal')
    .from('appraisal')
    .select('school_id')
    .eq('id', appraisalId)
    .maybeSingle();
  const appraisal = row as unknown as { school_id: string } | null;
  if (!appraisal) return fail('That appraisal is not visible to you.');

  const { error } = await supabase
    .schema('appraisal')
    .from('teacher_response')
    .insert({
      school_id: appraisal.school_id,
      appraisal_id: appraisalId,
      status,
      comment: comment || null,
    });
  if (error) return fail(error.message);

  revalidatePath('/appraisal');
  return {
    ok: true,
    message:
      status === 'acknowledged'
        ? 'Acknowledged. Your earlier responses stay on the record too.'
        : 'Recorded on your appraisal file.',
  };
}

/**
 * A challenge to an appraisal outcome.
 *
 * The original recommendation is copied onto the representation at this moment,
 * so the file shows what was decided even if the outcome is later revised.
 */
export async function submitRepresentation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const appraisalId = String(formData.get('appraisalId') ?? '');
  const grounds = String(formData.get('grounds') ?? '').trim();

  if (!appraisalId) return fail('No appraisal specified.');
  if (grounds.length < 20) {
    return fail(
      'Set out the grounds in at least 20 characters — this is the case the reviewer reads.',
    );
  }

  const { data: row } = await supabase
    .schema('appraisal')
    .from('appraisal')
    .select('school_id, recommendation, recommendation_rationale, recommended_by, recommended_at')
    .eq('id', appraisalId)
    .maybeSingle();
  const appraisal = row as unknown as {
    school_id: string;
    recommendation: string | null;
    recommendation_rationale: string | null;
    recommended_by: string | null;
    recommended_at: string | null;
  } | null;

  if (!appraisal) return fail('That appraisal is not visible to you.');
  if (!appraisal.recommendation) {
    return fail('There is no recommendation to challenge yet.');
  }

  const { error } = await supabase.schema('appraisal').from('representation').insert({
    school_id: appraisal.school_id,
    appraisal_id: appraisalId,
    original_recommendation: appraisal.recommendation,
    original_rationale: appraisal.recommendation_rationale,
    original_recommended_by: appraisal.recommended_by,
    original_recommended_at: appraisal.recommended_at,
    submitted_by: userId,
    grounds,
  });
  if (error) return fail(error.message);

  revalidatePath('/appraisal');
  return {
    ok: true,
    message:
      'Representation submitted. The original decision stays on the record; a reviewer independent of it will respond.',
  };
}

/** The decision on a representation. Independent of whoever made the original. */
export async function reviewRepresentation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const representationId = String(formData.get('representationId') ?? '');
  const status = String(formData.get('status') ?? '');
  const reason = String(formData.get('outcomeReason') ?? '').trim();
  const revised = String(formData.get('revisedRecommendation') ?? '').trim();

  if (!representationId || !status) return fail('Choose an outcome.');
  if (reason.length < 20) {
    return fail(
      'Give the reason in at least 20 characters. A grievance decision without reasons is the thing the procedure exists to prevent.',
    );
  }
  if (['upheld', 'partly_upheld'].includes(status) && revised.length < 10) {
    return fail('If the representation succeeds in any part, say what the position now is.');
  }

  const { error } = await supabase
    .schema('appraisal')
    .from('representation')
    .update({
      status,
      reviewer_user_id: userId,
      reviewed_at: new Date().toISOString(),
      outcome: status,
      outcome_reason: reason,
      revised_recommendation: revised || null,
    })
    .eq('id', representationId);

  if (error) return fail(error.message);

  revalidatePath('/appraisal');
  revalidatePath('/manager');
  return { ok: true, message: 'Representation decided. The original remains on the record.' };
}

/** Move an appraisal to its next stage. */
export async function advanceAppraisal(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const appraisalId = String(formData.get('appraisalId') ?? '');
  const nextStage = String(formData.get('nextStage') ?? '');
  if (!appraisalId || !nextStage) return fail('No appraisal or stage specified.');

  const { error } = await supabase
    .schema('appraisal')
    .from('appraisal')
    .update({ stage: nextStage })
    .eq('id', appraisalId);
  if (error) return fail(error.message);

  revalidatePath('/appraisal');
  revalidatePath('/manager');
  return { ok: true, message: `Moved to ${nextStage.replace(/_/g, ' ')}.` };
}

/** Recompute the growth score. Deterministic; the appraiser triggers it. */
export async function recomputeGrowthScore(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const appraisalId = String(formData.get('appraisalId') ?? '');
  if (!appraisalId) return fail('No appraisal specified.');

  const { data, error } = await supabase
    .schema('appraisal')
    .rpc('compute_growth_score', { p_appraisal_id: appraisalId });
  if (error) return fail(error.message);

  revalidatePath('/appraisal');
  return {
    ok: true,
    message: `Growth score recomputed: ${Number(data).toFixed(1)}%. Every component shows its weight, result and evidence.`,
  };
}

/** Recompute increment readiness for a teacher. Readiness, not a decision. */
export async function recomputeReadiness(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId, yearId } = await context();
  if (!userId || !yearId) return fail('Not signed in, or no academic year is current.');

  const teacherProfileId = String(formData.get('teacherProfileId') ?? '');
  if (!teacherProfileId) return fail('No teacher specified.');

  const { data: model } = await supabase
    .schema('pay')
    .from('readiness_model')
    .select('id')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const modelId = (model as unknown as { id: string } | null)?.id;
  if (!modelId) return fail('No increment readiness model is configured.');

  const { error } = await supabase.schema('pay').rpc('compute_increment_readiness', {
    p_teacher_profile_id: teacherProfileId,
    p_academic_year_id: yearId,
    p_model_id: modelId,
  });
  if (error) return fail(error.message);

  revalidatePath('/increment');
  return { ok: true, message: 'Readiness recomputed. This is an indicator, not a decision.' };
}

/**
 * Record the human recommendation on an increment.
 *
 * The outcome is a person's judgement. The readiness figure is evidence for it,
 * never a substitute — which is why a rationale is required whatever the number.
 */
export async function recordIncrementRecommendation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const recommendationId = String(formData.get('recommendationId') ?? '');
  const outcome = String(formData.get('outcome') ?? '');
  const rationale = String(formData.get('rationale') ?? '').trim();

  if (!recommendationId || !outcome) return fail('Choose an outcome.');
  if (rationale.length < 20) {
    return fail(
      'Give your reasoning in at least 20 characters. The readiness figure is evidence for a judgement, not the judgement.',
    );
  }

  const { error } = await supabase
    .schema('pay')
    .from('recommendation')
    .update({
      outcome,
      outcome_rationale: rationale,
      recommended_by: userId,
      recommended_at: new Date().toISOString(),
    })
    .eq('id', recommendationId);
  if (error) return fail(error.message);

  revalidatePath('/increment');
  return { ok: true, message: 'Recommendation recorded. It now moves through the approval chain.' };
}

/** Record a decision at one stage of the approval chain. */
export async function recordApproval(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const recommendationId = String(formData.get('recommendationId') ?? '');
  const stage = String(formData.get('stage') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  if (!recommendationId || !stage || !decision) return fail('Choose a stage and a decision.');
  if (!['endorsed', 'approved'].includes(decision) && note.length < 10) {
    return fail('Returning or declining needs a reason of at least 10 characters.');
  }

  const { data: rec } = await supabase
    .schema('pay')
    .from('recommendation')
    .select('school_id')
    .eq('id', recommendationId)
    .maybeSingle();
  const found = rec as unknown as { school_id: string } | null;
  if (!found) return fail('That recommendation is not visible to you.');

  const { error } = await supabase
    .schema('pay')
    .from('approval')
    .insert({
      school_id: found.school_id,
      recommendation_id: recommendationId,
      stage,
      decision,
      decided_by: userId,
      note: note || null,
    });

  if (error) {
    // The gate and the independence rules surface as database errors; pass the
    // message through, because each already explains itself.
    return fail(error.message);
  }

  await supabase.schema('pay').from('recommendation').update({ stage }).eq('id', recommendationId);

  revalidatePath('/increment');
  return { ok: true, message: `Recorded at the ${stage.replace(/_/g, ' ')} stage.` };
}
