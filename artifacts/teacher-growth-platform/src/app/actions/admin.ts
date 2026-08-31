'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './growth';

function fail(message: string): ActionResult {
  return { ok: false, message };
}

const SLUG = /^[a-z][a-z0-9_]*$/;

function slugProblem(key: string, label = 'Key'): string | null {
  if (!key) return `${label} is required.`;
  if (!SLUG.test(key)) {
    return `${label} must be lowercase letters, digits and underscores, starting with a letter — for example "assessment_for_learning".`;
  }
  return null;
}

/**
 * The product's central labelling rule, enforced at the point of entry.
 *
 * Claiming a competency is NPST- or CBSE-aligned without citing where says the
 * school is held to a standard nobody can check. The database refuses it too
 * (`*_aligned_needs_reference`), but a constraint violation is a poor way to
 * learn a policy, so the actions explain it instead.
 */
function sourceProblem(framework: string, alignment: string, reference: string): string | null {
  if (!framework || !alignment) return 'Choose where this comes from.';
  if (alignment === 'aligned' && reference.trim().length === 0) {
    return 'An aligned item must cite the clause it aligns to — for example "NPST 2023, indicator 8.2.2". If you cannot cite one, record it as derived or school-defined instead.';
  }
  if (alignment !== 'school_defined' && framework === 'school') {
    return 'A school framework item cannot be aligned or derived from an external standard. Choose the framework it comes from, or record it as school-defined.';
  }
  return null;
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

/** The caller's school. Every admin write is scoped to it. */
async function schoolOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase.schema('core').from('school').select('id').limit(1).maybeSingle();
  return (data as unknown as { id: string } | null)?.id ?? null;
}

function sourceFields(formData: FormData) {
  return {
    framework: String(formData.get('sourceFramework') ?? 'school'),
    alignment: String(formData.get('sourceAlignment') ?? 'school_defined'),
    reference: String(formData.get('externalReference') ?? '').trim(),
  };
}

// ---------------------------------------------------------------------------
// 1. Create a competency framework
// ---------------------------------------------------------------------------
/**
 * Creates a framework together with a first standard and domain.
 *
 * A framework with nothing under it cannot hold a competency, so creating one
 * in three separate steps just leaves an unusable shell if the user stops after
 * the first. One action, one usable structure.
 */
