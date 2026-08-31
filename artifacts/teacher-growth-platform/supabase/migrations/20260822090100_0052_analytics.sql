-- ===========================================================================
-- 0052 — Leadership analytics
-- ===========================================================================
-- Views and functions for the heatmap, the school analytics, the training-needs
-- analysis and the CPD impact question.
--
-- Two rules run through all of it:
--
--   * "Avoid ranking teachers publicly." Nothing here orders teachers by
--     performance. The heatmap is a matrix, not a league table, and the
--     aggregate views group by department, stage and competency — never by
--     person. Individual figures exist only where a permission already grants
--     access to that individual.
--
--   * "Do not claim causal impact from simple correlation." The CPD impact view
--     reports what is ASSOCIATED with verified improvement and names the
--     confounders it cannot rule out. It never says a course caused anything.
--
-- Everything is `security_invoker`, so RLS decides what any given user sees:
-- a Head of Department's heatmap covers their department, a Principal's covers
-- the school, and neither had to be special-cased here.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Competency heatmap
-- ---------------------------------------------------------------------------
-- One row per teacher per competency, with every dimension the brief lists as a
-- filter. The UI slices this; the database does not decide the slicing.
create view growth.competency_heatmap
with (security_invoker = true) as
select
  vc.school_id,
  vc.academic_year_id,
  vc.teacher_profile_id,
  u.full_name            as teacher_name,
  d.display_name         as department,
  d.key                  as department_key,
  tc.display_name        as teacher_category,
  tc.key                 as teacher_category_key,
  cl.display_name        as career_level,
  cl.key                 as career_level_key,
  c.key                  as competency_key,
  c.name                 as competency_name,
  dom.name               as domain_name,
  std.name               as standard_name,
  vl.ordinal             as verified_ordinal,
  vl.name                as verified_level,
  el.ordinal             as expected_ordinal,
  el.name                as expected_level,
  (el.ordinal - vl.ordinal)                     as gap_size,
  (vl.ordinal >= el.ordinal)                    as meets_expectation,
  g.priority_score,
  g.priority_band_key
from assessment.verified_competency vc
join core.teacher_profile tp on tp.id = vc.teacher_profile_id
join core.app_user u on u.id = tp.user_id
left join core.department d on d.id = tp.primary_department_id
left join core.teacher_category tc on tc.id = tp.teacher_category_id
left join core.career_level cl on cl.id = tp.career_level_id
join competency.competency c on c.id = vc.competency_id
join competency.domain dom on dom.id = c.domain_id
join competency.standard std on std.id = dom.standard_id
join competency.proficiency_level vl on vl.id = vc.verified_level_id
join competency.proficiency_level el on el.id = vc.expected_level_id
left join growth.gap g on g.teacher_profile_id = vc.teacher_profile_id
                      and g.competency_id = vc.competency_id
                      and g.academic_year_id = vc.academic_year_id
where vc.id in (
  -- The current verified level only: a teacher reassessed mid-year appears once.
  select distinct on (teacher_profile_id, competency_id, academic_year_id) id
  from assessment.verified_competency
  order by teacher_profile_id, competency_id, academic_year_id, verified_at desc
);

comment on view growth.competency_heatmap is
  'One row per teacher per competency, carrying every filter dimension the brief lists. A matrix, not a league table — nothing here orders teachers by performance.';

-- ---------------------------------------------------------------------------
-- Aggregate gap analysis — by competency, department, stage, subject, category
-- ---------------------------------------------------------------------------
create view growth.gap_analysis
with (security_invoker = true) as
select
  g.school_id,
  g.academic_year_id,
  gd.competency_key,
  gd.competency_name,
  tp.primary_department_id,
  d.display_name        as department,
  tc.display_name       as teacher_category,
  ss.display_name       as stage,
  s.display_name        as subject,
  count(*)                                             as teachers_with_gap,
  round(avg(gd.priority_score), 1)                     as avg_priority,
  count(*) filter (where gd.priority_band_key in ('high', 'critical')) as high_or_critical,
  round(avg(gd.gap_size), 2)                           as avg_gap_size
from growth.gap g
join growth.gap_detail gd on gd.id = g.id
join core.teacher_profile tp on tp.id = g.teacher_profile_id
left join core.department d on d.id = tp.primary_department_id
left join core.teacher_category tc on tc.id = tp.teacher_category_id
left join core.teacher_teaching_assignment tta on tta.teacher_profile_id = tp.id
                                              and tta.academic_year_id = g.academic_year_id
left join core.school_stage ss on ss.id = tta.school_stage_id
left join core.subject s on s.id = tta.subject_id
where gd.gap_size > 0
group by g.school_id, g.academic_year_id, gd.competency_key, gd.competency_name,
         tp.primary_department_id, d.display_name, tc.display_name,
         ss.display_name, s.display_name;

comment on view growth.gap_analysis is
  'Gaps aggregated by competency and by department, stage, subject and category. Grouped by cohort, never by person.';

