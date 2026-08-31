-- ===========================================================================
-- 0037 — Stage 4 provisioning: verified SQAAF structure and CPD configuration
-- ===========================================================================
-- Everything below is transcribed from documents that have been read, not
-- recalled. Two sources:
--
--   * CBSE School Quality Assessment and Assurance Framework, April 2023
--     https://cbseacademic.nic.in/sqaa/doc/handbook.pdf — retrieved and read
--     2026-08-20. 7 domains, 48 sub-domains, 84 standards, 336 marks.
--   * CBSE CPD Guidelines 2025, Notification TRG-02/2025 — verified in 0030.
--
-- The CPD numbers appear here as ROWS, not as constants in application code.
-- `src/` contains no CPD hour figure anywhere; a test asserts that.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- SQAAF as a regulatory source and requirement
-- ---------------------------------------------------------------------------
insert into regulatory.source (
  authority_id, document_type, title, reference_number, version_label,
  issued_on, effective_from, source_url, verification_status,
  retrieved_at, verified_at, last_reviewed_on, review_due_on, notes
)
select a.id, 'framework',
  'CBSE School Quality Assessment and Assurance Framework (SQAAF)',
  'SQAA Framework April 2023', 'April 2023',
  date '2023-04-01', date '2023-04-01',
  'https://cbseacademic.nic.in/sqaa/doc/handbook.pdf',
  'verified',
  timestamptz '2026-08-20 23:10:00+05:30',
  timestamptz '2026-08-20 23:10:00+05:30',
  date '2026-08-20', date '2027-04-01',
  'Retrieved and read in full 2026-08-20 (300 pages). Establishes 7 domains, 48 sub-domains, '
  '84 standards, 336 maximum marks, a four-point benchmarking scale (Level I Inceptive through '
  'Level IV Dynamic Evolving) and domain weightages of 40% for Curriculum, Pedagogy and '
  'Assessment and 10% for each of the other six. Section 1.11.2, which would give the overall '
  'maturity-level bands, is an image and could not be read; the bands therefore remain '
  'unverified and are not recorded.'
from regulatory.authority a where a.key = 'cbse'
on conflict do nothing;

insert into regulatory.requirement (
  requirement_key, version, source_id, clause_reference, title, requirement_text,
  classification, verification_status, effective_from, evidence_required,
  applicability_note, last_reviewed_on, review_due_on, notes
)
select
  v.requirement_key, 1, s.id, v.clause_reference, v.title, v.requirement_text,
  v.classification::regulatory.requirement_classification,
  'verified'::regulatory.verification_status,
  date '2023-04-01', v.evidence_required, v.applicability_note,
  date '2026-08-20', date '2027-04-01', v.notes
from (values

  ('cbse.sqaaf.annual_self_assessment',
   'SQAA Framework April 2023, section 1.4 Eligibility for SQAA Process',
   'Annual SQAAF self-assessment on the SQAA Portal',
   'Schools affiliated to CBSE must undergo the process of SQAA and self-assess themselves on '
   'the SQAA Framework every year on SQAA Portal. Schools aspiring to be affiliated to CBSE may '
   'also undertake self-assessment against the framework in an offline mode while submitting an '
   'application for affiliation.',
   'A completed self-assessment against all applicable standards, with supporting evidence and '
   'records held by the school, submitted on the SQAA Portal.',
   'Applies to schools affiliated to CBSE. The framework states a guiding principle of no '
   'differential assessment criteria for government, government-aided and private schools, so '
   'applicability does not turn on the school''s funding status.',
   'This supersedes the Stage 1 position that SQAAF was `recommended` and that whether '
   'submission is an affiliation condition was unknown. The framework''s own eligibility '
   'section makes annual self-assessment mandatory for affiliated schools. The practice '
   'standards it contains remain guidance; the obligation to self-assess is what is mandatory.',
   'mandatory'),

  ('cbse.sqaaf.scoring_scheme',
   'SQAA Framework April 2023, sections 1.7 and 1.11.1',
   'SQAAF scoring: 84 standards, 336 marks, four performance levels',
   'Each standard is assessed against four performance levels indicating a development '
   'continuum: Level I Inceptive, Level II Transient, Level III Stable and Level IV Dynamic '
   'Evolving, scoring 1, 2, 3 and 4 respectively. There are 84 standards across seven domains '
   'giving 336 maximum marks. Curriculum, Pedagogy and Assessment carries 40% weightage as the '
   'core domain; the remaining six domains carry 10% each. Domain weightage score is the total '
   'obtained on all standards under the domain divided by the maximum available, multiplied by '
   'the weightage assigned to that domain. The number of standards is lower for non-residential '
   'schools and schools with no canteen, and the score is generated accordingly.',
   'A score against each standard, sub-domain and domain, recorded on the score card at '
   'Annexure G of the framework.',
   'Applies wherever the SQAAF self-assessment applies.',
   'The overall maturity-level bands (section 1.11.2) could not be read — that page is an image '
   '— so no band thresholds are recorded. Anything claiming a maturity level from a percentage '
   'would be invented.',
   'mandatory')

) as v(requirement_key, clause_reference, title, requirement_text, evidence_required,
       applicability_note, notes, classification)
