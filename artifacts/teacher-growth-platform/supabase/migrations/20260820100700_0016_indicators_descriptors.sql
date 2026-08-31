-- ===========================================================================
-- 0016 — Behavioural indicators and proficiency descriptors
-- ===========================================================================
-- Indicators must be observable. Where a competency is NPST-aligned, NPST's own
-- indicator text is used VERBATIM and cited by its NPST number — that is the
-- strongest possible provenance. Where the school extends beyond NPST, the
-- indicator is school-authored and says so.
--
-- The check constraint on indicator.statement rejects verdicts ("Is a good
-- teacher"); every statement below describes something a person could witness.
-- ===========================================================================

create or replace function competency.provision_school_indicators(p_school_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fw    uuid;
  v_count integer;
begin
  select id into v_fw from competency.framework
   where school_id = p_school_id and key = 'school_professional_practice' and version = 1;
  if v_fw is null then
    raise exception 'School framework not provisioned for %.', p_school_id;
  end if;

  insert into competency.indicator (
    school_id, competency_id, key, statement, sort_order,
    source_framework, source_alignment, external_reference
  )
  select p_school_id, c.id, v.key, v.statement, v.sort,
         v.src::competency.source_framework, v.align::competency.source_alignment, v.ref
  from (values

    -- Core values and ethics — NPST Domain 1, verbatim -------------------
    ('core_values_ethics', 'i1', 'Treats all students and colleagues with respect and fairness.', 1, 'npst', 'aligned', 'NPST 2023, indicator 1.1.1'),
    ('core_values_ethics', 'i2', 'Promotes unity and harmony among all by creating a safe environment where people feel free to share their ideas and feelings.', 2, 'npst', 'aligned', 'NPST 2023, indicator 1.1.2'),
    ('core_values_ethics', 'i3', 'Protects student information and does not share it unless required for specific purposes by authorities.', 3, 'npst', 'aligned', 'NPST 2023, indicator 1.2.1'),
    ('core_values_ethics', 'i4', 'Diligently follows stated rules (school as well as state regulations) and is aware of the consequences of ignoring or breaking them.', 4, 'npst', 'aligned', 'NPST 2023, indicator 1.4.1'),

    -- Safeguarding — school-authored -------------------------------------
    ('child_safeguarding', 'i1', 'Recognises signs that a child may be at risk and records what was observed, factually and promptly.', 1, 'school', 'school_defined', null),
    ('child_safeguarding', 'i2', 'Reports a safeguarding concern through the school''s named reporting route within the stated timeframe.', 2, 'school', 'school_defined', null),
    ('child_safeguarding', 'i3', 'Explains to students, in age-appropriate terms, how to raise a concern and who they can approach.', 3, 'school', 'school_defined', null),

    -- Communication — NPST Domain 8.3, verbatim --------------------------
    ('communication', 'i1', 'Gives specific qualitative feedback to students while checking their tasks or responding to their answers.', 1, 'npst', 'aligned', 'NPST 2023, indicator 8.3.1'),
    ('communication', 'i2', 'Shares specific and detailed feedback to parents/caregivers on student performance.', 2, 'npst', 'aligned', 'NPST 2023, indicator 8.3.4'),
    ('communication', 'i3', 'Adjusts explanations when a student or parent has not understood, rather than repeating the same wording.', 3, 'school', 'school_defined', null),

    -- Parent engagement — NPST 2.2 / 2.3, verbatim -----------------------
    ('parent_engagement', 'i1', 'Builds trusting relationships with parents and the community to ensure students have learning support at home and in society.', 1, 'npst', 'aligned', 'NPST 2023, indicator 2.2.1'),
    ('parent_engagement', 'i2', 'Provides parents/caregivers with specific and well-considered guidance on how to support their children''s learning at home.', 2, 'npst', 'aligned', 'NPST 2023, indicator 8.3.6'),
    ('parent_engagement', 'i3', 'Builds strong relationships with teachers in other schools and the community for enriching students'' learning experiences.', 3, 'npst', 'aligned', 'NPST 2023, indicator 2.3.1'),

    -- Collaboration — NPST 2.1, verbatim ---------------------------------
    ('collaboration', 'i1', 'Collaborates with colleagues and other professionals in school to create diverse learning opportunities for students.', 1, 'npst', 'aligned', 'NPST 2023, indicator 2.1.1'),
    ('collaboration', 'i2', 'Contributes to a productive work culture for self and colleagues.', 2, 'npst', 'aligned', 'NPST 2023, indicator 2.5.2'),
    ('collaboration', 'i3', 'Shares planning materials and assessment tasks with the team rather than working in isolation.', 3, 'school', 'school_defined', null),

    -- Subject knowledge ---------------------------------------------------
    ('subject_knowledge', 'i1', 'Explains the underlying concepts of the subject accurately, without introducing misconceptions.', 1, 'school', 'school_defined', null),
    ('subject_knowledge', 'i2', 'Anticipates the misconceptions students commonly hold in this topic and plans specifically to address them.', 2, 'school', 'school_defined', null),
    ('subject_knowledge', 'i3', 'Connects the topic to prior learning and to other subjects where the link genuinely helps understanding.', 3, 'school', 'school_defined', null),

    -- Pedagogical knowledge -----------------------------------------------
    ('pedagogical_knowledge', 'i1', 'Selects an instructional strategy that matches the intended learning outcome, and can say why that strategy.', 1, 'school', 'school_defined', null),
    ('pedagogical_knowledge', 'i2', 'Uses questioning that requires reasoning rather than recall alone, and gives students time to think.', 2, 'school', 'school_defined', null),
    ('pedagogical_knowledge', 'i3', 'Varies pacing and grouping within a lesson in response to how students are actually responding.', 3, 'school', 'school_defined', null),

    -- Pedagogical content knowledge ---------------------------------------
    ('pedagogical_content_knowledge', 'i1', 'Chooses representations, analogies or examples that make this specific concept accessible to this specific group.', 1, 'school', 'school_defined', null),
    ('pedagogical_content_knowledge', 'i2', 'Sequences the sub-ideas of a topic so that each one rests on something students already hold securely.', 2, 'school', 'school_defined', null),

    -- Lesson and learning design — NPST Domain 7 --------------------------
    ('lesson_learning_design', 'i1', 'States learning objectives in terms of what students will be able to do by the end of the lesson.', 1, 'npst', 'derived', 'NPST 2023, SD 7.1 Learning goals and objective'),
    ('lesson_learning_design', 'i2', 'Plans a sequence of learning experiences that build towards the stated objective rather than filling the time.', 2, 'npst', 'derived', 'NPST 2023, SD 7.2 Planning of Learning Experiences'),
    ('lesson_learning_design', 'i3', 'Builds a check for understanding into the plan at the point where the learning could break down.', 3, 'school', 'school_defined', null),

    -- Competency-based education ------------------------------------------
    ('competency_based_education', 'i1', 'Defines success for a unit as a demonstrable competency, not as content covered.', 1, 'cbse', 'derived', null),
    ('competency_based_education', 'i2', 'Uses tasks that require students to apply learning in an unfamiliar situation.', 2, 'cbse', 'derived', null),
    ('competency_based_education', 'i3', 'Can show, for a given student, what that student is now able to do that they could not do before.', 3, 'school', 'school_defined', null),

    -- Experiential learning -------------------------------------------------
    ('experiential_learning', 'i1', 'Plans activities in which students do, make or investigate something rather than only receive information.', 1, 'cbse', 'derived', null),
    ('experiential_learning', 'i2', 'Runs a structured debrief that draws the intended learning out of the experience.', 2, 'school', 'school_defined', null),

    -- Learning environment --------------------------------------------------
    ('learning_environment', 'i1', 'Establishes routines that let the lesson start and transitions happen without lost learning time.', 1, 'school', 'school_defined', null),
    ('learning_environment', 'i2', 'Responds to a wrong answer in a way that keeps the student willing to answer again.', 2, 'school', 'school_defined', null),
    ('learning_environment', 'i3', 'Arranges the physical and social environment so that every student can see, hear and participate.', 3, 'school', 'school_defined', null),

    -- Assessment and feedback — NPST Domain 8, verbatim ---------------------
    ('assessment_feedback', 'i1', 'Actively incorporates assessment for learning and as learning in classrooms.', 1, 'npst', 'aligned', 'NPST 2023, indicator 8.1.6'),
    ('assessment_feedback', 'i2', 'Uses assessment data to identify and address common issues and alternative conceptions in classroom learning.', 2, 'npst', 'aligned', 'NPST 2023, indicator 8.2.1'),
    ('assessment_feedback', 'i3', 'Uses assessment data to modify lesson plans and pedagogy adequately to suit specific learning needs of students.', 3, 'npst', 'aligned', 'NPST 2023, indicator 8.2.2'),
    ('assessment_feedback', 'i4', 'Synthesizes information on student learning collected using multiple assessments to identify areas of improvement in instruction and planning.', 4, 'npst', 'aligned', 'NPST 2023, indicator 8.2.3'),
    ('assessment_feedback', 'i5', 'Actively encourages students to reflect on their performance by enabling self and peer assessments.', 5, 'npst', 'aligned', 'NPST 2023, indicator 8.3.5'),

    -- Inclusive education ---------------------------------------------------
    ('inclusive_education', 'i1', 'Identifies the specific barrier a student faces rather than describing them generally as weak.', 1, 'school', 'school_defined', null),
    ('inclusive_education', 'i2', 'Implements the agreed accommodations for students with identified needs, consistently and without singling them out.', 2, 'school', 'school_defined', null),
    ('inclusive_education', 'i3', 'Plans extension that deepens rather than merely adds more work for students who are ahead.', 3, 'school', 'school_defined', null),

    -- Differentiated instruction — NPST SD 6.2 -------------------------------
    ('differentiated_instruction', 'i1', 'Plans more than one route into the same learning objective for students at different starting points.', 1, 'npst', 'derived', 'NPST 2023, SD 6.2 Differentiated instruction/teaching'),
    ('differentiated_instruction', 'i2', 'Adjusts the level of scaffolding during the lesson based on what students are producing.', 2, 'school', 'school_defined', null),

    -- Student wellbeing -------------------------------------------------------
    ('student_wellbeing', 'i1', 'Notices and records a sustained change in a student''s engagement, mood or attendance.', 1, 'school', 'school_defined', null),
    ('student_wellbeing', 'i2', 'Refers a wellbeing concern to the counsellor or designated staff member rather than managing it alone.', 2, 'school', 'school_defined', null),

    -- Digital pedagogy ---------------------------------------------------------
    ('digital_pedagogy', 'i1', 'Uses a digital tool where it does something a non-digital approach could not do as well.', 1, 'school', 'school_defined', null),
    ('digital_pedagogy', 'i2', 'Models safe, responsible and attributed use of digital sources in front of students.', 2, 'school', 'school_defined', null),

    -- Computational thinking and AI readiness -----------------------------------
    ('computational_thinking_ai', 'i1', 'Builds decomposition, pattern-finding or algorithmic thinking into a subject task at a level suited to the stage.', 1, 'cbse', 'derived', null),
    ('computational_thinking_ai', 'i2', 'Discusses with students, at an age-appropriate level, what AI tools can and cannot reliably do.', 2, 'school', 'school_defined', null),

    -- Reflective practice — NPST Domain 12, verbatim ------------------------------
    ('reflective_practice', 'i1', 'Discusses the strengths and weaknesses of own practice.', 1, 'npst', 'aligned', 'NPST 2023, indicator 12.1'),
    ('reflective_practice', 'i2', 'Documents reflections on lesson plans and classroom strategies in light of student learning needs.', 2, 'npst', 'aligned', 'NPST 2023, indicator 12.3'),
    ('reflective_practice', 'i3', 'Gives multiple approaches undertaken to alter practice for better teaching-learning in classrooms.', 3, 'npst', 'aligned', 'NPST 2023, indicator 12.4'),

    -- Professional development — NPST Domain 13, verbatim -------------------------
    ('professional_development', 'i1', 'Uses various sources and participates in various platforms for shared learning opportunities within and outside the school.', 1, 'npst', 'aligned', 'NPST 2023, indicator 13.1'),
    ('professional_development', 'i2', 'Applies something specific from a completed professional learning activity in the classroom, and can point to where.', 2, 'school', 'school_defined', null),

    -- Innovation -------------------------------------------------------------------
    ('innovation', 'i1', 'Trials a considered change to practice with a stated reason for expecting it to help.', 1, 'school', 'school_defined', null),
    ('innovation', 'i2', 'Evaluates the trial against evidence of student learning and reports the outcome, including when it did not work.', 2, 'school', 'school_defined', null),

    -- Mentoring — NPST 12.5 / 12.6, verbatim ----------------------------------------
    ('mentoring', 'i1', 'Mentors colleagues in reflective practice.', 1, 'npst', 'aligned', 'NPST 2023, indicator 12.5'),
    ('mentoring', 'i2', 'Takes initiative to build a peer support group for ongoing learning.', 2, 'npst', 'aligned', 'NPST 2023, indicator 12.6'),

    -- Leadership — NPST SD 2.5, verbatim --------------------------------------------
    ('leadership', 'i1', 'Sets realistic goals for students and helps them achieve them by creating a supportive learning culture where everyone feels safe and valued.', 1, 'npst', 'aligned', 'NPST 2023, indicator 2.5.1'),
    ('leadership', 'i2', 'Takes responsibility for an area of school improvement beyond own classroom and reports on its progress.', 2, 'school', 'school_defined', null),
    ('leadership', 'i3', 'Encourages and supports students and colleagues to follow rules and helps them solve problems when they arise.', 3, 'npst', 'aligned', 'NPST 2023, indicator 1.4.2')

  ) as v(competency_key, key, statement, sort, src, align, ref)
  join competency.competency c
    on c.school_id = p_school_id and c.key = v.competency_key
   and c.domain_id in (
     select d.id from competency.domain d
     join competency.standard s on s.id = d.standard_id
     where s.framework_id = v_fw
   )
  on conflict (competency_id, key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function competency.provision_school_indicators(uuid) is
  'Seeds behavioural indicators. NPST-aligned competencies use NPST indicator '
  'text verbatim with its NPST number; the rest are school-authored.';

-- ===========================================================================
-- Proficiency descriptors
-- ===========================================================================
-- What each competency looks like AT each level of the school's five-point
-- scale. This is what makes an assessment defensible: the assessor points at a
-- descriptor rather than at a feeling.

create or replace function competency.provision_proficiency_descriptors(p_school_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fw    uuid;
  v_count integer;
begin
  select id into v_fw from competency.framework
   where school_id = p_school_id and key = 'school_professional_practice' and version = 1;

  insert into competency.proficiency_descriptor (
    school_id, competency_id, proficiency_level_id, descriptor
  )
  select p_school_id, c.id, pl.id, v.descriptor
  from (values
    ('core_values_ethics','foundation','Follows school rules and treats students courteously when reminded.'),
    ('core_values_ethics','developing','Consistently fair and respectful; handles student information correctly.'),
    ('core_values_ethics','proficient','Actively builds a climate of fairness; applies rules consistently and explains them.'),
    ('core_values_ethics','advanced','Colleagues seek their judgement on ethical questions; models constitutional values visibly.'),
    ('core_values_ethics','expert_lead','Shapes the school''s ethical culture and guides others through difficult judgement calls.'),

    ('child_safeguarding','foundation','Knows the reporting route and can describe when to use it.'),
    ('child_safeguarding','developing','Recognises common indicators of risk and reports promptly when prompted.'),
    ('child_safeguarding','proficient','Independently identifies, records and reports concerns within the required timeframe.'),
    ('child_safeguarding','advanced','Supports colleagues in recognising and handling concerns appropriately.'),
    ('child_safeguarding','expert_lead','Leads safeguarding practice and reviews the school''s procedures against them.'),

    ('communication','foundation','Communicates the essentials clearly with preparation and support.'),
    ('communication','developing','Gives clear feedback to students; parent communication is accurate if generic.'),
    ('communication','proficient','Feedback is specific and actionable; adapts explanations when not understood.'),
    ('communication','advanced','Handles difficult conversations with families constructively and unaided.'),
    ('communication','expert_lead','Sets the standard for communication across the team and coaches others in it.'),

    ('parent_engagement','foundation','Attends scheduled parent meetings and reports on progress accurately.'),
    ('parent_engagement','developing','Initiates contact when a concern arises rather than waiting for a meeting.'),
    ('parent_engagement','proficient','Builds trust with families and gives specific guidance for supporting learning at home.'),
    ('parent_engagement','advanced','Engages hard-to-reach families successfully and sustains the relationship.'),
    ('parent_engagement','expert_lead','Designs the school''s approach to family partnership and builds community links.'),

    ('collaboration','foundation','Participates in team meetings and completes shared tasks as agreed.'),
    ('collaboration','developing','Contributes materials and ideas to the team without being asked.'),
    ('collaboration','proficient','Plans jointly with colleagues to create opportunities no one teacher could alone.'),
    ('collaboration','advanced','Improves how the team works; resolves friction constructively.'),
    ('collaboration','expert_lead','Builds collaborative practice across departments and stages.'),

    ('subject_knowledge','foundation','Secure in the content immediately being taught; relies on prepared materials.'),
    ('subject_knowledge','developing','Explains concepts accurately and answers most unplanned student questions.'),
    ('subject_knowledge','proficient','Anticipates common misconceptions and plans deliberately to address them.'),
    ('subject_knowledge','advanced','Commands the subject well beyond the syllabus and connects it across disciplines.'),
    ('subject_knowledge','expert_lead','Recognised subject authority; develops others'' subject knowledge.'),

    ('pedagogical_knowledge','foundation','Uses a small repertoire of strategies, mostly as modelled.'),
    ('pedagogical_knowledge','developing','Chooses among several strategies and can explain the choice afterwards.'),
    ('pedagogical_knowledge','proficient','Matches strategy to intended outcome deliberately, and adapts pacing mid-lesson.'),
    ('pedagogical_knowledge','advanced','Draws on a wide repertoire fluently and diagnoses why a strategy is not working.'),
    ('pedagogical_knowledge','expert_lead','Develops pedagogical practice across the school and supports colleagues to widen theirs.'),

    ('pedagogical_content_knowledge','foundation','Uses the representations provided in the textbook or scheme.'),
    ('pedagogical_content_knowledge','developing','Selects among known representations for the topic being taught.'),
    ('pedagogical_content_knowledge','proficient','Chooses representations to suit this concept and this group, and sequences sub-ideas soundly.'),
    ('pedagogical_content_knowledge','advanced','Creates new representations when existing ones fail a particular group.'),
    ('pedagogical_content_knowledge','expert_lead','Builds and shares the department''s repertoire of how to teach difficult ideas.'),

    ('lesson_learning_design','foundation','Plans lessons that follow the scheme of work with stated objectives.'),
    ('lesson_learning_design','developing','Objectives are outcome-based; the sequence generally builds towards them.'),
    ('lesson_learning_design','proficient','Designs coherent sequences with checks for understanding at the right points.'),
    ('lesson_learning_design','advanced','Designs units that others adopt; anticipates where learning will break down.'),
    ('lesson_learning_design','expert_lead','Leads curriculum and learning design across a stage or department.'),

    ('competency_based_education','foundation','Understands the distinction between coverage and competency.'),
    ('competency_based_education','developing','States unit success in competency terms, though tasks remain largely recall-based.'),
    ('competency_based_education','proficient','Uses application tasks in unfamiliar contexts and can evidence what students can now do.'),
    ('competency_based_education','advanced','Redesigns units around competencies and demonstrates the shift in student capability.'),
    ('competency_based_education','expert_lead','Leads the school''s move to competency-based practice.'),

    ('experiential_learning','foundation','Runs prepared hands-on activities as designed by others.'),
    ('experiential_learning','developing','Plans activity-based learning; the debrief is present but thin.'),
    ('experiential_learning','proficient','Designs experiences and runs a debrief that draws out the intended learning.'),
    ('experiential_learning','advanced','Designs sustained experiential units, including outside the classroom.'),
    ('experiential_learning','expert_lead','Builds experiential learning capability across the school.'),

    ('learning_environment','foundation','Maintains order with support; routines are still being established.'),
    ('learning_environment','developing','Routines work; transitions cost little learning time.'),
    ('learning_environment','proficient','Students take intellectual risks; wrong answers are handled so participation continues.'),
    ('learning_environment','advanced','Climate is notably strong and resilient, including with difficult groups.'),
    ('learning_environment','expert_lead','Helps colleagues establish climate; shapes school-wide expectations.'),

    ('assessment_feedback','foundation','Marks work accurately and records results as required.'),
    ('assessment_feedback','developing','Uses formative checks; feedback is specific but not always acted upon.'),
    ('assessment_feedback','proficient','Uses assessment evidence to adapt subsequent instruction, and students act on feedback.'),
    ('assessment_feedback','advanced','Synthesises multiple assessments to reshape planning; embeds self and peer assessment.'),
    ('assessment_feedback','expert_lead','Leads assessment design and moderation; develops others'' assessment literacy.'),

    ('inclusive_education','foundation','Aware of identified needs in the class and applies stated accommodations when reminded.'),
    ('inclusive_education','developing','Applies accommodations consistently; identifies barriers with support.'),
    ('inclusive_education','proficient','Identifies specific barriers independently and plans access and extension accordingly.'),
    ('inclusive_education','advanced','Adapts complex cases successfully and advises colleagues on inclusive strategies.'),
    ('inclusive_education','expert_lead','Leads inclusive practice and works with specialists to build school capability.'),

    ('differentiated_instruction','foundation','Provides the same task to all, with some support for those who struggle.'),
    ('differentiated_instruction','developing','Plans two routes into the objective; scaffolding is planned but fixed.'),
    ('differentiated_instruction','proficient','Plans multiple routes and adjusts scaffolding live, based on student output.'),
    ('differentiated_instruction','advanced','Differentiates fluently across a wide attainment range without lowering expectations.'),
    ('differentiated_instruction','expert_lead','Develops differentiation practice across the team.'),

    ('student_wellbeing','foundation','Knows who the designated staff are and how to raise a concern.'),
    ('student_wellbeing','developing','Notices marked changes in students and mentions them to the right person.'),
    ('student_wellbeing','proficient','Records sustained changes factually and refers appropriately without overstepping.'),
    ('student_wellbeing','advanced','Supports colleagues in recognising and responding to wellbeing concerns.'),
    ('student_wellbeing','expert_lead','Shapes the school''s wellbeing practice with the counselling team.'),

    ('digital_pedagogy','foundation','Uses the school''s core digital tools for basic classroom tasks.'),
    ('digital_pedagogy','developing','Uses digital tools to present and organise learning reliably.'),
    ('digital_pedagogy','proficient','Chooses digital tools where they add something non-digital approaches cannot; models responsible use.'),
    ('digital_pedagogy','advanced','Designs learning that genuinely depends on the affordances of the tool.'),
    ('digital_pedagogy','expert_lead','Leads digital pedagogy and supports colleagues to adopt it purposefully.'),

    ('computational_thinking_ai','foundation','Aware of computational thinking and current AI tools in education.'),
    ('computational_thinking_ai','developing','Includes occasional pattern-finding or decomposition tasks in subject teaching.'),
    ('computational_thinking_ai','proficient','Builds computational thinking into subject tasks routinely and discusses AI limits with students.'),
    ('computational_thinking_ai','advanced','Designs cross-curricular computational tasks and guides responsible student AI use.'),
    ('computational_thinking_ai','expert_lead','Leads the school''s approach to computational thinking and AI readiness.'),

    ('reflective_practice','foundation','Can describe how a lesson went when asked.'),
    ('reflective_practice','developing','Identifies strengths and weaknesses of own practice with prompting.'),
    ('reflective_practice','proficient','Documents reflections against student learning and changes practice as a result.'),
    ('reflective_practice','advanced','Shows multiple approaches trialled to alter practice, with evidence of effect.'),
    ('reflective_practice','expert_lead','Mentors colleagues in reflective practice and builds it into team routine.'),

    ('professional_development','foundation','Attends required professional learning.'),
    ('professional_development','developing','Attends and can summarise what was learned.'),
    ('professional_development','proficient','Selects development that addresses a known gap and applies it visibly in practice.'),
    ('professional_development','advanced','Seeks development beyond the school and brings it back to colleagues.'),
    ('professional_development','expert_lead','Designs and delivers professional learning for others.'),

    ('innovation','foundation','Open to trying approaches suggested by others.'),
    ('innovation','developing','Trials a change to practice, though evaluation is informal.'),
    ('innovation','proficient','Trials a considered change with a stated rationale and evaluates it against student learning.'),
    ('innovation','advanced','Runs structured trials and reports outcomes honestly, including failures.'),
    ('innovation','expert_lead','Builds a culture of evaluated experimentation across the school.'),

    ('mentoring','foundation','Supports a new colleague informally when asked.'),
    ('mentoring','developing','Acts as a buddy to a new colleague with a defined remit.'),
    ('mentoring','proficient','Mentors a colleague through structured cycles with agreed goals.'),
    ('mentoring','advanced','Mentors several colleagues, including in reflective practice, with demonstrable effect.'),
    ('mentoring','expert_lead','Designs the school''s mentoring programme and develops other mentors.'),

    ('leadership','foundation','Carries out own responsibilities reliably and supports school routines.'),
    ('leadership','developing','Takes on a defined responsibility beyond the classroom.'),
    ('leadership','proficient','Leads an area of practice, sets goals for it and reports progress.'),
    ('leadership','advanced','Leads a team or a school improvement priority with measurable impact.'),
    ('leadership','expert_lead','Shapes school strategy and develops leadership capability in others.')

  ) as v(competency_key, level_key, descriptor)
  join competency.competency c
    on c.school_id = p_school_id and c.key = v.competency_key
   and c.domain_id in (
     select d.id from competency.domain d
     join competency.standard s on s.id = d.standard_id
     where s.framework_id = v_fw
   )
  join competency.proficiency_scale ps
    on ps.framework_id = v_fw and ps.key = 'school_five_point'
  join competency.proficiency_level pl
    on pl.scale_id = ps.id and pl.key = v.level_key
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function competency.provision_proficiency_descriptors(uuid) is
  'Five descriptors for each of the 23 competencies — 115 rows. Every '
  'competency is described at every level so no assessment rests on an '
  'undefined expectation.';
