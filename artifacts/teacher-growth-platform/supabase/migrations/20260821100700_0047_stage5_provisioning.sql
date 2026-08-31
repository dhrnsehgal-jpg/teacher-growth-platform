-- ===========================================================================
-- 0047 — Stage 5 provisioning
-- ===========================================================================
-- Every Punjab rule below is recorded as REQUIRES VERIFICATION with its
-- applicability undetermined. That is not a placeholder: `indiacode.nic.in`
-- returned HTTP 403 and `pbhe.punjab.gov.in` refused the connection, so no
-- Punjab instrument has been read. The brief is explicit — do not invent the
-- requirement, and never infer applicability from a statute's title.
--
-- The titles here are what the sources are CALLED. Nothing about their content,
-- scope or current amendment status is asserted, and the applicability trigger
-- from migration 0040 will refuse to mark any of them applicable while the
-- school's funding status is unverified.
--
-- Provisioned as a function called by the seed, because `core.school` is empty
-- at migration time on a fresh reset.
-- ===========================================================================

create function service.provision_stage5(p_school_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_year uuid;
  v_admin uuid;
  v_model uuid;
  v_readiness uuid;
  v_cycle uuid;
  v_authority uuid;
begin
  select id into v_year from core.academic_year where school_id = p_school_id and is_current;

  select ra.user_id into v_admin
  from core.user_role_assignment ra
  join core.role_permission rp on rp.role_id = ra.role_id
  where ra.school_id = p_school_id and rp.permission_key = 'school.manage'
  limit 1;

  -- =========================================================================
  -- The employment ladder
  -- =========================================================================
  insert into service.designation
    (school_id, key, display_name, rank_order, carries_leadership, description, source_note)
  values
    (p_school_id, 'teacher', 'Teacher', 1, false,
     'Classroom teaching post.',
     'School-defined organisational structure. No Punjab or CBSE designation structure has been verified for this school.'),
    (p_school_id, 'senior_teacher', 'Senior Teacher', 2, false,
     'Experienced classroom post with additional subject responsibility.', null),
    (p_school_id, 'coordinator', 'Coordinator', 3, true,
     'Coordinates a stage, subject or programme.', null),
    (p_school_id, 'head_of_department', 'Head of Department', 4, true,
     'Leads a department: assessment, observation and development of its staff.', null),
    (p_school_id, 'academic_coordinator', 'Academic Coordinator', 5, true,
     'Academic leadership across stages.', null),
    (p_school_id, 'vice_principal', 'Vice Principal', 6, true,
     'Deputy head of school.', null),
    (p_school_id, 'principal', 'Principal', 7, true,
     'Head of school.', null)
  on conflict (school_id, key) do nothing;

  -- =========================================================================
  -- Punjab service rules — named, unread, undetermined
  -- =========================================================================
  insert into service.policy
    (school_id, key, version, title, summary, classification, verification_status,
     applicability, applicability_note, amendment_status)
  values
    (p_school_id, 'punjab.security_of_service_1979', 1,
     'Punjab Privately Managed Recognised Schools Employees (Security of Service) Act, 1979 (Punjab Act 18 of 1979)',
     'Named in Stage 1 research as potentially relevant to service security in privately managed recognised schools. '
     'THE TEXT HAS NOT BEEN READ: indiacode.nic.in returns HTTP 403 to automated retrieval and was retried in Stage 5.',
     'school_policy', 'requires_verification', 'requires_verification',
     'Applicability undetermined. Whether this Act reaches a privately managed CBSE-affiliated school, and whether it '
     'distinguishes aided from unaided schools, cannot be stated without reading the extent and application sections. '
     'Nothing has been inferred from the title.',
     'Unknown — amendment history not established.'),

    (p_school_id, 'punjab.rte_rules_2011', 1,
     'Punjab Right of Children to Free and Compulsory Education Rules, 2011 (as amended)',
     'Made under the RTE Act, 2009. May carry provisions on teacher qualification, salary and conditions of service. NOT READ.',
     'school_policy', 'requires_verification', 'requires_verification',
     'Applicability undetermined. No authoritative Punjab Government URL was reachable in Stage 1 or Stage 5.',
     'Unknown — "as amended" status not established.'),

    (p_school_id, 'punjab.service_conditions_notifications', 1,
     'Punjab School Education Department notifications on teacher service conditions',
     'A category rather than a single instrument. No specific notification has been identified or read.',
     'school_policy', 'requires_verification', 'requires_verification',
     'Applicability undetermined. Which notifications exist, and which reach an unaided CBSE school, is unknown.',
     'Unknown.'),

    (p_school_id, 'school.employment_policy', 1,
     'School employment and service policy',
     'The school''s own adopted employment policy. This is the only instrument the platform currently treats as '
     'governing anything, and it is school policy — not a Punjab or CBSE rule.',
     'school_policy', 'requires_verification', 'potentially_applicable',
     'The school''s own policy applies to the school''s own staff. Recorded as potentially applicable rather than '
     'verified because the policy document itself has not been supplied.',
     'Not applicable — school policy.')
  on conflict (school_id, key, version) do nothing;

  -- =========================================================================
  -- Pay framework — recorded, unverified, and importing nothing
  -- =========================================================================
  select id into v_authority from regulatory.authority where key = 'punjab_sed';

  insert into pay.framework
    (school_id, key, version, name, authority_id, applies_to_funding_status,
     applicability, applicability_note, classification, verification_status,
     base_structure, increment_rule, progression_rule, source_document)
  values
    (p_school_id, 'punjab.government_pay_scales', 1,
     'Punjab Government pay scales (applicability NOT established)',
     v_authority, array['private_aided', 'government']::core.school_funding_status[],
     'requires_verification',
     'Recorded so that the question is visible, NOT because it applies. Being located in Punjab does not import '
     'Punjab Government pay scales into a privately managed school. Whether any part of this reaches this school '
     'depends on its funding status, which is unverified, and on instruments that have not been read.',
     'school_policy', 'requires_verification',
     'Not recorded — no structure has been verified.',
     'Not recorded — no increment rule has been verified.',
     'Not recorded.',
     null),

    (p_school_id, 'school.pay_arrangement', 1,
     'School''s own pay arrangement',
     null, array['private_unaided', 'private_aided', 'other']::core.school_funding_status[],
     'requires_verification',
     'The school''s own arrangement. Undetermined here only because the document has not been supplied; this platform '
     'holds no salary figures in any case.',
     'school_policy', 'requires_verification',
     'Held by the school. This platform records which arrangement applies, not what anyone is paid.',
     'Held by the school.',
     'Held by the school.',
     null)
  on conflict (school_id, key, version) do nothing;

  -- =========================================================================
  -- The approval chain
  -- =========================================================================
  insert into pay.approval_step
    (school_id, stage, step_order, display_name, required_permission, is_required, note)
  values
    (p_school_id, 'system_analysis', 1, 'System analysis', null, true,
     'Deterministic readiness computation. Produces evidence for a decision; makes none.'),
    (p_school_id, 'supervisor_recommendation', 2, 'Supervisor recommendation', 'increment.recommend', true,
     'The supervisor who knows the teacher''s work recommends, with a rationale.'),
    (p_school_id, 'principal_review', 3, 'Principal review', 'increment.recommend', true, null),
    (p_school_id, 'hr_management_review', 4, 'HR / Management review', 'increment.read', true,
     'Checks the recommendation against service policy and consistency across staff.'),
    (p_school_id, 'authorised_approval', 5, 'Authorised approval', 'increment.approve', true,
     'The authorised approver. Holds no assessment permission, so approval stays an independent check.'),
    (p_school_id, 'final_decision', 6, 'Final decision', 'increment.approve', true,
     'Recorded by a person. Gated on the school''s funding status being verified — a final decision asserts that some '
     'pay arrangement applies, and none has been.')
  on conflict (school_id, stage) do nothing;

  -- =========================================================================
  -- Professional growth model — DEMO SCHOOL POLICY
  -- =========================================================================
  insert into appraisal.growth_model
    (school_id, key, version, name, description, classification, effective_from, created_by)
  values
    (p_school_id, 'school.growth', 1, 'School Professional Growth Model 2026-27',
     'The school''s own weighting of professional growth. Every weight below is a school decision, open to change by '
     'the school, and is not derived from any CBSE or Punjab Government formula.',
     'school_policy', date '2026-04-01', v_admin)
  on conflict (school_id, key, version) do nothing;

  select id into v_model from appraisal.growth_model
   where school_id = p_school_id and key = 'school.growth' and version = 1;

  insert into appraisal.growth_component
    (school_id, model_id, key, display_name, source, weight_percent, definition, sort_order)
  values
    (p_school_id, v_model, 'competency_attainment', 'Competency attainment', 'competency_attainment', 25,
     'The proportion of expected competencies where the verified level meets or exceeds the level expected of this post.', 1),
    (p_school_id, v_model, 'competency_growth', 'Competency growth', 'competency_growth', 15,
     'Whether verified movement has occurred this year. A reassessment only follows evidenced impact, so its presence is the measure.', 2),
    (p_school_id, v_model, 'kpi_achievement', 'KPI achievement', 'kpi_achievement', 15,
     'The proportion of agreed KPIs closed for the year against those assigned.', 3),
    (p_school_id, v_model, 'cpd_compliance', 'CPD compliance', 'cpd_compliance', 15,
     'Credited CPD hours against the annual requirement in force for the year.', 4),
    (p_school_id, v_model, 'cpd_impact', 'CPD impact', 'cpd_impact', 15,
     'Whether development has been applied in practice and verified by a reviewer, rather than merely completed.', 5),
    (p_school_id, v_model, 'professional_goals', 'Professional goals', 'professional_goals', 10,
     'The proportion of professional goals recorded as achieved against those set for the year.', 6),
    (p_school_id, v_model, 'classroom_practice', 'Classroom practice', 'classroom_practice', 5,
     'Whether classroom observation evidence exists for the year. The judgement itself belongs to the appraiser.', 7)
  on conflict (model_id, key) do nothing;

  -- =========================================================================
  -- Increment readiness model — DEMO SCHOOL POLICY
  -- =========================================================================
  insert into pay.readiness_model
    (school_id, key, version, name, classification, effective_from)
  values (p_school_id, 'school.readiness', 1, 'School Increment Readiness Model 2026-27',
          'school_policy', date '2026-04-01')
  on conflict (school_id, key, version) do nothing;

  select id into v_readiness from pay.readiness_model
   where school_id = p_school_id and key = 'school.readiness' and version = 1;

  insert into pay.readiness_requirement
    (school_id, model_id, key, display_name, source, weight_percent, threshold, threshold_note, is_mandatory, sort_order)
  values
    (p_school_id, v_readiness, 'growth_score', 'Professional growth score', 'growth_score', 30, 60,
     'The school expects a growth score of at least 60% before recommending an increment.', true, 1),
    (p_school_id, v_readiness, 'cpd_compliance', 'CPD requirement', 'cpd_compliance', 25, 100,
     'The full annual CPD requirement must be met. This is a CBSE requirement in its own right, not a school threshold.', true, 2),
    (p_school_id, v_readiness, 'competency_attainment', 'Competency attainment', 'competency_attainment', 20, 70,
     'At least 70% of verified competencies at or above the expected level for the post.', false, 3),
    (p_school_id, v_readiness, 'cpd_impact', 'Development applied in practice', 'cpd_impact', 15, 100,
     'At least one development item verified as applied in practice, not merely completed.', false, 4),
    (p_school_id, v_readiness, 'kpi_achievement', 'KPI achievement', 'kpi_achievement', 10, 60,
     'At least 60% of assigned KPIs closed for the year.', false, 5)
  on conflict (model_id, key) do nothing;

  -- =========================================================================
  -- The appraisal cycle
  -- =========================================================================
  insert into appraisal.cycle
    (school_id, academic_year_id, key, name, opens_on, closes_on, growth_model_id, policy_version_note, status)
  select p_school_id, v_year, 'appraisal_2026_27', 'Annual Appraisal 2026-27',
         date '2027-01-15', date '2027-03-15', v_model,
         'Growth model school.growth v1. No Punjab service rule was verified as applicable when this cycle opened.',
         'open'
  where v_year is not null
  on conflict (school_id, key) do nothing;

  return (select count(*)::integer from service.designation where school_id = p_school_id);
end;
$fn$;

comment on function service.provision_stage5 is
  'Stage 5 configuration for one school. Every Punjab instrument is recorded unread and undetermined, because none could be retrieved.';

do $$
declare s record;
begin
  for s in select id from core.school loop
    perform service.provision_stage5(s.id);
  end loop;
end $$;
