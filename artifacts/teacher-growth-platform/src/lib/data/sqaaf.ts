import { createClient } from '@/lib/supabase/server';

/**
 * SQAAF reads.
 *
 * The framework structure is reference data: readable by every school member,
 * like the competency framework. The self-assessment itself is institutional and
 * sits behind `sqaaf.read`.
 */

export interface StandardDetail {
  standard_id: string;
  standard_code: string;
  statement: string;
  applies_when: string;
  platform_relevant: boolean;
  relevance_note: string | null;
  sub_domain_code: string;
  sub_domain_name: string;
  domain_id: string;
  domain_number: number;
  domain_name: string;
  weightage_percent: number;
  platform_coverage: 'primary' | 'partial' | 'none';
  coverage_note: string | null;
  version_id: string;
  edition_label: string;
  verification_status: string;
}

export interface PerformanceLevel {
  id: string;
  level_number: number;
  roman_label: string;
  display_name: string;
  score: number;
  description: string | null;
}

export interface SelfAssessment {
  id: string;
  academic_year_id: string;
  version_id: string;
  status: string;
  started_at: string | null;
  externally_submitted_at: string | null;
}

export interface ReadinessRow {
  self_assessment_id: string;
  domain_id: string;
  domain_number: number;
  domain_name: string;
  platform_coverage: 'primary' | 'partial' | 'none';
  standards_total: number;
  standards_platform_relevant: number;
  standards_rated: number;
  /** Anything mapped, whatever its state. */
  standards_with_evidence: number;
  /** What actually counts: the underlying record is verified. */
  standards_with_verified_evidence: number;
  /** Mapped, but nothing verified behind it yet. */
  standards_with_unverified_evidence_only: number;
  standards_with_gap: number;
  /** Standards with no VERIFIED evidence — the actionable number. */
  platform_relevant_without_evidence: number;
}

export interface ImprovementAction {
  id: string;
  standard_code: string;
  standard_statement: string;
  domain_number: number;
  domain_name: string;
  priority: 'low' | 'medium' | 'high';
  area_of_improvement: string;
  proposed_action: string;
  convenor_name: string | null;
  team_note: string | null;
  target_date: string | null;
  status: string;
  reviewed_at: string | null;
  review_note: string | null;
  completed_at: string | null;
  current_level_name: string | null;
  aspirational_level_name: string | null;
  is_overdue: boolean;
}

export interface RatingRow {
  id: string;
  standard_id: string;
  rationale: string;
  priority: 'low' | 'medium' | 'high' | null;
  level: { display_name: string; level_number: number; score: number } | null;
  aspirational: { display_name: string; level_number: number } | null;
}

export async function getFrameworkVersion() {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('sqaaf')
    .from('framework_version')
    .select(
      'id, key, edition_label, total_standards, total_marks, max_level_score, verification_status, effective_from, notes',
    )
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (
    (data as unknown as {
      id: string;
      key: string;
      edition_label: string;
      total_standards: number;
      total_marks: number;
      max_level_score: number;
      verification_status: string;
      effective_from: string;
      notes: string | null;
    }) ?? null
  );
}

export async function getPerformanceLevels(versionId: string): Promise<PerformanceLevel[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('sqaaf')
    .from('performance_level')
    .select('id, level_number, roman_label, display_name, score, description')
    .eq('version_id', versionId)
    .order('level_number');
  return (data ?? []) as unknown as PerformanceLevel[];
}

export async function getStandards(options?: {
  platformRelevantOnly?: boolean;
  domainNumber?: number;
}): Promise<StandardDetail[]> {
  const supabase = await createClient();
  let query = supabase.schema('sqaaf').from('standard_detail').select('*');
  if (options?.platformRelevantOnly) query = query.eq('platform_relevant', true);
  if (options?.domainNumber) query = query.eq('domain_number', options.domainNumber);
  const { data } = await query.order('standard_code');
  return (data ?? []) as unknown as StandardDetail[];
}

