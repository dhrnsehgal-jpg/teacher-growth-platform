,   'Anticipated and addressed a known misconception.'),
      ('reflective_practice', 'Practice changed in response to evidence of learning.')
    ) as v(competency_key, note)
    join competency.competency c on c.school_id=v_school and c.key=v.competency_key
    on conflict do nothing;

    insert into evidence.evidence_link (school_id, evidence_id, teacher_kpi_id, note)
    select v_school, v_evidence, k.id, 'Evidence towards the assessment design KPI.'
    from kpi.teacher_kpi k
    join core.teacher_profile tp on tp.id = k.teacher_profile_id
    where tp.user_id = u_rajesh and k.academic_year_id = v_year
      and k.name = 'Assessment Design and Moderation'
    on conflict do nothing;
  end if;

  -- ------------------------------------------------- professional goals
  insert into growth.professional_goal (
    school_id, teacher_profile_id, academic_year_id, competency_id,
    title, description, success_measure, target_date, status, created_by
  )
  select v_school, tp.id, v_year, c.id, v.title, v.description, v.measure, v.target_date, 'active', v.uid
  from (values
    (u_simran, 'differentiated_instruction',
     'Plan two routes into every literacy objective',
     'Build the habit of planning an access route and an extension route for each early-literacy objective.',
     'Every literacy plan this term shows two routes, and the reading-group data narrows.',
     date '2026-12-15'),
    (u_rajesh, 'competency_based_education',
     'Rebuild the Class XI mechanics unit around competencies',
     'Replace coverage-based unit planning with demonstrable competencies and application tasks.',
     'Unit plan states competencies; at least two application tasks set in unfamiliar contexts.',
     date '2027-01-31'),
    (u_anjali, 'mentoring',
     'Establish a structured mentoring cycle in the Science department',
     'Set up termly mentoring cycles with agreed goals for each teacher in the department.',
     'Every department member has a recorded mentoring cycle with goals and a review.',
     date '2027-03-31')
  ) as v(uid, competency_key, title, description, measure, target_date)
  join core.teacher_profile tp on tp.school_id=v_school and tp.user_id=v.uid
  join competency.competency c on c.school_id=v_school and c.key=v.competency_key
  on conflict do nothing;

end $$;

-- ===========================================================================
-- STAGE 3 — assessment, gaps, CPD catalogue and the demo growth scenario
-- ===========================================================================
-- The scenario the brief specifies, seeded to its STARTING state:
--   Neha Sharma, Middle Stage Mathematics teacher
--   Competency: Competency-Based Assessment
--   Expected level 4, verified level 2 → gap of 2, priority High
-- The rest of the loop (select CPD → approve → complete → reflect → apply →
-- verify → reassess to 3) is driven through the application, not seeded, so the
-- end-to-end test exercises the real code paths.
-- ===========================================================================

do $$
declare
  v_school uuid; v_year uuid; v_comp uuid;
  v_stage_middle uuid; v_dept_math uuid; v_scale uuid;
  v_neha_tp uuid; v_vikram_tp uuid;
  v_cycle uuid; v_ta uuid; v_obs uuid; v_ev uuid;
  v_l2 uuid; v_l4 uuid;
  u_neha    uuid := '00000000-0000-4000-8000-000000000203';
  u_vikram  uuid := '00000000-0000-4000-8000-000000000206';
  u_principal uuid := '00000000-0000-4000-8000-000000000210';
  v_gaps integer; v_recs integer;
