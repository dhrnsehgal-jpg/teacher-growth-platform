import { createClient } from '@/lib/supabase/server';

/**
 * Reads that exist only to populate admin forms.
 *
 * Every one goes through the RLS-bound client, so an option a user cannot write
 * to is an option they never see — the dropdown is not the access control, but
 * it should not disagree with it either.
 */

export interface Option {
  id: string;
  label: string;
}

async function options(
  schema: string,
  table: string,
  labelColumn: string,
  order = labelColumn,
): Promise<Option[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema(schema)
    .from(table)
    .select(`id, ${labelColumn}`)
    .order(order);
  return ((data ?? []) as unknown as Record<string, string>[]).map((r) => ({
    id: r.id as string,
    label: r[labelColumn] as string,
  }));
}

export interface DomainOption {
  id: string;
  name: string;
  standard_name: string;
  framework_name: string;
  framework_key: string;
}

/** Domains, labelled with the standard and framework above them. */
export async function getDomainOptions(): Promise<DomainOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('competency')
    .from('domain')
    .select(
      // Composite FKs (domain→standard, standard→framework) reject column-name
      // embeds; the relation name is required. Stage 2's lesson, migration 0019.
      `id, name,
       standard!inner(name, framework!inner(name, key))`,
    )
    .order('name');
  return (
    (data ?? []) as unknown as {
      id: string;
      name: string;
      standard: { name: string; framework: { name: string; key: string } };
    }[]
  ).map((d) => ({
    id: d.id,
    name: d.name,
    standard_name: d.standard.name,
    framework_name: d.standard.framework.name,
    framework_key: d.standard.framework.key,
  }));
}

export interface ScaleOption {
  id: string;
  key: string;
  name: string;
  framework_name: string;
  levels: { id: string; ordinal: number; name: string; descriptor: string }[];
}

export async function getProficiencyScales(): Promise<ScaleOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('competency')
    .from('proficiency_scale')
    .select(
      // scale→framework is composite; proficiency_level is the reverse relation.
      `id, key, name,
       framework!inner(name),
       levels:proficiency_level(id, ordinal, name, descriptor)`,
    )
    .order('key');
  return (
    (data ?? []) as unknown as {
      id: string;
      key: string;
      name: string;
      framework: { name: string };
      levels: { id: string; ordinal: number; name: string; descriptor: string }[];
    }[]
  ).map((s) => ({
    id: s.id,
    key: s.key,
    name: s.name,
    framework_name: s.framework.name,
    levels: [...(s.levels ?? [])].sort((a, b) => a.ordinal - b.ordinal),
  }));
}

export const getTeacherCategories = () => options('core', 'teacher_category', 'display_name');
export const getSchoolStages = () => options('core', 'school_stage', 'display_name');
export const getCareerLevels = () => options('core', 'career_level', 'display_name');
export const getSubjects = () => options('core', 'subject', 'display_name');
export const getKpiCategories = () => options('kpi', 'category', 'name');
export const getEvidenceTypes = () => options('evidence', 'evidence_type', 'name');

export interface RoleOption {
  key: string;
  label: string;
}

export async function getRoles(): Promise<RoleOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('core')
    .from('role')
    .select('key, display_name')
    .order('key');
  return ((data ?? []) as unknown as { key: string; display_name: string }[]).map((r) => ({
    key: r.key,
    label: r.display_name,
  }));
}

export interface StaffOption {
  id: string;
  userId: string;
  name: string;
  department: string | null;
}

/** Staff the caller may act on. RLS decides who appears. */
export async function getStaffOptions(): Promise<StaffOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select(
      `id, user_id, is_active,
       user:user_id!inner(full_name),
       department:primary_department_id(display_name)`,
    )
    .eq('is_active', true);
  return (
    (data ?? []) as unknown as {
      id: string;
      user_id: string;
      user: { full_name: string };
      department: { display_name: string } | null;
    }[]
  )
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.user.full_name,
      department: r.department?.display_name ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface KpiTemplateOption {
  id: string;
  key: string;
  name: string;
  category: string;
  default_target: string | null;
  default_weight: number | null;
  is_student_outcome_measure: boolean;
}

export async function getKpiTemplates(): Promise<KpiTemplateOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('kpi')
    .from('template')
    .select(
      // template→category is composite.
      `id, key, name, default_target, default_weight, is_student_outcome_measure,
       category!inner(name)`,
    )
    .eq('status', 'active')
    .order('name');
  return (
    (data ?? []) as unknown as {
      id: string;
      key: string;
      name: string;
      default_target: string | null;
      default_weight: number | null;
      is_student_outcome_measure: boolean;
      category: { name: string };
    }[]
  ).map((t) => ({ ...t, category: t.category.name }));
}

export interface EvidenceRequirementRow {
  id: string;
  minimum_count: number;
  description: string | null;
  role_key: string | null;
  evidence_type_name: string | null;
  teacher_category_name: string | null;
  school_stage_name: string | null;
}

/**
 * Evidence requirements with their audience resolved.
 *
 * `teacher_category_id` and `school_stage_id` point into `core`, and PostgREST
 * cannot embed across schemas — the Stage 2 lesson (migration 0019). Rather
 * than add a view for one admin list, the two lookups are resolved here from
 * option lists the page already needs.
 */
export async function getEvidenceRequirementRows(
  yearId: string,
): Promise<EvidenceRequirementRow[]> {
  const supabase = await createClient();
  const [{ data }, categories, stages] = await Promise.all([
    supabase
      .schema('evidence')
      .from('requirement')
      .select(
        // evidence_type is in the same schema, so this embed is fine.
        'id, minimum_count, description, role_key, teacher_category_id, school_stage_id, evidence_type:evidence_type_id(name)',
      )
      .eq('academic_year_id', yearId),
    getTeacherCategories(),
    getSchoolStages(),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id, c.label]));
  const stageName = new Map(stages.map((s) => [s.id, s.label]));

  return (
    (data ?? []) as unknown as {
      id: string;
      minimum_count: number;
      description: string | null;
      role_key: string | null;
      teacher_category_id: string | null;
      school_stage_id: string | null;
      evidence_type: { name: string } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    minimum_count: r.minimum_count,
    description: r.description,
    role_key: r.role_key,
    evidence_type_name: r.evidence_type?.name ?? null,
    teacher_category_name: r.teacher_category_id
      ? (categoryName.get(r.teacher_category_id) ?? null)
      : null,
    school_stage_name: r.school_stage_id ? (stageName.get(r.school_stage_id) ?? null) : null,
  }));
}

/** Does the signed-in user hold this permission at their school? */
export async function hasPermission(permission: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: school } = await supabase
    .schema('core')
    .from('school')
    .select('id')
    .limit(1)
    .maybeSingle();
  const schoolId = (school as unknown as { id: string } | null)?.id;
  if (!schoolId) return false;

  const { data } = await supabase.schema('core').rpc('has_permission', {
    p_school_id: schoolId,
    p_permission: permission,
  });
  return data === true;
}
