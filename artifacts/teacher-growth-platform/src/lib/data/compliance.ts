import { createClient } from '@/lib/supabase/server';

/**
 * CPD compliance reads.
 *
 * Every figure here comes from the database — `compliance.cpd_progress()` and
 * the configuration tables behind it. This module deliberately contains no CPD
 * hour constant: not 50, not 25, not the domain allocation. A test asserts that
 * no file under `src/` does, because a number duplicated in application code is
 * a number that will disagree with the rule one day.
 */

export type ComplianceState = 'compliant' | 'on_track' | 'at_risk' | 'not_met';
export type SourceClass = 'board_or_government' | 'school_or_complex';

export interface ProgressRow {
  dimension: 'total' | 'source_class' | 'category' | 'category_source';
  item_key: string;
  label: string;
  source_class: SourceClass | null;
  required_hours: number;
  completed_hours: number;
  remaining_hours: number;
  state: ComplianceState;
  engine_version: string;
}

export interface CpdRecordRow {
  id: string;
  teacher_profile_id: string;
  teacher_name: string;
  title: string;
  description: string | null;
  category_key: string;
  category_name: string;
  source_class: SourceClass;
  source_type_key: string;
  source_type_name: string;
  counts_toward_requirement: boolean;
  provider_name: string | null;
  activity_from: string;
  activity_to: string;
  duration_hours: number;
  hour_basis: 'attendance' | 'activity_rule';
  activity_rule_name: string | null;
  claimed_hours: number;
  credited_hours: number | null;
  status: string;
  certificate_evidence_id: string | null;
  external_reference: string | null;
  review_note: string | null;
  competency_link_count: number;
}

export interface RequirementVersion {
  id: string;
  key: string;
  version: number;
  title: string;
  total_hours: number;
  classification: string;
  verification_status: string;
  applicability: string;
  applicability_note: string | null;
  clause_reference: string | null;
  effective_from: string;
  effective_to: string | null;
}

/** The rule governing a year, resolved by the database, not by the caller. */
export async function getRequirementVersion(
  schoolId: string,
  yearId: string,
): Promise<RequirementVersion | null> {
  const supabase = await createClient();
  const { data } = await supabase.schema('compliance').rpc('requirement_version_for_year', {
    p_school_id: schoolId,
    p_academic_year_id: yearId,
  });
  const row = Array.isArray(data) ? data[0] : data;
  return (row as RequirementVersion) ?? null;
}

export async function getCpdProgress(
  teacherProfileId: string,
  yearId: string,
): Promise<ProgressRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.schema('compliance').rpc('cpd_progress', {
    p_teacher_profile_id: teacherProfileId,
    p_academic_year_id: yearId,
  });
  return (data ?? []) as ProgressRow[];
}

export async function getCpdRecords(
  teacherProfileId: string,
  yearId: string,
): Promise<CpdRecordRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('compliance')
    .from('cpd_record_detail')
    .select('*')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .order('activity_from', { ascending: false });
  return (data ?? []) as unknown as CpdRecordRow[];
}

/** Records awaiting a reviewer, across everyone the caller can see. */
export async function getCpdAwaitingReview(yearId: string): Promise<CpdRecordRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('compliance')
    .from('cpd_record_detail')
    .select('*')
    .eq('academic_year_id', yearId)
    .eq('status', 'submitted')
    .order('activity_from');
  return (data ?? []) as unknown as CpdRecordRow[];
}

export interface CategoryOption {
  id: string;
  key: string;
  display_name: string;
}
export interface SourceTypeOption {
  id: string;
  key: string;
  display_name: string;
  source_class: SourceClass;
  counts_toward_requirement: boolean;
}
export interface ActivityRuleOption {
  id: string;
  key: string;
  permitted_activity: string;
  hour_credit: number;
  required_evidence: string;
  clause_reference: string | null;
  verification_status: string;
  cap_group_id: string | null;
}

export async function getCpdCategories(): Promise<CategoryOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('compliance')
    .from('cpd_category')
    .select('id, key, display_name')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []) as unknown as CategoryOption[];
}

export async function getCpdSourceTypes(): Promise<SourceTypeOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('compliance')
    .from('cpd_source_type')
    .select('id, key, display_name, source_class, counts_toward_requirement')
    .eq('is_active', true)
    .order('display_name');
  return (data ?? []) as unknown as SourceTypeOption[];
}

