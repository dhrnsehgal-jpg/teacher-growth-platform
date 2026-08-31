-- ===========================================================================
-- 0044 — Growth score and increment readiness engines, and access control
-- ===========================================================================
-- Both engines are deterministic PL/pgSQL. No model participates in either, for
-- the reason the gap engine does not: a figure that feeds an employment
-- conversation must be reproducible, and a teacher must be able to be told
-- exactly how it was arrived at.
--
-- Engine versions are recorded on every row they produce.
-- ===========================================================================

insert into core.permission (key, description, is_compensation_sensitive) values
  ('service_record.read.scope', 'Read the service records of staff within the authorised scope.', false),
  ('service_record.manage', 'Maintain service records, career events and qualification verification.', false),
  ('representation.review', 'Review a representation made against an appraisal outcome.', false),
  ('pay_framework.manage', 'Maintain pay frameworks, entitlements and readiness models.', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- A final increment decision stays behind the Stage 1 gate
-- ---------------------------------------------------------------------------
-- Preparing a recommendation is allowed while applicability is undetermined —
-- that is the developmental half, and withholding it would stop the school
-- doing useful work. Concluding one is not: a final decision asserts that some
-- pay arrangement applies, and no such arrangement has been verified.
create function pay.assert_final_decision_gated()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stage <> 'final_decision' then
    return new;
  end if;
  if not core.employment_compliance_enabled(new.school_id) then
    raise exception '%', core.employment_gate_message()
      using hint = core.service_rule_gate_message(),
            errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger approval_final_decision_gated
  before insert on pay.approval
  for each row execute function pay.assert_final_decision_gated();

-- Same for the entitlement side: an entitlement asserts something is owed under
-- a rule, and no rule has been verified as reaching this school.
create function pay.assert_entitlement_gated()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not core.employment_compliance_enabled(new.school_id) then
    raise exception '%', core.employment_gate_message()
      using hint = core.service_rule_gate_message(),
            errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger entitlement_gated
  before insert or update on pay.entitlement
  for each row execute function pay.assert_entitlement_gated();

-- ---------------------------------------------------------------------------
-- Growth score engine
-- ---------------------------------------------------------------------------
create function appraisal.compute_growth_score(p_appraisal_id uuid)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v appraisal.appraisal;
  v_model appraisal.growth_model;
  v_year uuid;
  v_score_id uuid;
  v_component appraisal.growth_component;
  v_raw numeric(6,2);
  v_evidence text;
  v_basis text;
  v_count integer;
  v_total numeric(6,2) := 0;
begin
  select * into v from appraisal.appraisal where id = p_appraisal_id;
  if v.id is null then
    raise exception 'Appraisal not found';
  end if;

  -- Two statements: PL/pgSQL will not select into a record and a scalar together.
  select c.academic_year_id into v_year
  from appraisal.cycle c where c.id = v.cycle_id;

  select m.* into v_model
  from appraisal.cycle c
  join appraisal.growth_model m on m.id = c.growth_model_id
  where c.id = v.cycle_id;

  if v_model.id is null then
    raise exception 'This appraisal cycle has no growth model bound to it'
      using hint = 'Bind a model to the cycle before scoring, so the score can name the policy it was made under.';
  end if;

  delete from appraisal.growth_score where appraisal_id = p_appraisal_id;

  insert into appraisal.growth_score
    (school_id, appraisal_id, model_id, total_percent, disclaimer, model_version, computed_by)
  values (v.school_id, p_appraisal_id, v_model.id, 0, v_model.disclaimer, v_model.version,
          core.current_user_id())
  returning id into v_score_id;

  for v_component in
    select * from appraisal.growth_component where model_id = v_model.id order by sort_order
  loop
    v_raw := 0; v_count := 0;
    v_evidence := 'No evidence of this kind on record.';
    v_basis := 'Nothing recorded, so this component scores zero rather than being skipped.';

    if v_component.source = 'competency_attainment' then
      -- Proportion of expected competencies verified at or above expectation.
      select count(*) filter (where vc.verified_ordinal >= vc.expected_ordinal),
             count(*)
        into v_count, v_total
      from (
        select pl.ordinal as verified_ordinal, el.ordinal as expected_ordinal
        from assessment.verified_competency a
        join competency.proficiency_level pl on pl.id = a.verified_level_id
        join competency.proficiency_level el on el.id = a.expected_level_id
        where a.teacher_profile_id = v.teacher_profile_id
          and a.academic_year_id = v_year
      ) vc;
      v_raw := case when v_total > 0 then round(v_count * 100.0 / v_total, 2) else 0 end;
      v_evidence := format('%s of %s verified competencies at or above the expected level.', v_count, v_total);
      v_basis := 'Verified levels compared with expected levels for the year.';
      v_count := coalesce(v_total, 0)::integer;

    elsif v_component.source = 'competency_growth' then
      select count(*) into v_count
      from assessment.verified_competency a
      where a.teacher_profile_id = v.teacher_profile_id
        and a.academic_year_id = v_year
        and a.is_reassessment;
      -- Any verified movement scores; the platform does not grade improvement.
      v_raw := case when v_count > 0 then 100 else 0 end;
      v_evidence := format('%s verified reassessment(s) this year.', v_count);
      v_basis := 'A reassessment only happens after impact has been evidenced and verified, so its presence is the measure.';

    elsif v_component.source = 'kpi_achievement' then
      select count(*) filter (where k.status = 'closed'), count(*)
        into v_count, v_total
      from kpi.teacher_kpi k
      where k.teacher_profile_id = v.teacher_profile_id and k.academic_year_id = v_year;
      v_raw := case when v_total > 0 then round(v_count * 100.0 / v_total, 2) else 0 end;
      v_evidence := format('%s of %s assigned KPIs closed.', v_count, v_total);
      v_basis := 'KPIs marked closed for the year against those assigned.';
      v_count := coalesce(v_total, 0)::integer;

    elsif v_component.source = 'cpd_compliance' then
      select p.completed_hours, p.required_hours into v_raw, v_total
      from compliance.cpd_progress(v.teacher_profile_id, v_year) p
      where p.dimension = 'total';
      v_evidence := format('%s of %s CPD hours credited.', coalesce(v_raw, 0), coalesce(v_total, 0));
      v_raw := case when coalesce(v_total, 0) > 0
                    then least(100, round(coalesce(v_raw, 0) * 100.0 / v_total, 2)) else 0 end;
      v_basis := 'Credited CPD hours against the requirement in force for the year.';

    elsif v_component.source = 'cpd_impact' then
      select count(*) into v_count
      from growth.learning_plan_item pi
      join growth.learning_plan lp on lp.id = pi.learning_plan_id
      where lp.teacher_profile_id = v.teacher_profile_id
        and lp.academic_year_id = v_year
        and pi.status in ('impact_verified', 'reassessed');
      v_raw := case when v_count > 0 then 100 else 0 end;
      v_evidence := format('%s development item(s) with impact verified in practice.', v_count);
      v_basis := 'Completing a course counts for nothing here; only verified application does.';

    elsif v_component.source = 'professional_goals' then
      select count(*) filter (where g.status = 'achieved'), count(*)
        into v_count, v_total
      from growth.professional_goal g
      where g.teacher_profile_id = v.teacher_profile_id and g.academic_year_id = v_year;
      v_raw := case when v_total > 0 then round(v_count * 100.0 / v_total, 2) else 0 end;
      v_evidence := format('%s of %s professional goals achieved.', v_count, v_total);
      v_basis := 'Goals recorded as achieved against those set for the year.';
      v_count := coalesce(v_total, 0)::integer;

    elsif v_component.source = 'classroom_practice' then
      select count(*) into v_count
      from assessment.observation o
      where o.teacher_profile_id = v.teacher_profile_id and o.academic_year_id = v_year;
      v_raw := case when v_count > 0 then 100 else 0 end;
      v_evidence := format('%s classroom observation(s) recorded.', v_count);
      v_basis := 'Presence of observation evidence. The judgement itself belongs to the appraiser, not to arithmetic.';

    else
      -- collaboration, school_contribution, professional_conduct, leadership,
      -- manual: no defensible automatic measure exists, so the appraiser
      -- records these and says why. Scoring them from proxy data would invent
      -- a judgement nobody made.
      v_raw := 0;
      v_evidence := 'Recorded by the appraiser — no automatic measure.';
      v_basis := 'This component has no defensible automatic measure; the appraiser sets it with a rationale.';
    end if;

    insert into appraisal.growth_score_component
      (school_id, growth_score_id, component_id, component_name, weight_percent,
       raw_result, weighted_points, evidence_summary, evidence_count, basis)
    values
      (v.school_id, v_score_id, v_component.id, v_component.display_name,
       v_component.weight_percent, v_raw,
       round(v_raw * v_component.weight_percent / 100.0, 2),
       v_evidence, coalesce(v_count, 0), v_basis);
  end loop;

  select coalesce(sum(weighted_points), 0) into v_total
  from appraisal.growth_score_component where growth_score_id = v_score_id;

  update appraisal.growth_score set total_percent = v_total where id = v_score_id;
  return v_total;
end;
$$;

comment on function appraisal.compute_growth_score is
  'Deterministic. Engine growth-score-v1. Components with no defensible automatic measure score zero and say so, rather than being inferred from proxy data.';

-- ---------------------------------------------------------------------------
-- Increment readiness engine
-- ---------------------------------------------------------------------------
create function pay.compute_increment_readiness(
  p_teacher_profile_id uuid,
  p_academic_year_id uuid,
  p_model_id uuid
) returns pay.recommendation
language plpgsql security definer set search_path = ''
as $$
declare
  v_school uuid;
  v_model pay.readiness_model;
  v_req pay.readiness_requirement;
  v_appraisal uuid;
  v_value numeric(6,2);
  v_met boolean;
  v_percent numeric(6,2) := 0;
  v_total integer := 0;
  v_metcount integer := 0;
  v_outstanding jsonb := '[]'::jsonb;
  v_detail text;
  v_row pay.recommendation;
begin
  select school_id into v_school from core.teacher_profile where id = p_teacher_profile_id;
  select * into v_model from pay.readiness_model where id = p_model_id;
  if v_model.id is null then
    raise exception 'Readiness model not found';
  end if;

  select a.id into v_appraisal
  from appraisal.appraisal a
  join appraisal.cycle c on c.id = a.cycle_id
  where a.teacher_profile_id = p_teacher_profile_id and c.academic_year_id = p_academic_year_id;

  for v_req in
    select * from pay.readiness_requirement where model_id = p_model_id order by sort_order
  loop
    v_total := v_total + 1;
    v_value := 0;
    v_detail := 'Not recorded.';

    if v_req.source = 'growth_score' then
      select gs.total_percent into v_value
      from appraisal.growth_score gs where gs.appraisal_id = v_appraisal;
      v_value := coalesce(v_value, 0);
      v_detail := format('Professional growth score %s%%.', v_value);

    elsif v_req.source = 'cpd_compliance' then
      select case when p.required_hours > 0
                  then least(100, round(p.completed_hours * 100.0 / p.required_hours, 2))
                  else 0 end
        into v_value
      from compliance.cpd_progress(p_teacher_profile_id, p_academic_year_id) p
      where p.dimension = 'total';
      v_value := coalesce(v_value, 0);
      v_detail := format('CPD requirement %s%% complete.', v_value);

    elsif v_req.source = 'competency_attainment' then
      select case when count(*) > 0
                  then round(count(*) filter (where pl.ordinal >= el.ordinal) * 100.0 / count(*), 2)
                  else 0 end
        into v_value
      from assessment.verified_competency a
      join competency.proficiency_level pl on pl.id = a.verified_level_id
      join competency.proficiency_level el on el.id = a.expected_level_id
      where a.teacher_profile_id = p_teacher_profile_id and a.academic_year_id = p_academic_year_id;
      v_value := coalesce(v_value, 0);
      v_detail := format('%s%% of verified competencies at or above expectation.', v_value);

    elsif v_req.source = 'cpd_impact' then
      select case when count(*) > 0 then 100 else 0 end into v_value
      from growth.learning_plan_item pi
      join growth.learning_plan lp on lp.id = pi.learning_plan_id
      where lp.teacher_profile_id = p_teacher_profile_id
        and lp.academic_year_id = p_academic_year_id
        and pi.status in ('impact_verified', 'reassessed');
      v_detail := case when v_value > 0
                       then 'Development has been applied and verified in practice.'
                       else 'No development yet verified as applied in practice.' end;

    elsif v_req.source = 'kpi_achievement' then
      select case when count(*) > 0
                  then round(count(*) filter (where status = 'closed') * 100.0 / count(*), 2)
                  else 0 end
        into v_value
      from kpi.teacher_kpi
      where teacher_profile_id = p_teacher_profile_id and academic_year_id = p_academic_year_id;
      v_value := coalesce(v_value, 0);
      v_detail := format('%s%% of assigned KPIs closed.', v_value);

    else
      -- service_condition, conduct, collaboration, leadership, manual: recorded
      -- by a person. Left at zero and reported as outstanding rather than
      -- assumed satisfied — the safer direction to be wrong in.
      v_detail := 'Requires a recorded judgement; not yet provided.';
    end if;

    v_met := v_req.threshold is null or v_value >= v_req.threshold;
    if v_met then
      v_metcount := v_metcount + 1;
      v_percent := v_percent + v_req.weight_percent;
    else
      v_outstanding := v_outstanding || jsonb_build_object(
        'requirement', v_req.display_name,
        'threshold', v_req.threshold,
        'value', v_value,
        'mandatory', v_req.is_mandatory,
        'detail', v_detail,
        'why', v_req.threshold_note
      );
    end if;
  end loop;

  insert into pay.recommendation
    (school_id, teacher_profile_id, academic_year_id, appraisal_id, readiness_model_id,
     readiness_percent, requirements_total, requirements_met, outstanding, disclaimer)
  values
    (v_school, p_teacher_profile_id, p_academic_year_id, v_appraisal, p_model_id,
     least(100, v_percent), v_total, v_metcount, v_outstanding, v_model.disclaimer)
  on conflict (school_id, teacher_profile_id, academic_year_id) do update
    set readiness_percent = excluded.readiness_percent,
        requirements_total = excluded.requirements_total,
        requirements_met = excluded.requirements_met,
        outstanding = excluded.outstanding,
        disclaimer = excluded.disclaimer,
        readiness_model_id = excluded.readiness_model_id,
        appraisal_id = excluded.appraisal_id,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

comment on function pay.compute_increment_readiness is
  'Deterministic readiness, not a decision. Engine increment-readiness-v1. Requirements needing a human judgement are reported outstanding rather than assumed satisfied.';