begin
  select id into v_school from core.school where slug = 'demo-school';
  select id into v_year from core.academic_year where school_id = v_school and is_current;
  select id into v_stage_middle from core.school_stage where school_id=v_school and key='middle';
  select id into v_dept_math from core.department where school_id=v_school and key='mathematics';

  perform growth.provision_priority_bands(v_school);
  select competency.provision_stage3_competency(v_school) into v_comp;
  perform cpd.provision_default_catalogue(v_school);

  select ps.id into v_scale from competency.proficiency_scale ps
   join competency.framework f on f.id = ps.framework_id
   where f.school_id = v_school and f.key='school_professional_practice' and ps.key='school_five_point';
  select id into v_l2 from competency.proficiency_level where scale_id=v_scale and ordinal=2;
  select id into v_l4 from competency.proficiency_level where scale_id=v_scale and ordinal=4;

  -- A Mathematics Head of Department, so Neha has a manager in scope.
  insert into auth.users (id) values (u_vikram) on conflict (id) do nothing;
  if exists (select 1 from information_schema.columns
              where table_schema='auth' and table_name='users' and column_name='encrypted_password') then
    execute $sql$
      update auth.users set
        instance_id = '00000000-0000-0000-0000-000000000000'::uuid,
        aud = 'authenticated', role = 'authenticated',
        email = 'vikram.rao@demo-school.example',
        encrypted_password = extensions.crypt('demo-password-not-for-production', extensions.gen_salt('bf')),
        email_confirmed_at = now(), created_at = now(), updated_at = now(),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = '{}'::jsonb,
        confirmation_token = '', recovery_token = '', email_change = '',
        email_change_token_new = '', email_change_token_current = '',
        phone_change = '', phone_change_token = '', reauthentication_token = ''
      where id = $1
    $sql$ using u_vikram;
    execute $sql$
      insert into auth.identities (provider_id, user_id, identity_data, provider,
                                   last_sign_in_at, created_at, updated_at)
      select u.id::text, u.id,
             jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
             'email', now(), now(), now()
      from auth.users u where u.id = $1
      on conflict (provider, provider_id) do nothing
    $sql$ using u_vikram;
  end if;

  insert into core.app_user (id, email, full_name)
  values (u_vikram, 'vikram.rao@demo-school.example', 'Vikram Rao')
  on conflict (id) do nothing;

  insert into core.teacher_profile (
    school_id, user_id, employee_code, primary_department_id,
    teacher_category_id, career_level_id, date_of_joining, has_leadership_responsibility
  )
  select v_school, u_vikram, 'EMP-2006', v_dept_math, tc.id, cl.id, date '2015-04-01', true
  from core.teacher_category tc, core.career_level cl
  where tc.school_id=v_school and tc.key='head_of_department'
    and cl.school_id=v_school and cl.key='expert'
  on conflict (school_id, user_id) do nothing;

  insert into core.user_role_assignment (school_id, user_id, role_id, scope_type, scope_id)
  select v_school, u_vikram, r.id, 'department', v_dept_math
  from core.role r where r.school_id=v_school and r.key='head_of_department'
  on conflict do nothing;

  select id into v_neha_tp from core.teacher_profile where school_id=v_school and user_id=u_neha;
  select id into v_vikram_tp from core.teacher_profile where school_id=v_school and user_id=u_vikram;

  -- Expected level 4 for the Middle stage, and mandatory.
  insert into competency.competency_target (
    school_id, academic_year_id, competency_id, target_level_id,
    school_stage_id, is_mandatory, rationale
  )
  values (
    v_school, v_year, v_comp, v_l4, v_stage_middle, true,
    'Middle-stage assessment is where competency-based reporting begins to carry '
    'weight for students, so the school sets a higher bar for this stage.'
  )
  on conflict do nothing;

  -- School-wide baseline for the same competency, so other staff are covered.
  insert into competency.competency_target (
    school_id, academic_year_id, competency_id, target_level_id, rationale
  )
  select v_school, v_year, v_comp, pl.id, 'School-wide baseline expectation for the year.'
  from competency.proficiency_level pl where pl.scale_id=v_scale and pl.ordinal=3
  on conflict do nothing;

  -- A school strategic priority this year.
  insert into growth.strategic_priority (school_id, academic_year_id, competency_id, rationale, created_by)
  values (v_school, v_year, v_comp,
    'Competency-based assessment is the school''s stated improvement priority for 2026-27, '
    'following a review that found reporting still dominated by marks.', u_principal)
  on conflict do nothing;

  -- The assessment KPI depends on this competency.
  insert into kpi.template_competency (school_id, template_id, competency_id)
  select v_school, t.id, v_comp from kpi.template t
  where t.school_id=v_school and t.key='assessment_quality'
  on conflict do nothing;

  -- Give Neha a KPI set, including the assessment one.
  insert into kpi.teacher_kpi (
    school_id, teacher_profile_id, academic_year_id, template_id, category_id,
    name, description, metric, unit, direction, target, weight, data_source,
    frequency, evidence_requirement, is_student_outcome_measure,
    reviewer_user_id, status, assigned_by, assigned_at
  )
  select v_school, v_neha_tp, v_year, t.id, t.category_id, t.name, t.description,
         t.metric, t.unit, t.direction, coalesce(t.default_target,'As agreed'), v.weight,
         t.data_source, t.frequency, t.evidence_requirement, t.is_student_outcome_measure,
         u_vikram, 'assigned', u_principal, now()
  from (values
    ('assessment_quality', 30), ('lesson_observation_quality', 30),
    ('class_progress_vs_baseline', 20), ('cpd_participation', 20)
  ) as v(template_key, weight)
  join kpi.template t on t.school_id=v_school and t.key=v.template_key
  on conflict (teacher_profile_id, academic_year_id, name) do nothing;

  -- ------------------------------------------------------------ assessment
  insert into assessment.cycle (school_id, academic_year_id, key, name, status, opens_on, closes_on)
  values (v_school, v_year, 'term1_review', 'Term 1 Professional Review', 'in_review',
          date '2026-07-01', date '2026-08-31')
  on conflict (school_id, academic_year_id, key) do nothing
  returning id into v_cycle;
  if v_cycle is null then
    select id into v_cycle from assessment.cycle
     where school_id=v_school and academic_year_id=v_year and key='term1_review';
  end if;

  insert into assessment.teacher_assessment (school_id, cycle_id, teacher_profile_id, status,
                                             self_submitted_at, supervisor_submitted_at)
  values (v_school, v_cycle, v_neha_tp, 'supervisor_submitted', now(), now())
  on conflict (cycle_id, teacher_profile_id) do nothing
  returning id into v_ta;
  if v_ta is null then
    select id into v_ta from assessment.teacher_assessment
     where cycle_id=v_cycle and teacher_profile_id=v_neha_tp;
  end if;

  insert into assessment.observation (
    school_id, teacher_profile_id, academic_year_id, observer_user_id, observed_on,
    class_level_id, subject_id, focus, narrative
  )
  select v_school, v_neha_tp, v_year, u_vikram, date '2026-08-05', cl.id, s.id,
         'Competency-based assessment',
         'End-of-unit assessment reviewed during the lesson. Questions closely mirrored worked '
         'examples from the previous week, so students who had memorised the method succeeded '
         'while those asked to apply it in a new context did not attempt it. Marking was '
         'numerical with no criteria descriptors.'
  from core.class_level cl, core.subject s
  where cl.school_id=v_school and cl.key='class_7' and s.school_id=v_school and s.key='mathematics'
  returning id into v_obs;

  -- Three sources, stored separately, each with its own reasoning.
  insert into assessment.competency_rating (
    school_id, teacher_assessment_id, competency_id, source, level_id, rationale,
    observation_id, rated_by, rated_at
  ) values
    (v_school, v_ta, v_comp, 'self', v_l2,
     'I set application questions occasionally but my rubrics still describe marks rather than '
     'what the student can do. I am not confident writing unfamiliar-context tasks.',
     null, u_neha, now() - interval '10 days'),
    (v_school, v_ta, v_comp, 'supervisor', v_l2,
     'Assessment tasks remain close to taught examples and rubrics are mark-based. Neha is aware '
     'of the gap and has begun reading on the topic, which is why this is level 2 rather than 1.',
     null, u_vikram, now() - interval '5 days'),
    (v_school, v_ta, v_comp, 'observation', v_l2,
     'Observed assessment mirrored worked examples; no criteria-based rubric in use.',
     v_obs, u_vikram, now() - interval '5 days');

  -- Supporting evidence, verified but weak — which is itself a signal.
  insert into evidence.evidence (
    school_id, teacher_profile_id, academic_year_id, evidence_type_id,
    title, description, reflection, occurred_on, status, submitted_at
  )
  select v_school, v_neha_tp, v_year, et.id,
    'Class VII end-of-unit assessment — fractions',
    'The unit assessment as set, with its marking scheme.',
    'Looking at it again, most questions repeat the worked examples.',
    date '2026-08-01', 'submitted', now() - interval '9 days'
  from evidence.evidence_type et where et.school_id=v_school and et.key='assessment_design'
  returning id into v_ev;

  update evidence.evidence set status='under_review' where id=v_ev;
  update evidence.evidence
     set status='verified', strength='weak', reviewed_by=u_vikram, reviewed_at=now(),
         review_note='Genuine and relevant, but it demonstrates the current gap rather than the competency.'
   where id=v_ev;

  -- The verified level, with every input recorded and an explanation.
  insert into assessment.verified_competency (
    school_id, teacher_profile_id, competency_id, academic_year_id, source_cycle_id,
    verified_level_id, expected_level_id,
    self_level_id, supervisor_level_id, observation_level_id,
    evidence_strength, evidence_count, rationale, determined_from, verified_by
  ) values (
    v_school, v_neha_tp, v_comp, v_year, v_cycle,
    v_l2, v_l4, v_l2, v_l2, v_l2, 'weak', 1,
    'Self-assessment, supervisor assessment and the classroom observation all place practice at '
    'level 2, and they agree on why: tasks stay close to taught examples and rubrics describe '
    'marks rather than competencies. The single piece of evidence is genuine but demonstrates '
    'the gap rather than the competency, so it is recorded as weak. Verified at level 2 against '
    'an expected level of 4 for the Middle stage.',
    jsonb_build_object(
      'self', 2, 'supervisor', 2, 'observation', 2,
      'evidence_strength', 'weak', 'evidence_count', 1,
      'sources_agree', true, 'expected', 4),
    u_vikram
  );

  -- Run the engines.
  select growth.compute_gaps(v_neha_tp, v_year) into v_gaps;
  select cpd.generate_recommendations(v_neha_tp, v_year) into v_recs;

  raise notice 'Stage 3: % gap(s) computed for Neha, % recommendation(s) generated', v_gaps, v_recs;
