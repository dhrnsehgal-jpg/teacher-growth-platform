-- ===========================================================================
-- 0023 — Gap engine and CPD recommendation engine
-- ===========================================================================
-- Both are deterministic SQL. No language model participates in either
-- calculation or either ranking. Every score decomposes into named factors with
-- points and a plain-language reason, stored alongside the result, so
-- "why is this a priority?" and "why this course?" are answered from data
-- rather than regenerated prose.
--
-- Changing the method means bumping `engine_version`, which is recorded on
-- every row — so an old score is never silently reinterpreted under new rules.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Gap engine
-- ---------------------------------------------------------------------------

create or replace function growth.compute_gaps(
  p_teacher_profile_id uuid,
  p_academic_year_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  r           record;
  v_score     integer;
  v_factors   jsonb;
  v_band      text;
  v_count     integer := 0;
  v_expl      text;
  v_pts       integer;
begin
  select school_id into v_school_id from core.teacher_profile where id = p_teacher_profile_id;
  if v_school_id is null then
    raise exception 'Teacher profile % not found.', p_teacher_profile_id;
  end if;

  for r in
    select
      t.competency_id, t.competency_key, t.competency_name,
      t.target_ordinal as expected_ordinal,
      t.specificity,
      t.weight as target_weight,
      v.verified_ordinal,
      v.evidence_strength,
      v.evidence_count,
      -- Is the target mandatory for this teacher?
      coalesce((
        select bool_or(ct.is_mandatory)
        from competency.competency_target ct
        where ct.competency_id = t.competency_id
          and ct.academic_year_id = p_academic_year_id
      ), false) as is_mandatory,
      -- Has the school named this a strategic priority?
      exists (
        select 1 from growth.strategic_priority sp
        where sp.competency_id = t.competency_id
          and sp.academic_year_id = p_academic_year_id
      ) as is_strategic,
      -- Does an assigned KPI depend on this competency?
      exists (
        select 1
        from kpi.teacher_kpi k
        join kpi.template_competency tc on tc.template_id = k.template_id
        where k.teacher_profile_id = p_teacher_profile_id
          and k.academic_year_id = p_academic_year_id
          and tc.competency_id = t.competency_id
          and k.status not in ('cancelled', 'draft')
      ) as kpi_relevant,
      -- Did an observation rate this below the expected level?
      exists (
        select 1
        from assessment.current_rating cr
        join assessment.teacher_assessment ta on ta.id = cr.teacher_assessment_id
        where ta.teacher_profile_id = p_teacher_profile_id
          and cr.competency_id = t.competency_id
          and cr.source = 'observation'
          and cr.level_ordinal < t.target_ordinal
      ) as observed_below,
      -- Previous development attempts that did NOT close the gap.
      (
        select count(*)
        from growth.learning_plan_item li
        join growth.learning_plan lp on lp.id = li.learning_plan_id
        where lp.teacher_profile_id = p_teacher_profile_id
          and li.competency_id = t.competency_id
          and li.status in ('completed', 'reflected', 'applied', 'impact_verified', 'reassessed')
      )::integer as prior_attempts
    from competency.resolve_targets(p_teacher_profile_id, p_academic_year_id) t
    join assessment.current_verified_competency v
      on v.teacher_profile_id = p_teacher_profile_id
     and v.competency_id = t.competency_id
  loop
    v_factors := '[]'::jsonb;
    v_score := 0;

    -- 1. Gap magnitude — the base, worth the most.
    v_pts := least(greatest(r.expected_ordinal - r.verified_ordinal, 0), 4) * 30 / 4;
    if v_pts > 0 then
      v_score := v_score + v_pts;
      v_factors := v_factors || jsonb_build_object(
        'factor', 'Gap magnitude', 'points', v_pts,
        'why', format('Expected level %s, verified at level %s — a gap of %s.',
                      r.expected_ordinal, r.verified_ordinal,
                      r.expected_ordinal - r.verified_ordinal));
    end if;

    -- 2. Mandatory competency.
    if r.is_mandatory then
      v_score := v_score + 15;
      v_factors := v_factors || jsonb_build_object(
        'factor', 'Mandatory competency', 'points', 15,
        'why', 'School policy marks this competency as required rather than aspirational.');
    end if;

    -- 3. School strategic priority.
    if r.is_strategic then
      v_score := v_score + 15;
      v_factors := v_factors || jsonb_build_object(
        'factor', 'School strategic priority', 'points', 15,
        'why', coalesce((select sp.rationale from growth.strategic_priority sp
                         where sp.competency_id = r.competency_id
                           and sp.academic_year_id = p_academic_year_id limit 1),
                        'Named a school priority for this year.'));
    end if;

    -- 4. KPI relevance.
    if r.kpi_relevant then
      v_score := v_score + 10;
      v_factors := v_factors || jsonb_build_object(
        'factor', 'KPI relevance', 'points', 10,
        'why', 'One of your agreed KPIs this year depends on this competency.');
    end if;

    -- 5. Observation signal.
    if r.observed_below then
      v_score := v_score + 10;
      v_factors := v_factors || jsonb_build_object(
        'factor', 'Observed below expectation', 'points', 10,
        'why', 'A recorded classroom observation rated this below the expected level.');
    end if;

    -- 6. Evidence weakness.
    v_pts := case r.evidence_strength
               when 'none' then 10 when 'weak' then 10
               when 'adequate' then 5 else 0 end;
    if v_pts > 0 then
      v_score := v_score + v_pts;
      v_factors := v_factors || jsonb_build_object(
        'factor', 'Evidence strength', 'points', v_pts,
        'why', format('Supporting evidence is currently %s (%s item(s)).',
                      r.evidence_strength, r.evidence_count));
    end if;

    -- 7. Previous attempts that did not close the gap — escalates.
    if r.prior_attempts > 0 then
      v_score := v_score + 10;
      v_factors := v_factors || jsonb_build_object(
        'factor', 'Previous development attempted', 'points', 10,
        'why', format('%s previous development activity/activities targeted this '
                      || 'competency and the gap remains open.', r.prior_attempts));
    end if;

    -- 8. Target set specifically for this teacher rather than school-wide.
    if r.specificity > 0 then
      v_score := v_score + 5;
      v_factors := v_factors || jsonb_build_object(
        'factor', 'Specifically expected of your post', 'points', 5,
        'why', 'This expectation was set for your role, stage or career level '
               || 'rather than applied school-wide.');
    end if;

    -- 9. Weight the school placed on the target.
    v_pts := least(coalesce(r.target_weight, 0)::integer, 5);
    if v_pts > 0 then
      v_score := v_score + v_pts;
      v_factors := v_factors || jsonb_build_object(
        'factor', 'Weighting', 'points', v_pts,
        'why', 'The school weights this competency above the default.');
    end if;

    v_score := least(v_score, 100);

    -- No gap short-circuits everything: at or above expectation is not a
    -- development priority however heavily weighted the competency is.
    if r.expected_ordinal - r.verified_ordinal <= 0 then
      v_score := 0;
      v_factors := jsonb_build_array(jsonb_build_object(
        'factor', 'At or above expectation', 'points', 0,
        'why', format('Verified at level %s against an expected level of %s.',
                      r.verified_ordinal, r.expected_ordinal)));
    end if;

    select pb.key into v_band
    from growth.priority_band pb
    where pb.school_id = v_school_id
      and v_score between pb.min_score and pb.max_score
    order by pb.sort_order
    limit 1;
    v_band := coalesce(v_band, 'low');

    select string_agg(format('%s (+%s): %s', f->>'factor', f->>'points', f->>'why'),
                      E'\n' order by (f->>'points')::int desc)
      into v_expl
    from jsonb_array_elements(v_factors) f;

    insert into growth.gap (
      school_id, teacher_profile_id, competency_id, academic_year_id,
      expected_ordinal, verified_ordinal, gap_size,
      priority_score, priority_band_key, factors, explanation, computed_at
    )
    values (
      v_school_id, p_teacher_profile_id, r.competency_id, p_academic_year_id,
      r.expected_ordinal, r.verified_ordinal,
      greatest(r.expected_ordinal - r.verified_ordinal, 0),
      v_score, v_band, v_factors, coalesce(v_expl, 'No contributing factors.'), now()
    )
    on conflict (teacher_profile_id, competency_id, academic_year_id) do update
      set expected_ordinal = excluded.expected_ordinal,
          verified_ordinal = excluded.verified_ordinal,
          gap_size         = excluded.gap_size,
          priority_score   = excluded.priority_score,
          priority_band_key= excluded.priority_band_key,
          factors          = excluded.factors,
          explanation      = excluded.explanation,
          computed_at      = excluded.computed_at;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function growth.compute_gaps(uuid, uuid) is
  'Deterministic gap computation. Only competencies with a VERIFIED level are '
  'scored — an unassessed competency is reported as unassessed, not as a gap of '
  'unknown size.';

-- ---------------------------------------------------------------------------
-- CPD recommendation engine
-- ---------------------------------------------------------------------------

create table cpd.recommendation (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null references core.teacher_profile(id) on delete cascade,
  gap_id            uuid not null references growth.gap(id) on delete cascade,
  activity_id       uuid not null references cpd.activity(id) on delete cascade,
  rank              integer not null check (rank >= 1),
  score             integer not null,
  -- Named factors with points and reasons. Rendered as "Why this course?".
  reasons           jsonb not null default '[]'::jsonb,
  engine_version    text not null default 'cpd-recommender-v1',
  generated_at      timestamptz not null default now(),
  constraint recommendation_unique unique (gap_id, activity_id)
);

comment on table cpd.recommendation is
  'Ranked, explained CPD suggestions. Deterministic: the same inputs always '
  'produce the same ranking, and every point is attributable to a named factor.';

create index recommendation_gap_idx on cpd.recommendation (gap_id, rank);

alter table cpd.recommendation enable row level security;
create policy recommendation_select on cpd.recommendation
  for select using (core.can_view_staff_record(teacher_profile_id));
create policy recommendation_write on cpd.recommendation
  for all using (
    core.can_view_staff_record(teacher_profile_id)
    and (core.has_permission(school_id, 'cpd.read.scope')
         or exists (select 1 from core.teacher_profile tp
                    where tp.id = recommendation.teacher_profile_id and tp.user_id = auth.uid()))
  )
  with check (
    core.can_view_staff_record(teacher_profile_id)
    and (core.has_permission(school_id, 'cpd.read.scope')
         or exists (select 1 from core.teacher_profile tp
                    where tp.id = recommendation.teacher_profile_id and tp.user_id = auth.uid()))
  );

create or replace function cpd.generate_recommendations(
  p_teacher_profile_id uuid,
  p_academic_year_id uuid,
  p_max_per_gap integer default 5
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  g           record;
  a           record;
  v_score     integer;
  v_reasons   jsonb;
  v_rank      integer;
  v_total     integer := 0;
  v_stages    uuid[];
  v_subjects  uuid[];
  v_category  uuid;
begin
  select school_id, teacher_category_id into v_school_id, v_category
  from core.teacher_profile where id = p_teacher_profile_id;

  select d.stage_ids, d.subject_ids into v_stages, v_subjects
  from competency.teacher_dimensions(p_teacher_profile_id, p_academic_year_id) d;

  for g in
    select * from growth.gap
    where teacher_profile_id = p_teacher_profile_id
      and academic_year_id = p_academic_year_id
      and gap_size > 0
  loop
    delete from cpd.recommendation where gap_id = g.id;
    v_rank := 0;

    for a in
      select
        act.id as activity_id, act.title, act.cpd_hours, act.cost_amount,
        act.availability, act.delivery_method,
        act.recognition, act.recognition_alignment, act.external_reference,
        ac.is_primary, pl.ordinal as targets_ordinal, pl.name as targets_level_name,
        -- Applicability: no rows means "suits everyone".
        not exists (select 1 from cpd.activity_applicability aa where aa.activity_id = act.id)
          as applies_to_all,
        exists (select 1 from cpd.activity_applicability aa
                where aa.activity_id = act.id and aa.school_stage_id = any(v_stages)) as stage_match,
        exists (select 1 from cpd.activity_applicability aa
                where aa.activity_id = act.id and aa.subject_id = any(v_subjects)) as subject_match,
        exists (select 1 from cpd.activity_applicability aa
                where aa.activity_id = act.id and aa.teacher_category_id = v_category) as category_match,
        exists (
          select 1 from growth.learning_plan_item li
          join growth.learning_plan lp on lp.id = li.learning_plan_id
          where lp.teacher_profile_id = p_teacher_profile_id
            and li.cpd_activity_id = act.id
            and li.status not in ('declined', 'abandoned')
        ) as already_taken
      from cpd.activity act
      join cpd.activity_competency ac on ac.activity_id = act.id
      join competency.proficiency_level pl on pl.id = ac.targets_level_id
      where act.school_id = v_school_id
        and act.is_active
        and act.availability in ('available', 'scheduled', 'waitlist')
        and ac.competency_id = g.competency_id
    loop
      -- Applicability is an EXCLUSION, not a penalty: a course scoped to other
      -- stages or subjects is simply not offered.
      if not a.applies_to_all
         and not (a.stage_match or a.subject_match or a.category_match) then
        continue;
      end if;
      if a.already_taken then
        continue;
      end if;

      v_score := 0;
      v_reasons := '[]'::jsonb;

      if a.is_primary then
        v_score := v_score + 40;
        v_reasons := v_reasons || jsonb_build_object(
          'factor', 'Directly addresses this competency', 'points', 40,
          'why', 'This competency is a primary focus of the activity.');
      else
        v_score := v_score + 20;
        v_reasons := v_reasons || jsonb_build_object(
          'factor', 'Covers this competency', 'points', 20,
          'why', 'The activity covers this competency, though it is not its main focus.');
      end if;

      if a.targets_ordinal >= g.expected_ordinal then
        v_score := v_score + 20;
        v_reasons := v_reasons || jsonb_build_object(
          'factor', 'Pitched at or above your expected level', 'points', 20,
          'why', format('Develops practice towards %s, which meets your expected level of %s.',
                        a.targets_level_name, g.expected_ordinal));
      elsif a.targets_ordinal > g.verified_ordinal then
        v_score := v_score + 10;
        v_reasons := v_reasons || jsonb_build_object(
          'factor', 'Moves you forward', 'points', 10,
          'why', format('Develops practice towards %s — progress from your verified '
                        || 'level %s, though short of the expected %s.',
                        a.targets_level_name, g.verified_ordinal, g.expected_ordinal));
      end if;

      if a.stage_match then
        v_score := v_score + 10;
        v_reasons := v_reasons || jsonb_build_object(
          'factor', 'Matches the stage you teach', 'points', 10,
          'why', 'Designed for the school stage you currently teach.');
      end if;
      if a.subject_match then
        v_score := v_score + 10;
        v_reasons := v_reasons || jsonb_build_object(
          'factor', 'Matches your subject', 'points', 10,
          'why', 'Designed for a subject you currently teach.');
      end if;
      if a.category_match then
        v_score := v_score + 5;
        v_reasons := v_reasons || jsonb_build_object(
          'factor', 'Matches your post', 'points', 5,
          'why', 'Intended for teachers in your post.');
      end if;

      v_score := v_score + case a.availability
        when 'available' then 10 when 'scheduled' then 7 else 3 end;
      v_reasons := v_reasons || jsonb_build_object(
        'factor', 'Availability', 'points',
        case a.availability when 'available' then 10 when 'scheduled' then 7 else 3 end,
        'why', format('Currently %s.', replace(a.availability::text, '_', ' ')));

      if coalesce(a.cost_amount, 0) = 0 then
        v_score := v_score + 5;
        v_reasons := v_reasons || jsonb_build_object(
          'factor', 'No cost', 'points', 5, 'why', 'No fee to the school.');
      end if;

      if a.recognition_alignment = 'aligned' then
        v_score := v_score + 5;
        v_reasons := v_reasons || jsonb_build_object(
          'factor', 'Recognised provision', 'points', 5,
          'why', format('Recognised: %s.', coalesce(a.external_reference, a.recognition::text)));
      end if;

      v_rank := v_rank + 1;
      insert into cpd.recommendation (
        school_id, teacher_profile_id, gap_id, activity_id, rank, score, reasons
      )
      values (v_school_id, p_teacher_profile_id, g.id, a.activity_id, v_rank, v_score, v_reasons)
      on conflict (gap_id, activity_id) do update
        set score = excluded.score, reasons = excluded.reasons,
            generated_at = excluded.generated_at;

      v_total := v_total + 1;
    end loop;

    -- Rank by score, keeping only the strongest few per gap.
    with ranked as (
      select id, row_number() over (order by score desc, activity_id) as rn
      from cpd.recommendation where gap_id = g.id
    )
    update cpd.recommendation r set rank = ranked.rn
    from ranked where ranked.id = r.id;

    delete from cpd.recommendation
    where gap_id = g.id and rank > p_max_per_gap;
  end loop;

  return v_total;
end;
$$;

comment on function cpd.generate_recommendations(uuid, uuid, integer) is
  'Deterministic ranking. Applicability mismatches and already-taken activities '
  'are excluded outright rather than scored down, so a teacher is never offered '
  'something irrelevant with a quiet penalty attached.';

grant execute on function growth.compute_gaps(uuid, uuid) to authenticated;
grant execute on function growth.can_reassess(uuid) to authenticated;
grant execute on function cpd.generate_recommendations(uuid, uuid, integer) to authenticated;
