import { createClient } from '@/lib/supabase/server';

/**
 * Leadership analytics reads.
 *
 * Every query goes through the RLS-bound client, so a Head of Department's
 * heatmap covers their department and a Principal's covers the school without
 * either being special-cased here.
 *
 * Nothing in this module orders teachers by performance. The heatmap is a
 * matrix; the aggregates group by cohort.
 */

export interface HeatmapRow {
  teacher_profile_id: string;
  teacher_name: string;
  department: string | null;
  department_key: string | null;
  teacher_category: string | null;
  teacher_category_key: string | null;
  career_level: string | null;
  career_level_key: string | null;
  /** Many-to-many with a teacher, so arrays — see migration 0056. */
  school_stages: string[];
  school_stage_keys: string[];
  subjects: string[];
  subject_keys: string[];
  managers: string[];
  manager_user_ids: string[];
  competency_key: string;
  competency_name: string;
  domain_name: string;
  verified_ordinal: number;
  verified_level: string;
  expected_ordinal: number;
  expected_level: string;
  gap_size: number;
  meets_expectation: boolean;
  priority_score: number | null;
  priority_band_key: string | null;
}

export interface HeatmapFilters {
  department?: string;
  teacherCategory?: string;
  careerLevel?: string;
  schoolStage?: string;
  subject?: string;
  manager?: string;
}

export async function getHeatmap(
  yearId: string,
  filters: HeatmapFilters = {},
): Promise<HeatmapRow[]> {
  const supabase = await createClient();
  let query = supabase
    .schema('growth')
    .from('competency_heatmap')
    .select('*')
    .eq('academic_year_id', yearId);

  if (filters.department) query = query.eq('department_key', filters.department);
  if (filters.teacherCategory) query = query.eq('teacher_category_key', filters.teacherCategory);
  if (filters.careerLevel) query = query.eq('career_level_key', filters.careerLevel);
  // Array containment, not equality: a teacher covering three stages appears
  // once, and filtering to any one of them keeps their row rather than
  // duplicating it.
  if (filters.schoolStage) query = query.contains('school_stage_keys', [filters.schoolStage]);
  if (filters.subject) query = query.contains('subject_keys', [filters.subject]);
  if (filters.manager) query = query.contains('manager_user_ids', [filters.manager]);

  const { data } = await query;
  return (data ?? []) as unknown as HeatmapRow[];
}

export interface TrainingNeed {
  competency_key: string;
  competency_name: string;
  stage: string;
  department: string;
  group_size: number;
  teachers_with_gap: number;
  share_percent: number;
  high_or_critical: number;
  avg_priority: number | null;
  statement: string;
}

export async function getTrainingNeeds(
  yearId: string,
  minGroupSize = 3,
  minSharePercent = 40,
): Promise<TrainingNeed[]> {
  const supabase = await createClient();
  const { data } = await supabase.schema('growth').rpc('training_needs', {
    p_academic_year_id: yearId,
    p_min_group_size: minGroupSize,
    p_min_share_percent: minSharePercent,
  });
  return (data ?? []) as unknown as TrainingNeed[];
}

export interface ProgrammeImpact {
  activity_id: string;
  activity_title: string;
  provider_name: string;
  times_selected: number;
  times_completed: number;
  times_applied: number;
  times_impact_verified: number;
  times_followed_by_reassessment: number;
}

export async function getProgrammeImpact(): Promise<ProgrammeImpact[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('cpd')
    .from('programme_impact')
    .select('*')
    .order('times_selected', { ascending: false });
  return (data ?? []) as unknown as ProgrammeImpact[];
}

/** Teachers in one gap cluster, and the CPD that addresses it. */
export interface ClusterMember {
  teacher_profile_id: string;
  teacher_name: string;
  department: string | null;
  gap_size: number;
  priority_score: number | null;
}

export async function getCluster(yearId: string, competencyKey: string): Promise<ClusterMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('growth')
    .from('competency_heatmap')
    .select('teacher_profile_id, teacher_name, department, gap_size, priority_score')
    .eq('academic_year_id', yearId)
    .eq('competency_key', competencyKey)
    .gt('gap_size', 0)
    .order('priority_score', { ascending: false });
  return (data ?? []) as unknown as ClusterMember[];
}

export interface ClusterActivity {
  id: string;
  title: string;
  provider_name: string;
  cpd_hours: number | null;
  delivery_method: string | null;
  capacity: number | null;
}

export async function getActivitiesFor(competencyKey: string): Promise<ClusterActivity[]> {
  const supabase = await createClient();
  const { data: comp } = await supabase
    .schema('competency')
    .from('competency')
    .select('id')
    .eq('key', competencyKey)
    .maybeSingle();
  const competencyId = (comp as unknown as { id: string } | null)?.id;
  if (!competencyId) return [];

  const { data } = await supabase
    .schema('cpd')
    .from('activity_competency')
    // `activity` by relation name: the FK is composite (activity_id, school_id)
    // and PostgREST rejects the column form with PGRST200, which this data layer
    // would swallow into "no activities mapped".
    .select('activity(id, title, cpd_hours, delivery_method, capacity, provider(name))')
    .eq('competency_id', competencyId);

  return (
    (data ?? []) as unknown as {
      activity: {
        id: string;
        title: string;
        cpd_hours: number | null;
        delivery_method: string | null;
        capacity: number | null;
        provider: { name: string } | null;
      } | null;
    }[]
  )
    .filter((r) => r.activity)
    .map((r) => ({
      id: r.activity!.id,
      title: r.activity!.title,
      provider_name: r.activity!.provider?.name ?? 'Unknown provider',
      cpd_hours: r.activity!.cpd_hours,
      delivery_method: r.activity!.delivery_method,
      capacity: r.activity!.capacity,
    }));
}