end $$;

-- ===========================================================================
-- Stage 4 — CPD compliance ledger and SQAAF self-assessment
-- ===========================================================================
do $stage4$
declare
  v_school uuid;
  v_year   uuid;
  v_neha   uuid;
  v_vikram uuid;
  v_priya  uuid;
  v_ver    uuid;
  v_fw     uuid;
  v_sa     uuid;
  v_std    integer;
  v_rec    uuid;
  v_cba_record uuid;
  v_comp   uuid;
  v_vc     uuid;
  v_gap    uuid;
  v_l2     uuid;
  v_l3     uuid;
  v_l4     uuid;
begin
  select id into v_school from core.school where slug = 'demo-school';
  select id into v_year from core.academic_year where school_id = v_school and is_current;

  -- Structure and configuration first.
  select sqaaf.provision_framework(v_school) into v_std;

  select tp.id into v_neha from core.teacher_profile tp
    join core.app_user u on u.id = tp.user_id
   where tp.school_id = v_school and u.email like 'neha.sharma%';
  select id into v_vikram from core.app_user where email like 'vikram.rao%';
  select id into v_priya  from core.app_user where email like 'gurpreet.dhillon%';

  select id into v_ver from compliance.cpd_requirement_version
    where school_id = v_school and key = 'cbse.cpd' and version = 1;
  select id into v_fw from sqaaf.framework_version where school_id = v_school and key = 'cbse.sqaaf.2023';

  -- -------------------------------------------------------------------------
  -- Neha's CPD year: 38 of 50 hours
  -- -------------------------------------------------------------------------
  -- Records are inserted as `submitted` and then verified, because the status
  -- machine refuses to create a verified record out of nothing — the same rule
  -- a real reviewer works under.
  insert into compliance.cpd_record
    (school_id, teacher_profile_id, academic_year_id, title, description,
     source_type_id, provider_name, category_id, source_class,
     activity_from, activity_to, duration_hours, claimed_hours,
     hour_basis, activity_rule_id, requirement_version_id, status, submitted_at, created_by)
  select v_school, v_neha, v_year, x.title, x.description,
         st.id, x.provider, cat.id, x.source_class::compliance.cpd_source_class,
         x.from_date::date, x.to_date::date, x.hours, x.hours,
         case when x.rule_key is null then 'attendance' else 'activity_rule' end::compliance.cpd_hour_basis,
         ar.id, v_ver, 'submitted', now(), (select user_id from core.teacher_profile where id = v_neha)
  from (values
    ('Value Education and Ethics in the Classroom',
     'CBSE Capacity Building Programme on Annexure-I topics.',
     'cbse', 'CBSE', 'core_values_ethics', 'board_or_government',
     '2026-05-12', '2026-05-12', 4, null),

    ('School values and code of conduct workshop',
     'In-house programme on the school''s values framework and professional conduct.',
     'school_inhouse', 'School Professional Development Team', 'core_values_ethics', 'school_or_complex',
     '2026-04-20', '2026-04-21', 6, null),

    ('Competency Based Assessment (Secondary Level) - Mathematics',
     'CBSE offline subject-specific Capacity Building Programme, 2 days = 12 hours (Annexure-II).',
     'cbse', 'CBSE', 'knowledge_practice', 'board_or_government',
     '2026-07-06', '2026-07-07', 12, null),

    ('Experiential learning in mathematics — School Complex session',
     'Joint session with neighbouring schools on experiential and activity-based mathematics.',
     'school_complex', 'North Zone School Complex', 'knowledge_practice', 'school_or_complex',
     '2026-06-15', '2026-06-15', 6, null),

    ('Leading transformation in schools — CBSE online session',
     'CBSE session drawn from Annexure-III topics.',
     'cbse', 'CBSE', 'professional_growth', 'board_or_government',
     '2026-08-05', '2026-08-05', 2, null),

    ('Board examination evaluation duty as Examiner',
     'Full evaluation duty assigned by the Regional Office.',
     'school_inhouse', 'CBSE Regional Office (duty assigned)', 'professional_growth', 'school_or_complex',
     '2026-04-06', '2026-04-10', 6, 'board_exam_evaluation'),

    ('Mentoring two probationary mathematics teachers',
     'Structured mentoring with recorded sessions and a reflective journal.',
     'school_inhouse', 'School Professional Development Team', 'professional_growth', 'school_or_complex',
     '2026-11-20', '2026-11-20', 2, 'research_mentoring_publication')
  ) as x(title, description, source_key, provider, category_key, source_class, from_date, to_date, hours, rule_key)
  join compliance.cpd_source_type st on st.school_id = v_school and st.key = x.source_key
  join compliance.cpd_category cat on cat.school_id = v_school and cat.key = x.category_key
  left join compliance.cpd_activity_rule ar on ar.version_id = v_ver and ar.key = x.rule_key;

  -- The Head of Department verifies them and credits the hours claimed.
  update compliance.cpd_record
     set status = 'verified', reviewed_by = v_vikram, reviewed_at = now(),
         credited_hours = claimed_hours,
         review_note = 'Certificate and attendance record checked against the provider''s confirmation.'
   where teacher_profile_id = v_neha and academic_year_id = v_year and status = 'submitted';

  -- One record, many meanings. The Competency-Based Assessment programme
  -- developed several competencies; linking it four times must not turn 12
  -- hours into 48. A test asserts exactly that.
  select id into v_cba_record from compliance.cpd_record
   where teacher_profile_id = v_neha and title like 'Competency Based Assessment%';

  insert into compliance.cpd_record_competency (school_id, cpd_record_id, competency_id, note)
  select v_school, v_cba_record, c.id,
         'Developed through the CBSE competency-based assessment programme.'
  from competency.competency c
  where c.school_id = v_school
    and c.key in ('competency_based_assessment', 'assessment_feedback',
                  'lesson_learning_design', 'subject_knowledge')
  on conflict do nothing;

  -- -------------------------------------------------------------------------
  -- SQAAF self-assessment
  -- -------------------------------------------------------------------------
  insert into sqaaf.self_assessment
    (school_id, academic_year_id, version_id, status, started_at, started_by)
  values (v_school, v_year, v_fw, 'in_progress', now(), v_priya)
  on conflict (school_id, academic_year_id) do nothing
  returning id into v_sa;

  if v_sa is null then
    select id into v_sa from sqaaf.self_assessment
      where school_id = v_school and academic_year_id = v_year;
  end if;

  select id into v_l2 from sqaaf.performance_level where version_id = v_fw and level_number = 2;
  select id into v_l3 from sqaaf.performance_level where version_id = v_fw and level_number = 3;
  select id into v_l4 from sqaaf.performance_level where version_id = v_fw and level_number = 4;

  insert into sqaaf.standard_rating
    (school_id, self_assessment_id, standard_id, level_id, aspirational_level_id,
     rationale, responsible_user_id, priority, rated_by)
  select v_school, v_sa, s.id, x.level, x.aspiration, x.rationale, v_vikram, x.priority::sqaaf.priority_band, v_priya
  from (values
    ('3.1.3', v_l3, v_l4,
     'Appraisal runs as a documented developmental cycle: self-assessment, supervisor assessment, observation and verified levels are recorded separately with written rationales, and every teacher can read their own record in full. Not yet at level IV because moderation across departments is not running.',
     'medium'),
    ('3.1.4', v_l3, v_l4,
     'Capacity building is planned and tracked per teacher against the CBSE 50-hour scheme, with hours recorded by domain and source. Impact on practice is verified before a competency is reassessed. Consistency across all departments is still being established.',
     'medium'),
    ('1.6.2', v_l2, v_l4,
     'Teachers use varied assessment modes, but the evidence shows assessment design still leaning on recall tasks close to taught examples. This is the gap the current development cycle is addressing.',
     'high'),
    ('1.6.3', v_l2, v_l3,
     'Procedures and criteria exist and are followed, but rubrics frequently describe marks rather than competencies, so assessment for learning is inconsistent between classes.',
     'high')
  ) as x(code, level, aspiration, rationale, priority)
  join sqaaf.standard s on s.school_id = v_school and s.code = x.code
  on conflict (self_assessment_id, standard_id) do nothing;

  -- Collect once, use twice: the CPD record and the verified competency already
  -- exist for the teacher's own development. They are referenced here, not copied.
  select id into v_vc from assessment.verified_competency
   where teacher_profile_id = v_neha order by verified_at desc limit 1;

  insert into sqaaf.evidence_map
    (school_id, standard_id, self_assessment_id, cpd_record_id, mapped_by, note)
  select v_school, s.id, v_sa, v_cba_record, v_priya,
    'CBSE subject-specific capacity building programme, 12 hours, verified.'
  from sqaaf.standard s where s.school_id = v_school and s.code in ('3.1.4', '1.6.2')
  on conflict do nothing;

  insert into sqaaf.evidence_map
    (school_id, standard_id, self_assessment_id, verified_competency_id, mapped_by, note)
  select v_school, s.id, v_sa, v_vc, v_priya,
    'Verified competency level with every input recorded beside it, including the observation.'
  from sqaaf.standard s
  where s.school_id = v_school and s.code = '3.1.3' and v_vc is not null
  on conflict do nothing;

  -- A standard this platform could evidence but does not yet.
  insert into sqaaf.evidence_gap
    (school_id, self_assessment_id, standard_id, description, responsible_user_id, identified_by)
  select v_school, v_sa, s.id,
    'No rubric or student-work evidence has been submitted showing competencies assessed against Learning Outcomes and the Holistic Progress Card criteria. The platform holds assessment designs, but none are linked to this standard.',
    v_vikram, v_priya
  from sqaaf.standard s where s.school_id = v_school and s.code = '1.6.4'
  on conflict (self_assessment_id, standard_id) do nothing;

  select g.id into v_gap from sqaaf.evidence_gap g
  join sqaaf.standard s on s.id = g.standard_id
  where g.self_assessment_id = v_sa and s.code = '1.6.4';

  insert into sqaaf.improvement_action
    (school_id, self_assessment_id, standard_id, evidence_gap_id,
     current_level_id, aspirational_level_id, priority,
     area_of_improvement, proposed_action, convenor_user_id, team_note,
     target_date, status, created_by)
  select v_school, v_sa, s.id, v_gap, v_l2, v_l4, 'high',
    'Assessment of skills and competencies against Learning Outcomes and Holistic Progress Card criteria',
    'Each department submits two moderated assessment designs with competency-referenced rubrics by the end of term two, linked as evidence against this standard. Mathematics leads, since its competency-based assessment work is furthest along.',
    v_vikram,
    'Convened by the Mathematics HoD with one representative per department.',
    date '2026-12-15', 'approved', v_priya
  from sqaaf.standard s where s.school_id = v_school and s.code = '1.6.4';

  raise notice 'Stage 4: SQAAF % standards provisioned, Neha CPD % hours credited',
    v_std,
    (select coalesce(sum(credited_hours), 0) from compliance.cpd_record
      where teacher_profile_id = v_neha and status = 'verified');
