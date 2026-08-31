/**
 * Teacher Professional Profile queries.
 *
 * `competency.resolve_targets` is called as an RPC so the resolution logic lives
 * in exactly one place — the database — rather than being reimplemented, and
 * inevitably diverging, in the application.
 */

import { dataClient } from './client';
import * as preview from './preview';
import type { SourceAlignment, SourceFramework } from '@/lib/competency/source';

export interface TeacherProfileSummary {
  id: string;
  employee_code: string | null;
  date_of_joining: string | null;
  employment_status: string;
  has_leadership_responsibility: boolean;
  user: { full_name: string; email: string };
  department: { display_name: string } | null;
  teacher_category: { display_name: string } | null;
  career_level: { display_name: string } | null;
}

export interface ResolvedTarget {
  competency_id: string;
  competency_key: string;
  competency_name: string;
  domain_name: string;
  standard_name: string;
  source_framework: SourceFramework;
  source_alignment: SourceAlignment;
  external_reference: string | null;
  target_level_key: string;
  target_level_name: string;
  target_ordinal: number;
  specificity: number;
  weight: number | null;
  rationale: string | null;
}

export interface TeacherKpi {
  id: string;
  name: string;
  description: string;
  metric: string;
  target: string;
  weight: number;
  frequency: string;
  data_source: string;
  evidence_requirement: string | null;
  is_student_outcome_measure: boolean;
  status: string;
  category_name: string | null;
  reviewer_name: string | null;
}

export interface TeachingAssignment {
  subject: { display_name: string } | null;
  class_level: { display_name: string } | null;
  school_stage: { display_name: string } | null;
}

export interface ProfessionalGoal {
  id: string;
  title: string;
  description: string | null;
  success_measure: string | null;
  target_date: string | null;
  status: string;
}

/** The signed-in user's own profile, or null if they are not a teacher. */
export async function getOwnProfile(): Promise<TeacherProfileSummary | null> {
  if (preview.isPreviewMode()) {
    const [row] = await preview.q<TeacherProfileSummary>(preview.sqlOwnProfile);
    return row ?? null;
  }
  const supabase = await dataClient();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select(
      `id, employee_code, date_of_joining, employment_status, has_leadership_responsibility,
       user:user_id!inner(full_name, email),
       department:primary_department_id(display_name),
       teacher_category:teacher_category_id(display_name),
       career_level:career_level_id(display_name)`,
    )
    .eq('user_id', auth.user.id)
    .maybeSingle();

  return (data as unknown as TeacherProfileSummary) ?? null;
}

export async function getCurrentAcademicYear(): Promise<{ id: string; label: string } | null> {
  if (preview.isPreviewMode()) {
    const [row] = await preview.q<{ id: string; label: string }>(preview.sqlCurrentYear);
    return row ?? null;
  }
  const supabase = await dataClient();
  if (!supabase) return null;
  const { data } = await supabase
    .schema('core')
    .from('academic_year')
    .select('id, label')
    .eq('is_current', true)
    .maybeSingle();
  return (data as unknown as { id: string; label: string }) ?? null;
}

export async function getResolvedTargets(
  teacherProfileId: string,
  academicYearId: string,
): Promise<ResolvedTarget[]> {
  if (preview.isPreviewMode()) {
    return preview.q<ResolvedTarget>(preview.sqlResolvedTargets, [
      teacherProfileId,
      academicYearId,
    ]);
  }
  const supabase = await dataClient();
  if (!supabase) return [];
  const { data } = await supabase.schema('competency').rpc('resolve_targets', {
    p_teacher_profile_id: teacherProfileId,
    p_academic_year_id: academicYearId,
  });
  return (data ?? []) as unknown as ResolvedTarget[];
}

export async function getTeacherKpis(
  teacherProfileId: string,
  academicYearId: string,
): Promise<TeacherKpi[]> {
  if (preview.isPreviewMode()) {
    return preview.q<TeacherKpi>(preview.sqlTeacherKpis, [teacherProfileId, academicYearId]);
  }
  const supabase = await dataClient();
  if (!supabase) return [];
  const { data } = await supabase
    // A view, because the reviewer join crosses into the `core` schema and
    // PostgREST cannot embed across schemas.
    .schema('kpi')
    .from('teacher_kpi_detail')
    .select(
      `id, name, description, metric, target, weight, frequency, data_source,
       evidence_requirement, is_student_outcome_measure, status,
       category_name, reviewer_name`,
    )
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', academicYearId)
    .order('weight', { ascending: false });
  return (data ?? []) as unknown as TeacherKpi[];
}

export async function getTeachingAssignments(
  teacherProfileId: string,
  academicYearId: string,
): Promise<TeachingAssignment[]> {
  if (preview.isPreviewMode()) {
    return preview.q<TeachingAssignment>(preview.sqlTeachingAssignments, [
      teacherProfileId,
      academicYearId,
    ]);
  }
  const supabase = await dataClient();
  if (!supabase) return [];
  const { data } = await supabase
    .schema('core')
    .from('teacher_teaching_assignment')
    .select(
      `subject:subject_id(display_name),
       class_level:class_level_id(display_name),
       school_stage:school_stage_id(display_name)`,
    )
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', academicYearId);
  return (data ?? []) as unknown as TeachingAssignment[];
}

export async function getProfessionalGoals(
  teacherProfileId: string,
  academicYearId: string,
): Promise<ProfessionalGoal[]> {
  if (preview.isPreviewMode()) {
    return preview.q<ProfessionalGoal>(preview.sqlGoals, [teacherProfileId, academicYearId]);
  }
  const supabase = await dataClient();
  if (!supabase) return [];
  const { data } = await supabase
    .schema('growth')
    .from('professional_goal')
    .select('id, title, description, success_measure, target_date, status')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', academicYearId)
    .order('created_at');
  return (data ?? []) as unknown as ProfessionalGoal[];
}

export interface EvidenceRequirementRow {
  minimum_count: number;
  description: string | null;
  evidence_type: { key: string; name: string; submission_guidance: string | null } | null;
}

export async function getEvidenceRequirements(
  academicYearId: string,
): Promise<EvidenceRequirementRow[]> {
  if (preview.isPreviewMode()) {
    return preview.q<EvidenceRequirementRow>(preview.sqlEvidenceRequirements, [academicYearId]);
  }
  const supabase = await dataClient();
  if (!supabase) return [];
  const { data } = await supabase
    .schema('evidence')
    .from('requirement')
    .select(
      'minimum_count, description, evidence_type:evidence_type_id(key, name, submission_guidance)',
    )
    .eq('academic_year_id', academicYearId);
  return (data ?? []) as unknown as EvidenceRequirementRow[];
}