/** Whole-school figures for the leadership overview. */
export interface SchoolSummary {
  staff: number;
  assessedCompetencies: number;
  meetingExpectation: number;
  openGaps: number;
  highOrCritical: number;
  reassessments: number;
  needingSupport: { teacher_profile_id: string; teacher_name: string; high: number }[];
  strongGrowth: { teacher_profile_id: string; teacher_name: string; reassessments: number }[];
}

export async function getSchoolSummary(yearId: string): Promise<SchoolSummary> {
  const rows = await getHeatmap(yearId);

  const byTeacher = new Map<string, { name: string; high: number }>();
  for (const r of rows) {
    if (r.priority_band_key === 'high' || r.priority_band_key === 'critical') {
      const acc = byTeacher.get(r.teacher_profile_id) ?? { name: r.teacher_name, high: 0 };
      acc.high += 1;
      byTeacher.set(r.teacher_profile_id, acc);
    }
  }

  const supabase = await createClient();
  const { data: reassessed } = await supabase
    .schema('assessment')
    .from('verified_competency')
    .select('teacher_profile_id, is_reassessment')
    .eq('academic_year_id', yearId)
    .eq('is_reassessment', true);

  const growthByTeacher = new Map<string, number>();
  for (const r of (reassessed ?? []) as unknown as { teacher_profile_id: string }[]) {
    growthByTeacher.set(r.teacher_profile_id, (growthByTeacher.get(r.teacher_profile_id) ?? 0) + 1);
  }
  const nameFor = new Map(rows.map((r) => [r.teacher_profile_id, r.teacher_name]));

  return {
    staff: new Set(rows.map((r) => r.teacher_profile_id)).size,
    assessedCompetencies: rows.length,
    meetingExpectation: rows.filter((r) => r.meets_expectation).length,
    openGaps: rows.filter((r) => r.gap_size > 0).length,
    highOrCritical: rows.filter(
      (r) => r.priority_band_key === 'high' || r.priority_band_key === 'critical',
    ).length,
    reassessments: (reassessed ?? []).length,
    // "Teachers requiring support" — deliberately those with the most
    // high-priority gaps, which is a statement about workload and development
    // need, not a ranking of quality.
    needingSupport: [...byTeacher.entries()]
      .map(([id, v]) => ({ teacher_profile_id: id, teacher_name: v.name, high: v.high }))
      .sort((a, b) => b.high - a.high)
      .slice(0, 5),
    strongGrowth: [...growthByTeacher.entries()]
      .map(([id, n]) => ({
        teacher_profile_id: id,
        teacher_name: nameFor.get(id) ?? 'Unknown',
        reassessments: n,
      }))
      .sort((a, b) => b.reassessments - a.reassessments)
      .slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// The school analytics the brief enumerates
// ---------------------------------------------------------------------------

export interface KpiTrendRow {
  academic_year: string;
  category_name: string;
  kpis_assigned: number;
  teachers_covered: number;
  mean_weight: number | null;
  student_outcome_weight: number | null;
  total_weight: number | null;
  student_outcome_measures: number;
}

export async function getKpiTrend(): Promise<KpiTrendRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('kpi')
    .from('kpi_trend')
    .select('*')
    .order('academic_year', { ascending: false })
    .order('category_name');
  return (data ?? []) as unknown as KpiTrendRow[];
}

export interface InvestmentRow {
  department: string;
  teachers_with_a_plan: number;
  items_planned: number;
  items_approved: number;
  items_completed: number;
  items_reaching_verified_impact: number;
  hours_planned: number;
  hours_completed: number;
  cost_planned: number;
  cost_committed: number;
}

export async function getDevelopmentInvestment(yearId: string): Promise<InvestmentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('growth')
    .from('development_investment')
    .select('*')
    .eq('academic_year_id', yearId)
    .order('department');
  return (data ?? []) as unknown as InvestmentRow[];
}

export interface PipelineRow {
  career_level: string;
  level_order: number;
  teachers: number;
}

export async function getCareerPipeline(): Promise<PipelineRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('core')
    .from('career_pipeline')
    .select('*')
    .order('level_order');
  return (data ?? []) as unknown as PipelineRow[];
}

export interface RecommendationDistributionRow {
  /** Null until a recommendation reaches an outcome — a real bar, not a gap. */
  outcome: string | null;
  recommendations: number;
  proposing_withholding: number;
}

/**
 * Increment recommendations by outcome.
 *
 * Returns nothing for a reader without `increment.read` — the view is
 * security_invoker over an RLS-protected table, so the empty result IS the
 * permission working rather than a missing feature.
 */
export async function getRecommendationDistribution(
  yearId: string,
): Promise<RecommendationDistributionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('pay')
    .from('recommendation_distribution')
    .select('*')
    .eq('academic_year_id', yearId)
    .order('outcome');
  return (data ?? []) as unknown as RecommendationDistributionRow[];
}

export interface SqaafReadinessRow {
  domain_number: number;
  domain_name: string;
  standards_platform_relevant: number;
  standards_with_verified_evidence: number;
  platform_relevant_without_evidence: number;
}

export async function getSqaafReadiness(yearId: string): Promise<SqaafReadinessRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('sqaaf')
    .from('evidence_readiness')
    .select(
      'domain_number, domain_name, standards_platform_relevant, standards_with_verified_evidence, platform_relevant_without_evidence',
    )
    .eq('academic_year_id', yearId)
    .order('domain_number');
  return (data ?? []) as unknown as SqaafReadinessRow[];
}
