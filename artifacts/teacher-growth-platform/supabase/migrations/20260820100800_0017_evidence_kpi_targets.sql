-- ===========================================================================
-- 0017 — Evidence types, KPI catalogue, and competency targets
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Evidence types
-- ---------------------------------------------------------------------------

create or replace function evidence.provision_default_types(p_school_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  insert into evidence.evidence_type (
    school_id, key, name, description, submission_guidance,
    contains_student_data, sort_order
  )
  select p_school_id, v.key, v.name, v.description, v.guidance, v.student_data, v.sort
  from (values
    ('teacher_diary', 'Teacher Diary', 'Ongoing record of teaching, observations and decisions.',
     'Extract the entries relevant to the competency; do not upload the whole diary.', false, 1),
    ('lesson_plan', 'Lesson Plan', 'A planned lesson or sequence of lessons.',
     'Include the objectives and the checks for understanding.', false, 2),
    ('classroom_observation', 'Classroom Observation', 'A structured observation record made by a reviewer.',
     'Normally uploaded by the observer, not the teacher.', false, 3),
    ('student_work_sample', 'Student Work Sample', 'Examples of student output demonstrating the effect of teaching.',
     'Remove or redact student names and identifying details before uploading.', true, 4),
    ('assessment_design', 'Assessment Design', 'A test, task or assessment instrument the teacher designed.',
     'Include the mark scheme or success criteria.', true, 5),
    ('rubric', 'Rubric', 'A criteria-based marking or feedback rubric.', null, false, 6),
    ('project', 'Project', 'A student or teacher project, including cross-curricular work.', null, true, 7),
    ('portfolio', 'Portfolio', 'A curated collection assembled around a theme or competency.', null, true, 8),
    ('experiential_learning_evidence', 'Experiential Learning Evidence',
     'Evidence of activity-, arts-, sports- or toy-based learning and its debrief.', null, true, 9),
    ('inclusive_practice_evidence', 'Inclusive Practice Evidence',
     'Evidence of accommodations, access arrangements or extension work.',
     'Take particular care to anonymise: this evidence often concerns identified students.', true, 10),
    ('cpd_certificate', 'CPD Certificate', 'Certificate or completion record for a professional development activity.',
     'The certificate alone evidences attendance, not application in practice.', false, 11),
    ('professional_reflection', 'Professional Reflection', 'The teacher''s written reflection on their own practice.', null, false, 12),
    ('action_research', 'Action Research', 'A structured enquiry into own practice with findings.', null, true, 13),
    ('e_content', 'E-Content', 'Digital learning material the teacher developed.', null, false, 14),
    ('mentoring_record', 'Mentoring Record', 'Record of mentoring given or received, with goals and outcomes.', null, false, 15),
    ('professional_presentation', 'Professional Presentation',
     'Presentation delivered to colleagues, at a seminar, workshop or conference.', null, false, 16),
    ('school_improvement_project', 'School Improvement Project',
     'Contribution to a school-level improvement initiative.', null, false, 17),
    ('supervisor_feedback', 'Supervisor Feedback', 'Written feedback from a Head of Department, Coordinator or Principal.',
     'Uploaded by the reviewer, or by the teacher with the reviewer named.', false, 18)
  ) as v(key, name, description, guidance, student_data, sort)
  on conflict (school_id, key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Suggested evidence per competency. Guidance, not gatekeeping: `is_required`
-- is false throughout until the school decides otherwise.
create or replace function competency.provision_evidence_descriptors(p_school_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer; v_fw uuid;
begin
  select id into v_fw from competency.framework
   where school_id = p_school_id and key = 'school_professional_practice' and version = 1;

  insert into competency.evidence_descriptor (
    school_id, competency_id, evidence_type_key, guidance, is_required
  )
  select p_school_id, c.id, v.evidence_type_key, v.guidance, false
  from (values
    ('core_values_ethics', 'supervisor_feedback', 'Feedback speaking to fairness and professional conduct.'),
    ('core_values_ethics', 'professional_reflection', null),
    ('child_safeguarding', 'cpd_certificate', 'Safeguarding training completion.'),
    ('child_safeguarding', 'professional_reflection', 'Reflection on a handled concern, fully anonymised.'),
    ('communication', 'supervisor_feedback', null),
    ('communication', 'student_work_sample', 'Work showing written feedback given to the student.'),
    ('parent_engagement', 'teacher_diary', 'Record of parent contact and its outcome.'),
    ('collaboration', 'lesson_plan', 'Jointly planned material, with contributors named.'),
    ('collaboration', 'school_improvement_project', null),
    ('subject_knowledge', 'assessment_design', null),
    ('subject_knowledge', 'lesson_plan', 'Plans showing anticipated misconceptions.'),
    ('pedagogical_knowledge', 'classroom_observation', null),
    ('pedagogical_knowledge', 'lesson_plan', null),
    ('pedagogical_content_knowledge', 'lesson_plan', 'Plans showing chosen representations and sequencing.'),
    ('pedagogical_content_knowledge', 'e_content', null),
    ('lesson_learning_design', 'lesson_plan', null),
    ('lesson_learning_design', 'classroom_observation', null),
    ('competency_based_education', 'assessment_design', 'Tasks requiring application in unfamiliar contexts.'),
    ('competency_based_education', 'student_work_sample', null),
    ('experiential_learning', 'experiential_learning_evidence', null),
    ('experiential_learning', 'project', null),
    ('learning_environment', 'classroom_observation', null),
    ('assessment_feedback', 'assessment_design', null),
    ('assessment_feedback', 'rubric', null),
    ('assessment_feedback', 'student_work_sample', 'Work showing feedback acted upon.'),
    ('inclusive_education', 'inclusive_practice_evidence', null),
    ('inclusive_education', 'lesson_plan', 'Plans showing access and extension routes.'),
    ('differentiated_instruction', 'lesson_plan', null),
    ('differentiated_instruction', 'classroom_observation', null),
    ('student_wellbeing', 'teacher_diary', 'Anonymised record of a noticed change and the referral made.'),
    ('digital_pedagogy', 'e_content', null),
    ('digital_pedagogy', 'lesson_plan', null),
    ('computational_thinking_ai', 'lesson_plan', null),
    ('computational_thinking_ai', 'project', null),
    ('reflective_practice', 'professional_reflection', null),
    ('reflective_practice', 'action_research', null),
    ('professional_development', 'cpd_certificate', null),
    ('professional_development', 'professional_reflection', 'How the learning changed practice.'),
    ('innovation', 'action_research', null),
    ('innovation', 'professional_presentation', null),
    ('mentoring', 'mentoring_record', null),
    ('leadership', 'school_improvement_project', null),
    ('leadership', 'professional_presentation', null)
  ) as v(competency_key, evidence_type_key, guidance)
  join competency.competency c
    on c.school_id = p_school_id and c.key = v.competency_key
   and c.domain_id in (
     select d.id from competency.domain d
     join competency.standard s on s.id = d.standard_id where s.framework_id = v_fw
   )
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- KPI catalogue
-- ---------------------------------------------------------------------------

create or replace function kpi.provision_default_catalogue(p_school_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  insert into kpi.category (school_id, key, name, description, sort_order)
  select p_school_id, v.key, v.name, v.description, v.sort
  from (values
    ('teaching_learning',         'Teaching & Learning',         'Quality and effect of classroom teaching.', 1),
    ('curriculum_planning',       'Curriculum Planning',         'Planning, coverage and curriculum contribution.', 2),
    ('assessment',                'Assessment',                  'Assessment design, moderation and feedback.', 3),
    ('student_progress',          'Student Progress',            'Progress of the students taught.', 4),
    ('professional_development',  'Professional Development',    'Own professional learning and its application.', 5),
    ('inclusion',                 'Inclusion',                   'Access, accommodation and extension for all learners.', 6),
    ('innovation',                'Innovation',                  'Evaluated improvement to practice.', 7),
    ('collaboration',             'Collaboration',               'Working with colleagues across the school.', 8),
    ('parent_engagement',         'Parent Engagement',           'Partnership with families.', 9),
    ('professional_responsibilities','Professional Responsibilities','Duties, records, punctuality and compliance.', 10),
    ('school_contribution',       'School Contribution',         'Contribution beyond the classroom.', 11),
    ('leadership',                'Leadership',                  'Leading people, teams or priorities.', 12)
  ) as v(key, name, description, sort)
  on conflict (school_id, key) do nothing;

  insert into kpi.template (
    school_id, category_id, key, name, description, metric, unit, direction,
    default_target, default_weight, data_source, frequency, evidence_requirement,
    is_student_outcome_measure, source_framework, source_alignment
  )
  select p_school_id, cat.id, v.key, v.name, v.description, v.metric, v.unit,
         v.direction::kpi.measurement_direction, v.target, v.weight, v.data_source,
         v.frequency::kpi.frequency, v.evidence, v.student_outcome, 'school', 'school_defined'
  from (values
    ('teaching_learning', 'lesson_observation_quality', 'Lesson Observation Outcomes',
     'Quality of teaching as judged against the school observation rubric across the year.',
     'Mean observation rating across scheduled observations', 'rubric points (1-5)', 'increase',
     '3.5 or above', 20, 'Classroom observation records held in the platform', 'termly',
     'At least two completed observation records.', false),

    ('curriculum_planning', 'curriculum_coverage', 'Curriculum Planning and Coverage',
     'Timely, complete planning submitted for the assigned classes.',
     'Percentage of planned units submitted on time', '%', 'increase',
     '95%', 10, 'Planning records submitted to the Head of Department', 'termly',
     'Submitted unit plans.', false),

    ('assessment', 'assessment_quality', 'Assessment Design and Moderation',
     'Quality of assessments designed, and participation in moderation.',
     'Assessments moderated and accepted without major revision', 'count', 'increase',
     'All assessments accepted at first moderation', 10, 'Departmental moderation records', 'termly',
     'Assessment instruments and moderation notes.', false),

    ('student_progress', 'class_progress_vs_baseline', 'Class Progress Against Baseline',
     'Progress made by the class relative to its own starting point, not against other classes.',
     'Proportion of students meeting or exceeding their individual baseline expectation', '%', 'increase',
     '75%', 15, 'School internal assessment records, baseline and end-of-year', 'annual',
     'Baseline and outcome data with the teacher''s commentary.', true),

    ('professional_development', 'cpd_participation', 'Professional Development Participation',
     'Participation in professional learning and its application in practice.',
     'CPD hours completed and evidenced as applied', 'hours', 'increase',
     'Per the school CPD policy for the year', 10, 'CPD records held in the platform', 'annual',
     'Certificates plus a reflection showing application.', false),

    ('inclusion', 'inclusion_practice', 'Inclusive Practice',
     'Implementation of agreed accommodations and extension for identified students.',
     'Agreed accommodations implemented and reviewed', '%', 'increase',
     '100%', 10, 'Individual support records and observation', 'termly',
     'Inclusive practice evidence, anonymised.', false),

    ('innovation', 'evaluated_innovation', 'Evaluated Innovation',
     'A considered change to practice, trialled and evaluated against student learning.',
     'Completed innovation cycles with written evaluation', 'count', 'increase',
     '1 per year', 5, 'Action research or innovation record', 'annual',
     'Trial rationale and written evaluation, including negative results.', false),

    ('collaboration', 'team_contribution', 'Team Contribution',
     'Contribution to shared planning, materials and departmental work.',
     'Contributions to shared resources and team activity', 'qualitative', 'qualitative',
     'Consistent and substantive', 5, 'Head of Department record', 'termly',
     'Shared materials with contributors named.', false),

    ('parent_engagement', 'parent_partnership', 'Parent Partnership',
     'Timely, specific communication with families and response to concerns.',
     'Parent contacts logged and concerns closed within the agreed timeframe', '%', 'increase',
     '90%', 5, 'Parent communication log', 'termly',
     'Communication log entries.', false),

    ('professional_responsibilities', 'records_and_duties', 'Records and Duties',
     'Accuracy and timeliness of required records, and fulfilment of assigned duties.',
     'Required records submitted on time', '%', 'increase',
     '100%', 5, 'School administrative records', 'termly',
     null, false),

    ('school_contribution', 'beyond_classroom', 'Contribution Beyond the Classroom',
     'Contribution to school events, clubs, committees or improvement work.',
     'Sustained contribution to at least one school-level activity', 'qualitative', 'qualitative',
     'One sustained contribution', 5, 'School activity records', 'annual',
     'School improvement project or activity record.', false),

    ('leadership', 'team_leadership', 'Team Leadership',
     'Leading a team, stage or priority, including the development of colleagues.',
     'Agreed leadership objectives met, with evidence of effect on the team', 'qualitative', 'qualitative',
     'All agreed objectives met', 20, 'Line management review and team outcomes', 'termly',
     'Leadership objectives and review record.', false)

  ) as v(category_key, key, name, description, metric, unit, direction, target,
         weight, data_source, frequency, evidence, student_outcome)
  join kpi.category cat on cat.school_id = p_school_id and cat.key = v.category_key
  on conflict (school_id, key) do nothing;

  get diagnostics v_count = row_count;

  -- Applicability: the leadership template is offered only to leadership posts.
  insert into kpi.template_applicability (school_id, template_id, role_key)
  select p_school_id, t.id, v.role_key
  from (values
    ('team_leadership', 'head_of_department'),
    ('team_leadership', 'academic_coordinator'),
    ('team_leadership', 'vice_principal'),
    ('team_leadership', 'principal')
  ) as v(template_key, role_key)
  join kpi.template t on t.school_id = p_school_id and t.key = v.template_key
  on conflict do nothing;

  -- The school's KPI policy for the current year.
  insert into kpi.school_policy (
    school_id, academic_year_id, max_student_outcome_weight_pct,
    require_weights_total_100, min_kpi_count, notes
  )
  select p_school_id, ay.id, 30, true, 4,
    'School policy. The 30% cap on student-outcome weight exists so that student '
    'examination results can never be the sole or dominant determinant of teacher '
    'effectiveness. This is the school''s own rule, not a CBSE or State requirement.'
  from core.academic_year ay
  where ay.school_id = p_school_id and ay.is_current
  on conflict (school_id, academic_year_id) do nothing;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Competency targets
-- ---------------------------------------------------------------------------
-- The baseline applies to everyone. Overrides carry more dimensions and
-- therefore win. This is where "a newly appointed PRT and an HOD do not have
-- identical leadership expectations" actually becomes true.

create or replace function competency.provision_default_targets(
  p_school_id uuid,
  p_academic_year_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer; v_fw uuid; v_scale uuid;
begin
  select id into v_fw from competency.framework
   where school_id = p_school_id and key = 'school_professional_practice' and version = 1;
  select id into v_scale from competency.proficiency_scale
   where framework_id = v_fw and key = 'school_five_point';

  -- 1. Baseline: every competency, everyone. Mostly Proficient, with the
  --    leadership-flavoured competencies deliberately lower — they are not a
  --    universal expectation of every classroom teacher.
  insert into competency.competency_target (
    school_id, academic_year_id, competency_id, target_level_id, rationale
  )
  select p_school_id, p_academic_year_id, c.id, pl.id,
         'School-wide baseline expectation for the year.'
  from competency.competency c
  join competency.domain d on d.id = c.domain_id
  join competency.standard s on s.id = d.standard_id and s.framework_id = v_fw
  join competency.proficiency_level pl
    on pl.scale_id = v_scale
   and pl.key = case c.key
     when 'leadership' then 'foundation'
     when 'mentoring' then 'foundation'
     when 'innovation' then 'developing'
     when 'computational_thinking_ai' then 'developing'
     else 'proficient'
   end
  where c.school_id = p_school_id and c.status = 'active'
  on conflict do nothing;

  -- 2. By teacher category.
  insert into competency.competency_target (
    school_id, academic_year_id, competency_id, target_level_id,
    teacher_category_id, rationale
  )
  select p_school_id, p_academic_year_id, c.id, pl.id, tc.id, v.rationale
  from (values
    ('subject_knowledge', 'pgt', 'advanced',
     'PGTs teach senior secondary classes where depth beyond the syllabus is routinely required.'),
    ('assessment_feedback', 'pgt', 'advanced',
     'Senior secondary assessment design carries board-examination consequences for students.'),
    ('inclusive_education', 'special_educator', 'expert_lead',
     'Inclusion is the core professional expertise of this post, not an additional expectation.'),
    ('differentiated_instruction', 'special_educator', 'expert_lead',
     'Core expertise of the post.'),
    ('student_wellbeing', 'counsellor', 'expert_lead',
     'Core expertise of the post.'),
    ('mentoring', 'pgt', 'developing',
     'Senior teachers are expected to begin supporting colleagues.'),
    ('leadership', 'head_of_department', 'advanced',
     'Leading a department is the substance of the post.'),
    ('mentoring', 'head_of_department', 'advanced',
     'Developing the department''s teachers is a core duty of the post.'),
    ('leadership', 'principal', 'expert_lead',
     'School-wide leadership is the post.'),
    ('leadership', 'vice_principal', 'advanced',
     'Whole-school leadership responsibility, under the Principal.'),
    ('experiential_learning', 'pre_primary_teacher', 'advanced',
     'Foundational-stage pedagogy is substantially play- and activity-based.'),
    ('child_safeguarding', 'pre_primary_teacher', 'advanced',
     'The youngest children are least able to report concerns themselves.')
  ) as v(competency_key, category_key, level_key, rationale)
  join competency.competency c on c.school_id = p_school_id and c.key = v.competency_key
  join core.teacher_category tc on tc.school_id = p_school_id and tc.key = v.category_key
  join competency.proficiency_level pl on pl.scale_id = v_scale and pl.key = v.level_key
  on conflict do nothing;

  -- 3. By stage.
  insert into competency.competency_target (
    school_id, academic_year_id, competency_id, target_level_id,
    school_stage_id, rationale
  )
  select p_school_id, p_academic_year_id, c.id, pl.id, ss.id, v.rationale
  from (values
    ('computational_thinking_ai', 'foundational', 'foundation',
     'Computational thinking at the Foundational stage is pattern and sequence play, not programming.'),
    ('computational_thinking_ai', 'secondary', 'proficient',
     'Secondary students meet AI and data concepts directly, including as CBSE elective subjects.'),
    ('differentiated_instruction', 'foundational', 'advanced',
     'The attainment spread at school entry is at its widest, and early gaps compound.'),
    ('digital_pedagogy', 'foundational', 'developing',
     'Screen use is deliberately limited at this stage; the expectation is correspondingly lower.')
  ) as v(competency_key, stage_key, level_key, rationale)
  join competency.competency c on c.school_id = p_school_id and c.key = v.competency_key
  join core.school_stage ss on ss.school_id = p_school_id and ss.key = v.stage_key
  join competency.proficiency_level pl on pl.scale_id = v_scale and pl.key = v.level_key
  on conflict do nothing;

  -- 4. By RBAC role, and by leadership responsibility.
  insert into competency.competency_target (
    school_id, academic_year_id, competency_id, target_level_id,
    role_key, rationale
  )
  select p_school_id, p_academic_year_id, c.id, pl.id, v.role_key, v.rationale
  from (values
    ('leadership', 'head_of_department', 'advanced', 'Holds departmental leadership authority in the platform.'),
    ('mentoring', 'head_of_department', 'advanced', 'Expected to develop the teachers they supervise.'),
    ('collaboration', 'head_of_department', 'advanced', 'Responsible for how the department works together.'),
    ('leadership', 'academic_coordinator', 'advanced', 'Holds stage-level leadership authority.'),
    ('leadership', 'principal', 'expert_lead', 'Whole-school leadership.')
  ) as v(competency_key, role_key, level_key, rationale)
  join competency.competency c on c.school_id = p_school_id and c.key = v.competency_key
  join competency.proficiency_level pl on pl.scale_id = v_scale and pl.key = v.level_key
  on conflict do nothing;

  insert into competency.competency_target (
    school_id, academic_year_id, competency_id, target_level_id,
    requires_leadership, rationale
  )
  select p_school_id, p_academic_year_id, c.id, pl.id, true,
    'Applies to any post carrying formal leadership responsibility, whatever its title.'
  from competency.competency c
  join competency.proficiency_level pl on pl.scale_id = v_scale and pl.key = 'proficient'
  where c.school_id = p_school_id and c.key in ('leadership', 'mentoring')
  on conflict do nothing;

  -- 5. By career level: entrants are held to a lower bar on the competencies
  --    that genuinely take years to build.
  insert into competency.competency_target (
    school_id, academic_year_id, competency_id, target_level_id,
    career_level_id, rationale
  )
  select p_school_id, p_academic_year_id, c.id, pl.id, cl.id,
    'Entrants are building these; the expectation rises with career level.'
  from competency.competency c
  join core.career_level cl on cl.school_id = p_school_id and cl.key = 'entrant'
  join competency.proficiency_level pl on pl.scale_id = v_scale and pl.key = 'developing'
  where c.school_id = p_school_id
    and c.key in ('pedagogical_content_knowledge', 'assessment_feedback', 'differentiated_instruction')
  on conflict do nothing;

  select count(*) into v_count
  from competency.competency_target
  where school_id = p_school_id and academic_year_id = p_academic_year_id;

  return v_count;
end;
$$;

comment on function competency.provision_default_targets(uuid, uuid) is
  'Seeds a baseline plus deliberate overrides by category, stage, role, '
  'leadership responsibility and career level. Resolution picks the most '
  'specific match — see competency.resolve_targets().';
