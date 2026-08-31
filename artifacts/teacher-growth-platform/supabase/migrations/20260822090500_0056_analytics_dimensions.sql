-- ===========================================================================
-- 0056 — The analytics dimensions the brief asks for
-- ===========================================================================
-- The heatmap was filterable by department, teacher category and career level.
-- The brief asks for six: department, STAGE, SUBJECT, teacher category, career
-- level and MANAGER. Three were missing, and a filter that is missing is not a
-- small gap — a head of Middle Stage Mathematics who cannot filter to Middle
-- Stage Mathematics cannot use the heatmap for the one thing they need it for.
--
-- Stage and subject are many-to-many with a teacher (one person teaches Physics
-- to Class XI and General Science to Class VIII), so they cannot be columns on
-- a per-teacher row without fanning it out and double-counting every gap. They
-- are exposed as ARRAYS instead, and the data layer filters with `cs` — the row
-- appears once however many stages the teacher covers.
--
-- Manager is derived from the role assignment that would let that person see
-- the teacher, which is the same rule `can_view_staff_record` applies. It is
-- also an array: a teacher may be reachable by more than one supervisor.
-- ===========================================================================

-- `create or replace` cannot insert a column into the middle of a view, so the
-- view is dropped and rebuilt. Nothing else reads it — checked, not assumed.
drop view if exists growth.competency_heatmap;

create view growth.competency_heatmap
with (security_invoker = true) as
select
  vc.school_id,
  vc.academic_year_id,
  vc.teacher_profile_id,
  u.full_name       as teacher_name,
  d.display_name    as department,
  d.key             as department_key,
  tc.display_name   as teacher_category,
  tc.key            as teacher_category_key,
  cl.display_name   as career_level,
  cl.key            as career_level_key,

  -- Many-to-many dimensions, as arrays. See the header.
  coalesce(stages.names, array[]::text[])   as school_stages,
  coalesce(stages.keys,  array[]::text[])   as school_stage_keys,
  coalesce(subs.names,   array[]::text[])   as subjects,
  coalesce(subs.keys,    array[]::text[])   as subject_keys,
  coalesce(mgr.names,    array[]::text[])   as managers,
  coalesce(mgr.ids,      array[]::uuid[])   as manager_user_ids,

  c.key             as competency_key,
  c.name            as competency_name,
  dom.name          as domain_name,
  std.name          as standard_name,
  vl.ordinal        as verified_ordinal,
  vl.name           as verified_level,
  el.ordinal        as expected_ordinal,
  el.name           as expected_level,
  el.ordinal - vl.ordinal as gap_size,
  vl.ordinal >= el.ordinal as meets_expectation,
  g.priority_score,
  g.priority_band_key
from assessment.verified_competency vc
join core.teacher_profile tp on tp.id = vc.teacher_profile_id
join core.app_user u on u.id = tp.user_id
left join core.department d on d.id = tp.primary_department_id
left join core.teacher_category tc on tc.id = tp.teacher_category_id
left join core.career_level cl on cl.id = tp.career_level_id

-- Lateral, not joined: a plain join would multiply the row by the number of
-- stages and subjects taught, and every count built on this view would inflate.
left join lateral (
  select array_agg(distinct ss.display_name) as names,
         array_agg(distinct ss.key)          as keys
    from core.teacher_teaching_assignment tta
    join core.school_stage ss on ss.id = tta.school_stage_id
   where tta.teacher_profile_id = tp.id
     and tta.academic_year_id = vc.academic_year_id
) stages on true
left join lateral (
  select array_agg(distinct s.display_name) as names,
         array_agg(distinct s.key)          as keys
    from core.teacher_teaching_assignment tta
    join core.subject s on s.id = tta.subject_id
   where tta.teacher_profile_id = tp.id
     and tta.academic_year_id = vc.academic_year_id
) subs on true
left join lateral (
  select array_agg(distinct mu.full_name) as names,
         array_agg(distinct mu.id)        as ids
    from core.user_role_assignment ura
    join core.app_user mu on mu.id = ura.user_id
    join core.role_permission rp
      on rp.role_id = ura.role_id
     and rp.permission_key = 'teacher_record.read.scope'
   where ura.school_id = tp.school_id
     and ura.user_id <> tp.user_id
     and ura.valid_from <= current_date
     and (ura.valid_to is null or ura.valid_to >= current_date)
     and case ura.scope_type
           when 'school' then true
           when 'department' then ura.scope_id = tp.primary_department_id
           when 'school_stage' then exists (
             select 1 from core.teacher_teaching_assignment tta
              where tta.teacher_profile_id = tp.id and tta.school_stage_id = ura.scope_id)
           when 'individual' then exists (
             select 1 from core.role_assignment_subject_user rasu
              where rasu.assignment_id = ura.id and rasu.subject_user_id = tp.user_id)
           else false
         end
) mgr on true

join competency.competency c on c.id = vc.competency_id
join competency.domain dom on dom.id = c.domain_id
join competency.standard std on std.id = dom.standard_id
join competency.proficiency_level vl on vl.id = vc.verified_level_id
join competency.proficiency_level el on el.id = vc.expected_level_id
left join growth.gap g
  on g.teacher_profile_id = vc.teacher_profile_id
 and g.competency_id = vc.competency_id
 and g.academic_year_id = vc.academic_year_id
