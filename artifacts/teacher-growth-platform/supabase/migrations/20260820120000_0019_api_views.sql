-- ===========================================================================
-- 0019 — Views for reads PostgREST cannot express
-- ===========================================================================
-- PostgREST cannot embed a related row across schemas. Two reads the UI needs
-- do exactly that:
--
--   competency.competency_target → core.teacher_category / school_stage /
--                                  career_level / subject
--   kpi.teacher_kpi              → core.app_user (the named reviewer)
--
-- Every attempted syntax fails with "Could not find a relationship … in the
-- schema cache". Joining in the client would mean several extra round-trips and
-- reassembling rows by hand, so the join belongs in the database.
--
-- `security_invoker = true` is essential: the view runs with the CALLER's
-- privileges, so Row Level Security on every underlying table still applies. A
-- view without it would run as owner and quietly become a way around RLS —
-- exactly the kind of hole this project exists to avoid.
-- ===========================================================================

create or replace view competency.competency_target_detail
with (security_invoker = true) as
select
  t.id,
  t.school_id,
  t.competency_id,
  t.academic_year_id,
  t.rationale,
  t.role_key,
  t.requires_leadership,
  t.weight,
  pl.key      as level_key,
  pl.name     as level_name,
  pl.ordinal  as level_ordinal,
  tc.display_name as teacher_category_name,
  ss.display_name as school_stage_name,
  cl.display_name as career_level_name,
  sub.display_name as subject_name
from competency.competency_target t
join competency.proficiency_level pl on pl.id = t.target_level_id
left join core.teacher_category tc on tc.id = t.teacher_category_id
left join core.school_stage ss     on ss.id = t.school_stage_id
left join core.career_level cl     on cl.id = t.career_level_id
left join core.subject sub         on sub.id = t.subject_id;

comment on view competency.competency_target_detail is
  'A competency target with the human names of the population it applies to. '
  'security_invoker, so RLS on every underlying table still governs access.';

create or replace view kpi.teacher_kpi_detail
with (security_invoker = true) as
select
  k.id,
  k.school_id,
  k.teacher_profile_id,
  k.academic_year_id,
  k.name,
  k.description,
  k.metric,
  k.unit,
  k.direction,
  k.target,
  k.weight,
  k.data_source,
  k.frequency,
  k.evidence_requirement,
  k.is_student_outcome_measure,
  k.status,
  k.reviewer_user_id,
  c.name        as category_name,
  r.full_name   as reviewer_name
from kpi.teacher_kpi k
left join kpi.category c   on c.id = k.category_id
left join core.app_user r  on r.id = k.reviewer_user_id;

comment on view kpi.teacher_kpi_detail is
  'A teacher KPI with its category and the reviewer''s name. The reviewer join '
  'crosses into the core schema, which PostgREST cannot embed. Note the teacher '
  'can only see the reviewer name because migration 0018 repaired staff '
  'directory visibility.';

grant select on competency.competency_target_detail to authenticated, service_role;
grant select on kpi.teacher_kpi_detail             to authenticated, service_role;