end $stage4$;

-- ===========================================================================
-- Stage 5 — service records, appraisal, growth score and increment readiness
-- ===========================================================================
do $stage5$
declare
  v_school uuid;
  v_year   uuid;
  v_neha   uuid;
  v_vikram uuid;
  v_principal uuid;
  v_cycle  uuid;
  v_appraisal uuid;
  v_readiness uuid;
  v_score  numeric;
  v_rec    pay.recommendation;
  v_designations integer;
begin
  select id into v_school from core.school where slug = 'demo-school';
  select id into v_year from core.academic_year where school_id = v_school and is_current;

  select service.provision_stage5(v_school) into v_designations;

  select tp.id into v_neha from core.teacher_profile tp
    join core.app_user u on u.id = tp.user_id
   where tp.school_id = v_school and u.email like 'neha.sharma%';
  select id into v_vikram from core.app_user where email like 'vikram.rao%';
  select id into v_principal from core.app_user where email like 'gurpreet.dhillon%';

  -- -------------------------------------------------------------------------
  -- Service records for every teacher
  -- -------------------------------------------------------------------------
  insert into service.service_record
    (school_id, teacher_profile_id, employee_id, appointment_date, appointment_letter_reference,
     designation_id, employment_category, probation_state, confirmed_on, prior_experience_months, created_by)
  select v_school, tp.id, tp.employee_code, tp.date_of_joining,
         'APPT/' || tp.employee_code,
         d.id, tc.display_name, 'confirmed',
         tp.date_of_joining + 365, tp.prior_experience_months, v_principal
  from core.teacher_profile tp
  join core.teacher_category tc on tc.id = tp.teacher_category_id
  join service.designation d on d.school_id = v_school and d.key = case
        when tc.key = 'principal' then 'principal'
        when tc.key = 'vice_principal' then 'vice_principal'
        when tc.key = 'academic_coordinator' then 'academic_coordinator'
        when tc.key = 'head_of_department' then 'head_of_department'
        else 'teacher' end
  where tp.school_id = v_school
  on conflict (school_id, teacher_profile_id) do nothing;

  -- The appointment event, so the career history is not empty from day one.
  insert into service.career_event
    (school_id, service_record_id, event_type, effective_on, summary, reference, recorded_by)
  select v_school, r.id, 'appointment', r.appointment_date,
         'Appointed to the school on ' || r.appointment_date || '.',
         r.appointment_letter_reference, v_principal
  from service.service_record r where r.school_id = v_school
  on conflict do nothing;

  insert into service.career_event
    (school_id, service_record_id, event_type, effective_on, summary, recorded_by)
  select v_school, r.id, 'confirmation', r.confirmed_on,
         'Confirmed in post following probation.', v_principal
  from service.service_record r where r.school_id = v_school and r.confirmed_on is not null
  on conflict do nothing;

  -- A qualification, verified, for the teacher the demo follows.
  insert into service.qualification
    (school_id, service_record_id, qualification, awarding_body, subject_or_field, level,
     awarded_year, verification_status, verified_by, verified_at, verification_note)
  select v_school, r.id, 'M.Sc. Mathematics', 'Panjab University', 'Mathematics', 'Masters',
         2014, 'verified', v_principal, now(),
         'Original degree certificate sighted and copy held on file.'
  from service.service_record r where r.school_id = v_school and r.teacher_profile_id = v_neha
  on conflict do nothing;

  -- -------------------------------------------------------------------------
  -- A part-completed year, so the appraisal has something real to score
  -- -------------------------------------------------------------------------
  -- Stage 3 deliberately leaves Neha's competency journey for the Playwright
  -- spec to drive, so at seed time she is mid-cycle. Two KPIs closed and one
  -- goal achieved represent a year in progress rather than a blank one — the
  -- growth score below is genuinely computed from this state, not arranged to
  -- reach a flattering number.
  update kpi.teacher_kpi set status = 'closed'
   where teacher_profile_id = v_neha and academic_year_id = v_year
     and id in (select id from kpi.teacher_kpi
                 where teacher_profile_id = v_neha and academic_year_id = v_year
                 order by weight desc limit 2);

  insert into growth.professional_goal
    (school_id, teacher_profile_id, academic_year_id, title, description, success_measure,
     target_date, status, created_by)
  values
    (v_school, v_neha, v_year,
     'Rewrite the fractions unit around competency-based assessment',
     'Rebuild the Middle Stage fractions unit so assessment tasks require application in unfamiliar contexts.',
     'Unit assessment has at least half its marks on application tasks, with a competency-referenced rubric.',
     date '2026-12-15', 'achieved', v_vikram),
    (v_school, v_neha, v_year,
     'Moderate marking with a colleague each term',
     'Establish a termly moderation habit within the Mathematics department.',
     'Three recorded moderation sessions across the year.',
     date '2027-03-01', 'active', v_vikram)
  on conflict do nothing;

  -- -------------------------------------------------------------------------
  -- Neha's appraisal, run to the point of acknowledgement
  -- -------------------------------------------------------------------------
  select id into v_cycle from appraisal.cycle where school_id = v_school and key = 'appraisal_2026_27';

  insert into appraisal.appraisal (school_id, cycle_id, teacher_profile_id, appraiser_user_id)
  values (v_school, v_cycle, v_neha, v_vikram)
  on conflict (cycle_id, teacher_profile_id) do nothing
  returning id into v_appraisal;

  if v_appraisal is null then
    select id into v_appraisal from appraisal.appraisal
     where cycle_id = v_cycle and teacher_profile_id = v_neha;
  end if;

  -- Walk the workflow in order, as a real cycle would.
  update appraisal.appraisal set stage = 'competency_review' where id = v_appraisal;
  update appraisal.appraisal set stage = 'kpi_review' where id = v_appraisal;
  update appraisal.appraisal set stage = 'classroom_observation' where id = v_appraisal;
  update appraisal.appraisal set stage = 'evidence_review' where id = v_appraisal;
  update appraisal.appraisal set stage = 'cpd_compliance' where id = v_appraisal;
  update appraisal.appraisal set stage = 'cpd_impact' where id = v_appraisal;
  update appraisal.appraisal set stage = 'professional_goals' where id = v_appraisal;
  update appraisal.appraisal set stage = 'supervisor_review' where id = v_appraisal;

  update appraisal.appraisal
     set stage = 'appraisal_discussion',
         discussion_held_on = date '2027-02-10',
         discussion_note = 'Discussed the competency-based assessment work and the CPD shortfall in '
                           'Knowledge and Practice. Neha raised workload in the exam term.'
   where id = v_appraisal;

  select appraisal.compute_growth_score(v_appraisal) into v_score;

  update appraisal.appraisal
     set stage = 'final_recommendation',
         recommendation = 'Satisfactory progress; continue development in competency-based assessment.',
         recommendation_rationale =
           'Verified movement from level 2 to level 3 in Competency-Based Assessment, with impact evidenced '
           'in practice. CPD stands at 38 of 50 hours with the shortfall concentrated on the CBSE-delivered side.',
         recommended_by = v_vikram,
         recommended_at = now()
   where id = v_appraisal;

  update appraisal.appraisal set stage = 'teacher_acknowledgement' where id = v_appraisal;

  insert into appraisal.teacher_response (school_id, appraisal_id, status, comment)
  values (v_school, v_appraisal, 'reviewed', null);

  insert into appraisal.teacher_response (school_id, appraisal_id, status, comment)
  values (v_school, v_appraisal, 'comments_submitted',
          'I accept the assessment. I would note that the CBSE-delivered hours were not offered in my subject '
          'until the second term, which is why that side of the split is short.');

  -- -------------------------------------------------------------------------
  -- Increment readiness — computed, but no decision taken
  -- -------------------------------------------------------------------------
  select id into v_readiness from pay.readiness_model
   where school_id = v_school and key = 'school.readiness' and version = 1;

  select * into v_rec from pay.compute_increment_readiness(v_neha, v_year, v_readiness);

  raise notice 'Stage 5: % designations, growth score %, readiness % (% of % requirements met)',
    v_designations, round(v_score, 1), round(v_rec.readiness_percent, 1),
    v_rec.requirements_met, v_rec.requirements_total;
