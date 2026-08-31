-- ===========================================================================
-- 0050 — Year-on-year comparison
-- ===========================================================================
-- Three questions a school asks at the end of a cycle and could not previously
-- answer without exporting to a spreadsheet:
--
--   Is our SQAAF position better than last year's?
--   Are our teachers' growth scores moving?
--   Is CPD compliance improving across the school?
--
-- All three are views rather than stored aggregates, so they cannot go stale,
-- and all three are `security_invoker` so RLS still decides who sees what.
--
-- Each carries the year it describes. Comparing a growth score computed under
-- one model version with one computed under another is a real hazard, so the
-- growth view surfaces the model version alongside the figure rather than
-- silently placing them on the same axis.
-- ===========================================================================

create view appraisal.growth_score_by_year
with (security_invoker = true) as
select
  a.school_id,
  a.teacher_profile_id,
  u.full_name          as teacher_name,
  c.academic_year_id,
  ay.label             as academic_year,
  ay.starts_on,
  gs.total_percent,
  gs.model_version,
  gs.disclaimer,
  gs.computed_at,
  -- The previous year's score for the same teacher, so movement is readable
  -- without the caller having to self-join.
  lag(gs.total_percent) over (
    partition by a.teacher_profile_id order by ay.starts_on
  ) as previous_percent,
  lag(gs.model_version) over (
    partition by a.teacher_profile_id order by ay.starts_on
  ) as previous_model_version
from appraisal.growth_score gs
join appraisal.appraisal a on a.id = gs.appraisal_id
join appraisal.cycle c on c.id = a.cycle_id
join core.academic_year ay on ay.id = c.academic_year_id
join core.teacher_profile tp on tp.id = a.teacher_profile_id
join core.app_user u on u.id = tp.user_id;

comment on view appraisal.growth_score_by_year is
  'Growth scores across years, with the previous year alongside. The model version is carried too: comparing scores computed under different models is a real hazard, and hiding it would invite exactly that.';

-- ---------------------------------------------------------------------------
create view sqaaf.self_assessment_by_year
with (security_invoker = true) as
-- Each aggregate comes from its own lateral subquery rather than a shared set
-- of LEFT JOINs. Joining ratings, gaps and actions together fans the rows out:
-- with four ratings and one gap the row count is four, and `count(gap)` reports
-- four gaps. The first version of this view did exactly that.
select
  sa.school_id,
  sa.academic_year_id,
  ay.label            as academic_year,
  ay.starts_on,
  sa.id               as self_assessment_id,
  fv.edition_label,
  sa.status,
  r.standards_rated,
  r.score_on_rated,
  r.standards_rated * fv.max_level_score as max_on_rated,
  g.open_gaps,
  a.actions_completed,
  a.actions_total
from sqaaf.self_assessment sa
join core.academic_year ay on ay.id = sa.academic_year_id
join sqaaf.framework_version fv on fv.id = sa.version_id
left join lateral (
  select count(*) as standards_rated, coalesce(sum(pl.score), 0) as score_on_rated
  from sqaaf.standard_rating sr
  join sqaaf.performance_level pl on pl.id = sr.level_id
  where sr.self_assessment_id = sa.id
) r on true
left join lateral (
  select count(*) as open_gaps
  from sqaaf.evidence_gap eg
  where eg.self_assessment_id = sa.id and eg.resolved_at is null
) g on true
left join lateral (
  select count(*) filter (where ia.status = 'completed') as actions_completed,
         count(*) as actions_total
  from sqaaf.improvement_action ia
  where ia.self_assessment_id = sa.id
) a on true;

comment on view sqaaf.self_assessment_by_year is
  'SQAAF position per year. Reports the score over RATED standards only, and says so — a partial total presented as a SQAAF score would be the most plausible way this module could mislead.';

-- ---------------------------------------------------------------------------
create view compliance.cpd_by_year
with (security_invoker = true) as
select
  r.school_id,
  r.academic_year_id,
  ay.label                                     as academic_year,
  ay.starts_on,
  count(distinct r.teacher_profile_id)         as teachers_with_records,
  coalesce(sum(r.credited_hours) filter (where r.status = 'verified'), 0) as hours_credited,
  coalesce(sum(r.claimed_hours) filter (where r.status = 'submitted'), 0) as hours_awaiting,
  count(*) filter (where r.status = 'verified')                          as records_verified,
  count(*) filter (where r.status = 'rejected')                          as records_rejected
from compliance.cpd_record r
join core.academic_year ay on ay.id = r.academic_year_id
group by r.school_id, r.academic_year_id, ay.label, ay.starts_on;

comment on view compliance.cpd_by_year is
  'Whole-school CPD per year. Counts verified hours only — claimed hours are shown separately rather than folded in.';

grant select on
  appraisal.growth_score_by_year,
  sqaaf.self_assessment_by_year,
  compliance.cpd_by_year
to authenticated, service_role;
