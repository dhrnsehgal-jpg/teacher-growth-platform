-- ===========================================================================
-- 0007 — Global reference data: permission catalogue, role provisioning,
--        and the regulatory sources established during Stage 1 research
-- ===========================================================================
-- Only *global* reference data is seeded here. School-specific rows (the school
-- itself, its departments, its staff) are created by provisioning, not by a
-- migration — see core.provision_school_roles() and supabase/seed.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Permission catalogue
-- ---------------------------------------------------------------------------
-- Mirrored in src/lib/rbac/permissions.ts. The Vitest suite asserts the two
-- lists match, so a permission cannot be added on one side only.

insert into core.permission (key, description, is_compensation_sensitive) values
  -- School configuration
  ('school.manage',            'Configure the school, academic years, departments, stages and categories.', false),
  ('staff_directory.read',     'See the list of colleagues and their basic directory details.', false),

  -- Access control
  ('rbac.read',                'View role assignments across the school.', false),
  ('rbac.manage',              'Create roles and grant or revoke role assignments.', false),

  -- Teacher records
  ('teacher_record.read.scope','Read the professional records of staff within the assignment scope.', false),
  ('teacher_record.manage',    'Create and maintain staff professional records, including qualification verification.', false),

  -- Competency and assessment (framework activated in Stage 2/3)
  ('competency.read',          'View the competency framework and its indicators.', false),
  ('competency.manage',        'Define and version the competency framework, KPIs and targets.', false),
  ('assessment.read.scope',    'Read assessment outcomes for staff within scope.', false),
  ('assessment.conduct',       'Record assessments and observations for staff within scope.', false),
  ('assessment.moderate',      'Moderate or override assessment outcomes, with a recorded reason.', false),
  ('observation.conduct',      'Carry out and record classroom observations.', false),
  ('evidence.submit',          'Submit evidence against competencies and KPIs.', false),
  ('evidence.review',          'Review and verify submitted evidence.', false),

  -- CPD
  ('cpd.read.scope',           'View CPD records and hour ledgers for staff within scope.', false),
  ('cpd.manage',               'Maintain the CPD catalogue, providers and hour ledger rules.', false),
  ('cpd.approve',              'Approve CPD activity claims and the hours credited for them.', false),

  -- Development planning
  ('development_plan.read.scope', 'View individual professional development plans within scope.', false),
  ('development_plan.approve',    'Approve individual professional development plans.', false),

  -- Appraisal
  ('appraisal.read.scope',     'View appraisal records for staff within scope.', false),
  ('appraisal.conduct',        'Conduct appraisal cycles for staff within scope.', false),
  ('appraisal.finalise',       'Finalise an appraisal outcome for the school.', false),

  -- Compensation-sensitive. Deliberately separated from appraisal: appraising a
  -- teacher does not confer sight of their pay outcome.
  ('increment.read',           'View increment readiness and recommendations.', true),
  ('increment.recommend',      'Raise an increment recommendation for approval.', true),
  ('increment.approve',        'Approve or decline an increment recommendation.', true),
  ('career_progression.read.scope', 'View career progression status for staff within scope.', false),
  ('career_progression.recommend',  'Recommend a staff member for the next career level.', false),
  ('career_progression.approve',    'Approve a career level change.', true),

  -- Regulatory and compliance
  ('regulatory.read',          'View the regulatory register, sources and requirement versions.', false),
  ('regulatory.manage',        'Maintain regulatory sources, requirement versions and applicability determinations.', false),
  ('regulatory.authorise_recalculation', 'Authorise recalculation of a locked academic year under newer rules.', false),
  ('compliance.read',          'View compliance status and evidence for the school.', false),
  ('compliance.manage',        'Maintain compliance evidence and remediation actions.', false),

  -- Oversight
  ('audit.read',               'Read the school-wide audit trail.', false),
  ('system.admin',             'Platform administration: tenants, integrations and technical configuration.', false);

comment on table core.permission is
  'Global permission catalogue. Access to a teacher''s own record is structural '
  '(RLS matches on user id) and therefore has no permission key.';

-- ---------------------------------------------------------------------------
-- Role provisioning
-- ---------------------------------------------------------------------------
-- Creates the nine system roles for a school and grants their default
-- permissions. Idempotent, so it can be re-run after new permissions are added.