end $stage5$;

-- ===========================================================================
-- Stage 6 — the demo cohort
-- ===========================================================================
-- Fifteen further fictional teachers, bringing the school to twenty-two, so the
-- leadership analytics have something real to aggregate. Seven teachers cannot
-- show a heatmap, a gap cluster or a training-needs statement worth reading.
--
-- The Stage 3 demo scenario (Neha Sharma, Competency-Based Assessment) is
-- untouched: every earlier test depends on it, and the cohort is added beside
-- it rather than folded into it.
--
-- All names are fictional. All data is synthetic.
-- ===========================================================================

create or replace function pg_temp.demo_user(
  p_id uuid, p_email text, p_name text
) returns uuid
language plpgsql as $fn$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password'
  ) then
    execute $sql$
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change, email_change_token_new,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token
      )
      values ('00000000-0000-0000-0000-000000000000'::uuid, $1, 'authenticated', 'authenticated', $2,
              extensions.crypt('demo-password-not-for-production', extensions.gen_salt('bf')),
              now(), now(), now(),
              '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
              '', '', '', '', '', '', '', '')
      on conflict (id) do nothing
    $sql$ using p_id, p_email;

    execute $sql$
      insert into auth.identities (provider_id, user_id, identity_data, provider,
                                   last_sign_in_at, created_at, updated_at)
      select $1, $1, jsonb_build_object('sub', $1::text, 'email', $2), 'email', now(), now(), now()
      on conflict do nothing
    $sql$ using p_id, p_email;
  else
    -- The no-Docker shim has a minimal auth.users.
    execute 'insert into auth.users (id) values ($1) on conflict (id) do nothing' using p_id;
  end if;

  insert into core.app_user (id, email, full_name) values (p_id, p_email, p_name)
  on conflict (id) do nothing;

  return p_id;
end;
$fn$;

do $cohort$
declare
  v_school uuid;
  v_year   uuid;
  v_id     uuid;
  r        record;
  v_tp     uuid;
  v_scale  uuid;
  v_cycle  uuid;
  v_assessment uuid;
  v_comp   record;
  v_level  uuid;
  v_expected uuid;
  v_ordinal integer;
  v_seq    integer := 0;
  v_gaps   integer;
  v_year_label text;
  v_principal_user uuid;
  v_plan   uuid;
  v_item   uuid;
  v_gap_id uuid;
  v_comp_id uuid;
  v_activity uuid;
  v_verifier uuid;
  v_second_verifier uuid;
