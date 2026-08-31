-- ===========================================================================
-- 0024 — Stage 3 privileges and API views
-- ===========================================================================
-- Same lesson as migrations 0008 and 0014: a policy on an unreachable schema is
-- dead code, and PostgREST cannot embed across schemas. New schemas therefore
-- need grants, and every cross-schema read needs a `security_invoker` view.
-- ===========================================================================

grant usage on schema assessment to authenticated, service_role;
grant usage on schema cpd        to authenticated, service_role;
revoke all on schema assessment from anon;
revoke all on schema cpd        from anon;

grant select, insert, update, delete on all tables in schema assessment to authenticated;
grant select, insert, update, delete on all tables in schema cpd        to authenticated;
grant all on all tables in schema assessment to service_role;
grant all on all tables in schema cpd        to service_role;
grant usage, select on all sequences in schema assessment to authenticated, service_role;
grant usage, select on all sequences in schema cpd        to authenticated, service_role;

-- Append-only trails are written by trigger, never by a client.
revoke insert, update, delete on growth.plan_item_event from authenticated;
revoke update, delete on assessment.verified_competency from authenticated;

do $$
declare s text;
begin
  foreach s in array array['assessment', 'cpd'] loop
    execute format(
      'alter default privileges in schema %I grant select, insert, update, delete on tables to authenticated', s);
    execute format(
      'alter default privileges in schema %I grant all on tables to service_role', s);
    execute format(
      'alter default privileges in schema %I grant usage, select on sequences to authenticated, service_role', s);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- A gap with everything needed to explain it.
create or replace view growth.gap_detail
with (security_invoker = true) as
select
  g.id, g.school_id, g.teacher_profile_id, g.academic_year_id, g.competency_id,
  g.expected_ordinal, g.verified_ordinal, g.gap_size,
  g.priority_score, g.priority_band_key, g.factors, g.explanation,
  g.engine_version, g.computed_at,
  c.key as competency_key, c.name as competency_name, c.description as competency_description,
  c.source_framework, c.source_alignment, c.external_reference,
  d.name as domain_name, st.name as standard_name,
  pb.label as priority_label, pb.sort_order as priority_sort,
  el.name as expected_level_name, vl.name as verified_level_name
from growth.gap g
join competency.competency c on c.id = g.competency_id
join competency.domain d on d.id = c.domain_id
join competency.standard st on st.id = d.standard_id
left join growth.priority_band pb
  on pb.school_id = g.school_id and pb.key = g.priority_band_key
left join competency.proficiency_scale ps
  on ps.school_id = g.school_id and ps.key = 'school_five_point'
left join competency.proficiency_level el
  on el.scale_id = ps.id and el.ordinal = g.expected_ordinal
left join competency.proficiency_level vl
  on vl.scale_id = ps.id and vl.ordinal = g.verified_ordinal;

-- A recommendation with the activity it points at.
create or replace view cpd.recommendation_detail
with (security_invoker = true) as
select
  r.id, r.school_id, r.teacher_profile_id, r.gap_id, r.activity_id,
  r.rank, r.score, r.reasons, r.engine_version, r.generated_at,
  a.key as activity_key, a.title, a.description, a.learning_outcomes,
  a.delivery_method, a.duration_hours, a.cpd_hours, a.cost_amount, a.cost_currency,
  a.prerequisite, a.url, a.availability, a.next_offering_on, a.evidence_requirement,
  a.recognition, a.recognition_alignment, a.external_reference,
  p.name as provider_name, p.recognition as provider_recognition,
  g.competency_id, c.key as competency_key, c.name as competency_name,
  g.priority_band_key, g.gap_size
from cpd.recommendation r
join cpd.activity a on a.id = r.activity_id
join cpd.provider p on p.id = a.provider_id
join growth.gap g on g.id = r.gap_id
join competency.competency c on c.id = g.competency_id;

-- A Learning Map row with its competency, activity and current milestone.
create or replace view growth.plan_item_detail
with (security_invoker = true) as
select
  i.id, i.school_id, i.learning_plan_id, i.status, i.competency_id, i.gap_id,
  i.selection_rationale, i.due_on, i.owner_user_id,
  i.proposed_at, i.approved_at, i.approval_note,
  i.started_at, i.completed_at, i.completion_note,
  i.reflected_at, i.reflection,
  i.applied_at, i.application_summary,
  i.impact_verified_at, i.impact_verification_note,
  i.reassessed_at, i.verified_competency_id,
  lp.teacher_profile_id, lp.academic_year_id,
  c.key as competency_key, c.name as competency_name,
  a.title as activity_title, a.cpd_hours, a.delivery_method,
  prov.name as provider_name,
  owner.full_name as owner_name,
  verifier.full_name as impact_verified_by_name,
  (select count(*) from growth.plan_item_evidence pe
    where pe.learning_plan_item_id = i.id) as evidence_count,
  (select count(*) from growth.plan_item_evidence pe
     join evidence.evidence e on e.id = pe.evidence_id
    where pe.learning_plan_item_id = i.id and e.status = 'verified') as verified_evidence_count
from growth.learning_plan_item i
join growth.learning_plan lp on lp.id = i.learning_plan_id
join competency.competency c on c.id = i.competency_id
left join cpd.activity a on a.id = i.cpd_activity_id
left join cpd.provider prov on prov.id = a.provider_id
left join core.app_user owner on owner.id = i.owner_user_id
left join core.app_user verifier on verifier.id = i.impact_verified_by;

-- Ratings with their competency, for the "why is my level what it is?" panel.
create or replace view assessment.rating_detail
with (security_invoker = true) as
select
  cr.id, cr.school_id, cr.teacher_assessment_id, cr.competency_id, cr.source,
  cr.level_id, cr.level_key, cr.level_name, cr.level_ordinal,
  cr.rationale, cr.rated_at, cr.rated_by, cr.rated_by_name, cr.observation_id,
  ta.teacher_profile_id, ta.cycle_id,
  c.key as competency_key, c.name as competency_name
from assessment.current_rating cr
join assessment.teacher_assessment ta on ta.id = cr.teacher_assessment_id
join competency.competency c on c.id = cr.competency_id;

-- Competency movement over time — the growth trend.
create or replace view assessment.competency_history
with (security_invoker = true) as
select
  v.id, v.school_id, v.teacher_profile_id, v.competency_id, v.academic_year_id,
  v.verified_at, v.is_reassessment, v.rationale, v.evidence_strength,
  vl.ordinal as verified_ordinal, vl.name as verified_level_name,
  el.ordinal as expected_ordinal, el.name as expected_level_name,
  c.key as competency_key, c.name as competency_name,
  au.full_name as verified_by_name
from assessment.verified_competency v
join competency.proficiency_level vl on vl.id = v.verified_level_id
join competency.proficiency_level el on el.id = v.expected_level_id
join competency.competency c on c.id = v.competency_id
left join core.app_user au on au.id = v.verified_by
order by v.teacher_profile_id, v.competency_id, v.verified_at;

grant select on growth.gap_detail                     to authenticated, service_role;
grant select on cpd.recommendation_detail             to authenticated, service_role;
grant select on growth.plan_item_detail               to authenticated, service_role;
grant select on assessment.rating_detail              to authenticated, service_role;
grant select on assessment.competency_history         to authenticated, service_role;
grant select on assessment.current_rating             to authenticated, service_role;
grant select on assessment.current_verified_competency to authenticated, service_role;