where vc.id in (
  select distinct on (teacher_profile_id, competency_id, academic_year_id) id
    from assessment.verified_competency
   order by teacher_profile_id, competency_id, academic_year_id, verified_at desc
);

comment on view growth.competency_heatmap is
  'Per-teacher, per-competency position with the six dimensions the analytics '
  'brief requires. Stage, subject and manager are arrays because each is '
  'many-to-many with a teacher; filtering uses array containment so a row '
  'appears once regardless of how many stages that teacher covers.';

-- ---------------------------------------------------------------------------
-- School analytics the brief enumerates and the page did not show.
-- ---------------------------------------------------------------------------

-- What the school measures, how heavily, and how much of it rests on student
-- outcomes. Note what this is NOT: `kpi.teacher_kpi` records no achievement
-- figure, so there is no outcome to average. Inventing a "performance" column
-- to fill the shape of the word "trend" would be worse than reporting the
-- thing the platform actually knows.
create or replace view kpi.kpi_trend
with (security_invoker = true) as
select
  tk.school_id,
  tk.academic_year_id,
  ay.label          as academic_year,
  cat.name          as category_name,
  count(*)                                            as kpis_assigned,
  count(distinct tk.teacher_profile_id)               as teachers_covered,
  round(avg(tk.weight), 1)                            as mean_weight,
  sum(tk.weight) filter (where tk.is_student_outcome_measure) as student_outcome_weight,
  sum(tk.weight)                                      as total_weight,
  count(*) filter (where tk.is_student_outcome_measure) as student_outcome_measures
from kpi.teacher_kpi tk
join kpi.category cat on cat.id = tk.category_id
join core.academic_year ay on ay.id = tk.academic_year_id
group by tk.school_id, tk.academic_year_id, ay.label, cat.name;

comment on view kpi.kpi_trend is
  'KPI coverage and weighting by category and year, including how much weight '
  'rests on student-outcome measures. Deliberately carries no teacher '
  'identity: a KPI trend is a question about the school, and naming people in '
  'it turns it into a ranking. Records no achievement figure because the '
  'platform stores none.';

-- What the school has actually invested in development.
create or replace view growth.development_investment
with (security_invoker = true) as
select
  lp.school_id,
  lp.academic_year_id,
  coalesce(d.display_name, 'Unassigned') as department,
  count(distinct lp.teacher_profile_id)  as teachers_with_a_plan,
  count(i.id)                            as items_planned,
  count(i.id) filter (where i.status not in ('proposed', 'declined', 'abandoned'))
                                         as items_approved,
  count(i.id) filter (where i.completed_at is not null)
                                         as items_completed,
  count(i.id) filter (where i.impact_verified_at is not null)
                                         as items_reaching_verified_impact,
  coalesce(sum(a.cpd_hours), 0)          as hours_planned,
  coalesce(sum(a.cpd_hours) filter (where i.completed_at is not null), 0)
                                         as hours_completed,
  coalesce(sum(a.cost_amount), 0)        as cost_planned,
  coalesce(sum(a.cost_amount) filter (where i.completed_at is not null), 0)
                                         as cost_committed
from growth.learning_plan lp
join core.teacher_profile tp on tp.id = lp.teacher_profile_id
left join core.department d on d.id = tp.primary_department_id
left join growth.learning_plan_item i on i.learning_plan_id = lp.id
left join cpd.activity a on a.id = i.cpd_activity_id
group by lp.school_id, lp.academic_year_id, coalesce(d.display_name, 'Unassigned');

comment on view growth.development_investment is
  'Development planned against completed against reaching verified impact, by '
  'department. The last column is the one worth reading: hours planned is an '
  'intention, and hours completed is still only attendance.';

-- The progression pipeline: how many staff sit at each career level.
create or replace view core.career_pipeline
with (security_invoker = true) as
select
  tp.school_id,
  cl.display_name as career_level,
  cl.level_order,
  count(*)        as teachers
from core.teacher_profile tp
join core.career_level cl on cl.id = tp.career_level_id
where tp.is_active
group by tp.school_id, cl.display_name, cl.level_order;

comment on view core.career_pipeline is
  'Headcount by career level. A distribution, not a queue — nothing here '
  'implies anyone is due to move, because progression is a judgement made at '
  'appraisal and is not calculated by this platform.';

-- Increment recommendations by outcome, naming nobody.
create or replace view pay.recommendation_distribution
with (security_invoker = true) as
select
  r.school_id,
  r.academic_year_id,
  r.outcome,
  count(*)                                        as recommendations,
  count(*) filter (where r.proposes_withholding)  as proposing_withholding
from pay.recommendation r
group by r.school_id, r.academic_year_id, r.outcome;

comment on view pay.recommendation_distribution is
  'Counts by recommendation outcome, with how many propose withholding. '
  'Carries no teacher identity, so the distribution can be read as the '
  'management question it is without exposing an individual position.';

grant select on growth.competency_heatmap to authenticated;
grant select on kpi.kpi_trend to authenticated;
grant select on growth.development_investment to authenticated;
grant select on core.career_pipeline to authenticated;
grant select on pay.recommendation_distribution to authenticated;