begin
  select id into v_school from core.school where slug = 'demo-school';
  select id, label into v_year, v_year_label
    from core.academic_year where school_id = v_school and is_current;
  select tp.user_id into v_principal_user
    from core.teacher_profile tp
   where tp.school_id = v_school and tp.employee_code = 'EMP-2010';
  select ps.id into v_scale from competency.proficiency_scale ps
    join competency.framework f on f.id = ps.framework_id
   where f.school_id = v_school and ps.key = 'school_five_point';
  select id into v_cycle from assessment.cycle where school_id = v_school limit 1;

  -- -------------------------------------------------------------------------
  -- The cohort
  -- -------------------------------------------------------------------------
  for r in
    select * from (values
      ('00000000-0000-4000-8000-000000000301'::uuid, 'meera.krishnan@demo-school.example',  'Meera Krishnan',  'EMP-3001', 'vice_principal',       'vice_principal',       null,                'lead_practitioner', 2011),
      ('00000000-0000-4000-8000-000000000302'::uuid, 'sunil.batra@demo-school.example',     'Sunil Batra',     'EMP-3002', 'academic_coordinator', 'academic_coordinator', null,                'expert',            2013),
      ('00000000-0000-4000-8000-000000000303'::uuid, 'ritu.malhotra@demo-school.example',   'Ritu Malhotra',   'EMP-3003', 'coordinator',          'teacher',              'pre_primary',       'expert',            2015),
      ('00000000-0000-4000-8000-000000000304'::uuid, 'davinder.gill@demo-school.example',   'Davinder Gill',   'EMP-3004', 'head_of_department',   'head_of_department',   'languages',         'expert',            2012),
      ('00000000-0000-4000-8000-000000000305'::uuid, 'kavita.joshi@demo-school.example',    'Kavita Joshi',    'EMP-3005', 'head_of_department',   'head_of_department',   'social_science',    'expert',            2014),
      ('00000000-0000-4000-8000-000000000306'::uuid, 'arjun.nair@demo-school.example',      'Arjun Nair',      'EMP-3006', 'pgt',                  'teacher',              'science',           'proficient',        2017),
      ('00000000-0000-4000-8000-000000000307'::uuid, 'shalini.rao@demo-school.example',     'Shalini Rao',     'EMP-3007', 'pgt',                  'teacher',              'commerce',          'proficient',        2016),
      ('00000000-0000-4000-8000-000000000308'::uuid, 'manpreet.brar@demo-school.example',   'Manpreet Brar',   'EMP-3008', 'tgt',                  'teacher',              'mathematics',       'developing',        2021),
      ('00000000-0000-4000-8000-000000000309'::uuid, 'farida.qureshi@demo-school.example',  'Farida Qureshi',  'EMP-3009', 'tgt',                  'teacher',              'languages',         'proficient',        2018),
      ('00000000-0000-4000-8000-000000000310'::uuid, 'tarun.chopra@demo-school.example',    'Tarun Chopra',    'EMP-3010', 'tgt',                  'teacher',              'social_science',    'developing',        2022),
      ('00000000-0000-4000-8000-000000000311'::uuid, 'nisha.bedi@demo-school.example',      'Nisha Bedi',      'EMP-3011', 'prt',                  'teacher',              'primary',           'developing',        2020),
      ('00000000-0000-4000-8000-000000000312'::uuid, 'jaspreet.sandhu@demo-school.example', 'Jaspreet Sandhu', 'EMP-3012', 'prt',                  'teacher',              'primary',           'entrant',           2024),
      ('00000000-0000-4000-8000-000000000313'::uuid, 'lalita.menon@demo-school.example',    'Lalita Menon',    'EMP-3013', 'pre_primary_teacher',         'teacher',              'pre_primary',       'proficient',        2019),
      ('00000000-0000-4000-8000-000000000314'::uuid, 'imran.sheikh@demo-school.example',    'Imran Sheikh',    'EMP-3014', 'special_educator',     'teacher',              'primary',           'proficient',        2018),
      ('00000000-0000-4000-8000-000000000315'::uuid, 'anita.dsouza@demo-school.example',    'Anita D''Souza',  'EMP-3015', 'counsellor',           'teacher',              'primary',           'proficient',        2020),
      ('00000000-0000-4000-8000-000000000316'::uuid, 'rohit.thakur@demo-school.example',    'Rohit Thakur',    'EMP-3016', 'physical_education_teacher', 'teacher',              'physical_education','developing',        2021)
    ) as t(id, email, name, code, category_key, role_key, dept_key, career_key, joined)
  loop
    v_seq := v_seq + 1;
    perform pg_temp.demo_user(r.id, r.email, r.name);

    insert into core.teacher_profile
      (school_id, user_id, employee_code, primary_department_id, teacher_category_id,
       career_level_id, date_of_joining, has_leadership_responsibility, prior_experience_months,
       qualification_verification)
    select v_school, r.id, r.code,
           (select id from core.department where school_id = v_school and key = r.dept_key),
           (select id from core.teacher_category where school_id = v_school and key = r.category_key),
           (select id from core.career_level where school_id = v_school and key = r.career_key),
           make_date(r.joined, 4, 1),
           r.role_key in ('vice_principal', 'academic_coordinator', 'head_of_department'),
           (2026 - r.joined) * 12,
           'verified'
    on conflict (school_id, user_id) do nothing;

    insert into core.user_role_assignment (school_id, user_id, role_id, scope_type)
    select v_school, r.id, ro.id, 'school'
    from core.role ro where ro.school_id = v_school and ro.key = r.role_key
    on conflict do nothing;
  end loop;

  -- -------------------------------------------------------------------------
  -- The Compliance Administrator
  -- -------------------------------------------------------------------------
  -- One of the nine Stage 1 roles, and until now nobody held it — which meant
  -- `regulatory.manage` was unheld, so no one could activate a requirement and
  -- regulatory-change notifications had no recipients. Migration 0037 already
  -- looked for this person by name and fell back when she did not exist.
  --
  -- She is deliberately NOT a teacher: the role owns the regulatory register and
  -- holds no permission over any individual's assessment or pay.
  perform pg_temp.demo_user(
    '00000000-0000-4000-8000-000000000320'::uuid,
    'priya.chandra@demo-school.example',
    'Priya Chandra');

  insert into core.user_role_assignment (school_id, user_id, role_id, scope_type)
  select v_school, '00000000-0000-4000-8000-000000000320'::uuid, ro.id, 'school'
  from core.role ro where ro.school_id = v_school and ro.key = 'compliance_admin'
  on conflict do nothing;

  -- -------------------------------------------------------------------------
  -- Teaching assignments, so stage and subject filters have something to filter
  -- -------------------------------------------------------------------------
  insert into core.teacher_teaching_assignment
    (school_id, teacher_profile_id, academic_year_id, subject_id, class_level_id, school_stage_id)
  select v_school, tp.id, v_year, s.id, cl.id, ss.id
  from core.teacher_profile tp
  join core.app_user u on u.id = tp.user_id
  join core.department d on d.id = tp.primary_department_id
  join core.subject s on s.school_id = v_school and s.key = case d.key
        when 'mathematics' then 'mathematics'
        when 'science' then 'science'
        when 'languages' then 'english'
        when 'social_science' then 'social_science'
        when 'pre_primary' then 'early_learning'
        when 'primary' then 'english'
        when 'commerce' then 'social_science'
        else 'english' end
  join core.school_stage ss on ss.school_id = v_school and ss.key = case d.key
        when 'pre_primary' then 'foundational'
        when 'primary' then 'preparatory'
        when 'mathematics' then 'middle'
        when 'languages' then 'middle'
        when 'social_science' then 'middle'
        else 'secondary' end
  -- One class level per stage: the lowest by sort order, picked deterministically.
  join lateral (
    select id from core.class_level
     where school_id = v_school and school_stage_id = ss.id
     order by sort_order, id limit 1
  ) cl on true
  where u.email like '%@demo-school.example' and tp.employee_code like 'EMP-30%'
  on conflict do nothing;

  -- -------------------------------------------------------------------------
  -- Varied competency profiles, so the heatmap has range rather than one colour
  -- -------------------------------------------------------------------------
  -- Deterministic, not random: the pattern below spreads teachers across the
  -- scale by their sequence and the competency's position, so the same seed
  -- always produces the same heatmap and a test can assert against it.
  v_seq := 0;
  for r in
    select tp.id as profile_id, tp.employee_code, u.full_name
    from core.teacher_profile tp
    join core.app_user u on u.id = tp.user_id
    where tp.school_id = v_school and tp.employee_code like 'EMP-30%'
    order by tp.employee_code
  loop
    v_seq := v_seq + 1;

    insert into assessment.teacher_assessment (school_id, cycle_id, teacher_profile_id, status)
    values (v_school, v_cycle, r.profile_id, 'verified')
    on conflict do nothing
    returning id into v_assessment;

    if v_assessment is null then
      select id into v_assessment from assessment.teacher_assessment
       where cycle_id = v_cycle and teacher_profile_id = r.profile_id;
    end if;

    for v_comp in
      select c.id, c.key, row_number() over (order by c.key) as n
      from competency.competency c
      where c.school_id = v_school and c.status = 'active'
    loop
      -- Expected level: 4 for leadership-heavy competencies, 3 otherwise.
      v_ordinal := case when v_comp.key in ('leadership', 'mentoring') then 4 else 3 end;
      select id into v_expected from competency.proficiency_level
       where scale_id = v_scale and ordinal = v_ordinal;

      -- Verified level: spread deterministically. Competency-Based Assessment
      -- is deliberately weak across the Middle Stage, so the training-needs
      -- analysis has a real cluster to find.
      v_ordinal := case
        when v_comp.key = 'competency_based_assessment' and v_seq % 3 <> 0 then 2
        when v_comp.key = 'digital_pedagogy' and v_seq % 4 = 0 then 2
        else 1 + ((v_seq + v_comp.n) % 4)
      end;
      select id into v_level from competency.proficiency_level
       where scale_id = v_scale and ordinal = v_ordinal;

      insert into assessment.verified_competency
        (school_id, teacher_profile_id, competency_id, academic_year_id, source_cycle_id,
         verified_level_id, expected_level_id, self_level_id, supervisor_level_id,
         evidence_strength, evidence_count, rationale, determined_from, verified_by)
      values
        (v_school, r.profile_id, v_comp.id, v_year, v_cycle, v_level, v_expected,
         v_level, v_level, 'adequate', 1,
         'Synthetic demo record: verified from self and supervisor assessment during the '
         || 'demo cohort provisioning. Not a real assessment of a real teacher.',
         jsonb_build_object('demo', true, 'sequence', v_seq),
         (select user_id from core.teacher_profile where id = (
            select id from core.teacher_profile where school_id = v_school and employee_code = 'EMP-2010')))
      on conflict do nothing;
    end loop;

    -- Gaps, so the analytics have priorities to cluster.
    select growth.compute_gaps(r.profile_id, v_year) into v_gaps;
  end loop;


  -- -------------------------------------------------------------------------
  -- Fill in the original personas, who had one competency each
  -- -------------------------------------------------------------------------
  -- The Stage 1-5 seed gave Neha and her colleagues only the competencies each
  -- scripted scenario needed — one, in Neha's case. The Stage 6 cohort block
  -- then gave sixteen new teachers the full set of twenty-four. The result read
  -- as a bug on the flagship persona's own dashboard: "0 of your 1 assessed
  -- competencies are at or above what is expected of your post."
  --
  -- Only the MISSING pairs are inserted. Anything already seeded is left
  -- exactly as it is, because the Stage 3 lifecycle spec depends on Neha's
  -- Competency-Based Assessment sitting at 2 against an expected 4.
  --
  -- The added rows are deliberately at or one below expectation, never worse.
  -- That keeps each persona's scripted gap as their top development priority —
  -- the lifecycle spec looks for it in the top five — and it is the more
  -- realistic picture anyway: a teacher with one clear priority, not twenty.
  -- Somebody other than the Principal who may verify, for the Principal's own
  -- records. Chosen by permission rather than by name, and looked up HERE
  -- rather than at the top of the block: the school-scoped roles this finds are
  -- assigned by the cohort provisioning above, so earlier it returns nothing.
  select ura.user_id into v_second_verifier
    from core.user_role_assignment ura
    join core.role_permission rp
      on rp.role_id = ura.role_id and rp.permission_key = 'teacher_record.read.scope'
   where ura.school_id = v_school
     and ura.user_id <> v_principal_user
     and ura.scope_type = 'school'
   limit 1;

  if v_second_verifier is null then
    raise exception 'No second verifier: the Principal would have to verify '
      'their own competency, which the database refuses.';
  end if;

  for r in
    select tp.id as profile_id, tp.employee_code, tp.user_id
    from core.teacher_profile tp
    where tp.school_id = v_school and tp.employee_code not like 'EMP-30%'
    order by tp.employee_code
  loop
    v_seq := v_seq + 1;

    -- Nobody verifies their own competency — the database refuses it, and it
    -- caught this: the Principal is himself one of the personas being filled
    -- in here. His rows are verified by the Vice Principal instead.
    v_verifier := case
      when r.user_id = v_principal_user then v_second_verifier
      else v_principal_user
    end;

    select id into v_assessment from assessment.teacher_assessment
     where cycle_id = v_cycle and teacher_profile_id = r.profile_id;

    if v_assessment is null then
      insert into assessment.teacher_assessment
        (school_id, cycle_id, teacher_profile_id, status)
      values (v_school, v_cycle, r.profile_id, 'verified')
      returning id into v_assessment;
    end if;

    for v_comp in
      select c.id, c.key, row_number() over (order by c.key) as n
      from competency.competency c
      where c.school_id = v_school and c.status = 'active'
        -- Left unverified on purpose. The assessment-capture spec needs a
        -- competency with nothing recorded against it, so it can drive
        -- self-assessment, supervisor rating and verification from scratch —
        -- filling this in removed the "Verify level" form it reaches for. Not
        -- everything being assessed is the truthful picture anyway.
        and c.key <> 'digital_pedagogy'
        and not exists (
          select 1 from assessment.verified_competency vc
           where vc.teacher_profile_id = r.profile_id
             and vc.competency_id = c.id
             and vc.academic_year_id = v_year
        )
    loop
      v_ordinal := case when v_comp.key in ('leadership', 'mentoring') then 4 else 3 end;
      select id into v_expected from competency.proficiency_level
       where scale_id = v_scale and ordinal = v_ordinal;

      -- Every added competency sits AT expectation, so each persona keeps
      -- exactly the one scripted gap their scenario is built around. A first
      -- version put every third competency one level below; that was more
      -- lifelike and it shifted the training-needs analysis, which found
      -- Digital Pedagogy instead of the Competency-Based Assessment cluster
      -- the cohort is deliberately seeded to produce. The range in the heatmap
      -- comes from the sixteen cohort teachers; these seven carry the scripted
      -- scenarios and should not compete with them.
      select id into v_level from competency.proficiency_level
       where scale_id = v_scale and ordinal = v_ordinal;

      insert into assessment.verified_competency
        (school_id, teacher_profile_id, competency_id, academic_year_id, source_cycle_id,
         verified_level_id, expected_level_id, self_level_id, supervisor_level_id,
         evidence_strength, evidence_count, rationale, determined_from, verified_by)
      values
        (v_school, r.profile_id, v_comp.id, v_year, v_cycle, v_level, v_expected,
         v_level, v_level, 'adequate', 1,
         'Synthetic demo record: verified from self and supervisor assessment. '
         || 'Not a real assessment of a real teacher.',
         jsonb_build_object('demo', true, 'sequence', v_seq),
         v_verifier);
    end loop;

    select growth.compute_gaps(r.profile_id, v_year) into v_gaps;
  end loop;

  -- -------------------------------------------------------------------------
  -- Learning plans across the cohort, at different points in the lifecycle
  -- -------------------------------------------------------------------------
  -- The brief asks the demo to include learning plans. Without them the
  -- Learning Map is empty for everyone but Neha, whose plan only exists after
  -- the e2e suite runs, and the development-investment analytics report
  -- nothing.
  --
  -- Two constraints shaped this:
  --
  --  1. Items are inserted as `proposed` and then stepped forward one status at
  --     a time, because the transition trigger refuses anything else. That is
  --     the point of the trigger, and it means these records go through the
  --     same gate a real one does — including the one that has no edge from
  --     `completed` to `reassessed`.
  --
  --  2. Nothing is left AWAITING APPROVAL. The Stage 3 lifecycle spec finds
  --     Neha's pending item with `.first()`, and a seeded item sitting in the
  --     same queue could be matched instead. Every item here is approved or
  --     beyond, which is also what a plan looks like mid-year.
  --
  -- Differentiated Instruction is deliberately untouched: that is the
  -- competency the analytics cohort-plan spec drives.
  v_seq := 0;
  for r in
    select tp.id as profile_id, u.full_name, tp.employee_code
    from core.teacher_profile tp
    join core.app_user u on u.id = tp.user_id
    where tp.school_id = v_school and tp.employee_code like 'EMP-30%'
    order by tp.employee_code
    limit 9
  loop
    v_seq := v_seq + 1;

    insert into growth.learning_plan
      (school_id, teacher_profile_id, academic_year_id, title, summary, status,
       submitted_at, approved_by, approved_at, approval_note)
    values
      (v_school, r.profile_id, v_year,
       'Individual Professional Development Plan ' || v_year_label,
       'Synthetic demo plan. Priorities taken from this teacher''s identified gaps.',
       'approved', now() - interval '90 days', v_principal_user,
       now() - interval '86 days',
       'Agreed at the start-of-year development conversation.')
    on conflict do nothing
    returning id into v_plan;

    continue when v_plan is null;

    -- One item per teacher, against their own highest-priority gap, using the
    -- activity the recommender would rank first for it.
    select g.id, g.competency_id
      into v_gap_id, v_comp_id
      from growth.gap g
      join competency.competency c on c.id = g.competency_id
     where g.teacher_profile_id = r.profile_id
       and g.academic_year_id = v_year
       and g.gap_size > 0
       and c.key <> 'differentiated_instruction'
     order by g.priority_score desc, c.key
     limit 1;

    continue when v_gap_id is null;

    select a.id into v_activity
      from cpd.activity a
      join cpd.activity_competency ac on ac.activity_id = a.id
     where ac.competency_id = v_comp_id and a.is_active
     order by a.key
     limit 1;

    insert into growth.learning_plan_item
      (school_id, learning_plan_id, gap_id, competency_id, cpd_activity_id,
       status, selection_rationale, owner_user_id, proposed_at)
    values
      (v_school, v_plan, v_gap_id, v_comp_id, v_activity, 'proposed',
       'Selected from the ranked recommendations for this gap.',
       (select user_id from core.teacher_profile where id = r.profile_id),
       now() - interval '88 days')
    returning id into v_item;

    -- Approved for everyone; then a third stop at completed, a third at
    -- applied, and a third go all the way to verified impact — so the
    -- investment analytics show planned, completed and verified as three
    -- genuinely different numbers rather than one repeated.
    update growth.learning_plan_item
       set status = 'approved', approved_at = now() - interval '84 days',
           approved_by = v_principal_user,
           approval_note = 'Approved: addresses the priority gap for this post.'
     where id = v_item;

    update growth.learning_plan_item
       set status = 'in_progress', started_at = now() - interval '70 days'
     where id = v_item;

    if v_seq % 3 <> 1 then
      update growth.learning_plan_item
         set status = 'completed', completed_at = now() - interval '52 days',
             completion_note = 'Attended in full.'
       where id = v_item;

      update growth.learning_plan_item
         set status = 'reflected', reflected_at = now() - interval '48 days',
             reflection = 'The session separated what I assess from what I intend '
               || 'students to be able to do. I am rewriting one unit''s '
               || 'end-of-unit task so the marks sit on application rather than recall.'
       where id = v_item;
    end if;

    if v_seq % 3 = 0 then
      update growth.learning_plan_item
         set status = 'applied', applied_at = now() - interval '30 days',
             application_summary = 'Rewrote the end-of-unit assessment with two '
               || 'unfamiliar-context tasks and a rubric describing the competency, '
               || 'and used the results to reorder the following lessons.'
       where id = v_item;

      update growth.learning_plan_item
         set status = 'impact_verified', impact_verified_at = now() - interval '20 days',
             impact_verified_by = v_principal_user,
             impact_verification_note = 'Observed the revised task in use. The '
               || 'application items were genuinely unfamiliar and the rubric was '
               || 'applied consistently across the class.'
       where id = v_item;
    end if;
  end loop;

  perform privacy.provision_retention(v_school);

  raise notice 'Stage 6: cohort of % teachers provisioned, % total staff',
    v_seq, (select count(*) from core.teacher_profile where school_id = v_school);
end $cohort$;