export async function getActivityRules(versionId: string): Promise<ActivityRuleOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('compliance')
    .from('cpd_activity_rule')
    .select(
      'id, key, permitted_activity, hour_credit, required_evidence, clause_reference, verification_status, cap_group_id',
    )
    .eq('version_id', versionId)
    .eq('is_active', true)
    .order('hour_credit', { ascending: false });
  return (data ?? []) as unknown as ActivityRuleOption[];
}

export interface CapGroup {
  id: string;
  display_name: string;
  cap_hours: number;
  cap_basis: string;
}

export async function getCapGroups(versionId: string): Promise<CapGroup[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('compliance')
    .from('cpd_rule_cap_group')
    .select('id, display_name, cap_hours, cap_basis')
    .eq('version_id', versionId);
  return (data ?? []) as unknown as CapGroup[];
}

/**
 * Whole-school CPD position.
 *
 * Runs the same per-teacher engine for each teacher rather than a separate
 * aggregate query, so the management dashboard and the teacher's own page can
 * never show different numbers for the same person.
 */
export interface TeacherComplianceRow {
  teacherProfileId: string;
  name: string;
  department: string | null;
  category: string | null;
  /** Every stage this teacher teaches. A teacher may span more than one. */
  stages: string[];
  total: ProgressRow | null;
  bySource: ProgressRow[];
  byCategory: ProgressRow[];
  missingCategories: string[];
  missingSources: string[];
}

export async function getSchoolCpdOverview(yearId: string): Promise<TeacherComplianceRow[]> {
  const supabase = await createClient();
  const { data: staff } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select(
      `id, is_active,
       user:user_id!inner(full_name),
       department:primary_department_id(display_name),
       teacher_category:teacher_category_id(display_name)`,
    )
    .eq('is_active', true);

  const rows = (staff ?? []) as unknown as {
    id: string;
    user: { full_name: string };
    department: { display_name: string } | null;
    teacher_category: { display_name: string } | null;
  }[];

  // Stage comes from teaching assignments, not the profile: a teacher can teach
  // more than one stage, and the platform has always treated stage that way.
  const { data: assignments } = await supabase
    .schema('core')
    .from('teacher_teaching_assignment')
    .select('teacher_profile_id, school_stage:school_stage_id(display_name, sort_order)')
    .eq('academic_year_id', yearId);

  const stagesByTeacher = new Map<string, Set<string>>();
  for (const a of (assignments ?? []) as unknown as {
    teacher_profile_id: string;
    school_stage: { display_name: string } | null;
  }[]) {
    if (!a.school_stage) continue;
    const set = stagesByTeacher.get(a.teacher_profile_id) ?? new Set<string>();
    set.add(a.school_stage.display_name);
    stagesByTeacher.set(a.teacher_profile_id, set);
  }

  const results = await Promise.all(
    rows.map(async (r) => {
      const progress = await getCpdProgress(r.id, yearId);
      const byCategory = progress.filter((p) => p.dimension === 'category');
      const bySource = progress.filter((p) => p.dimension === 'source_class');
      return {
        teacherProfileId: r.id,
        name: r.user.full_name,
        department: r.department?.display_name ?? null,
        category: r.teacher_category?.display_name ?? null,
        stages: [...(stagesByTeacher.get(r.id) ?? [])].sort(),
        total: progress.find((p) => p.dimension === 'total') ?? null,
        bySource,
        byCategory,
        missingCategories: byCategory.filter((c) => c.remaining_hours > 0).map((c) => c.label),
        missingSources: bySource.filter((s) => s.remaining_hours > 0).map((s) => s.label),
      };
    }),
  );

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export const STATE_LABEL: Record<ComplianceState, string> = {
  compliant: 'Compliant',
  on_track: 'On track',
  at_risk: 'At risk',
  not_met: 'Not met',
};

export const STATE_CLASS: Record<ComplianceState, string> = {
  compliant: 'bg-foreground text-background',
  on_track: 'bg-muted text-foreground',
  at_risk: 'bg-caution text-caution-foreground',
  not_met: 'bg-caution text-caution-foreground',
};
