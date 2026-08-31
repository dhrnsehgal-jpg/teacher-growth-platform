-- ===========================================================================
-- 0015 — Framework provisioning
-- ===========================================================================
-- Two frameworks are provisioned per school:
--
--   1. `npst_2023` — the NPST Guiding Document, 2023 as a REFERENCE framework.
--      Its standards, domains and indicator text are NCTE's, recorded verbatim
--      with clause references. No targets are set against it: NPST does not
--      bind this school (see regulatory requirement `central.npst.applicability`
--      — it reaches a school only through an entity designated by the State/UT).
--
--   2. `school_professional_practice` — the school's OPERATING framework. This
--      is what targets and assessments attach to. Each competency records where
--      it actually came from:
--
--        aligned        traceable to a named clause of a verified source
--        derived        informed by an external framework, but reworded/extended
--        school_defined the school's own; no external claim at all
--
--      Roughly two thirds of the seeded competencies are NPST-aligned with real
--      clause references. Three are school_defined. The rest are CBSE-aligned
--      via the verified SQAA Framework Overview, or derived.
--
-- Provisioning is a function, not inline INSERTs, so a second school gets the
-- same starting framework and can then diverge.
-- ===========================================================================

create or replace function competency.provision_npst_reference(p_school_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source uuid;
  v_fw     uuid;
  v_scale  uuid;
begin
  select id into v_source from regulatory.source
   where source_url = 'https://ncte.gov.in/website/PDF/NPST/NPST-Book.pdf';

  insert into competency.framework (
    school_id, key, version, name, description,
    source_framework, source_alignment, external_reference, regulatory_source_id,
    status, effective_from
  ) values (
    p_school_id, 'npst_2023', 1,
    'National Professional Standards for Teachers (NPST), 2023',
    'Reference copy of the NCTE NPST Guiding Document, 2023, recorded so the '
    'school framework can be mapped against it. NPST is a guiding document: it '
    'reaches a school only through an implementing entity designated by the '
    'State/UT Government (NPST §5.2). No targets are set against this framework.',
    'npst', 'aligned', 'NPST Guiding Document, 2023', v_source,
    'active', date '2023-01-01'
  )
  on conflict (school_id, key, version) do nothing
  returning id into v_fw;

  if v_fw is null then
    select id into v_fw from competency.framework
     where school_id = p_school_id and key = 'npst_2023' and version = 1;
    return v_fw;
  end if;

  -- NPST's own three levels. Recorded because NPST publishes its own
  -- terminology; the school's operating scale is separate and has five levels.
  insert into competency.proficiency_scale (
    school_id, framework_id, key, name, description,
    source_framework, source_alignment, external_reference
  ) values (
    p_school_id, v_fw, 'npst_levels', 'NPST Teacher Profile Levels',
    'Three levels proposed as applicable to all NPST domains and competencies, '
    'across stages of schooling and subject area.',
    'npst', 'aligned', 'NPST Guiding Document, 2023, §3.2(c)'
  )
  returning id into v_scale;

  insert into competency.proficiency_level (school_id, scale_id, key, name, ordinal, descriptor)
  values
    (p_school_id, v_scale, 'proficient', 'Proficient Teacher', 1,
     'Professionally independent, demonstrating the skills vital to teaching and learning.'),
    (p_school_id, v_scale, 'advanced', 'Advanced Teacher', 2,
     'Embodies the utmost standards of teaching, beyond the proficient stage.'),
    (p_school_id, v_scale, 'expert', 'Expert Teacher', 3,
     'Consistently displays the best level of performance and mentors others towards the next stage.');

  -- Standards
  insert into competency.standard (
    school_id, framework_id, key, name, description, sort_order,
    source_framework, source_alignment, external_reference
  )
  select p_school_id, v_fw, v.key, v.name, v.description, v.sort,
         'npst', 'aligned', v.ref
  from (values
    ('npst_s1', 'Standard 1: Core Values and Ethics',
     'Covers domains related to core values and ethics a teacher is expected to develop.',
     1, 'NPST Guiding Document, 2023, §4.1'),
    ('npst_s2', 'Standard 2: Knowledge and Practice',
     'What a teacher is expected to know and understand about their students and about '
     'teaching-learning in order to function effectively at each career stage, including '
     'subject matter knowledge and related pedagogical content knowledge.',
     2, 'NPST Guiding Document, 2023, §4.2'),
    ('npst_s3', 'Standard 3: Professional Growth and Development',
     'What a teacher is expected to do to improve professional knowledge, competence and '
     'practice at each career stage through participation in CPD programmes.',
     3, 'NPST Guiding Document, 2023, §4.3')
  ) as v(key, name, description, sort, ref);

  -- Domains. Domains 9, 10 and 11 are deliberately absent: they could not be
  -- extracted from the source PDF and are recorded as REQUIRES VERIFICATION on
  -- the regulatory source. Seeding invented placeholders would be worse than
  -- the gap.
  insert into competency.domain (
    school_id, standard_id, key, name, description, sort_order,
    source_framework, source_alignment, external_reference
  )
  select p_school_id, s.id, v.key, v.name, null, v.sort,
         'npst', 'aligned', v.ref
  from (values
    ('npst_s1', 'npst_d1',  'Domain 1: Constitutional values as enshrined in the Constitution of India', 1, 'NPST 2023, Standard 1, Domain 1'),
    ('npst_s1', 'npst_d2',  'Domain 2: Professional Relationships', 2, 'NPST 2023, Standard 1, Domain 2'),
    ('npst_s2', 'npst_d3',  'Domain 3: Recognizing, identifying, and fostering unique capabilities of each child', 3, 'NPST 2023, Standard 2, Domain 3'),
    ('npst_s2', 'npst_d4',  'Domain 4: Knowledge, conceptual understanding and application of the subject', 4, 'NPST 2023, Standard 2, Domain 4'),
    ('npst_s2', 'npst_d5',  'Domain 5: Curriculum', 5, 'NPST 2023, Standard 2, Domain 5'),
    ('npst_s2', 'npst_d6',  'Domain 6: Content Development for Student Learning', 6, 'NPST 2023, Standard 2, Domain 6'),
    ('npst_s2', 'npst_d7',  'Domain 7: Learning Plans', 7, 'NPST 2023, Standard 2, Domain 7'),
    ('npst_s2', 'npst_d8',  'Domain 8: Assessment of, for and as learning', 8, 'NPST 2023, Standard 2, Domain 8'),
    ('npst_s3', 'npst_d12', 'Domain 12: Reflective practice', 12, 'NPST 2023, Standard 3, Domain 12'),
    ('npst_s3', 'npst_d13', 'Domain 13: Engagement and participation in a learning community', 13, 'NPST 2023, Standard 3, Domain 13')
  ) as v(standard_key, key, name, sort, ref)
  join competency.standard s
    on s.framework_id = v_fw and s.key = v.standard_key;

  return v_fw;
end;
$$;

comment on function competency.provision_npst_reference(uuid) is
  'Records the verified NPST structure as a reference framework. Domains 9-11 '
  'are intentionally missing — unextractable from the source and therefore '
  'unverified.';

-- ===========================================================================
-- The school's operating framework
-- ===========================================================================

create or replace function competency.provision_school_framework(p_school_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_npst_source  uuid;
  v_sqaaf_source uuid;
  v_fw           uuid;
  v_scale        uuid;
begin
  select id into v_npst_source from regulatory.source
   where source_url = 'https://ncte.gov.in/website/PDF/NPST/NPST-Book.pdf';
  select id into v_sqaaf_source from regulatory.source
   where source_url = 'https://cbseacademic.nic.in/sqaa/doc/TabC-SQAA%20Framework%20Overview.pdf';

  insert into competency.framework (
    school_id, key, version, name, description,
    source_framework, source_alignment, status, effective_from
  ) values (
    p_school_id, 'school_professional_practice', 1,
    'School Framework for Professional Practice',
    'The school''s own competency framework. It takes NPST as its spine and '
    'extends it for a CBSE-affiliated K-12 context. Every competency records '
    'its actual source: NPST-aligned items cite the NPST clause, CBSE-aligned '
    'items cite the verified SQAA Framework Overview, and school-defined items '
    'make no external claim.',
    'school', 'school_defined', 'active', current_date
  )
  on conflict (school_id, key, version) do nothing
  returning id into v_fw;

  if v_fw is null then
    select id into v_fw from competency.framework
     where school_id = p_school_id and key = 'school_professional_practice' and version = 1;
    return v_fw;
  end if;

  -- ------------------------------------------------------------------ scale
  -- Product descriptors, not any official framework's terminology.
  insert into competency.proficiency_scale (
    school_id, framework_id, key, name, description,
    source_framework, source_alignment
  ) values (
    p_school_id, v_fw, 'school_five_point', 'School Five-Point Proficiency Scale',
    'The school''s operating scale. These are product descriptors chosen for the '
    'MVP, not NPST terminology — NPST publishes three levels (Proficient, '
    'Advanced, Expert), recorded separately on the NPST reference framework.',
    'school', 'school_defined'
  )
  returning id into v_scale;

  insert into competency.proficiency_level (school_id, scale_id, key, name, ordinal, descriptor)
  values
    (p_school_id, v_scale, 'foundation', 'Foundation', 1,
     'Beginning to apply the practice with structured guidance and close support.'),
    (p_school_id, v_scale, 'developing', 'Developing', 2,
     'Applies the practice consistently in familiar situations; still developing judgement in unfamiliar ones.'),
    (p_school_id, v_scale, 'proficient', 'Proficient', 3,
     'Independently effective. Adapts the practice to the class in front of them.'),
    (p_school_id, v_scale, 'advanced', 'Advanced', 4,
     'Consistently strong across contexts, and improves the practice of colleagues nearby.'),
    (p_school_id, v_scale, 'expert_lead', 'Expert / Lead', 5,
     'Shapes practice beyond their own classroom and builds capability across the school.');

  -- -------------------------------------------------------------- standards
  insert into competency.standard (
    school_id, framework_id, key, name, description, sort_order,
    source_framework, source_alignment, external_reference
  )
  select p_school_id, v_fw, v.key, v.name, v.description, v.sort,
         'npst', 'derived', v.ref
  from (values
    ('s1_values_ethics', 'Core Values and Professional Ethics',
     'Who the teacher is: values, ethics, safeguarding and professional relationships.',
     1, 'Structure follows NPST 2023, Standard 1'),
    ('s2_knowledge_practice', 'Knowledge and Practice',
     'What the teacher knows and does: subject, pedagogy, design, assessment, inclusion and digital practice.',
     2, 'Structure follows NPST 2023, Standard 2'),
    ('s3_growth_development', 'Professional Growth and Development',
     'How the teacher grows: reflection, development, innovation, mentoring and leadership.',
     3, 'Structure follows NPST 2023, Standard 3')
  ) as v(key, name, description, sort, ref);

  -- ---------------------------------------------------------------- domains
  insert into competency.domain (
    school_id, standard_id, key, name, description, sort_order,
    source_framework, source_alignment
  )
  select p_school_id, s.id, v.key, v.name, v.description, v.sort, 'school', 'school_defined'
  from (values
    ('s1_values_ethics',      'ethics_values',           'Professional Ethics and Values',      'Constitutional values, integrity, and the safety of children.', 1),
    ('s1_values_ethics',      'relationships_community', 'Professional Relationships and Community', 'Communication, collaboration and partnership with families.', 2),
    ('s2_knowledge_practice', 'subject_pedagogy',        'Subject and Pedagogical Knowledge',    'What is taught and how it is taught.', 3),
    ('s2_knowledge_practice', 'learning_design',         'Learning Design and Delivery',         'Planning and running learning that works.', 4),
    ('s2_knowledge_practice', 'assessment_feedback_dom', 'Assessment and Feedback',              'Finding out what students know, and acting on it.', 5),
    ('s2_knowledge_practice', 'inclusive_responsive',    'Inclusive and Responsive Practice',    'Reaching every learner, and caring for them.', 6),
    ('s2_knowledge_practice', 'digital_future_ready',    'Digital and Future-Ready Practice',    'Technology, computational thinking and AI readiness.', 7),
    ('s3_growth_development', 'reflection_growth',       'Reflection and Growth',                'Looking honestly at practice and improving it.', 8),
    ('s3_growth_development', 'leadership_contribution', 'Leadership and Contribution',          'Growing others and strengthening the school.', 9)
  ) as v(standard_key, key, name, description, sort)
  join competency.standard s
    on s.framework_id = v_fw and s.key = v.standard_key;

  -- ----------------------------------------------------------- competencies
  -- source_framework / source_alignment / external_reference are the honest
  -- record. `aligned` always carries a clause reference; `school_defined`
  -- never claims an external origin.
  insert into competency.competency (
    school_id, domain_id, key, name, description, sort_order,
    source_framework, source_alignment, external_reference, regulatory_source_id, rationale
  )
  select
    p_school_id, d.id, v.key, v.name, v.description, v.sort,
    v.src::competency.source_framework, v.align::competency.source_alignment,
    v.ref,
    case v.src when 'npst' then v_npst_source when 'cbse' then v_sqaaf_source else null end,
    v.rationale
  from (values

    -- Standard 1 ---------------------------------------------------------
    ('ethics_values', 'core_values_ethics', 'Core Values and Professional Ethics',
     'Upholds constitutional values, treats students and colleagues with fairness and respect, and handles student information responsibly.',
     1, 'npst', 'aligned', 'NPST 2023, Standard 1, Domain 1 (SD 1.1-1.4)',
     'Adopted directly from NPST Domain 1, whose indicator text is used verbatim.'),

    ('ethics_values', 'child_safeguarding', 'Child Safety and Safeguarding',
     'Recognises and responds to safeguarding concerns, follows reporting procedures, and maintains an environment in which children are safe and know how to raise a concern.',
     2, 'school', 'school_defined', null,
     'School-defined. NPST Domain 1 touches dignity and legal obligation but does not set out a safeguarding competency. India has specific statutory instruments in this area (for example the POCSO Act) and CBSE has issued school safety guidance; NONE of these were verified during Stages 1-2. This competency is therefore the school''s own and must NOT be presented as a statutory or CBSE requirement until those instruments are verified.'),

    ('relationships_community', 'communication', 'Communication',
     'Communicates clearly with students, colleagues and families, including specific qualitative feedback on student performance.',
     3, 'npst', 'aligned', 'NPST 2023, Standard 2, Domain 8 (SD 8.3 Communication and Feedback)',
     'NPST places communication with students and parents under assessment feedback; the school keeps it visible as its own competency.'),

    ('relationships_community', 'parent_engagement', 'Parent and Community Engagement',
     'Builds trusting relationships with parents and the community so that students are supported at home as well as in school.',
     4, 'npst', 'aligned', 'NPST 2023, Standard 1, Domain 2 (SD 2.2, SD 2.3)',
     'Adopted from NPST Domain 2, sub-domains 2.2 and 2.3.'),

    ('relationships_community', 'collaboration', 'Collaboration',
     'Works with colleagues and other professionals to create richer learning opportunities than any one teacher could alone.',
     5, 'npst', 'aligned', 'NPST 2023, Standard 1, Domain 2 (SD 2.1)',
     'Adopted from NPST sub-domain 2.1.'),

    -- Standard 2 ---------------------------------------------------------
    ('subject_pedagogy', 'subject_knowledge', 'Subject and Content Knowledge',
     'Commands the subject matter taught, including its structure, its common misconceptions and its links to other subjects.',
     6, 'npst', 'aligned', 'NPST 2023, Standard 2, Domain 4 (SD 4.1)',
     'Adopted from NPST Domain 4.'),

    ('subject_pedagogy', 'pedagogical_knowledge', 'Pedagogical Knowledge',
     'Selects and uses instructional strategies and learning taxonomies suited to the intended learning.',
     7, 'npst', 'aligned', 'NPST 2023, Standard 2, Domain 6 (SD 6.1)',
     'Adopted from NPST sub-domain 6.1.'),

    ('subject_pedagogy', 'pedagogical_content_knowledge', 'Pedagogical Content Knowledge',
     'Knows how to make this particular subject learnable: the representations, analogies and sequences that work for these ideas with these learners.',
     8, 'npst', 'aligned', 'NPST 2023, §4.2 (Standard 2 encompasses "subject matter knowledge and related pedagogical content knowledge")',
     'NPST names pedagogical content knowledge in its description of Standard 2 but does not give it a discrete domain. The school separates it because subject knowledge and the ability to teach that subject are distinct and develop differently.'),

    ('learning_design', 'lesson_learning_design', 'Lesson and Learning Design',
     'Sets clear learning goals and plans sequences of learning experiences that move students towards them.',
     9, 'npst', 'aligned', 'NPST 2023, Standard 2, Domain 7 (SD 7.1, SD 7.2)',
     'Adopted from NPST Domain 7.'),

    ('learning_design', 'competency_based_education', 'Competency-Based Education',
     'Designs and teaches for demonstrable competencies rather than content coverage, and can show what students can now do.',
     10, 'cbse', 'aligned', 'CBSE SQAA Framework Overview — NEP 2020 Recommendations: "Competency Based Teaching"',
     'The verified CBSE SQAA Framework Overview lists Competency Based Teaching among the NEP 2020 recommendations the framework reflects. Whether SQAAF submission is an affiliation condition for this school is still unverified, so this is an aligned competency, not a compliance obligation.'),

    ('learning_design', 'experiential_learning', 'Experiential Learning',
     'Plans learning in which students do, make or investigate something, and draws the intended learning out of that experience.',
     11, 'cbse', 'aligned', 'CBSE SQAA Framework Overview — NEP 2020 Recommendations: "Experiential Learning"',
     'Listed in the verified SQAA Framework Overview. Also reflected in NCERT''s CPD guidance on arts-, sports- and toy-based pedagogies.'),

    ('learning_design', 'learning_environment', 'Classroom and Learning Environment',
     'Creates a safe, orderly and encouraging environment in which students are willing to share ideas and take intellectual risks.',
     12, 'npst', 'derived', null,
     'Derived from NPST indicator 1.1.2 ("creating a safe environment where people feel free to share their ideas and feelings"), broadened by the school into a full classroom-environment competency. Marked derived rather than aligned because NPST has no classroom-environment domain.'),

    ('assessment_feedback_dom', 'assessment_feedback', 'Assessment and Feedback',
     'Uses assessment of, for and as learning; interprets assessment data; and gives feedback that changes what students do next.',
     13, 'npst', 'aligned', 'NPST 2023, Standard 2, Domain 8 (SD 8.1, SD 8.2, SD 8.3)',
     'Adopted from NPST Domain 8, whose indicator text is used verbatim.'),

    ('inclusive_responsive', 'inclusive_education', 'Inclusive Education',
     'Identifies and meets the learning needs of students with disabilities and of gifted students, so that every learner can access the curriculum.',
     14, 'npst', 'aligned', 'NPST 2023, Standard 2, Domain 3 (SD 3.3)',
     'Adopted from NPST sub-domain 3.3. The verified CBSE SQAA Framework Overview also names Inclusive Practices as a domain and an NEP 2020 recommendation.'),

    ('inclusive_responsive', 'differentiated_instruction', 'Differentiated Instruction',
     'Adapts content, process and expectation so that students at different starting points all make progress.',
     15, 'npst', 'aligned', 'NPST 2023, Standard 2, Domain 6 (SD 6.2 Differentiated instruction/teaching)',
     'Adopted from NPST sub-domain 6.2.'),

    ('inclusive_responsive', 'student_wellbeing', 'Student Wellbeing',
     'Notices changes in a student''s wellbeing, responds appropriately, and refers on when the need exceeds the teacher''s role.',
     16, 'school', 'school_defined', null,
     'School-defined. Wellbeing is implied across NPST Domains 2 and 3 but has no domain of its own, and no verified CBSE instrument on teacher responsibility for wellbeing was located. Kept explicit because a K-12 school needs it named.'),

    ('digital_future_ready', 'digital_pedagogy', 'Digital Pedagogy',
     'Uses digital tools to make learning better rather than merely digital, and models responsible technology use.',
     17, 'cbse', 'derived', null,
     'Derived. The verified SQAA Framework Overview lists "Digital Literacy" among NEP 2020 recommendations; digital literacy and digital pedagogy are not the same thing, so this is marked derived rather than aligned.'),

    ('digital_future_ready', 'computational_thinking_ai', 'Computational Thinking and AI Readiness',
     'Builds computational thinking into subject teaching and prepares students for AI-influenced study and work, at a level appropriate to the stage.',
     18, 'cbse', 'aligned', 'CBSE SQAA Framework Overview — NEP 2020 Recommendations: "Mathematical and Computational Thinking"; "Introduction of contemporary subjects like AI, Data Science, Design Thinking"',
     'Both elements appear in the verified SQAA Framework Overview list.'),

    -- Standard 3 ---------------------------------------------------------
    ('reflection_growth', 'reflective_practice', 'Reflective Practice',
     'Examines own practice honestly against student learning, and changes it in response.',
     19, 'npst', 'aligned', 'NPST 2023, Standard 3, Domain 12',
     'Adopted from NPST Domain 12, whose indicator text is used verbatim.'),

    ('reflection_growth', 'professional_development', 'Professional Development',
     'Takes part in professional learning within and beyond the school, and applies it in practice.',
     20, 'npst', 'aligned', 'NPST 2023, Standard 3, Domain 13',
     'Adopted from NPST Domain 13. The NEP 2020 / NCERT 50-hour CPD expectation attaches here; it is recorded as recommended, not mandatory, in the regulatory register.'),

    ('reflection_growth', 'innovation', 'Innovation',
     'Tries a considered change to practice, evaluates whether it worked, and shares the result honestly including when it did not.',
     21, 'school', 'school_defined', null,
     'School-defined. No verified external framework names innovation as a teacher competency. Included because the school wants deliberate, evaluated experimentation rather than novelty for its own sake.'),

    ('leadership_contribution', 'mentoring', 'Mentoring',
     'Supports colleagues'' development through structured mentoring, including mentoring in reflective practice.',
     22, 'npst', 'aligned', 'NPST 2023, Standard 3, Domain 12 (indicator 12.5 "Mentors colleagues in reflective practice")',
     'Aligned to a specific NPST indicator; separated into its own competency because mentoring is expected of senior staff and not of every teacher.'),

    ('leadership_contribution', 'leadership', 'Leadership and School Contribution',
     'Sets goals and strategies that help the school function effectively, and contributes to a productive working culture.',
     23, 'npst', 'aligned', 'NPST 2023, Standard 1, Domain 2 (SD 2.5)',
     'Aligned to NPST sub-domain 2.5. Targets for this competency differ sharply by role and category — a newly appointed PRT is not held to a Head of Department''s leadership expectation.')

  ) as v(domain_key, key, name, description, sort, src, align, ref, rationale)
  join competency.domain d
    on d.school_id = p_school_id and d.key = v.domain_key
   and d.standard_id in (select id from competency.standard where framework_id = v_fw);

  return v_fw;
end;
$$;

comment on function competency.provision_school_framework(uuid) is
  'Seeds the school''s operating framework: 23 competencies across 3 standards '
  'and 9 domains, each carrying its actual source. 15 are NPST-aligned with '
  'clause references, 3 CBSE-aligned via the verified SQAA overview, 2 derived, '
  '3 school-defined.';