join regulatory.source s on s.reference_number = 'SQAA Framework April 2023'
on conflict do nothing;

-- Same gate as CPD: the requirement is verified, the school's exposure is not.
insert into regulatory.school_requirement_status
  (school_id, requirement_id, applicability, is_enforced, determination_note)
select sc.id, r.id, 'potentially_applicable', false,
  'The requirement is verified from the CBSE SQAA Framework (April 2023). Applicability to this '
  'school depends on its CBSE affiliation, recorded as unverified in the School Regulatory '
  'Profile. Confirm the affiliation number and status to activate SQAAF compliance reporting.'
from core.school sc
cross join regulatory.requirement r
where r.requirement_key like 'cbse.sqaaf.%'
on conflict (school_id, requirement_id) do update
  set applicability = excluded.applicability,
      determination_note = excluded.determination_note;

-- ---------------------------------------------------------------------------
-- Provisioning
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Provisioning functions
-- ---------------------------------------------------------------------------
-- Called by the seed, not run inline: at migration time `core.school` is still
-- empty on a fresh reset, so a DO block looping over schools provisions nothing.
-- Migration 0030 shipped exactly that mistake and it went unnoticed because the
-- migration succeeded — it just did no work.
create function sqaaf.provision_framework(p_school_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_version  uuid;
  v_year     uuid;
  v_cpd_ver  uuid;
  v_cap      uuid;
  v_src      uuid;
  v_cat_core uuid;
  v_cat_know uuid;
  v_cat_grow uuid;
  v_admin    uuid;
begin

  select id into v_year from core.academic_year where school_id = p_school_id and is_current;
  -- `core.app_user` has no school_id: membership is expressed through role
  -- assignments. Prefer whoever holds regulatory.manage, since these rows record
  -- a regulatory determination and should be attributed to someone who may make one.
  select ra.user_id into v_admin
  from core.user_role_assignment ra
  join core.role_permission rp on rp.role_id = ra.role_id
  where ra.school_id = p_school_id and rp.permission_key = 'regulatory.manage'
  limit 1;

  if v_admin is null then
    select ra.user_id into v_admin from core.user_role_assignment ra
    where ra.school_id = p_school_id limit 1;
  end if;

  -- =========================================================================
  -- SQAAF framework structure
  -- =========================================================================
  insert into sqaaf.framework_version
    (school_id, key, edition_label, source_id, requirement_id,
     total_standards, total_marks, max_level_score, verification_status, effective_from, notes)
  select p_school_id, 'cbse.sqaaf.2023', 'CBSE SQAA Framework, April 2023',
    s.id, r.id, 84, 336, 4, 'verified', date '2023-04-01',
    'Transcribed from the framework document. Standard statements are quoted from Annexure G, '
    'the score card, cross-checked against the domain sections.'
  from regulatory.source s
  left join regulatory.requirement r on r.requirement_key = 'cbse.sqaaf.scoring_scheme'
  where s.reference_number = 'SQAA Framework April 2023'
  on conflict (school_id, key) do nothing
  returning id into v_version;

  if v_version is null then
    select id into v_version from sqaaf.framework_version
      where school_id = p_school_id and key = 'cbse.sqaaf.2023';
  end if;

  -- The four-point benchmarking scale, verified from the framework.
  insert into sqaaf.performance_level
    (school_id, version_id, level_number, roman_label, display_name, score, description) values
    (p_school_id, v_version, 1, 'I',   'Inceptive',        1, 'The practice is beginning; foundations are being put in place.'),
    (p_school_id, v_version, 2, 'II',  'Transient',        2, 'The practice exists but is not yet consistent across the school.'),
    (p_school_id, v_version, 3, 'III', 'Stable',           3, 'The practice is established and applied consistently.'),
    (p_school_id, v_version, 4, 'IV',  'Dynamic Evolving', 4, 'The practice is embedded, reviewed and continually improved.')
  on conflict (version_id, level_number) do nothing;

  -- Domains
    insert into sqaaf.domain (school_id, version_id, domain_number, name, weightage_percent, standard_count, max_score, platform_coverage, coverage_note) values
      (p_school_id, v_version, 1, 'Curriculum, Pedagogy and Assessment', 40, 26, 104, 'partial', 'Teacher practice, assessment design and pedagogy evidence come from this platform. Curriculum policy, teaching days, teacher-student ratio, facilities and whole-school programmes do not.'),
      (p_school_id, v_version, 2, 'Infrastructure – Adequacy, Functionality, Aesthetics and Safety', 10, 20, 80, 'none', 'Infrastructure evidence — buildings, laboratories, safety, sanitation, hostels, transport — is not held by a teacher-growth platform and must be gathered elsewhere.'),
      (p_school_id, v_version, 3, 'Human Resources', 10, 10, 40, 'primary', 'This platform is the primary evidence source for staff appraisal, capacity building and CPD. Recruitment, salary and non-teaching staff records are only partly covered.'),
      (p_school_id, v_version, 4, 'Inclusive Practices', 10, 7, 28, 'partial', 'Inclusive pedagogy and assessment practice come from competency evidence. Physical accessibility, transport and facilities do not.'),
      (p_school_id, v_version, 5, 'Management and Governance', 10, 10, 40, 'none', 'Governance, financial administration, admissions and record systems are outside this platform. Nothing here should be read as evidencing them.'),
      (p_school_id, v_version, 6, 'Leadership', 10, 5, 20, 'partial', 'Leadership development of teachers is evidenced here through development plans and CPD. Wider leadership practice is not.'),
      (p_school_id, v_version, 7, 'Beneficiary Satisfaction', 10, 6, 24, 'none', 'Beneficiary satisfaction surveys of students, parents, community and management are not collected by this platform.');
  
  -- Sub-domains
    insert into sqaaf.sub_domain (school_id, domain_id, code, name, sort_order)
    select p_school_id, d.id, x.code, x.name, x.ord
    from (values
      ('1.1', 'Curriculum Planning', 0),
      ('1.2', 'Teaching Learning Processes', 1),
      ('1.3', 'Student Enrichment, Skill based/Vocational Education Programmes embedded in the Annual Curriculum and Pedagogical Plan', 2),
      ('1.4', 'Mainstreaming Physical Education and Sports', 3),
      ('1.5', 'Values and Ethos', 4),
      ('1.6', 'Student Performance, Assessment of Learning Outcomes and Feedback', 5),
      ('1.7', 'Early Childhood Care and Education and Foundational Literacy and Numeracy', 6),
      ('2.1', 'Classrooms, Library, Laboratories, Computer Labs, ICT Facilities and rooms for different activities', 7),
      ('2.2', 'Principal’s Office, Staff room and Administrative spaces', 8),
      ('2.3', 'Infirmary (Medical room) and Health Management facilities', 9),
      ('2.4', 'Water, Sanitation Facilities and Waste Management', 10),
      ('2.5', 'Furniture', 11),
      ('2.6', 'Lighting and Ventilation', 12),
      ('2.7', 'Eco-friendly Orientation and integration of Organic Living in Curriculum', 13),
      ('2.8', 'Safety Provisions', 14),
      ('2.9', 'Playground and Sports Facilities', 15),
      ('2.10', 'Hostels (Only for Residential Schools and separate for Boys and Girls)', 16),
      ('2.11', 'School Canteen (For Day Schools)', 17),
      ('2.12', 'Transport and Escort Facility', 18),
      ('3.1', 'School Staff – teaching and non-teaching', 19),
      ('3.2', 'Parents', 20),
      ('3.3', 'Students', 21),
      ('3.4', 'Alumni', 22),
      ('3.5', 'Community', 23),
      ('4.1', 'Barrier free Environment', 24),
      ('4.2', 'Games, Sports and other Recreational Facilities', 25),
      ('4.3', 'Transportation Facilities', 26),
      ('4.4', 'Overcoming Attitudinal Barriers', 27),
      ('4.5', 'Self Special Equity Projects', 28),
      ('5.1', 'Vision and Mission Statement', 29),
      ('5.2', 'Institutional Planning', 30),
      ('5.3', 'Effective Coordination', 31),
      ('5.4', 'Resource Management', 32),
      ('5.5', 'Relationship Management', 33),
      ('5.6', 'Activity Management', 34),
      ('5.7', 'Data and Record Maintenance', 35),
      ('5.8', 'Oral/Virtual/Online and Written Communication', 36),
      ('5.9', 'Financial and Fee Administration', 37),
      ('5.10', 'Admission Process', 38),
      ('6.1', 'Pedagogical Leadership', 39),
      ('6.2', 'Collaborative Leadership', 40),
      ('6.3', 'Systems for Ongoing Quality and Change Management', 41),
      ('7.1', 'Satisfaction of Students', 42),
      ('7.2', 'Satisfaction of Staff (Teaching and Non-Teaching)', 43),
      ('7.3', 'Satisfaction of Principal', 44),
      ('7.4', 'Satisfaction of Parents and Alumni', 45),
      ('7.5', 'Satisfaction of Community', 46),
      ('7.6', 'Satisfaction of Management', 47)
    ) as x(code, name, ord)
    join sqaaf.domain d on d.version_id = v_version and d.domain_number = split_part(x.code, '.', 1)::int;
  
  -- Standards
    insert into sqaaf.standard (school_id, sub_domain_id, code, statement, sort_order, applies_when, platform_relevant, relevance_note)
    select p_school_id, sd.id, x.code, x.statement, x.ord, x.applies_when, x.relevant, x.note
    from (values
      ('1.1.1', 'Principal and teachers are familiar with the spirit and content of NCF and recommendations of NEP', 0, 'always', true, 'CPD records on NCF/NEP topics, and the Core Values and Ethics competency assessments.'),
      ('1.1.2', 'The School Leaders and Teachers are familiar with the curriculum documents and support material brought out by CBSE', 1, 'always', true, 'CPD records on CBSE curriculum documents and support material.'),
      ('1.1.3', 'The School Integrated Annual Curriculum and Pedagogical Plan (ACPP) reflects the recommendations of the Board.', 2, 'always', false, null),
      ('1.1.4', 'Curriculum develops skills and abilities which prepare students for lifelong learning; fosters global citizenship leading to the attainment of Sustainable Development Goals (SDGs).', 3, 'always', false, null),
      ('1.2.1', 'School follows an optimum number of teaching days and teaching hours as defined by the Appropriate Authority/State/UT Government.', 4, 'always', false, null),
      ('1.2.2', 'The school follows Teacher – Student Ratio as per norms.', 5, 'always', false, null),
      ('1.2.3', 'Teachers are empowered to adopt varied teaching learning approaches reflecting their understanding of the needs of the diverse students and create a conducive environment for joyful learning.', 6, 'always', true, 'Classroom observation records and the Teaching-Learning Process competency assessments.'),
      ('1.2.4', 'The School uses NCERT defined Learning Outcomes (LOs) for all classes as success criteria.', 7, 'always', true, 'Assessment-practice competency evidence showing Learning Outcomes used as success criteria.'),
      ('1.3.1', 'The school provides ample opportunities for Art Education.', 8, 'always', false, null),
      ('1.3.2', 'The School Vocational Education Programme develops entrepreneurial and employability skills and provides opportunities for internship and apprenticeship at local industry.', 9, 'always', false, null),
      ('1.3.3', 'The school provides facilities to the students to participate in activities which enhance Literary and Reading Skills, Creative and Critical Thinking Skills; Scientific Skills; Communication Skills, Leadership Skills, and ensures mandatory Digital, Financial, Citizenship, Information and Media, Environmental and Health Literacy.', 10, 'always', false, null),
      ('1.3.4', 'The school has a Life Skills Development Programme focusing on Thinking, Social and Emotional skills.', 11, 'always', false, null),
      ('1.4.1', 'School has a Policy & a strong leadership for promoting Healthy Physical Education in Students.', 12, 'always', false, null),
      ('1.4.2', 'Teaching and learning of PE, Sports, Yoga and other Fitness Activities is rich and engaging.', 13, 'always', false, null),
      ('1.4.3', 'Inclusive PE and Sport is an important aspect of school ambience', 14, 'always', false, null),
      ('1.5.1', 'The school nurtures values through a climate of care, compassion, and respect; welcomes diversity and creates a culture of pride for the school amongst the stakeholders.', 15, 'always', false, null),
      ('1.5.2', 'The school inculcates pride towards Indian heritage and civilization and encourages students to be conscious of their duties towards society, living beings and nature.', 16, 'always', false, null),
      ('1.6.1', 'The school ensures 75% attendance of its students and reduces drop outs.', 17, 'always', false, null),
      ('1.6.2', 'Teachers use multiple modes of assessment to assess the performance of the students - Assessment of Learning.', 18, 'always', true, 'Competency-Based Assessment evidence: assessment designs and rubrics submitted by teachers.'),
      ('1.6.3', 'The school has defined procedures and criteria to regularly assess the students'' performance; adopts varied assessment tools and techniques to assess the performance of the students – Assessment for Learning and As Learning.', 19, 'always', true, 'Assessment design evidence and the Competency-Based Assessment verified levels.'),
      ('1.6.4', 'Assessment of skills and competencies (visual and performing arts, life skills, values and ethos, vocational skills, health and physical education, scientific skills, computational skills, literacy skills, digital skills, reading skills and other skills) is done on the basis of Learning Outcomes and the criteria given in the Holistic Progress Card (HPC).', 20, 'always', true, 'Evidence linked to skills and competencies assessment, including rubrics and student work samples.'),
      ('1.6.5', 'The school uses the results of NAS/SLAS/Third Party Assessment/CBSE SAFAL assessment to ensure all students progress on their developmental continuum.', 21, 'always', false, null),
      ('1.7.1', 'The school organises content and teaching learning material based on defined Learning Outcomes, principles and guidelines given in NCF for Foundational Stage along with consideration for the local context.', 22, 'always', false, null),
      ('1.7.2', 'The school adopts an inclusive approach to pedagogy that is play based, engaging, contextual and experiential.', 23, 'always', true, 'Foundational-stage teachers inclusive pedagogy evidence and competency assessments.'),
      ('1.7.3', 'The schools designs and conducts age appropriate, regular and ongoing assessments that check for the achievement of the defined Learning Outcomes.', 24, 'always', true, 'Assessment design evidence from foundational-stage teachers.'),
      ('1.7.4', 'The school has created a suitable ecosystem for attaining Foundational Literacy and Numeracy (FLN) targets for all children.', 25, 'always', false, null),
      ('2.1.1', 'The school has sufficient classrooms conducive to learning.', 26, 'always', false, null),
      ('2.1.2', 'The School Library facilitates effective delivery/implementation of its educational programmes.', 27, 'always', false, null),
      ('2.1.3', 'Laboratories are available to support learning activities.', 28, 'always', false, null),
      ('2.1.4', 'Computer and other ICT facilities are available to support different administrative and educational activities in the school.', 29, 'always', false, null),
      ('2.1.5', 'The school has adequate number of activity rooms for art, sculpture, music, dance, theatre, technology.', 30, 'always', false, null),
      ('2.2.1', 'The school has sufficient space for Principal, staff and administration as per requirements.', 31, 'always', false, null),
      ('2.3.1', 'The school has effective preventive health care and health management facilities.', 32, 'always', false, null),
      ('2.4.1', 'The school provides safe drinking water; adequate sanitation facilities and follows effective waste management practices.', 33, 'always', false, null),
      ('2.5.1', 'The school has adequate, safe, comfortable, age appropriate and aesthetically designed furniture.', 34, 'always', false, null),
      ('2.6.1', 'The school building is designed for natural lighting and ventilation in keeping with the best international norms.', 35, 'always', false, null),
      ('2.7.1', 'The school follows eco-friendly/green practices to promote and inculcate organic lifestyle among students.', 36, 'always', false, null),
      ('2.8.1', 'The school ensures safety measures as per statutory requirements and as defined by the Board from time to time; effective measures are also in place for Disaster Management.', 37, 'always', false, null),
      ('2.9.1', 'Indoor and outdoor sport facilities are available and support divyang.', 38, 'always', false, null),
      ('2.10.1', 'School has sufficient rooms/dormitories, recreational spaces, washrooms, drinking areas, residence of warden, residence of pastoral care staff, visitors’ room, laundry room, storage room for food items (perishable and non-perishable) and additional bedding, and common room.', 39, 'residential_only', false, null),
      ('2.10.2', 'School provides for a separate clean and hygienic Kitchen and Dining Area.', 40, 'residential_only', false, null),
      ('2.10.3', 'The school fosters a culture of cleanliness and hygiene.', 41, 'residential_only', false, null),
      ('2.10.4', 'School provides for safety and security of students.', 42, 'residential_only', false, null),
      ('2.10.5', 'Students’ physical, mental, socio-emotional and intellectual well-being is taken care of by intensive pastoral care programmes.', 43, 'residential_only', false, null),
      ('2.11.1', 'The school has a well-managed, hygienic and safe canteen.', 44, 'day_school_canteen_only', false, null),
      ('2.12.1', 'School provides optional, safe and reliable transportation facility to accessible and remote areas.', 45, 'always', false, null),
      ('3.1.1', 'The school recruits qualified and competent staff (teaching and non-teaching) that is sufficient in number to support fulfilment of school mission and objectives.', 46, 'always', true, 'Qualification verification status held on each teacher profile.'),
      ('3.1.2', 'The School Induction Programme lays strong foundations for productive relationship and high standards of performance.', 47, 'always', true, 'Induction CPD records for newly joined staff.'),
      ('3.1.3', 'The school staff appraisal is a supportive and developmental process to ensure positive outcomes for students.', 48, 'always', true, 'The appraisal process itself: assessments, observations, development plans and their rationales.'),
      ('3.1.4', 'The school is committed to achieving student learning outcomes by building the capacity of teachers through collaborative, reflective and experiential processes.', 49, 'always', true, 'The CPD ledger. SQAAFs own evidence list for this standard names an "Annual Training Calendar for each teacher-50 hours".'),
      ('3.1.5', 'The school decides the salary and other allowances as per state norms/central norms.', 50, 'always', false, null),
      ('3.1.6', 'The school creates a positive culture of engagement that strengthens employee-leader relationships.', 51, 'always', false, null),
      ('3.2.1', 'Parents are equal and vital partners in education.', 52, 'always', false, null),
      ('3.3.1', 'Students engagement as fundamental to schooling outcomes.', 53, 'always', false, null),
      ('3.4.1', 'Alumni act as Stakeholders in Quality Education and School Development.', 54, 'always', false, null),
      ('3.5.1', 'The school collaborates with community for student achievement and wellbeing and facilitates volunteerism.', 55, 'always', false, null),
      ('4.1.1', 'The school provides equitable, inclusive and accessible physical environment in which divyang and students from all socio economic backgrounds learn and thrive alongside their peers.', 56, 'always', false, null),
      ('4.1.2', 'The school addresses equity and inclusivity by providing accessible curriculum to divyang and students from all socio economic backgrounds.', 57, 'always', true, 'Inclusive Practice evidence submitted against the inclusion competencies.'),
      ('4.1.3', 'The school adopts accessible and inclusive pedagogical and assessment practices to accommodate divyang and students from diverse socio economic backgrounds.', 58, 'always', true, 'Inclusive pedagogy and assessment competency assessments and their evidence.'),
      ('4.2.1', 'Indoor and outdoor games, sports and other recreational facilities are provided to divyang and students belonging to different socio economic backgrounds to learn and thrive with their peers.', 59, 'always', false, null),
      ('4.3.1', 'The school provides safe transportation facilities to divyang.', 60, 'always', false, null),
      ('4.4.1', 'The school fosters a culture of compassion, care and empathy towards all.', 61, 'always', true, 'Core Values and Ethics competency evidence on care, compassion and empathy.'),
      ('4.5.1', 'Self Defence Training instils a sense of confidence, promotes physical fitness and enhances emotional wellbeing among the girls.', 62, 'always', false, null),
      ('5.1.1', 'The School Management and Governance System is driven by Standard Operating Procedures (SOPs) made in alignment with its policies, vision and mission.', 63, 'always', false, null),
      ('5.2.1', 'The School Institutional Plan is based on the needs of the students and community and the principle of optimum utilization of resources available in the school and community.', 64, 'always', false, null),
      ('5.3.1', 'The School Management and Governance System establishes effective co-ordination within the school and with outside community to achieve the desired goals.', 65, 'always', false, null),
      ('5.4.1', 'The School Resource Management System facilitates the optimal use of resources and creates a positive and supportive environment for the growth of the school.', 66, 'always', false, null),
      ('5.5.1', 'The School Relationship Management System nurtures and sustains meaningful relationships with its stakeholders to foster increased student achievement.', 67, 'always', false, null),
      ('5.6.1', 'The School Activity Management System accelerates and manages the workflow of all the activities of the school.', 68, 'always', false, null),
      ('5.7.1', 'The School Data and Record Maintenance System assists in making informed decisions for increased efficiency and productivity.', 69, 'always', false, null),
      ('5.8.1', 'The School Communication System facilitates the school staff to stay connected with its stakeholders and community anytime, anywhere.', 70, 'always', false, null),
      ('5.9.1', 'The School Financial and Fee Administration System is based on rationality, admissibility and allocability.', 71, 'always', false, null),
      ('5.10.1', 'The School Admission Policy is in consonance with Board’s and RTE Act norms and is inclusive of bringing OoSC (Out of School Children) and children from deprived communities in the school system.', 72, 'always', false, null),
      ('6.1.1', 'The school leader builds an intellectual and professional capital for teachers to set the direction for school improvement and student learning.', 73, 'always', true, 'Development plans, CPD approvals and the professional capital built through them.'),
      ('6.2.1', 'Collaborative leadership engages shared intelligence to co-create learning institutions.', 74, 'always', true, 'Mentoring records and collaborative professional development evidence.'),
      ('6.3.1', 'School Leader fosters a climate that supports achievement of learning outcomes.', 75, 'always', false, null),
      ('6.3.2', 'The School Leader demonstrates responsibility and accountability in building a culture of equitability, inclusivity and systems thinking in school.', 76, 'always', false, null),
      ('6.3.3', 'The school leader promotes innovation by introducing creative methods and techniques that equip students and the institution with 21st century skills.', 77, 'always', false, null),
      ('7.1.1', 'The school tracks and assesses student satisfaction on the learning experiences provided to them at all stages of engagement, inside and outside the classroom.', 78, 'always', false, null),
      ('7.2.1', 'The school tracks and assesses staff (teaching and non-teaching) satisfaction on the working conditions, safety, recognition, opportunities for creativity, growth and sense of belongingness at all stages of engagement.', 79, 'always', false, null),
      ('7.3.1', 'Intrinsic and extrinsic factors influence the job satisfaction experienced by the principal.', 80, 'always', false, null),
      ('7.4.1', 'The school maintains a healthy relationship with parents and alumni and assesses their satisfaction through connection, engagement and interaction.', 81, 'always', false, null),
      ('7.5.1', 'The school ensures the satisfaction of the community by establishing a culture of meaningful and sustainable community engagement in school programmes.', 82, 'always', false, null),
      ('7.6.1', 'The Management Satisfaction is assessed through stakeholder’s attitude and behaviour towards the institution.', 83, 'always', false, null)
    ) as x(code, statement, ord, applies_when, relevant, note)
    join sqaaf.sub_domain sd on sd.school_id = p_school_id
     and sd.code = substring(x.code from '^[0-9]+\.[0-9]+')
    join sqaaf.domain d on d.id = sd.domain_id and d.version_id = v_version;
  -- =========================================================================
  -- CPD configuration
  -- =========================================================================
  -- Categories: CBSE's three CPD domains, which carry the NPST Standard names.
  insert into compliance.cpd_category
    (school_id, key, display_name, description, npst_standard_key, sort_order) values
    (p_school_id, 'core_values_ethics', 'Core Values and Ethics',
     'CBSE CPD domain 1. Annexure-I topics.', 'core_values_and_ethics', 1),
    (p_school_id, 'knowledge_practice', 'Knowledge and Practice',
     'CBSE CPD domain 2. Annexure-II topics, including subject-specific offline training.', 'knowledge_and_practice', 2),
    (p_school_id, 'professional_growth', 'Professional Growth and Development',
     'CBSE CPD domain 3. Annexure-III topics, plus the capped academic-task equivalences.', 'professional_growth_and_development', 3)
  on conflict (school_id, key) do nothing;

  select id into v_cat_core from compliance.cpd_category where school_id = p_school_id and key = 'core_values_ethics';
  select id into v_cat_know from compliance.cpd_category where school_id = p_school_id and key = 'knowledge_practice';
  select id into v_cat_grow from compliance.cpd_category where school_id = p_school_id and key = 'professional_growth';

  -- Source types. `counts_toward_requirement` is TRUE only where the CBSE
  -- notification actually names the source. DIKSHA, SWAYAM and the rest are
  -- seeded as not counting: the notification does not mention them, and
  -- deciding that they count is a compliance judgement for the school to make
  -- and record, not a default for us to ship.
  insert into compliance.cpd_source_type
    (school_id, key, display_name, description, source_class, counts_toward_requirement,
     recognition, recognition_alignment, external_reference,
     classified_by, classified_at, classification_note) values

    (p_school_id, 'cbse', 'CBSE',
     'Capacity Building Programmes and training delivered by CBSE.',
     'board_or_government', true, 'cbse', 'aligned',
     'Notification TRG-02/2025, opening paragraph',
     v_admin, now(),
     'Named in the CBSE CPD Guidelines 2025 as a source of the 25 Board-side hours.'),

    (p_school_id, 'cbse_coe', 'CBSE Centre of Excellence',
     'Training delivered through a CBSE Centre of Excellence.',
     'board_or_government', true, 'cbse', 'aligned',
     'Notification TRG-02/2025, opening paragraph',
     v_admin, now(),
     'A CBSE delivery channel, counted on the Board side of the 25 + 25 split.'),

    (p_school_id, 'government_training', 'Government training',
     'Government Regional Training Institutes and other government-delivered training.',
     'board_or_government', true, 'cbse', 'aligned',
     'Notification TRG-02/2025, opening paragraph',
     v_admin, now(),
     'The notification names Government Regional Training Institutes alongside CBSE for the 25 Board-side hours.'),

    (p_school_id, 'school_inhouse', 'School / in-house',
     'Professional development organised by the school for its own staff.',
     'school_or_complex', true, 'cbse', 'aligned',
     'Notification TRG-02/2025, opening paragraph',
     v_admin, now(),
     'The notification assigns 25 hours to the school through in-house programmes.'),

    (p_school_id, 'school_complex', 'School Complex',
     'Development organised with a School Complex or a group of schools.',
     'school_or_complex', true, 'cbse', 'aligned',
     'Notification TRG-02/2025, opening paragraph',
     v_admin, now(),
     'The notification names School complexes alongside in-house programmes for the school-side 25 hours.'),

    (p_school_id, 'diksha', 'DIKSHA',
     'Courses on the DIKSHA platform, including NISHTHA.',
     'board_or_government', false, 'other_framework', 'derived', null,
     null, null, null),

    (p_school_id, 'swayam', 'SWAYAM',
     'Courses on the SWAYAM platform.',
     'board_or_government', false, 'other_framework', 'derived', null,
     null, null, null),

    (p_school_id, 'recognised_institution', 'Recognised institution',
     'A university, NCERT/SCERT body or other recognised institution.',
     'board_or_government', false, 'other_framework', 'derived', null,
     null, null, null),

    (p_school_id, 'other_approved', 'Other approved activity or provider',
     'Any other provider or activity the school has approved.',
     'school_or_complex', false, 'school', 'school_defined', null,
     null, null, null)
  on conflict (school_id, key) do nothing;

  -- The requirement version. Mandatory, so the schema requires it to cite both
  -- a source and a regulatory requirement.
  insert into compliance.cpd_requirement_version
    (school_id, key, version, authority_id, source_id, requirement_id, clause_reference,
     title, total_hours, classification, verification_status, applicability,
     applicability_note, effective_from, created_by, notes)
  select p_school_id, 'cbse.cpd', 1, a.id, s.id, r.id,
    'Notification TRG-02/2025, opening paragraph and scheme table',
    'CBSE CPD requirement, 2025 scheme', 50,
    'mandatory', 'verified', 'potentially_applicable',
    'Verified from the CBSE notification. Whether it binds this school depends on its CBSE '
    'affiliation, which is recorded as unverified in the School Regulatory Profile.',
    date '2025-04-01', v_admin,
    'Total and allocation transcribed from the notification. Any future revision is a new '
    'version row with its own effective period, never an edit to this one.'
  from regulatory.authority a
  join regulatory.source s on s.reference_number like '%TRG-02/2025%'
  join regulatory.requirement r on r.requirement_key = 'cbse.cpd.annual_hours'
  where a.key = 'cbse'
  on conflict (school_id, key, version) do nothing;

  select id into v_cpd_ver from compliance.cpd_requirement_version
    where school_id = p_school_id and key = 'cbse.cpd' and version = 1;

  -- The allocation matrix. 6 rows, summing to 50 — the deferred constraint
  -- trigger checks that at commit.
  insert into compliance.cpd_requirement_allocation
    (school_id, version_id, category_id, source_class, required_hours, note) values
    (p_school_id, v_cpd_ver, v_cat_core, 'board_or_government',  6, '6 hours by CBSE, offline, on Annexure-I topics.'),
    (p_school_id, v_cpd_ver, v_cat_core, 'school_or_complex',    6, '6 hours by the school, offline or online.'),
    (p_school_id, v_cpd_ver, v_cat_know, 'board_or_government', 16, '12 hours offline subject-specific from Annexure-II, plus 4 on other Annexure-II topics.'),
    (p_school_id, v_cpd_ver, v_cat_know, 'school_or_complex',    8, '6 hours offline plus 2 offline or online, by the school or a group of schools.'),
    (p_school_id, v_cpd_ver, v_cat_grow, 'board_or_government',  3, '3 hours by CBSE, offline or online, from Annexure-III.'),
    (p_school_id, v_cpd_ver, v_cat_grow, 'school_or_complex',   11, '11 hours by the school, within which the academic-task equivalences are capped.')
  on conflict (version_id, category_id, source_class) do nothing;

  -- Bind the current year to this version.
  insert into compliance.cpd_year_requirement
    (school_id, academic_year_id, version_id, bound_by, rationale)
  select p_school_id, v_year, v_cpd_ver, v_admin,
    'The 2025 scheme is in force for this academic year; its effective period covers it.'
  where v_year is not null
  on conflict (school_id, academic_year_id) do nothing;

  -- The shared 11-hour ceiling on academic tasks.
  insert into compliance.cpd_rule_cap_group
    (school_id, version_id, key, display_name, cap_hours, cap_basis)
  values (p_school_id, v_cpd_ver, 'academic_tasks', 'Academic and developmental tasks', 11,
    'Notification TRG-02/2025: "Only 11 hours will be considered. Schools will keep records for verification."')
  on conflict (version_id, key) do nothing;

  select id into v_cap from compliance.cpd_rule_cap_group
    where version_id = v_cpd_ver and key = 'academic_tasks';

  select s.id into v_src from regulatory.source s where s.reference_number like '%TRG-02/2025%';

  -- Activity rules. Every hour credit is transcribed from the notification and
  -- cites its clause; the schema refuses `verified` without one.
  insert into compliance.cpd_activity_rule
    (school_id, version_id, key, permitted_activity, hour_credit, cap_group_id,
     category_id, source_class, required_evidence, approval_permission,
     regulatory_source_id, clause_reference, verification_status)
  select p_school_id, v_cpd_ver, x.key, x.activity, x.hours, v_cap,
         v_cat_grow, 'school_or_complex', x.evidence, 'cpd.approve',
         v_src, 'Notification TRG-02/2025, Professional Growth and Development — academically inclined / developmental tasks',
         'verified'
  from (values
    ('board_exam_evaluation',
     'Board Examination evaluation duty as Examiner, Additional Head Examiner or Head Examiner, for the entire duty assigned by the Regional Office',
     6, 'Appointment letter and duty completion certificate from the Regional Office.'),
    ('sqp_item_development',
     'SQP, marking scheme, item development, question bank, CBP curriculum review, e-content, resource materials or practical examiner work assigned by CBSE',
     3, 'CBSE assignment letter and evidence of the work submitted.'),
    ('research_mentoring_publication',
     'Classroom research projects, mentoring or guiding fellow teachers, reflective journals, blogs on teaching experience, participation in online educational discussions, or paper publication',
     2, 'The artefact itself — journal, blog, published paper or mentoring record — with dates.'),
    ('resource_person_cbp',
     'Engaged as a Resource Person conducting CBSE Capacity Building Programmes',
     3, 'CBSE Resource Person engagement letter and session record.'),
    ('ddpm_evidya_eklavya',
     'Viewing the DD PM e-Vidya Channel CBSE 15, or online sessions such as Eklavya 3030 STEM Education',
     3, 'Viewing record or participation confirmation, with dates and topics.'),
    ('integrating_technology',
     'Integrating technology into teaching',
     2, 'Lesson plans or e-content showing the technology integrated, plus a reflective note.'),
    ('cbse_national_conferences',
     'Presentations at, or participation in, CBSE National Conferences',
     3, 'Conference registration or presentation certificate.')
  ) as x(key, activity, hours, evidence)
  on conflict (version_id, key) do nothing;

  -- Pacing threshold. School policy, and labelled as such.
  insert into compliance.risk_policy (school_id, academic_year_id)
  values (p_school_id, null)
  on conflict (school_id, academic_year_id) do nothing;

  -- The SQAAF submission window is deliberately left undated: the framework
  -- does not state one, and inventing a date is exactly what Stage 4 forbids.
  insert into sqaaf.submission_window
    (school_id, academic_year_id, version_id, verification_status, source_note, created_by)
  select p_school_id, v_year, v_version, 'requires_verification',
    'The SQAA Framework requires annual self-assessment but does not state the window. '
    'Confirm the current dates from the SQAA Portal before relying on any deadline shown here.',
    v_admin
  where v_year is not null
  on conflict (school_id, academic_year_id) do nothing;
  -- Applicability, set here rather than at migration time: the school does not
  -- exist yet when migrations run, so the blanket `requires_verification` the
  -- seed writes for every requirement would otherwise win and overwrite this.
  --
  -- All three SQAAF requirements share one gate. The framework is verified; what
  -- is undetermined is whether this school is affiliated to CBSE at all.
  update regulatory.school_requirement_status srs
     set applicability = 'potentially_applicable',
         determination_note =
           'The requirement is verified from the CBSE SQAA Framework (April 2023). Applicability '
           'to this school depends on its CBSE affiliation, recorded as unverified in the School '
           'Regulatory Profile. Confirm the affiliation number and status to activate SQAAF '
           'compliance reporting.'
    from regulatory.requirement r
   where r.id = srs.requirement_id
     and srs.school_id = p_school_id
     and r.requirement_key like 'cbse.sqaaf.%';

  return (select count(*)::integer from sqaaf.standard where school_id = p_school_id);
end;
$fn$;

comment on function sqaaf.provision_framework is
  'Loads the verified CBSE SQAAF April 2023 structure and the CPD configuration for one school. Idempotent.';

-- Any school that already exists when this migration runs.
do $$
declare s record;
begin
  for s in select id from core.school loop
    perform sqaaf.provision_framework(s.id);
  end loop;
end $$;