create or replace function core.provision_school_roles(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role record;
  v_grants jsonb := jsonb_build_object(

    -- A teacher's own record is reachable without any permission key; these
    -- grants are what lets them participate in the growth cycle.
    'teacher', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read'
    ),

    'head_of_department', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'observation.conduct', 'evidence.review', 'cpd.read.scope',
      'development_plan.read.scope', 'appraisal.read.scope', 'appraisal.conduct',
      'career_progression.read.scope'
    ),

    'academic_coordinator', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'observation.conduct', 'evidence.review', 'cpd.read.scope',
      'development_plan.read.scope', 'appraisal.read.scope',
      'career_progression.read.scope'
    ),

    'vice_principal', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'assessment.moderate', 'observation.conduct', 'evidence.review',
      'cpd.read.scope', 'cpd.approve', 'development_plan.read.scope',
      'development_plan.approve', 'appraisal.read.scope', 'appraisal.conduct',
      'career_progression.read.scope', 'compliance.read'
    ),

    -- The Principal leads the professional growth cycle and may *recommend* an
    -- increment, but does not approve one. Recommendation and approval are held
    -- by different people by design.
    'principal', jsonb_build_array(
      'school.manage', 'staff_directory.read', 'competency.read', 'competency.manage',
      'regulatory.read', 'teacher_record.read.scope', 'assessment.read.scope',
      'assessment.conduct', 'assessment.moderate', 'observation.conduct',
      'evidence.review', 'cpd.read.scope', 'cpd.approve',
      'development_plan.read.scope', 'development_plan.approve',
      'appraisal.read.scope', 'appraisal.conduct', 'appraisal.finalise',
      'increment.read', 'increment.recommend',
      'career_progression.read.scope', 'career_progression.recommend',
      'compliance.read', 'rbac.read'
    ),

    'hr_pd_admin', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'regulatory.read',
      'teacher_record.read.scope', 'teacher_record.manage',
      'cpd.read.scope', 'cpd.manage', 'cpd.approve',
      'development_plan.read.scope', 'appraisal.read.scope',
      'career_progression.read.scope', 'compliance.read', 'rbac.read',
      'increment.read'
    ),

    -- School Management / Authorised Approver: the only role that approves
    -- money. Deliberately holds no assessment or observation permissions.
    'management_approver', jsonb_build_array(
      'staff_directory.read', 'regulatory.read', 'compliance.read',
      'appraisal.read.scope', 'increment.read', 'increment.approve',
      'career_progression.read.scope', 'career_progression.approve'
    ),

    'compliance_admin', jsonb_build_array(
      'staff_directory.read', 'regulatory.read', 'regulatory.manage',
      'regulatory.authorise_recalculation', 'compliance.read', 'compliance.manage',
      'audit.read', 'rbac.read'
    ),

    -- System Administrator is a technical role. It holds no professional,
    -- appraisal or compensation permissions: platform access must not become a
    -- back door into staff records.
    'system_admin', jsonb_build_array(
      'system.admin', 'school.manage', 'rbac.read', 'rbac.manage', 'audit.read'
    )
  );
  v_display jsonb := jsonb_build_object(
    'teacher',              'Teacher',
    'head_of_department',   'Head of Department',
    'academic_coordinator', 'Academic Coordinator',
    'vice_principal',       'Vice Principal',
    'principal',            'Principal',
    'hr_pd_admin',          'HR / Professional Development Administrator',
    'management_approver',  'School Management / Authorised Approver',
    'compliance_admin',     'Compliance Administrator',
    'system_admin',         'System Administrator'
  );
  v_key text;
begin
  for v_key in select jsonb_object_keys(v_grants) loop
    insert into core.role (school_id, key, display_name, is_system)
    values (p_school_id, v_key, v_display ->> v_key, true)
    on conflict (school_id, key) do update
      set display_name = excluded.display_name;
  end loop;

  for v_role in
    select r.id, r.key from core.role r
    where r.school_id = p_school_id and r.is_system
  loop
    insert into core.role_permission (role_id, permission_key)
    select v_role.id, p.value #>> '{}'
    from jsonb_array_elements(v_grants -> v_role.key) p
    on conflict (role_id, permission_key) do nothing;
  end loop;
end;
$$;

comment on function core.provision_school_roles(uuid) is
  'Creates the nine system roles with their default grants. Idempotent. '
  'Separation of duties is encoded here: recommend and approve never coincide.';

-- ---------------------------------------------------------------------------
-- Regulatory authorities
-- ---------------------------------------------------------------------------

