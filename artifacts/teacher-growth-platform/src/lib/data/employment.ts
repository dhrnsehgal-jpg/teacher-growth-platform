import { createClient } from '@/lib/supabase/server';

/**
 * Stage 5 reads: service record, appraisal, growth score, increment readiness.
 *
 * Nothing here holds or returns a salary figure. The platform records which pay
 * arrangement applies and whether an increment is recommended; what anyone is
 * paid is not its business.
 */

export interface ServiceRecord {
  id: string;
  employee_id: string;
  appointment_date: string;
  appointment_letter_reference: string | null;
  employment_category: string | null;
  probation_state: string;
  probation_from: string | null;
  probation_to: string | null;
  confirmed_on: string | null;
  prior_experience_months: number | null;
  separated_on: string | null;
  designation: { display_name: string; rank_order: number } | null;
  service_policy_id: string | null;
}

export interface CareerEvent {
  id: string;
  event_type: string;
  effective_on: string;
  summary: string;
  reference: string | null;
}

export interface Qualification {
  id: string;
  qualification: string;
  awarding_body: string | null;
  subject_or_field: string | null;
  level: string | null;
  awarded_year: number | null;
  verification_status: string;
  verification_note: string | null;
}

export async function getServiceRecord(teacherProfileId: string): Promise<ServiceRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('service')
    .from('service_record')
    // `designation` is embedded by RELATION name, not by column: the FK is
    // composite (designation_id, school_id) and PostgREST rejects the column
    // form with PGRST200 — which this data layer would swallow into "no service
    // record" rather than surface as an error.
    .select(
      `id, employee_id, appointment_date, appointment_letter_reference, employment_category,
       probation_state, probation_from, probation_to, confirmed_on, prior_experience_months,
       separated_on, service_policy_id,
       designation(display_name, rank_order)`,
    )
    .eq('teacher_profile_id', teacherProfileId)
    .maybeSingle();
  return (data as unknown as ServiceRecord) ?? null;
}

export async function getCareerEvents(serviceRecordId: string): Promise<CareerEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('service')
    .from('career_event')
    .select('id, event_type, effective_on, summary, reference')
    .eq('service_record_id', serviceRecordId)
    .order('effective_on', { ascending: false });
  return (data ?? []) as unknown as CareerEvent[];
}

export async function getQualifications(serviceRecordId: string): Promise<Qualification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('service')
    .from('qualification')
    .select(
      'id, qualification, awarding_body, subject_or_field, level, awarded_year, verification_status, verification_note',
    )
    .eq('service_record_id', serviceRecordId);
  return (data ?? []) as unknown as Qualification[];
}

export interface ServicePolicy {
  id: string;
  key: string;
  version: number;
  title: string;
  summary: string | null;
  classification: string;
  verification_status: string;
  applicability: string;
  applicability_note: string | null;
  amendment_status: string | null;
}

export async function getServicePolicies(): Promise<ServicePolicy[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('service')
    .from('policy')
    .select(
      'id, key, version, title, summary, classification, verification_status, applicability, applicability_note, amendment_status',
    )
    .order('key');
  return (data ?? []) as unknown as ServicePolicy[];
}

export interface PayFramework {
  id: string;
  key: string;
  name: string;
  applicability: string;
  applicability_note: string | null;
  classification: string;
  verification_status: string;
  base_structure: string | null;
  increment_rule: string | null;
  progression_rule: string | null;
}

export async function getPayFrameworks(): Promise<PayFramework[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('pay')
    .from('framework')
    .select(
      'id, key, name, applicability, applicability_note, classification, verification_status, base_structure, increment_rule, progression_rule',
    )
    .order('key');
  return (data ?? []) as unknown as PayFramework[];
}

// ---------------------------------------------------------------------------
// Appraisal
// ---------------------------------------------------------------------------

export interface Appraisal {
  id: string;
  teacher_profile_id: string;
  stage: string;
  discussion_held_on: string | null;
  discussion_note: string | null;
  recommendation: string | null;
  recommendation_rationale: string | null;
  recommended_at: string | null;
  approved_at: string | null;
  approval_note: string | null;
  cycle: { name: string; closes_on: string | null } | null;
}

export async function getOwnAppraisal(teacherProfileId: string): Promise<Appraisal | null> {
  const supabase = await createClient();
  await supabase.schema('privacy').rpc('log_access', {
    p_subject_teacher_profile_id: teacherProfileId,
    p_record_type: 'appraisal',
  });
  const { data } = await supabase
    .schema('appraisal')
    .from('appraisal')
    .select(
      `id, teacher_profile_id, stage, discussion_held_on, discussion_note,
       recommendation, recommendation_rationale, recommended_at, approved_at, approval_note,
       cycle!inner(name, closes_on)`,
    )
    .eq('teacher_profile_id', teacherProfileId)
    .maybeSingle();
  return (data as unknown as Appraisal) ?? null;
}

export interface TeacherResponse {
  id: string;
  status: string;
  comment: string | null;
  responded_at: string;
}

export async function getTeacherResponses(appraisalId: string): Promise<TeacherResponse[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('appraisal')
    .from('teacher_response')
    .select('id, status, comment, responded_at')
    .eq('appraisal_id', appraisalId)
    .order('responded_at', { ascending: false });
  return (data ?? []) as unknown as TeacherResponse[];
}

