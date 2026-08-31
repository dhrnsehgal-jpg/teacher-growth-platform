-- ===========================================================================
-- 0025 — Stage 3 provisioning: priority bands, CPD catalogue, assessment cycle
-- ===========================================================================

-- Band calibration. The magnitude factor is worth up to 30 points, and a gap of
-- 2 earns only 15 of them. Compounding factors alone (mandatory + strategic +
-- KPI + observation + weak evidence) reach 80, so if Critical began at 80 a
-- two-level gap would be indistinguishable from a four-level one. Critical is
-- therefore set at 85, which requires a gap of 3 or more ON TOP of compounding
-- factors. See docs/GAP_ENGINE.md.
create or replace function growth.provision_priority_bands(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into growth.priority_band (school_id, key, label, min_score, max_score, sort_order, description)
  values
    (p_school_id, 'no_gap',   'No Gap',   0,  0,  1, 'Verified at or above the expected level.'),
    (p_school_id, 'low',      'Low',      1,  29, 2, 'A gap exists but little else compounds it.'),
    (p_school_id, 'medium',   'Medium',   30, 54, 3, 'A material gap, or a small gap on an important competency.'),
    (p_school_id, 'high',     'High',     55, 84, 4, 'A significant gap on a competency that matters to the role or the school.'),
    (p_school_id, 'critical', 'Critical', 85, 100, 5, 'A LARGE gap (3+ levels) on a competency that is also mandatory or strategic.')
  on conflict (school_id, key) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- The competency the demo scenario turns on
-- ---------------------------------------------------------------------------
-- Competency-Based Assessment is distinct from Competency-Based Education:
-- one is how you teach, the other is how you find out whether it worked. The
-- school separates them because a teacher can redesign their teaching and still
-- assess by recall.

create or replace function competency.provision_stage3_competency(p_school_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fw uuid; v_domain uuid; v_comp uuid; v_scale uuid; v_sqaaf uuid;
begin
  select id into v_fw from competency.framework
   where school_id = p_school_id and key = 'school_professional_practice' and version = 1;
  select d.id into v_domain from competency.domain d
   join competency.standard s on s.id = d.standard_id
   where s.framework_id = v_fw and d.key = 'assessment_feedback_dom';
  select id into v_scale from competency.proficiency_scale
   where framework_id = v_fw and key = 'school_five_point';
  select id into v_sqaaf from regulatory.source
   where source_url = 'https://cbseacademic.nic.in/sqaa/doc/TabC-SQAA%20Framework%20Overview.pdf';

  insert into competency.competency (
    school_id, domain_id, key, name, description, sort_order,
    source_framework, source_alignment, external_reference, regulatory_source_id, rationale
  ) values (
    p_school_id, v_domain, 'competency_based_assessment', 'Competency-Based Assessment',
    'Designs and uses assessments that measure demonstrable competencies in unfamiliar '
    'contexts, rather than recall of taught content, and reports what a student can now do.',
    24, 'cbse', 'aligned',
    'CBSE SQAA Framework Overview — NEP 2020 Recommendations: "Competency Based Teaching"; '
    '"Transforming assessment for student development"',
    v_sqaaf,
    'Separated from Competency-Based Education because the two fail independently: a teacher '
    'can redesign their teaching around competencies and still assess by recall, which leaves '
    'them unable to show what students can actually do.'
  )
  on conflict (domain_id, key) do nothing
  returning id into v_comp;

  if v_comp is null then
    select id into v_comp from competency.competency
     where school_id = p_school_id and key = 'competency_based_assessment';
    return v_comp;
  end if;

  insert into competency.indicator (
    school_id, competency_id, key, statement, sort_order,
    source_framework, source_alignment, external_reference
  ) values
    (p_school_id, v_comp, 'i1',
     'Writes assessment tasks that require students to apply learning in a context they have not been taught in.',
     1, 'school', 'school_defined', null),
    (p_school_id, v_comp, 'i2',
     'Uses a criteria-based rubric describing what the competency looks like, rather than marks alone.',
     2, 'school', 'school_defined', null),
    (p_school_id, v_comp, 'i3',
     'Uses assessment data to modify lesson plans and pedagogy adequately to suit specific learning needs of students.',
     3, 'npst', 'aligned', 'NPST 2023, indicator 8.2.2'),
    (p_school_id, v_comp, 'i4',
     'Reports student progress in terms of competencies demonstrated, not only marks obtained.',
     4, 'school', 'school_defined', null)
  on conflict do nothing;

  insert into competency.proficiency_descriptor (school_id, competency_id, proficiency_level_id, descriptor)
  select p_school_id, v_comp, pl.id, v.descriptor
  from (values
    ('foundation',  'Uses assessments provided by the department; grades by marks.'),
    ('developing',  'Writes some application questions; rubrics exist but describe marks rather than competencies.'),
    ('proficient',  'Designs assessments that test application in unfamiliar contexts and uses criteria-based rubrics.'),
    ('advanced',    'Assessment design consistently evidences competencies; data reliably reshapes subsequent teaching.'),
    ('expert_lead', 'Leads competency-based assessment design across the department and moderates others'' work.')
  ) as v(level_key, descriptor)
  join competency.proficiency_level pl on pl.scale_id = v_scale and pl.key = v.level_key
  on conflict do nothing;

  insert into competency.evidence_descriptor (school_id, competency_id, evidence_type_key, guidance, is_required)
  values
    (p_school_id, v_comp, 'assessment_design', 'An assessment you designed, with its rubric.', false),
    (p_school_id, v_comp, 'rubric', 'A criteria-based rubric describing the competency.', false),
    (p_school_id, v_comp, 'student_work_sample', 'Anonymised student work showing the competency demonstrated.', false)
  on conflict do nothing;

  return v_comp;
end;
$$;

-- ---------------------------------------------------------------------------
-- CPD catalogue
-- ---------------------------------------------------------------------------

create or replace function cpd.provision_default_catalogue(p_school_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer; v_ncert uuid;
begin
  select id into v_ncert from regulatory.source
   where source_url = 'https://ncert.nic.in/pdf/Guidelines50HoursCpd.pdf';

  insert into cpd.provider (
    school_id, key, name, description, website,
    recognition, recognition_alignment, external_reference, regulatory_source_id
  ) values
    (p_school_id, 'school_pd_team', 'School Professional Development Team',
     'In-house development led by senior staff.', null,
     'school', 'school_defined', null, null),
    (p_school_id, 'diksha_ncert', 'DIKSHA / NISHTHA (NCERT)',
     'National teacher development platform. NCERT''s CPD guidelines credit NISHTHA modules '
     'on DIKSHA at 4 hours each.', 'https://diksha.gov.in',
     'other_framework', 'aligned',
     'NCERT Guidelines for 50 Hours of CPD (2022), Section A — Online Mode', v_ncert),
    (p_school_id, 'regional_institute', 'Regional Institute of Education',
     'Regional teacher education institute. Recognition status REQUIRES VERIFICATION.',
     null, 'school', 'school_defined', null, null)
  on conflict (school_id, key) do nothing;

  insert into cpd.activity (
    school_id, provider_id, key, title, description, learning_outcomes,
    delivery_method, duration_hours, cpd_hours, cost_amount, prerequisite, url,
    availability, next_offering_on, evidence_requirement,
    recognition, recognition_alignment, external_reference
  )
  select p_school_id, pr.id, v.key, v.title, v.description, v.outcomes,
         v.method::cpd.delivery_method, v.duration, v.hours, v.cost, v.prereq, v.url,
         v.availability::cpd.availability, v.next_on, v.evidence,
         v.recognition::competency.source_framework,
         v.alignment::competency.source_alignment, v.ref
  from (values
    ('school_pd_team', 'designing_competency_based_assessment',
     'Designing Competency-Based Assessments',
     'A practical workshop on writing assessment tasks that measure demonstrable competencies '
     'in unfamiliar contexts, and building criteria-based rubrics that describe them.',
     E'Write application tasks set in unfamiliar contexts\nBuild a criteria-based rubric for a competency\nUse assessment data to reshape the next sequence of lessons\nReport progress in competency terms',
     'blended', 12.0, 12.0, 0, 'None', null, 'available', date '2026-09-15',
     'A revised assessment plan for one unit, including the rubric, plus a short note on what '
     'changed and why.',
     'school', 'school_defined', null),

    ('diksha_ncert', 'nishtha_assessment_for_learning',
     'NISHTHA: Assessment for Learning',
     'NCERT NISHTHA module on formative assessment and assessment as learning.',
     E'Distinguish assessment of, for and as learning\nUse formative checks during teaching\nGive feedback students can act on',
     'online_self_paced', 4.0, 4.0, 0, 'None', 'https://diksha.gov.in',
     'available', null,
     'Module completion certificate plus a reflection describing one change made to practice.',
     'other_framework', 'aligned',
     'NCERT Guidelines for 50 Hours of CPD (2022) — NISHTHA modules credited at 4 hours'),

    ('regional_institute', 'rubric_design_intensive',
     'Rubric Design Intensive',
     'A short course on criteria-based rubric construction and moderation.',
     E'Construct analytic and holistic rubrics\nModerate rubric application across a team',
     'face_to_face', 6.0, 6.0, 2500, 'None', null, 'scheduled', date '2026-11-10',
     'A rubric you designed, plus evidence it was moderated with a colleague.',
     'school', 'school_defined', null),

    ('school_pd_team', 'differentiation_foundational',
     'Differentiation in the Foundational Years',
     'Planning multiple routes into the same objective for the widest attainment spread.',
     E'Plan two routes into one objective\nAdjust scaffolding during a lesson',
     'in_school', 6.0, 6.0, 0, 'None', null, 'available', null,
     'A lesson plan showing two routes, plus a reflection after teaching it.',
     'school', 'school_defined', null)
  ) as v(provider_key, key, title, description, outcomes, method, duration, hours,
         cost, prereq, url, availability, next_on, evidence, recognition, alignment, ref)
  join cpd.provider pr on pr.school_id = p_school_id and pr.key = v.provider_key
  on conflict (school_id, key) do nothing;

  get diagnostics v_count = row_count;

  -- What each activity addresses.
  insert into cpd.activity_competency (school_id, activity_id, competency_id, targets_level_id, is_primary)
  select p_school_id, a.id, c.id, pl.id, v.primary_focus
  from (values
    ('designing_competency_based_assessment', 'competency_based_assessment', 'advanced',   true),
    ('designing_competency_based_assessment', 'assessment_feedback',         'proficient', false),
    ('nishtha_assessment_for_learning',       'assessment_feedback',         'proficient', true),
    ('nishtha_assessment_for_learning',       'competency_based_assessment', 'developing', false),
    ('rubric_design_intensive',               'competency_based_assessment', 'proficient', true),
    ('differentiation_foundational',          'differentiated_instruction',  'advanced',   true)
  ) as v(activity_key, competency_key, level_key, primary_focus)
  join cpd.activity a on a.school_id = p_school_id and a.key = v.activity_key
  join competency.competency c on c.school_id = p_school_id and c.key = v.competency_key
  join competency.proficiency_scale ps on ps.school_id = p_school_id and ps.key = 'school_five_point'
  join competency.proficiency_level pl on pl.scale_id = ps.id and pl.key = v.level_key
  on conflict (activity_id, competency_id) do nothing;

  -- Applicability.
  insert into cpd.activity_applicability (school_id, activity_id, school_stage_id, subject_id)
  select p_school_id, a.id, ss.id, sub.id
  from (values
    ('designing_competency_based_assessment', 'middle',       'mathematics'),
    ('designing_competency_based_assessment', 'secondary',    null),
    ('rubric_design_intensive',               'middle',       null)
  ) as v(activity_key, stage_key, subject_key)
  join cpd.activity a on a.school_id = p_school_id and a.key = v.activity_key
  left join core.school_stage ss on ss.school_id = p_school_id and ss.key = v.stage_key
  left join core.subject sub on sub.school_id = p_school_id and sub.key = v.subject_key
  on conflict do nothing;

  insert into cpd.activity_applicability (school_id, activity_id, school_stage_id)
  select p_school_id, a.id, ss.id
  from cpd.activity a
  join core.school_stage ss on ss.school_id = p_school_id and ss.key = 'foundational'
  where a.school_id = p_school_id and a.key = 'differentiation_foundational'
  on conflict do nothing;

  return v_count;
end;
$$;

grant execute on function growth.provision_priority_bands(uuid) to service_role;
grant execute on function competency.provision_stage3_competency(uuid) to service_role;
grant execute on function cpd.provision_default_catalogue(uuid) to service_role;