insert into regulatory.authority (layer, key, name, short_name, official_website) values
  ('central', 'moe',    'Ministry of Education, Government of India', 'MoE', 'https://www.education.gov.in'),
  ('central', 'ncte',   'National Council for Teacher Education', 'NCTE', 'https://ncte.gov.in'),
  ('central', 'ncert',  'National Council of Educational Research and Training', 'NCERT', 'https://ncert.nic.in'),
  ('central', 'meity',  'Ministry of Electronics and Information Technology', 'MeitY', 'https://www.meity.gov.in'),
  ('central', 'parliament_india', 'Parliament of India', 'Parliament', 'https://www.indiacode.nic.in'),
  ('cbse',    'cbse',   'Central Board of Secondary Education', 'CBSE', 'https://www.cbse.gov.in'),
  ('state',   'punjab_sed', 'Department of School Education, Government of Punjab', 'Punjab SED', 'https://www.ssapunjab.org'),
  ('state',   'punjab_govt', 'Government of Punjab', 'Punjab', 'https://punjab.gov.in');

-- ---------------------------------------------------------------------------
-- Regulatory sources
-- ---------------------------------------------------------------------------
-- Verification honesty rules applied here:
--   * 'verified'              — the document was retrieved and read during
--                               Stage 1 research (2026-08-20).
--   * 'requires_verification' — the document is known to exist and its official
--                               URL is recorded, but its text could NOT be
--                               retrieved (HTTP 403 / host unreachable). Nothing
--                               about its contents has been assumed.
-- In every case school-level applicability remains unverified, so nothing here
-- is enforced against any member of staff.

insert into regulatory.source (
  authority_id, document_type, title, reference_number, version_label,
  issued_on, effective_from, source_url, retrieved_at, verification_status,
  verified_at, last_reviewed_on, review_due_on, notes
)
select a.id, v.document_type, v.title, v.reference_number, v.version_label,
       v.issued_on, v.effective_from, v.source_url, v.retrieved_at,
       v.verification_status::regulatory.verification_status,
       v.verified_at, v.last_reviewed_on, v.review_due_on, v.notes