-- ---------------------------------------------------------------------------
-- Training needs analysis
-- ---------------------------------------------------------------------------
-- Produces the statement the brief gives as an example, and only where the data
-- supports it. `share_percent` is computed against the number of teachers in
-- the group who were ASSESSED on that competency — not against every teacher in
-- the school, which would understate the need and be a different claim.
create function growth.training_needs(
  p_academic_year_id uuid,
  p_min_group_size integer default 3,
  p_min_share_percent numeric default 40
) returns table (
  competency_key text,
  competency_name text,
  stage text,
  department text,
  group_size integer,
  teachers_with_gap integer,
  share_percent numeric,
  high_or_critical integer,
  avg_priority numeric,
  statement text
)
language sql stable security invoker
as $$
  with assessed as (
    select
      vc.teacher_profile_id, vc.competency_id,
      c.key as competency_key, c.name as competency_name,
      coalesce(ss.display_name, 'All stages') as stage,
      coalesce(d.display_name, 'Unassigned')  as department,
      (el.ordinal - vl.ordinal) > 0 as has_gap,
      g.priority_score, g.priority_band_key
    from assessment.verified_competency vc
    join competency.competency c on c.id = vc.competency_id
    join competency.proficiency_level vl on vl.id = vc.verified_level_id
    join competency.proficiency_level el on el.id = vc.expected_level_id
    join core.teacher_profile tp on tp.id = vc.teacher_profile_id
    left join core.department d on d.id = tp.primary_department_id
    left join core.teacher_teaching_assignment tta
           on tta.teacher_profile_id = tp.id and tta.academic_year_id = vc.academic_year_id
    left join core.school_stage ss on ss.id = tta.school_stage_id
    left join growth.gap g on g.teacher_profile_id = vc.teacher_profile_id
                          and g.competency_id = vc.competency_id
                          and g.academic_year_id = vc.academic_year_id
    where vc.academic_year_id = p_academic_year_id
  ),
  grouped as (
    select
      competency_key, competency_name, stage, department,
      count(distinct teacher_profile_id)::integer as group_size,
      count(distinct teacher_profile_id) filter (where has_gap)::integer as with_gap,
      count(distinct teacher_profile_id) filter (where priority_band_key in ('high','critical'))::integer as high,
      round(avg(priority_score) filter (where has_gap), 1) as avg_priority
    from assessed
    group by competency_key, competency_name, stage, department
  )
  select
    competency_key, competency_name, stage, department,
    group_size, with_gap,
    round(with_gap * 100.0 / nullif(group_size, 0), 0) as share_percent,
    high, avg_priority,
    -- The statement is assembled from the counts above, so it cannot say
    -- anything the data does not support.
    format('%s is a development priority for %s%% of %s %s teachers (%s of %s assessed).',
           competency_name,
           round(with_gap * 100.0 / nullif(group_size, 0), 0),
           stage, department, with_gap, group_size) as statement
  from grouped
  where group_size >= p_min_group_size
    and with_gap * 100.0 / nullif(group_size, 0) >= p_min_share_percent
  order by with_gap desc, avg_priority desc nulls last;
$$;

comment on function growth.training_needs is
  'Cohort training needs. The statement is assembled from the counts beside it, so it cannot assert anything the data does not support. Share is against teachers ASSESSED on the competency, not against all staff.';

-- ---------------------------------------------------------------------------
-- CPD impact — association, stated as association
-- ---------------------------------------------------------------------------
create view cpd.programme_impact
with (security_invoker = true) as
select
  a.school_id,
  a.id                            as activity_id,
  a.title                         as activity_title,
  p.name                          as provider_name,
  count(distinct pi.id)                                              as times_selected,
  count(distinct pi.id) filter (where pi.status = 'completed'
                                  or pi.completed_at is not null)    as times_completed,
  count(distinct pi.id) filter (where pi.status in ('applied', 'impact_verified', 'reassessed'))
                                                                     as times_applied,
  count(distinct pi.id) filter (where pi.status in ('impact_verified', 'reassessed'))
                                                                     as times_impact_verified,
  count(distinct pi.id) filter (where pi.status = 'reassessed')       as times_followed_by_reassessment,
  -- Movement is counted only where a reassessment followed the plan item, and
  -- even then it is association: the teacher did other things that year too.
  count(distinct vc.id) filter (where vc.is_reassessment)             as reassessments_after
from cpd.activity a
join cpd.provider p on p.id = a.provider_id
left join growth.learning_plan_item pi on pi.cpd_activity_id = a.id
left join assessment.verified_competency vc on vc.id = pi.verified_competency_id
group by a.school_id, a.id, a.title, p.name;

comment on view cpd.programme_impact is
  'Participation, application and verified impact per programme. Reports ASSOCIATION only: a teacher who improved after a course also did other things that year, and this view cannot separate them.';

grant select on growth.competency_heatmap, growth.gap_analysis, cpd.programme_impact
  to authenticated, service_role;
grant execute on function growth.training_needs(uuid, integer, numeric) to authenticated, service_role;