export async function createFramework(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const key = String(formData.get('key') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const standardName = String(formData.get('standardName') ?? '').trim();
  const domainName = String(formData.get('domainName') ?? '').trim();
  const src = sourceFields(formData);

  const problem =
    slugProblem(key) ??
    (name.length < 3 ? 'Give the framework a name.' : null) ??
    (standardName.length < 3
      ? 'Name the first standard — a framework needs one to hold competencies.'
      : null) ??
    (domainName.length < 3 ? 'Name the first domain within that standard.' : null) ??
    sourceProblem(src.framework, src.alignment, src.reference);
  if (problem) return fail(problem);

  const school = await schoolOf(supabase);
  if (!school) return fail('No school is visible to this account.');

  const shared = {
    school_id: school,
    source_framework: src.framework,
    source_alignment: src.alignment,
    external_reference: src.reference || null,
  };

  const { data: fw, error: fwError } = await supabase
    .schema('competency')
    .from('framework')
    .insert({ ...shared, key, name, description: description || null, status: 'draft' })
    .select('id')
    .maybeSingle();
  if (fwError) return fail(fwError.message);

  const frameworkId = (fw as unknown as { id: string }).id;

  const { data: std, error: stdError } = await supabase
    .schema('competency')
    .from('standard')
    .insert({ ...shared, framework_id: frameworkId, key: `${key}_s1`, name: standardName })
    .select('id')
    .maybeSingle();
  if (stdError) return fail(`Framework created, but the standard failed: ${stdError.message}`);

  const { error: domError } = await supabase
    .schema('competency')
    .from('domain')
    .insert({
      ...shared,
      standard_id: (std as unknown as { id: string }).id,
      key: `${key}_d1`,
      name: domainName,
    });
  if (domError) return fail(`Standard created, but the domain failed: ${domError.message}`);

  revalidatePath('/admin/framework');
  return {
    ok: true,
    message: `Framework "${name}" created as a draft, with one standard and one domain. Add competencies to it below.`,
  };
}

// ---------------------------------------------------------------------------
// 2. Add a competency
// ---------------------------------------------------------------------------
export async function createCompetency(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const domainId = String(formData.get('domainId') ?? '');
  const key = String(formData.get('key') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const rationale = String(formData.get('rationale') ?? '').trim();
  const src = sourceFields(formData);

  const problem =
    (!domainId ? 'Choose the domain this competency belongs to.' : null) ??
    slugProblem(key) ??
    (name.length < 3 ? 'Give the competency a name.' : null) ??
    (description.length < 20
      ? 'Describe the competency in at least 20 characters — this is what a teacher reads to understand what is expected.'
      : null) ??
    sourceProblem(src.framework, src.alignment, src.reference);
  if (problem) return fail(problem);

  const school = await schoolOf(supabase);
  if (!school) return fail('No school is visible to this account.');

  const { error } = await supabase
    .schema('competency')
    .from('competency')
    .insert({
      school_id: school,
      domain_id: domainId,
      key,
      name,
      description,
      rationale: rationale || null,
      source_framework: src.framework,
      source_alignment: src.alignment,
      external_reference: src.reference || null,
      status: 'active',
    });

  if (error) {
    return fail(
      error.code === '23505' ? `A competency with the key "${key}" already exists.` : error.message,
    );
  }

  revalidatePath('/admin/framework');
  return { ok: true, message: `Competency "${name}" added.` };
}

// ---------------------------------------------------------------------------
// 3. Edit a competency
// ---------------------------------------------------------------------------
/**
 * Edits the descriptive text only. The key, the domain and the source labels
 * are not editable here: changing a key breaks every reference to it, and
 * changing a source label silently rewrites the claim about where the standard
 * came from. Either is a new competency, or a retirement and a replacement.
 */
export async function updateCompetency(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const competencyId = String(formData.get('competencyId') ?? '');
  const competencyKey = String(formData.get('competencyKey') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const rationale = String(formData.get('rationale') ?? '').trim();

  if (!competencyId) return fail('Missing competency.');
  if (name.length < 3) return fail('Give the competency a name.');
  if (description.length < 20) return fail('Describe the competency in at least 20 characters.');

  const { error } = await supabase
    .schema('competency')
    .from('competency')
    .update({ name, description, rationale: rationale || null })
    .eq('id', competencyId);
  if (error) return fail(error.message);

  revalidatePath(`/admin/framework/${competencyKey}`);
  revalidatePath('/admin/framework');
  return { ok: true, message: 'Competency updated. The change is on the audit trail.' };
}

// ---------------------------------------------------------------------------
// 4. Add an indicator
// ---------------------------------------------------------------------------
export async function createIndicator(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const competencyId = String(formData.get('competencyId') ?? '');
  const competencyKey = String(formData.get('competencyKey') ?? '');
  const key = String(formData.get('key') ?? '').trim();
  const statement = String(formData.get('statement') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const weightRaw = String(formData.get('weight') ?? '').trim();
  const src = sourceFields(formData);

  const problem =
    (!competencyId ? 'Missing competency.' : null) ??
    slugProblem(key) ??
    (statement.length < 20 ? 'An indicator statement must be at least 20 characters.' : null) ??
    (/^(is|was) (a )?(good|great|excellent|bad|poor)\b/i.test(statement)
      ? 'That is a verdict, not an observable behaviour. Describe what the teacher does — "Uses formative assessment evidence to adapt subsequent instruction" — rather than how good they are.'
      : null) ??
    sourceProblem(src.framework, src.alignment, src.reference);
  if (problem) return fail(problem);

  const weight = weightRaw ? Number(weightRaw) : null;
  if (weight !== null && (!Number.isFinite(weight) || weight < 0)) {
    return fail('Weight must be a number of 0 or more, or left blank.');
  }

  const school = await schoolOf(supabase);
  if (!school) return fail('No school is visible to this account.');

  const { error } = await supabase
    .schema('competency')
    .from('indicator')
    .insert({
      school_id: school,
      competency_id: competencyId,
      key,
      statement,
      description: description || null,
      weight,
      source_framework: src.framework,
      source_alignment: src.alignment,
      external_reference: src.reference || null,
      status: 'active',
    });

  if (error) {
    return fail(
      error.code === '23514'
        ? 'The database rejected that statement as not observable. Describe what the teacher does, not how good they are.'
        : error.message,
    );
  }

  revalidatePath(`/admin/framework/${competencyKey}`);
  return { ok: true, message: 'Indicator added.' };
}

// ---------------------------------------------------------------------------
// 5. Define a proficiency level
// ---------------------------------------------------------------------------
export async function createProficiencyLevel(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const scaleId = String(formData.get('scaleId') ?? '');
  const key = String(formData.get('key') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const ordinalRaw = String(formData.get('ordinal') ?? '').trim();
  const descriptor = String(formData.get('descriptor') ?? '').trim();

  const ordinal = Number(ordinalRaw);
  const problem =
    (!scaleId ? 'Choose the scale this level belongs to.' : null) ??
    slugProblem(key) ??
    (name.length < 2 ? 'Give the level a name.' : null) ??
    (!Number.isInteger(ordinal) || ordinal < 1
      ? 'Ordinal must be a whole number of 1 or more.'
      : null) ??
    (descriptor.length < 20
      ? 'Describe what practice at this level looks like, in at least 20 characters. A level without a descriptor cannot be applied consistently by two different assessors.'
      : null);
  if (problem) return fail(problem);

  const school = await schoolOf(supabase);
  if (!school) return fail('No school is visible to this account.');

  const { error } = await supabase
    .schema('competency')
    .from('proficiency_level')
    .insert({ school_id: school, scale_id: scaleId, key, name, ordinal, descriptor });

  if (error) {
    return fail(
      error.code === '23505'
        ? `That scale already has a level at ordinal ${ordinal}, or a level keyed "${key}".`
        : error.message,
    );
  }

  revalidatePath('/admin/proficiency');
  return { ok: true, message: `Level ${ordinal} — ${name} added.` };
}

// ---------------------------------------------------------------------------
// 6. Define a role/stage target
// ---------------------------------------------------------------------------
/**
 * Sets the expected level for a competency, narrowed by any combination of
 * role, teacher category, stage, subject, career level and leadership.
 *
 * Leaving every dimension blank sets a school-wide expectation, which is
 * legitimate — but the interface says so, because "expected of everyone" and
 * "expected of Heads of Department" are very different statements to make about
 * a teacher.
 */
export async function createTarget(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId, yearId } = await context();
  if (!userId) return fail('Not signed in.');
  if (!yearId) return fail('No academic year is current.');

  const competencyId = String(formData.get('competencyId') ?? '');
  const competencyKey = String(formData.get('competencyKey') ?? '');
  const targetLevelId = String(formData.get('targetLevelId') ?? '');
  const rationale = String(formData.get('rationale') ?? '').trim();

  const pick = (field: string) => {
    const v = String(formData.get(field) ?? '').trim();
    return v || null;
  };

  if (!competencyId) return fail('Missing competency.');
  if (!targetLevelId) return fail('Choose the expected level.');
  if (rationale.length < 15) {
    return fail(
      'Say why this level is expected, in at least 15 characters. A teacher is entitled to the reasoning behind an expectation.',
    );
  }

  const roleKey = pick('roleKey');
  if (roleKey && !SLUG.test(roleKey)) return fail('Role key must be a lowercase slug.');

  const school = await schoolOf(supabase);
  if (!school) return fail('No school is visible to this account.');

  const { error } = await supabase
    .schema('competency')
    .from('competency_target')
    .insert({
      school_id: school,
      academic_year_id: yearId,
      competency_id: competencyId,
      target_level_id: targetLevelId,
      teacher_category_id: pick('teacherCategoryId'),
      school_stage_id: pick('schoolStageId'),
      career_level_id: pick('careerLevelId'),
      subject_id: pick('subjectId'),
      role_key: roleKey,
      requires_leadership: String(formData.get('requiresLeadership') ?? '') === 'true',
      is_mandatory: String(formData.get('isMandatory') ?? '') === 'true',
      rationale,
      source_framework: 'school',
      source_alignment: 'school_defined',
      created_by: userId,
    });

  if (error) {
    return fail(
      error.code === '23505'
        ? 'A target already exists for that exact combination. Edit or remove it first.'
        : error.message,
    );
  }

  revalidatePath(`/admin/framework/${competencyKey}`);
  revalidatePath('/me');
  return { ok: true, message: 'Target set for this academic year.' };
}

// ---------------------------------------------------------------------------
// 7. Create a KPI template
// ---------------------------------------------------------------------------
export async function createKpiTemplate(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const categoryId = String(formData.get('categoryId') ?? '');
  const key = String(formData.get('key') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const metric = String(formData.get('metric') ?? '').trim();
  const unit = String(formData.get('unit') ?? '').trim();
  const direction = String(formData.get('direction') ?? 'increase');
  const frequency = String(formData.get('frequency') ?? 'annual');
  const dataSource = String(formData.get('dataSource') ?? '').trim();
  const evidenceRequirement = String(formData.get('evidenceRequirement') ?? '').trim();
  const defaultTarget = String(formData.get('defaultTarget') ?? '').trim();
  const weightRaw = String(formData.get('defaultWeight') ?? '').trim();
  const isStudentOutcome = String(formData.get('isStudentOutcomeMeasure') ?? '') === 'true';

  const problem =
    (!categoryId ? 'Choose a KPI category.' : null) ??
    slugProblem(key) ??
    (name.length < 3 ? 'Give the KPI a name.' : null) ??
    (metric.length < 3 ? 'State what is measured.' : null) ??
    (description.length < 10
      ? 'Describe the KPI in at least 10 characters. It is copied onto every teacher it is assigned to, and is what they read when agreeing to it.'
      : null) ??
    (dataSource.length < 3
      ? 'Name the data source. A KPI whose data nobody can point to cannot be reviewed fairly.'
      : null) ??
    (evidenceRequirement.length < 10
      ? 'Say what evidence demonstrates this KPI, in at least 10 characters.'
      : null);
  if (problem) return fail(problem);

  const weight = weightRaw ? Number(weightRaw) : null;
  if (weight !== null && (!Number.isFinite(weight) || weight < 0)) {
    return fail('Weight must be a number of 0 or more, or left blank.');
  }

  const school = await schoolOf(supabase);
  if (!school) return fail('No school is visible to this account.');

  const { error } = await supabase
    .schema('kpi')
    .from('template')
    .insert({
      school_id: school,
      category_id: categoryId,
      key,
      name,
      description,
      metric,
      unit: unit || null,
      direction,
      frequency,
      data_source: dataSource,
      evidence_requirement: evidenceRequirement,
      default_target: defaultTarget || null,
      default_weight: weight,
      is_student_outcome_measure: isStudentOutcome,
      source_framework: 'school',
      source_alignment: 'school_defined',
      status: 'active',
    });

  if (error) {
    return fail(
      error.code === '23505' ? `A KPI template keyed "${key}" already exists.` : error.message,
    );
  }

  revalidatePath('/admin/kpi');
  return {
    ok: true,
    message: isStudentOutcome
      ? `KPI "${name}" created and flagged as a student-outcome measure. It can never be the sole determinant of effectiveness.`
      : `KPI "${name}" created.`,
  };
}

// ---------------------------------------------------------------------------
// 8. Assign a KPI to a teacher
// ---------------------------------------------------------------------------
export async function assignKpi(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId, yearId } = await context();
  if (!userId) return fail('Not signed in.');
  if (!yearId) return fail('No academic year is current.');

  const templateId = String(formData.get('templateId') ?? '');
  const teacherProfileId = String(formData.get('teacherProfileId') ?? '');
  const reviewerUserId = String(formData.get('reviewerUserId') ?? '');
  const target = String(formData.get('target') ?? '').trim();
  const weightRaw = String(formData.get('weight') ?? '').trim();

  if (!templateId) return fail('Choose a KPI template.');
  if (!teacherProfileId) return fail('Choose the teacher.');
  if (!reviewerUserId) {
    return fail(
      'Name the reviewer. An assigned KPI without someone accountable for reviewing it is not an agreement.',
    );
  }

  const { data: tpl } = await supabase
    .schema('kpi')
    .from('template')
    .select(
      'school_id, category_id, name, description, metric, unit, direction, frequency, data_source, evidence_requirement, default_target, default_weight, is_student_outcome_measure, source_framework, source_alignment, external_reference',
    )
    .eq('id', templateId)
    .maybeSingle();
  const template = tpl as unknown as Record<string, unknown> | null;
  if (!template) return fail('That KPI template is not visible to you.');

  const weight = weightRaw ? Number(weightRaw) : Number(template.default_weight ?? 1);
  if (!Number.isFinite(weight) || weight < 0) return fail('Weight must be a number of 0 or more.');

  // `teacher_kpi.target` is NOT NULL, and rightly so: an assigned KPI with no
  // target is not something a teacher can be reviewed against.
  const resolvedTarget = target || (template.default_target as string | null);
  if (!resolvedTarget) {
    return fail(
      'Enter a target. This template has no default, and a KPI without one cannot be reviewed.',
    );
  }

  const { error } = await supabase.schema('kpi').from('teacher_kpi').insert({
    school_id: template.school_id,
    teacher_profile_id: teacherProfileId,
    academic_year_id: yearId,
    template_id: templateId,
    category_id: template.category_id,
    name: template.name,
    description: template.description,
    metric: template.metric,
    unit: template.unit,
    direction: template.direction,
    frequency: template.frequency,
    data_source: template.data_source,
    evidence_requirement: template.evidence_requirement,
    is_student_outcome_measure: template.is_student_outcome_measure,
    source_framework: template.source_framework,
    source_alignment: template.source_alignment,
    external_reference: template.external_reference,
    target: resolvedTarget,
    weight,
    reviewer_user_id: reviewerUserId,
    status: 'assigned',
    assigned_by: userId,
    assigned_at: new Date().toISOString(),
  });

  if (error) {
    return fail(
      error.code === '23505'
        ? 'That KPI is already assigned to this teacher for this year.'
        : error.message,
    );
  }

  // The teacher's own profile changes too — assigning a KPI is something they
  // are entitled to see immediately, not on the next cold load.
  revalidatePath('/admin/kpi');
  revalidatePath('/me');
  revalidatePath('/dashboard');
  return { ok: true, message: 'KPI assigned for this academic year.' };
}

// ---------------------------------------------------------------------------
// 9. Configure an evidence requirement
// ---------------------------------------------------------------------------
export async function createEvidenceRequirement(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId, yearId } = await context();
  if (!userId) return fail('Not signed in.');
  if (!yearId) return fail('No academic year is current.');

  const evidenceTypeId = String(formData.get('evidenceTypeId') ?? '');
  const minimumRaw = String(formData.get('minimumCount') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const roleKey = String(formData.get('roleKey') ?? '').trim();

  const minimum = Number(minimumRaw);
  if (!evidenceTypeId) return fail('Choose the evidence type.');
  if (!Number.isInteger(minimum) || minimum < 1) return fail('Minimum count must be 1 or more.');
  if (roleKey && !SLUG.test(roleKey)) return fail('Role key must be a lowercase slug.');

  const school = await schoolOf(supabase);
  if (!school) return fail('No school is visible to this account.');

  const { error } = await supabase
    .schema('evidence')
    .from('requirement')
    .insert({
      school_id: school,
      academic_year_id: yearId,
      evidence_type_id: evidenceTypeId,
      minimum_count: minimum,
      description: description || null,
      teacher_category_id: String(formData.get('teacherCategoryId') ?? '') || null,
      school_stage_id: String(formData.get('schoolStageId') ?? '') || null,
      role_key: roleKey || null,
      // Evidence requirements are the school's own policy, always. CBSE does not
      // set them, and labelling them otherwise would be the exact confusion the
      // regulatory layer exists to prevent.
      source_framework: 'school',
      source_alignment: 'school_defined',
    });

  if (error) {
    return fail(
      error.code === '23505'
        ? 'A requirement already exists for that evidence type and audience this year.'
        : error.message,
    );
  }

  revalidatePath('/admin/evidence');
  revalidatePath('/me');
  return { ok: true, message: 'Evidence requirement configured for this academic year.' };
}

// ---------------------------------------------------------------------------
// 10. Growth model weights
// ---------------------------------------------------------------------------
/**
 * Adjusts the weights of a growth model's components.
 *
 * Applied in one transaction-shaped update, because the deferred constraint
 * requires the set to total 100 — changing one weight at a time would be
 * refused at the first save. The form therefore submits every weight together.
 */
export async function updateGrowthWeights(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const modelId = String(formData.get('modelId') ?? '');
  if (!modelId) return fail('No growth model specified.');

  const weights: { id: string; weight: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('weight_')) continue;
    const id = key.slice('weight_'.length);
    const weight = Number(String(value));
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      return fail('Every weight must be a number between 0 and 100.');
    }
    weights.push({ id, weight });
  }

  if (weights.length === 0) return fail('No weights submitted.');

  const total = weights.reduce((t, w) => t + w.weight, 0);
  if (Math.abs(total - 100) > 0.001) {
    return fail(
      `The weights total ${total}, not 100. Every component's weight is part of one whole — a model that does not sum to 100 produces a score nobody can interpret.`,
    );
  }

  for (const w of weights) {
    const { error } = await supabase
      .schema('appraisal')
      .from('growth_component')
      .update({ weight_percent: w.weight })
      .eq('id', w.id);
    if (error) return fail(error.message);
  }

  revalidatePath('/admin/growth');
  revalidatePath('/appraisal');
  return {
    ok: true,
    message:
      'Weights updated. Scores already computed keep the model version they were made under — this changes future scores only.',
  };
}

// ---------------------------------------------------------------------------
// 11. Increment readiness thresholds
// ---------------------------------------------------------------------------
export async function updateReadinessRequirement(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await context();
  if (!userId) return fail('Not signed in.');

  const requirementId = String(formData.get('requirementId') ?? '');
  const thresholdRaw = String(formData.get('threshold') ?? '').trim();
  const note = String(formData.get('thresholdNote') ?? '').trim();
  const mandatory = String(formData.get('isMandatory') ?? '') === 'true';

  if (!requirementId) return fail('No requirement specified.');
  if (note.length < 15) {
    return fail(
      'Say what the threshold means, in at least 15 characters. A bar nobody can explain is not a bar anyone can fairly be held to.',
    );
  }

  const threshold = thresholdRaw ? Number(thresholdRaw) : null;
  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0)) {
    return fail('The threshold must be a number of 0 or more, or blank for no threshold.');
  }

  const { error } = await supabase
    .schema('pay')
    .from('readiness_requirement')
    .update({ threshold, threshold_note: note, is_mandatory: mandatory })
    .eq('id', requirementId);
  if (error) return fail(error.message);

  revalidatePath('/admin/growth');
  revalidatePath('/increment');
  return { ok: true, message: 'Threshold updated. Recompute readiness to see its effect.' };
}