export async function getSelfAssessment(yearId: string): Promise<SelfAssessment | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('sqaaf')
    .from('self_assessment')
    .select('id, academic_year_id, version_id, status, started_at, externally_submitted_at')
    .eq('academic_year_id', yearId)
    .maybeSingle();
  return (data as unknown as SelfAssessment) ?? null;
}

export async function getReadiness(selfAssessmentId: string): Promise<ReadinessRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('sqaaf')
    .from('evidence_readiness')
    .select('*')
    .eq('self_assessment_id', selfAssessmentId)
    .order('domain_number');
  return (data ?? []) as unknown as ReadinessRow[];
}

export async function getRatings(selfAssessmentId: string): Promise<RatingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('sqaaf')
    .from('standard_rating')
    .select(
      // Both FKs are COMPOSITE and both point at the same table, so PostgREST
      // needs the relation name plus the constraint to disambiguate. Naming the
      // FK column — `level:level_id(...)` — fails outright for a composite key.
      // This is the Stage 2 embed trap (migration 0019) in a new place.
      `id, standard_id, rationale, priority,
       level:performance_level!standard_rating_level_id_school_id_fkey(display_name, level_number, score),
       aspirational:performance_level!standard_rating_aspirational_level_id_school_id_fkey(display_name, level_number)`,
    )
    .eq('self_assessment_id', selfAssessmentId);
  return (data ?? []) as unknown as RatingRow[];
}

export async function getImprovementActions(
  selfAssessmentId: string,
): Promise<ImprovementAction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('sqaaf')
    .from('improvement_action_detail')
    .select('*')
    .eq('self_assessment_id', selfAssessmentId)
    .order('priority', { ascending: false })
    .order('target_date', { nullsFirst: false });
  return (data ?? []) as unknown as ImprovementAction[];
}

export interface EvidenceGapRow {
  id: string;
  standard_id: string;
  description: string;
  identified_at: string;
  resolved_at: string | null;
  standard?: { code: string } | null;
}

export async function getEvidenceGaps(selfAssessmentId: string): Promise<EvidenceGapRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('sqaaf')
    .from('evidence_gap')
    .select('id, standard_id, description, identified_at, resolved_at, standard(code)')
    .eq('self_assessment_id', selfAssessmentId);
  return (data ?? []) as unknown as EvidenceGapRow[];
}

export interface MappedEvidence {
  id: string;
  standard_id: string;
  standard_code: string;
  note: string | null;
  aggregate_note: string | null;
  /** Which kind of platform record this points at. */
  kind: string;
  /** The status of that record, resolved — never stored on the mapping. */
  evidence_status: string;
  is_verified: boolean;
}

export async function getEvidenceMap(selfAssessmentId: string): Promise<MappedEvidence[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('sqaaf')
    .from('evidence_map_detail')
    .select(
      'id, standard_id, standard_code, note, aggregate_note, kind, evidence_status, is_verified',
    )
    .eq('self_assessment_id', selfAssessmentId);
  return (data ?? []) as unknown as MappedEvidence[];
}

export interface SubmissionWindow {
  opens_on: string | null;
  closes_on: string | null;
  verification_status: string;
  source_note: string | null;
}

export async function getSubmissionWindow(yearId: string): Promise<SubmissionWindow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('sqaaf')
    .from('submission_window')
    .select('opens_on, closes_on, verification_status, source_note')
    .eq('academic_year_id', yearId)
    .maybeSingle();
  return (data as unknown as SubmissionWindow) ?? null;
}

const KIND_LABEL: Record<string, string> = {
  cpd_record: 'CPD record',
  evidence: 'Evidence',
  verified_competency: 'Verified competency',
  teacher_kpi: 'KPI',
  plan_item: 'Development plan item',
  aggregate_note: 'Aggregate note',
};

/** What kind of platform record an evidence-map row points at. */
export function evidenceKind(m: MappedEvidence): string {
  return KIND_LABEL[m.kind] ?? m.kind;
}

export const COVERAGE_LABEL: Record<string, string> = {
  primary: 'Primary evidence source',
  partial: 'Partial — some standards only',
  none: 'Not covered by this platform',
};
