-- ===========================================================================
-- 0036 — Stage 4 role grants and API views
-- ===========================================================================
-- Two things PostgREST forces:
--
--   * Cross-schema embedding is impossible. Anything joining compliance/sqaaf
--     to core must be a view, and it must be `security_invoker` or the view
--     would bypass the RLS the whole design rests on.
--   * An embed names the target RELATION, not the FK column.
--
-- Both were learned in Stage 2 (migration 0019) by shipping four broken queries.
-- ===========================================================================

create or replace function core.provision_school_roles(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role record;
  v_grants jsonb := jsonb_build_object(

    'teacher', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'cpd_record.submit'
    ),

    'head_of_department', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'observation.conduct', 'evidence.review', 'cpd.read.scope',
      'development_plan.read.scope', 'development_plan.approve',
      'appraisal.read.scope', 'appraisal.conduct',
      'career_progression.read.scope', 'kpi.assign',
      'cpd_record.submit', 'sqaaf.read'
    ),

    'academic_coordinator', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'observation.conduct', 'evidence.review', 'cpd.read.scope',
      'development_plan.read.scope', 'development_plan.approve',
      'appraisal.read.scope', 'career_progression.read.scope', 'kpi.assign',
      'cpd_record.submit', 'sqaaf.read', 'sqaaf.manage'
    ),

    'vice_principal', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'assessment.moderate', 'observation.conduct', 'evidence.review',
      'cpd.read.scope', 'cpd.approve', 'development_plan.read.scope',
      'development_plan.approve', 'appraisal.read.scope', 'appraisal.conduct',
      'career_progression.read.scope', 'compliance.read', 'kpi.assign',
      'cpd_record.submit', 'sqaaf.read', 'sqaaf.manage'
    ),

    'principal', jsonb_build_array(
      'school.manage', 'staff_directory.read', 'competency.read', 'competency.manage',
      'regulatory.read', 'teacher_record.read.scope', 'assessment.read.scope',
      'assessment.conduct', 'assessment.moderate', 'observation.conduct',
      'evidence.review', 'cpd.read.scope', 'cpd.approve',
      'development_plan.read.scope', 'development_plan.approve',
      'appraisal.read.scope', 'appraisal.conduct', 'appraisal.finalise',
      'increment.read', 'increment.recommend',
      'career_progression.read.scope', 'career_progression.recommend',
      'compliance.read', 'rbac.read', 'kpi.manage', 'kpi.assign',
      'cpd_record.submit', 'sqaaf.read', 'sqaaf.manage'
    ),

    'hr_pd_admin', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'regulatory.read',
      'teacher_record.read.scope', 'teacher_record.manage',
      'cpd.read.scope', 'cpd.manage', 'cpd.approve',
      'development_plan.read.scope', 'appraisal.read.scope',
      'career_progression.read.scope', 'compliance.read', 'rbac.read',
      'increment.read', 'kpi.manage', 'kpi.assign',
      'cpd_record.submit', 'sqaaf.read', 'sqaaf.manage'
    ),

    'management_approver', jsonb_build_array(
      'staff_directory.read', 'regulatory.read', 'compliance.read',
      'appraisal.read.scope', 'increment.read', 'increment.approve',
      'career_progression.read.scope', 'career_progression.approve',
      'sqaaf.read'
    ),

    'compliance_admin', jsonb_build_array(
      'staff_directory.read', 'regulatory.read', 'regulatory.manage',
      'regulatory.authorise_recalculation', 'compliance.read', 'compliance.manage',
      'audit.read', 'rbac.read',
      'sqaaf.read', 'sqaaf.manage'
    ),

    'system_admin', jsonb_build_array(
      'system.admin', 'school.manage', 'rbac.read', 'rbac.manage', 'audit.read'
    )
  );
  v_display jsonb := jsonb_build_object(
    'teacher',              'Teacher',
    'head_of_department',   'Head of Department',
    'academic_coordinator', 'Academic Coordinator',
    'vice_principal',       'Vice Principal',
    'principal',            'Principal',
    'hr_pd_admin',          'HR / Professional Development Administrator',
    'management_approver',  'School Management / Authorised Approver',
    'compliance_admin',     'Compliance Administrator',
    'system_admin',         'System Administrator'
  );
  v_key text;
begin
  for v_key in select jsonb_object_keys(v_grants) loop
    insert into core.role (school_id, key, display_name, is_system)
    values (p_school_id, v_key, v_display ->> v_key, true)
    on conflict (school_id, key) do update
      set display_name = excluded.display_name;
  end loop;

  for v_role in
    select r.id, r.key from core.role r
    where r.school_id = p_school_id and r.is_system
  loop
    insert into core.role_permission (role_id, permission_key)
    select v_role.id, p.value #>> '{}'
    from jsonb_array_elements(v_grants -> v_role.key) p
    on conflict (role_id, permission_key) do nothing;
  end loop;
end;
$$;