from (values

  ('ncert', 'guidelines',
   'Guidelines for 50 Hours of Continuous Professional Development for Teachers, Head Teachers and Teacher Educators',
   'ISBN 978-93-5580-045-9', 'First Edition, August 2022',
   date '2022-08-01', date '2022-08-01',
   'https://ncert.nic.in/pdf/Guidelines50HoursCpd.pdf',
   timestamptz '2026-08-20 00:00:00+05:30', 'verified',
   timestamptz '2026-08-20 00:00:00+05:30', date '2026-08-20', date '2027-08-20',
   'Retrieved and read in full during Stage 1. The document states its guidelines are suggestive and may be adapted or adopted by States/UTs and organisations such as NVS, KVS, CBSE, EMRS, NIOS and NIEPA. Requires school-level sign-off before any enforcement.'),

  ('cbse', 'framework',
   'CBSE School Quality Assessment and Assurance Framework (SQAAF) — Framework Overview',
   null, 'Self-Paced Learning Module 1',
   null, null,
   'https://cbseacademic.nic.in/sqaa/doc/TabC-SQAA%20Framework%20Overview.pdf',
   timestamptz '2026-08-20 00:00:00+05:30', 'verified',
   timestamptz '2026-08-20 00:00:00+05:30', date '2026-08-20', date '2027-02-20',
   'Retrieved and read during Stage 1; confirms the seven SQAA domains and that there is no differential set of assessment criteria for government, government-aided and private schools. The full SQAAF manual and the scoring scale were NOT retrieved and remain unverified.'),

  ('cbse', 'guidelines',
   'CBSE Continuous Professional Development (CPD) Guidelines 2025',
   'CPD_Guidelines2025_01042025', '2025',
   date '2025-04-01', date '2025-04-01',
   'https://www.cbse.gov.in/cbsenew/documents/CPD_Guidelines2025_01042025.pdf',
   null, 'requires_verification',
   null, date '2026-08-20', date '2026-11-20',
   'Document located on cbse.gov.in but the text could NOT be retrieved (HTTP 403 to automated requests). Its contents, including any mandatory hour requirement and any split between Board-organised and school-organised hours, are UNVERIFIED. Must be downloaded and read by a person before any CPD compliance rule is activated.'),

  ('cbse', 'bye_laws',
   'CBSE Affiliation Bye-Laws, 2018',
   null, '2018',
   null, null,
   'https://www.cbse.gov.in/cbsenew/aff_bye_laws.html',
   null, 'requires_verification',
   null, date '2026-08-20', date '2026-11-20',
   'Chapter-wise PDFs are published on cbse.gov.in but could NOT be retrieved (HTTP 403). Provisions on teaching staff qualifications, service conditions and appraisal are UNVERIFIED. Note Circular 07/2024 (Cricular_Amendment_Aff_01062024.pdf) appears to amend the Bye-Laws and must be read alongside them.'),

  ('ncte', 'framework',
   'National Professional Standards for Teachers (NPST) — Guiding Document, 2023',
   null, '2023',
   null, null,
   'https://ncte.gov.in/website/PDF/NPST/NPST-Book.pdf',
   null, 'requires_verification',
   null, date '2026-08-20', date '2026-11-20',
   'ncte.gov.in was unreachable from this environment (connection refused). The NPST domains, standards and career stages are UNVERIFIED and must not be presented as mandatory. NEP 2020 tasks NCTE with developing NPST; whether any part has been notified as binding on private CBSE schools is an open question for human verification.'),

  ('moe', 'policy',
   'National Education Policy 2020',
   null, '2020',
   date '2020-07-29', date '2020-07-29',
   'https://www.education.gov.in/sites/upload_files/mhrd/files/NEP_Final_English_0.pdf',
   null, 'requires_verification',
   null, date '2026-08-20', date '2026-11-20',
   'Policy text not retrieved directly in Stage 1. The 50-hour CPD expectation is corroborated by the NCERT 2022 guidelines (verified), which describe NEP 2020 as expecting at least 50 hours of CPD per year. NEP is a policy, not legislation: it is classified as recommended, never mandatory.'),

  ('parliament_india', 'act',
   'The Digital Personal Data Protection Act, 2023',
   'Act No. 22 of 2023', '2023',
   date '2023-08-11', null,
   'https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf',
   null, 'requires_verification',
   null, date '2026-08-20', date '2026-11-20',
   'Act text not retrieved in full during Stage 1. Commencement and the DPDP Rules determine which obligations are live and by when. Treated as design input for privacy engineering, not as a set of enforced platform rules.'),

  ('punjab_govt', 'act',
   'The Punjab Privately Managed Recognised Schools Employees (Security of Service) Act, 1979',
   'Punjab Act No. 18 of 1979', '1979',
   null, null,
   'https://www.indiacode.nic.in/bitstream/123456789/14731/1/punjab_act_18_of_1979_punjab_privately_managed_recognised_schools_employees_security_of_service_rules_1979_-converted.pdf',
   null, 'requires_verification',
   null, date '2026-08-20', date '2026-11-20',
   'Text not retrieved (HTTP 403). Secondary indications suggest the associated Rules attach to employees on AIDED posts, which would make applicability turn on the school''s funding status. This is exactly the determination the platform gates on and must be settled by a person with the school''s recognition and funding documents.'),

  ('punjab_sed', 'rules',
   'Punjab Right of Children to Free and Compulsory Education Rules, 2011 (as amended)',
   null, 'as amended up to 2023',
   null, null,
   'https://www.education.gov.in',
   null, 'requires_verification',
   null, date '2026-08-20', date '2026-11-20',
   'Rules made under section 38 of the RTE Act, 2009. An authoritative Punjab Government URL was NOT established in Stage 1; commercial reproductions were found but are not acceptable sources. Rules on teacher qualifications, service conditions and duties are UNVERIFIED.')

) as v(authority_key, document_type, title, reference_number, version_label,
       issued_on, effective_from, source_url, retrieved_at, verification_status,
       verified_at, last_reviewed_on, review_due_on, notes)
join regulatory.authority a on a.key = v.authority_key;

-- ---------------------------------------------------------------------------
-- Requirements
-- ---------------------------------------------------------------------------
-- Only requirements whose text was actually read are recorded with substance.
-- Everything else stays as a source-level placeholder until a person reads it.

insert into regulatory.requirement (
  requirement_key, version, source_id, clause_reference, title, requirement_text,
  classification, verification_status, effective_from, evidence_required,
  applicability_note, last_reviewed_on, review_due_on, notes
)
select
  v.requirement_key, 1, s.id, v.clause_reference, v.title, v.requirement_text,
  v.classification::regulatory.requirement_classification,
  v.verification_status::regulatory.verification_status,
  v.effective_from, v.evidence_required, v.applicability_note,
  date '2026-08-20', v.review_due_on, v.notes