export interface GrowthScore {
  id: string;
  total_percent: number;
  disclaimer: string;
  model_version: number;
  engine_version: string;
  computed_at: string;
}

export interface GrowthScoreComponent {
  id: string;
  component_name: string;
  weight_percent: number;
  raw_result: number;
  weighted_points: number;
  evidence_summary: string;
  evidence_count: number;
  basis: string;
}

export async function getGrowthScore(
  appraisalId: string,
): Promise<{ score: GrowthScore; components: GrowthScoreComponent[] } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('appraisal')
    .from('growth_score')
    .select('id, total_percent, disclaimer, model_version, engine_version, computed_at')
    .eq('appraisal_id', appraisalId)
    .maybeSingle();
  const score = data as unknown as GrowthScore | null;
  if (!score) return null;

  const { data: parts } = await supabase
    .schema('appraisal')
    .from('growth_score_component')
    .select(
      'id, component_name, weight_percent, raw_result, weighted_points, evidence_summary, evidence_count, basis',
    )
    .eq('growth_score_id', score.id)
    .order('weight_percent', { ascending: false });

  return { score, components: (parts ?? []) as unknown as GrowthScoreComponent[] };
}

export interface Representation {
  id: string;
  original_recommendation: string;
  original_rationale: string | null;
  grounds: string;
  status: string;
  outcome: string | null;
  outcome_reason: string | null;
  revised_recommendation: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export async function getRepresentations(appraisalId: string): Promise<Representation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('appraisal')
    .from('representation')
    .select(
      'id, original_recommendation, original_rationale, grounds, status, outcome, outcome_reason, revised_recommendation, submitted_at, reviewed_at',
    )
    .eq('appraisal_id', appraisalId)
    .order('submitted_at', { ascending: false });
  return (data ?? []) as unknown as Representation[];
}

// ---------------------------------------------------------------------------
// Increment
// ---------------------------------------------------------------------------

export interface OutstandingRequirement {
  requirement: string;
  threshold: number | null;
  value: number;
  mandatory: boolean;
  detail: string;
  why: string;
}

export interface Recommendation {
  id: string;
  teacher_profile_id: string;
  readiness_percent: number;
  requirements_total: number;
  requirements_met: number;
  outstanding: OutstandingRequirement[];
  disclaimer: string;
  engine_version: string;
  outcome: string | null;
  outcome_rationale: string | null;
  stage: string;
  proposes_withholding: boolean;
}

export async function getRecommendation(
  teacherProfileId: string,
  yearId: string,
): Promise<Recommendation | null> {
  const supabase = await createClient();
  // Opening somebody else's increment record is logged. Reading your own is
  // not: that is not an access worth investigating, and logging it would bury
  // the ones that are.
  await supabase.schema('privacy').rpc('log_access', {
    p_subject_teacher_profile_id: teacherProfileId,
    p_record_type: 'increment_recommendation',
  });
  const { data } = await supabase
    .schema('pay')
    .from('recommendation')
    .select(
      'id, teacher_profile_id, readiness_percent, requirements_total, requirements_met, outstanding, disclaimer, engine_version, outcome, outcome_rationale, stage, proposes_withholding',
    )
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .maybeSingle();
  return (data as unknown as Recommendation) ?? null;
}

export interface ApprovalStep {
  stage: string;
  step_order: number;
  display_name: string;
  required_permission: string | null;
  note: string | null;
}

export async function getApprovalSteps(): Promise<ApprovalStep[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('pay')
    .from('approval_step')
    .select('stage, step_order, display_name, required_permission, note')
    .order('step_order');
  return (data ?? []) as unknown as ApprovalStep[];
}

export interface Approval {
  id: string;
  stage: string;
  decision: string;
  decided_at: string;
  note: string | null;
}

export async function getApprovals(recommendationId: string): Promise<Approval[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('pay')
    .from('approval')
    .select('id, stage, decision, decided_at, note')
    .eq('recommendation_id', recommendationId)
    .order('decided_at');
  return (data ?? []) as unknown as Approval[];
}

/** The gate message and whether employment calculations are enabled. */
export async function getEmploymentGate(): Promise<{
  enabled: boolean;
  fundingMessage: string;
  serviceRuleMessage: string;
  fundingStatus: string;
}> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .schema('core')
    .from('school_regulatory_profile')
    .select('funding_status')
    .maybeSingle();

  const [{ data: enabled }, { data: fundingMessage }, { data: serviceRuleMessage }] =
    await Promise.all([
      supabase.schema('core').rpc('employment_compliance_enabled', {
        p_school_id: (
          await supabase.schema('core').from('school').select('id').limit(1).maybeSingle()
        ).data?.id,
      }),
      supabase.schema('core').rpc('employment_gate_message'),
      supabase.schema('core').rpc('service_rule_gate_message'),
    ]);

  return {
    enabled: enabled === true,
    fundingMessage: (fundingMessage as string) ?? '',
    serviceRuleMessage: (serviceRuleMessage as string) ?? '',
    fundingStatus:
      (profile as unknown as { funding_status: string } | null)?.funding_status ?? 'unverified',
  };
}