do $$
declare s record;
begin
  for s in select id from core.school loop
    perform core.provision_school_roles(s.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create view compliance.cpd_record_detail
with (security_invoker = true) as
select
  r.id,
  r.school_id,
  r.teacher_profile_id,
  u.full_name          as teacher_name,
  r.academic_year_id,
  ay.label             as academic_year,
  r.title,
  r.description,
  cat.key              as category_key,
  cat.display_name     as category_name,
  r.source_class,
  st.key               as source_type_key,
  st.display_name      as source_type_name,
  st.counts_toward_requirement,
  coalesce(p.name, r.provider_name) as provider_name,
  r.activity_from,
  r.activity_to,
  r.duration_hours,
  r.hour_basis,
  ar.permitted_activity as activity_rule_name,
  r.claimed_hours,
  r.credited_hours,
  r.status,
  r.certificate_evidence_id,
  r.external_reference,
  r.review_note,
  r.reviewed_at,
  rv.title             as requirement_version_title,
  (select count(*) from compliance.cpd_record_competency rc where rc.cpd_record_id = r.id)
                       as competency_link_count
from compliance.cpd_record r
join core.teacher_profile tp on tp.id = r.teacher_profile_id
join core.app_user u on u.id = tp.user_id
join core.academic_year ay on ay.id = r.academic_year_id
join compliance.cpd_category cat on cat.id = r.category_id
join compliance.cpd_source_type st on st.id = r.source_type_id
left join cpd.provider p on p.id = r.provider_id
left join compliance.cpd_activity_rule ar on ar.id = r.activity_rule_id
left join compliance.cpd_requirement_version rv on rv.id = r.requirement_version_id;

comment on view compliance.cpd_record_detail is
  'CPD records with their teacher, category, source and rule resolved. security_invoker, so RLS still decides who sees which rows.';

create view sqaaf.standard_detail
with (security_invoker = true) as
select
  s.id            as standard_id,
  s.school_id,
  s.code          as standard_code,
  s.statement,
  s.applies_when,
  s.platform_relevant,
  s.relevance_note,
  sd.id           as sub_domain_id,
  sd.code         as sub_domain_code,
  sd.name         as sub_domain_name,
  d.id            as domain_id,
  d.domain_number,
  d.name          as domain_name,
  d.weightage_percent,
  d.platform_coverage,
  d.coverage_note,
  fv.id           as version_id,
  fv.edition_label,
  fv.verification_status
from sqaaf.standard s
join sqaaf.sub_domain sd on sd.id = s.sub_domain_id
join sqaaf.domain d on d.id = sd.domain_id
join sqaaf.framework_version fv on fv.id = d.version_id;

create view sqaaf.improvement_action_detail
with (security_invoker = true) as
select
  a.id,
  a.school_id,
  a.self_assessment_id,
  sa.academic_year_id,
  st.code          as standard_code,
  st.statement     as standard_statement,
  d.domain_number,
  d.name           as domain_name,
  a.priority,
  a.area_of_improvement,
  a.proposed_action,
  a.convenor_user_id,
  cu.full_name     as convenor_name,
  a.team_note,
  a.target_date,
  a.status,
  a.evidence_id,
  a.reviewed_at,
  a.review_note,
  a.completed_at,
  cl.display_name  as current_level_name,
  al.display_name  as aspirational_level_name,
  (a.target_date is not null
     and a.target_date < current_date
     and a.status not in ('completed', 'abandoned')) as is_overdue
from sqaaf.improvement_action a
join sqaaf.self_assessment sa on sa.id = a.self_assessment_id
join sqaaf.standard st on st.id = a.standard_id
join sqaaf.sub_domain sd on sd.id = st.sub_domain_id
join sqaaf.domain d on d.id = sd.domain_id
left join core.app_user cu on cu.id = a.convenor_user_id
left join sqaaf.performance_level cl on cl.id = a.current_level_id
left join sqaaf.performance_level al on al.id = a.aspirational_level_id;

create view sqaaf.evidence_readiness
with (security_invoker = true) as
select
  sa.id              as self_assessment_id,
  sa.school_id,
  sa.academic_year_id,
  d.id               as domain_id,
  d.domain_number,
  d.name             as domain_name,
  d.platform_coverage,
  count(st.id)                                              as standards_total,
  count(*) filter (where st.platform_relevant)              as standards_platform_relevant,
  count(*) filter (where r.id is not null)                  as standards_rated,
  count(*) filter (where m.mapped > 0)                      as standards_with_evidence,
  count(*) filter (where g.id is not null)                  as standards_with_gap,
  count(*) filter (where st.platform_relevant and coalesce(m.mapped, 0) = 0)
                                                            as platform_relevant_without_evidence
from sqaaf.self_assessment sa
join sqaaf.domain d on d.version_id = sa.version_id
join sqaaf.sub_domain sd on sd.domain_id = d.id
join sqaaf.standard st on st.sub_domain_id = sd.id
left join sqaaf.standard_rating r on r.self_assessment_id = sa.id and r.standard_id = st.id
left join sqaaf.evidence_gap g on g.self_assessment_id = sa.id and g.standard_id = st.id
left join lateral (
  select count(*) as mapped
  from sqaaf.evidence_map em
  where em.self_assessment_id = sa.id and em.standard_id = st.id
) m on true
group by sa.id, sa.school_id, sa.academic_year_id, d.id, d.domain_number, d.name, d.platform_coverage;

comment on view sqaaf.evidence_readiness is
  'Per-domain readiness for a SQAAF cycle. `platform_relevant_without_evidence` is the actionable number: standards this platform could evidence but has not.';

grant select on
  compliance.cpd_record_detail,
  sqaaf.standard_detail,
  sqaaf.improvement_action_detail,
  sqaaf.evidence_readiness
to authenticated, service_role;