from (values

  ('central.cpd.annual_hours_expectation',
   'https://ncert.nic.in/pdf/Guidelines50HoursCpd.pdf',
   'Foreword; Preface; Section A',
   'At least 50 hours of Continuous Professional Development per year',
   'NEP 2020 expects teachers and head teachers to participate in at least 50 hours of CPD every year. NCERT''s 2022 guidelines operationalise this through a blended "cafeteria" approach combining face-to-face, online/distance and other academic activities, and state that the guidelines are suggestive and may be adapted or adopted by States/UTs and by organisations including CBSE.',
   'recommended', 'verified', date '2022-08-01',
   'CPD portfolio (e-portfolio) holding certificates and evidence of completion for each activity claimed.',
   'This is a policy expectation operationalised through suggestive national guidelines. It is NOT, on the strength of this source alone, a binding CBSE affiliation condition. Whether CBSE mandates 50 hours for its affiliated schools must be established from the CBSE CPD Guidelines 2025, which remain unverified.',
   date '2027-08-20',
   'Verified against the NCERT document text during Stage 1 research.'),

  ('central.cpd.activity_hour_equivalence',
   'https://ncert.nic.in/pdf/Guidelines50HoursCpd.pdf',
   'Section A — Other Continuous Professional Development Activities Assessment Parameters',
   'Suggested hour equivalence for CPD activities',
   'NCERT suggests the following hour credits: local/regional paper publication or presentation 3 hours; national-level 6 hours; international-level 12 hours; e-content, module, book, chapter or translation development 12 hours; action research, innovative project or case study 18 hours; field visit to a model or innovative school or community 6 hours; a half-hour live session or discussion 3 hours; a live session of one hour or more 6 hours; acting as expert or resource person, or presenting at a workshop or seminar 3 hours; paper setting for a school subject 3 hours. Examiner and external-examiner work is to be credited as decided by the appropriate authority. Face-to-face sessions run 1 hour 30 minutes each, with four sessions making a 6-hour day; NISHTHA modules on DIKSHA carry 4 hours each.',
   'recommended', 'verified', date '2022-08-01',
   'Activity certificate, publication reference, or authority approval for the hours claimed.',
   'These are suggested equivalences from NCERT, intended primarily for state-recognised and state-board-affiliated schools. The school may adopt them as its own CPD hour policy — in which case they must be shown to teachers as school policy, not as a CBSE or central mandate.',
   date '2027-08-20',
   'Verified against the NCERT document text during Stage 1 research. Directly informs the design of the CPD hour ledger in Stage 4.'),

  ('cbse.sqaaf.domains',
   'https://cbseacademic.nic.in/sqaa/doc/TabC-SQAA%20Framework%20Overview.pdf',
   'SQAA Domains',
   'SQAA Framework comprises seven domains of school functioning',
   'The CBSE School Quality Assessment and Assurance Framework sets standards across seven domains: Curriculum, Pedagogy and Assessment; Infrastructure; Human Resources; Inclusive Practices; Management and Governance; Leadership; and Beneficiary Satisfaction. The framework is a self-assessment tool aligned to NEP 2020, and applies the same assessment criteria to government, government-aided and private schools.',
   'recommended', 'verified', null,
   'Completed SQAAF self-assessment with supporting evidence mapped to each domain.',
   'CBSE describes SQAAF as a set of standards and best practices for self-assessment and school improvement. Whether SQAAF submission is a condition of affiliation for this school is a separate question that must be established from the Affiliation Bye-Laws and current CBSE circulars, both of which remain unverified.',
   date '2027-02-20',
   'Domain names verified from the CBSE academic-unit overview document. Sub-domains, indicator statements, weightings and the scoring scale were NOT retrieved and remain unverified.')

) as v(requirement_key, source_url, clause_reference, title, requirement_text,
       classification, verification_status, effective_from, evidence_required,
       applicability_note, review_due_on, notes)
join regulatory.source s on s.source_url = v.source_url;

-- Applicability: the two CPD requirements are national guidance addressed to all
-- school types; the SQAAF domains statement is explicit that criteria do not
-- differ by school type.
insert into regulatory.requirement_school_type (requirement_id, school_type)
select r.id, 'all_school_types'::regulatory.school_type_applicability
from regulatory.requirement r
where r.requirement_key in (
  'central.cpd.annual_hours_expectation',
  'central.cpd.activity_hour_equivalence',
  'cbse.sqaaf.domains'
);

insert into regulatory.requirement_employee_category (requirement_id, employee_category)
select r.id, 'all_teaching_staff'
from regulatory.requirement r
where r.requirement_key in (
  'central.cpd.annual_hours_expectation',
  'central.cpd.activity_hour_equivalence'
);
