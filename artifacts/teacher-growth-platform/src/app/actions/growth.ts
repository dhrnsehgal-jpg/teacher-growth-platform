'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  message: string;
}

function fail(message: string): ActionResult {
  return { ok: false, message };
}

function refresh() {
  revalidatePath('/dashboard');
  revalidatePath('/learning-map');
  revalidatePath('/manager');
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Teacher selects a recommended activity. Creates the learning plan on first
 * use, and copies the recommendation's reasoning onto the item so the record
 * shows why this was chosen at the time.
 */
export async function selectCpd(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const gapId = String(formData.get('gapId') ?? '');
  const activityId = String(formData.get('activityId') ?? '');
  const rationale = String(formData.get('rationale') ?? '').trim();
  if (!gapId || !activityId) return fail('Missing gap or activity.');

  const supabase = await createClient();
  const userId = await currentUserId();
  if (!userId) return fail('Not signed in.');

  const { data: gap } = await supabase
    .schema('growth')
    .from('gap')
    .select('id, school_id, teacher_profile_id, competency_id, academic_year_id, expected_ordinal')
    .eq('id', gapId)
    .maybeSingle();
  if (!gap) return fail('Gap not found.');

  const g = gap as unknown as {
    school_id: string;
    teacher_profile_id: string;
    competency_id: string;
    academic_year_id: string;
    expected_ordinal: number;
  };

  let planId: string;
  const { data: existing } = await supabase
    .schema('growth')
    .from('learning_plan')
    .select('id')
    .eq('teacher_profile_id', g.teacher_profile_id)
    .eq('academic_year_id', g.academic_year_id)
    .maybeSingle();

  if (existing) {
    planId = (existing as unknown as { id: string }).id;
  } else {
    const { data: created, error } = await supabase
      .schema('growth')
      .from('learning_plan')
      .insert({
        school_id: g.school_id,
        teacher_profile_id: g.teacher_profile_id,
        academic_year_id: g.academic_year_id,
        status: 'active',
      })
      .select('id')
      .single();
    if (error) return fail(`Could not create the learning plan: ${error.message}`);
    planId = (created as unknown as { id: string }).id;
  }

  const { error: itemError } = await supabase
    .schema('growth')
    .from('learning_plan_item')
    .insert({
      school_id: g.school_id,
      learning_plan_id: planId,
      gap_id: gapId,
      competency_id: g.competency_id,
      cpd_activity_id: activityId,
      selection_rationale: rationale || 'Selected from the ranked recommendations for this gap.',
      owner_user_id: userId,
      status: 'proposed',
    });
  if (itemError) return fail(`Could not add it to your plan: ${itemError.message}`);

  refresh();
  return { ok: true, message: 'Added to your Learning Map and sent for approval.' };
}

/** Manager approves or declines. A decline must say why. */
export async function decidePlanItem(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const itemId = String(formData.get('itemId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (!itemId) return fail('Missing item.');

  if (decision === 'decline' && note.length < 10) {
    return fail('Declining requires a reason of at least 10 characters.');
  }

  const supabase = await createClient();
  const userId = await currentUserId();

  const { error } = await supabase
    .schema('growth')
    .from('learning_plan_item')
    .update({
      status: decision === 'approve' ? 'approved' : 'declined',
      approved_at: decision === 'approve' ? new Date().toISOString() : null,
      approved_by: userId,
      approval_note: note || null,
    })
    .eq('id', itemId);

  if (error) return fail(error.message);
  refresh();
  return {
    ok: true,
    message: decision === 'approve' ? 'Approved.' : 'Declined, with the reason recorded.',
  };
}

/** Teacher advances participation: start, then complete. */
export async function advanceParticipation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const itemId = String(formData.get('itemId') ?? '');
  const to = String(formData.get('to') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  const supabase = await createClient();

  const patch: Record<string, unknown> = { status: to };
  if (to === 'in_progress') patch.started_at = new Date().toISOString();
  if (to === 'completed') {
    patch.completed_at = new Date().toISOString();
    patch.completion_note = note || null;
  }

  const { error } = await supabase
    .schema('growth')
    .from('learning_plan_item')
    .update(patch)
    .eq('id', itemId);

  if (error) return fail(error.message);
  refresh();
  return {
    ok: true,
    message:
      to === 'completed'
        ? 'Marked complete. Completing an activity does not change your competency level — record what you took from it next.'
        : 'Started.',
  };
}

/** Teacher records reflection. */
export async function submitReflection(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const itemId = String(formData.get('itemId') ?? '');
  const reflection = String(formData.get('reflection') ?? '').trim();
  if (reflection.length < 30) {
    return fail('A reflection of at least 30 characters is required.');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema('growth')
    .from('learning_plan_item')
    .update({ status: 'reflected', reflected_at: new Date().toISOString(), reflection })
    .eq('id', itemId);

  if (error) return fail(error.message);
  refresh();
  return {
    ok: true,
    message: 'Reflection recorded. Next: apply it in practice and submit evidence.',
  };
}

/**
 * Teacher applies the learning and submits evidence of it. Creates the evidence
 * record, links it to the plan item, and moves the item to `applied`.
 */
export async function submitApplication(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const itemId = String(formData.get('itemId') ?? '');
  const summary = String(formData.get('summary') ?? '').trim();
  const evidenceTitle = String(formData.get('evidenceTitle') ?? '').trim();
  const evidenceDescription = String(formData.get('evidenceDescription') ?? '').trim();

  if (summary.length < 30) return fail('Describe how you applied it (at least 30 characters).');
  if (evidenceTitle.length < 3) return fail('Give the evidence a title.');

  const supabase = await createClient();

  const { data: item } = await supabase
    .schema('growth')
    .from('plan_item_detail')
    .select('id, school_id, teacher_profile_id, academic_year_id')
    .eq('id', itemId)
    .maybeSingle();
  if (!item) return fail('Plan item not found.');
  const it = item as unknown as {
    school_id: string;
    teacher_profile_id: string;
    academic_year_id: string;
  };

  const { data: type } = await supabase
    .schema('evidence')
    .from('evidence_type')
    .select('id')
    .eq('school_id', it.school_id)
    .eq('key', 'assessment_design')
    .maybeSingle();

  const { data: evidence, error: evidenceError } = await supabase
    .schema('evidence')
    .from('evidence')
    .insert({
      school_id: it.school_id,
      teacher_profile_id: it.teacher_profile_id,
      academic_year_id: it.academic_year_id,
      evidence_type_id: (type as unknown as { id: string } | null)?.id,
      title: evidenceTitle,
      description: evidenceDescription || null,
      reflection: summary,
      status: 'draft',
    })
    .select('id')
    .single();
  if (evidenceError) return fail(`Could not save the evidence: ${evidenceError.message}`);

  const evidenceId = (evidence as unknown as { id: string }).id;

  // Optional file. The path is <teacher_profile_id>/<evidence_id>/<filename>:
  // the storage policies in migration 0029 read the first segment to decide who
  // owns the object, so nothing may be written outside it.
  const file = formData.get('file');
  if (file instanceof File && file.size > 0) {
    const safeName = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    const path = `${it.teacher_profile_id}/${evidenceId}/${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('evidence')
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (uploadError) {
      // Leave the evidence in draft rather than claiming an attachment that
      // is not there.
      return fail(`Could not upload the file: ${uploadError.message}`);
    }

    const { error: pathError } = await supabase
      .schema('evidence')
      .from('evidence')
      .update({
        storage_bucket: 'evidence',
        storage_path: path,
        file_name: safeName,
        file_size_bytes: file.size,
        content_type: file.type || null,
      })
      .eq('id', evidenceId);
    if (pathError) return fail(`Could not record the file: ${pathError.message}`);
  }

  // Submit only once any upload has succeeded.
  const { error: submitError } = await supabase
    .schema('evidence')
    .from('evidence')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', evidenceId);
  if (submitError) return fail(`Could not submit the evidence: ${submitError.message}`);

  const { error: linkError } = await supabase.schema('growth').from('plan_item_evidence').insert({
    school_id: it.school_id,
    learning_plan_item_id: itemId,
    evidence_id: evidenceId,
    note: 'Evidence of application in practice.',
  });
  if (linkError) return fail(`Could not link the evidence: ${linkError.message}`);

  const { error } = await supabase
    .schema('growth')
    .from('learning_plan_item')
    .update({
      status: 'applied',
      applied_at: new Date().toISOString(),
      application_summary: summary,
    })
    .eq('id', itemId);
  if (error) return fail(error.message);

  refresh();
  return { ok: true, message: 'Application submitted. Awaiting verification by your reviewer.' };
}

/**
 * Reviewer verifies the evidence AND the application in practice.
 *
 * Both are required before reassessment: verified evidence proves the artefact
 * is genuine, and impact verification is the reviewer confirming they saw it in
 * practice.
 */
export async function verifyApplication(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const itemId = String(formData.get('itemId') ?? '');
  const strength = String(formData.get('strength') ?? 'adequate');
  const note = String(formData.get('note') ?? '').trim();
  if (note.length < 10) return fail('Record what you verified (at least 10 characters).');

  const supabase = await createClient();
  const userId = await currentUserId();

  const { data: links } = await supabase
    .schema('growth')
    .from('plan_item_evidence')
    .select('evidence_id')
    .eq('learning_plan_item_id', itemId);

  for (const link of (links ?? []) as unknown as { evidence_id: string }[]) {
    // The evidence lifecycle requires under_review before verified.
    await supabase
      .schema('evidence')
      .from('evidence')
      .update({ status: 'under_review' })
      .eq('id', link.evidence_id)
      .eq('status', 'submitted');

    const { error } = await supabase
      .schema('evidence')
      .from('evidence')
      .update({
        status: 'verified',
        strength,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: note,
      })
      .eq('id', link.evidence_id);
    if (error) return fail(`Could not verify the evidence: ${error.message}`);
  }

  const { error: itemError } = await supabase
    .schema('growth')
    .from('learning_plan_item')
    .update({
      status: 'impact_verified',
      impact_verified_at: new Date().toISOString(),
      impact_verified_by: userId,
      impact_verification_note: note,
    })
    .eq('id', itemId);
  if (itemError) return fail(itemError.message);

  refresh();
  return { ok: true, message: 'Application verified. The competency can now be reassessed.' };
}

/**
 * Reassessment — the only route to a changed competency level.
 *
 * Refuses unless `growth.can_reassess` is satisfied, writes a NEW
 * verified_competency row (never an update), then recomputes gaps and
 * recommendations so the whole picture moves together.
 */
export async function reassess(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const itemId = String(formData.get('itemId') ?? '');
  const newOrdinal = Number(formData.get('newOrdinal') ?? 0);
  const rationale = String(formData.get('rationale') ?? '').trim();
  if (rationale.length < 20) return fail('Give a rationale of at least 20 characters.');
  if (!newOrdinal) return fail('Choose the new level.');

  const supabase = await createClient();
  const userId = await currentUserId();

  const { data: gate } = await supabase
    .schema('growth')
    .rpc('can_reassess', { p_plan_item_id: itemId });
  const gateRow = (gate as unknown as { allowed: boolean; reason: string }[] | null)?.[0];
  if (!gateRow?.allowed) {
    return fail(gateRow?.reason ?? 'Reassessment is not permitted yet.');
  }

  const { data: item } = await supabase
    .schema('growth')
    .from('plan_item_detail')
    .select('id, school_id, teacher_profile_id, academic_year_id, competency_id, competency_key')
    .eq('id', itemId)
    .maybeSingle();
  if (!item) return fail('Plan item not found.');
  const it = item as unknown as {
    school_id: string;
    teacher_profile_id: string;
    academic_year_id: string;
    competency_id: string;
    competency_key: string;
  };

  const { data: current } = await supabase
    .schema('assessment')
    .from('current_verified_competency')
    .select(
      'id, verified_level_id, expected_level_id, self_level_id, supervisor_level_id, observation_level_id',
    )
    .eq('teacher_profile_id', it.teacher_profile_id)
    .eq('competency_id', it.competency_id)
    .maybeSingle();
  if (!current) return fail('No existing verified level to reassess from.');
  const prev = current as unknown as {
    id: string;
    verified_level_id: string;
    expected_level_id: string;
    self_level_id: string | null;
    supervisor_level_id: string | null;
    observation_level_id: string | null;
  };

  // The new level MUST come from the same scale as the current one. A school
  // holds more than one scale — its own five-point operating scale and the
  // three-point NPST reference scale — and looking up by ordinal alone matches
  // whichever comes first. That silently recorded "Expert Teacher" (NPST
  // ordinal 3) in place of "Proficient" (school ordinal 3).
  const { data: currentLevel } = await supabase
    .schema('competency')
    .from('proficiency_level')
    .select('scale_id')
    .eq('id', prev.verified_level_id)
    .maybeSingle();
  if (!currentLevel) return fail('Could not resolve the current proficiency scale.');

  const { data: level } = await supabase
    .schema('competency')
    .from('proficiency_level')
    .select('id')
    .eq('scale_id', (currentLevel as unknown as { scale_id: string }).scale_id)
    .eq('ordinal', newOrdinal)
    .maybeSingle();
  if (!level) return fail('That level does not exist on this competency scale.');

  const { data: verified, error } = await supabase
    .schema('assessment')
    .from('verified_competency')
    .insert({
      school_id: it.school_id,
      teacher_profile_id: it.teacher_profile_id,
      competency_id: it.competency_id,
      academic_year_id: it.academic_year_id,
      verified_level_id: (level as unknown as { id: string }).id,
      expected_level_id: prev.expected_level_id,
      self_level_id: prev.self_level_id,
      supervisor_level_id: prev.supervisor_level_id,
      observation_level_id: prev.observation_level_id,
      evidence_strength: 'adequate',
      evidence_count: 1,
      rationale,
      is_reassessment: true,
      supersedes_id: prev.id,
      verified_by: userId,
      determined_from: { route: 'cpd_impact', plan_item_id: itemId },
    })
    .select('id')
    .single();
  if (error) return fail(`Could not record the reassessment: ${error.message}`);

  await supabase
    .schema('growth')
    .from('learning_plan_item')
    .update({
      status: 'reassessed',
      reassessed_at: new Date().toISOString(),
      verified_competency_id: (verified as unknown as { id: string }).id,
    })
    .eq('id', itemId);

  // Recompute the derived picture so the dashboard moves with the assessment.
  await supabase.schema('growth').rpc('compute_gaps', {
    p_teacher_profile_id: it.teacher_profile_id,
    p_academic_year_id: it.academic_year_id,
  });
  await supabase.schema('cpd').rpc('generate_recommendations', {
    p_teacher_profile_id: it.teacher_profile_id,
    p_academic_year_id: it.academic_year_id,
    p_max_per_gap: 5,
  });

  refresh();
  revalidatePath(`/growth/${it.competency_key}`);
  return { ok: true, message: `Reassessed to level ${newOrdinal}. The gap has been recomputed.` };
}
