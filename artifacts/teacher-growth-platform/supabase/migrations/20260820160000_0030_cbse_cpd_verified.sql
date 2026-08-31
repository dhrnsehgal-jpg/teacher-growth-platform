-- ===========================================================================
-- 0030 — CBSE CPD Guidelines 2025: VERIFIED
-- ===========================================================================
-- Unread since Stage 1, because cbse.gov.in refuses automated requests. The
-- school supplied the PDF; it has now been read in full (5 pages, English and
-- Hindi, plus three annexures).
--
--   CBSE Notification No. TRG-02/2025, dated 01.04.2025
--   "Continuous Professional Development (CPD) Guidelines - 2025"
--   Issued by the Director-Training to all Principals/Heads of Schools
--   affiliated to CBSE.
--
-- Three things change as a result:
--
-- 1. The 50-hour figure is CBSE-MANDATORY for affiliated schools, not merely a
--    NEP/NCERT expectation. Stage 1 was right to refuse to assume this.
-- 2. The "25 + 25" split is confirmed — and the fragment Stage 1 discarded
--    (because it referred to government teachers) turns out to describe the
--    same structure for CBSE schools, sourced from Affiliation Notification
--    16/2021. Discarding it was still correct: it is now recorded from the
--    actual instrument rather than from a search snippet.
-- 3. CBSE requires CPD to sit "in the larger ambit of standards outlined in the
--    National Professional Standards for Teachers (NPST)". That is a body under
--    the central government adopting NPST for CPD purposes — which bears
--    directly on the NPST applicability question left open in Stage 2.
--
-- Applicability to THIS school remains `potentially_applicable`, because the
-- school's CBSE affiliation number and status are still recorded as unverified
-- in core.school_regulatory_profile. That is the gate working as designed: the
-- requirement is now certain, the school's exposure to it is not yet.
-- ===========================================================================

update regulatory.source
set
  verification_status = 'verified',
  reference_number    = 'Notification No. TRG-02/2025 (No. CBSE/Training Unit/2025)',
  version_label       = 'CPD Guidelines - 2025',
  issued_on           = date '2025-04-01',
  effective_from      = date '2025-04-01',
  retrieved_at        = timestamptz '2026-08-20 22:13:00+05:30',
  verified_at         = timestamptz '2026-08-20 22:13:00+05:30',
  last_reviewed_on    = date '2026-08-20',
  review_due_on       = date '2027-04-01',
  notes               = 'Read in full on 2026-08-20 from a copy supplied by the school. '
                        'cbse.gov.in returns HTTP 403 to automated requests, so the document '
                        'could not be retrieved directly at any point during Stages 1-3. '
                        'Signed by Manoj K. Srivastava, Director-Training. Contains three '
                        'annexures listing approved CBP topics with day/hour values, mapped to '
                        'Domains 1-3.'
where source_url = 'https://www.cbse.gov.in/cbsenew/documents/CPD_Guidelines2025_01042025.pdf';

-- The Affiliation Notification the CPD requirement actually rests on.
insert into regulatory.source (
  authority_id, document_type, title, reference_number, version_label,
  issued_on, effective_from, source_url, verification_status,
  last_reviewed_on, review_due_on, notes
)
select a.id, 'notification',
  'CBSE Affiliation Notification 16/2021 — Continuous Professional Development',
  'Notification 16/2021', '2021',
  date '2021-09-24', date '2021-09-24',
  'https://www.cbse.gov.in',
  'requires_verification',
  date '2026-08-20', date '2026-11-20',
  'The instrument the 25 + 25 hour split originates from, cited throughout the CPD '
  'Guidelines 2025. Its own text has NOT been read — only what the 2025 guidelines '
  'quote of it. Retrieve before relying on any provision the 2025 notification does '
  'not restate.'
from regulatory.authority a where a.key = 'cbse'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Requirements
-- ---------------------------------------------------------------------------

insert into regulatory.requirement (
  requirement_key, version, source_id, clause_reference, title, requirement_text,
  classification, verification_status, effective_from, evidence_required,
  applicability_note, last_reviewed_on, review_due_on, notes
)
select
  v.requirement_key, 1, s.id, v.clause_reference, v.title, v.requirement_text,
  'mandatory'::regulatory.requirement_classification,
  'verified'::regulatory.verification_status,
  date '2025-04-01', v.evidence_required, v.applicability_note,
  date '2026-08-20', date '2027-04-01', v.notes
from (values

  ('cbse.cpd.annual_hours',
   'Notification TRG-02/2025, opening paragraph; Affiliation Notification 16/2021 dated 24.09.2021',
   '50 hours of CPD per year — 25 through CBSE, 25 by the school',
   'Affiliation Notification 16/2021 dated 24.09.2021 earmarks 25 hours of CPD through CBSE or '
   'Government Regional Training Institutes, and the remaining 25 hours by the school through '
   'in-house programmes or with School complexes. CPD efforts must be in the larger ambit of the '
   'standards outlined in the National Professional Standards for Teachers (NPST) as well as the '
   'NCERT Guidelines for CPD.',
   'Registration of teachers on the CBSE Training Portal for the CBSE-delivered hours, and '
   'training records updated on the OASIS portal for the school-delivered hours.',
   'Binds schools affiliated to CBSE. The notification is addressed to all Principals and Heads '
   'of Schools/Institutions affiliated to CBSE and is issued for compliance. It does not '
   'distinguish between aided and unaided schools.',
   'This supersedes the Stage 1 position that 50 hours was only a NEP 2020 expectation '
   'operationalised by suggestive NCERT guidance. For a CBSE-affiliated school it is a Board '
   'requirement with a penalty clause behind it.'),

  ('cbse.cpd.domain_allocation',
   'Notification TRG-02/2025, scheme table',
   'CPD hours are allocated across three NPST-aligned domains',
   'The 50 hours are allocated as: Core Values and Ethics 12 hours (6 by CBSE offline on '
   'Annexure-I topics, 6 by the school offline or online); Knowledge and Practice 24 hours '
   '(16 by CBSE — 12 offline subject-specific from Annexure-II plus 4 offline or online on other '
   'Annexure-II topics — and 8 by the school, being 6 offline plus 2 offline or online, by the '
   'school or a group of schools); Professional Growth and Development 14 hours (3 by CBSE '
   'offline or online from Annexure-III, 11 by the school). School-delivered hours may be on '
   'Annexure topics or other topics aligned with the corresponding NPST Standard.',
   'Records by domain, distinguishing CBSE-delivered from school-delivered hours.',
   'The three domains correspond to the three NPST Standards: Core Values and Ethics, Knowledge '
   'and Practice, and Professional Growth and Development.',
   'The allocation is what makes CPD compliance reportable per domain rather than as a single '
   'total. A teacher can reach 50 hours and still be non-compliant on a domain.'),

  ('cbse.cpd.academic_task_equivalence',
   'Notification TRG-02/2025, Professional Growth and Development — academically inclined / developmental tasks',
   'Academic duties countable as CPD, capped at 11 hours',
   'Within the 11 school-delivered hours of Professional Growth and Development, the following '
   'academically inclined or developmental tasks count as CPD: Board Examination evaluation duty '
   'as Examiner, AHE or HE for the entire duty assigned by the Regional Office — 6 hours; SQP, '
   'marking scheme, item development, question bank, CBP curriculum review, e-content, resource '
   'materials or practical examiner work assigned by CBSE — 3 hours; research projects in the '
   'classroom, mentoring or guiding fellow teachers, writing reflective journals, writing blogs '
   'on teaching experiences, participation in online educational discussions, or paper '
   'publication — 2 hours; engaged as a Resource Person conducting CBSE CBPs — 3 hours; viewing '
   'the DD PM e-Vidya Channel CBSE 15 or online sessions such as Eklavya 3030 STEM Education — '
   '3 hours; integrating technology into teaching — 2 hours; presentations or participation in '
   'CBSE National Conferences — 3 hours. Only 11 hours will be considered, and schools must keep '
   'records for verification.',
   'Records evidencing each claimed task, retained by the school for verification.',
   'The listed hour values total more than 11; the cap is explicit in the notification.',
   'This is the CBSE equivalent of the NCERT activity table already recorded as '
   'central.cpd.activity_hour_equivalence. The two differ in both activities and hours, and must '
   'not be conflated: the CBSE table binds an affiliated school, the NCERT table is suggestive.'),

  ('cbse.cpd.recording_and_portals',
   'Notification TRG-02/2025, scheme table (Portal / OASIS references)',
   'CPD must be recorded on the CBSE Training Portal and OASIS',
   'Schools must register their teachers on the CBSE Training Portal for the CBSE-delivered '
   'hours in each domain. Training records for school-delivered hours must be updated on the '
   'OASIS portal. Schools must keep records of academically inclined and developmental tasks '
   'claimed as CPD, for verification.',
   'CBSE Training Portal registrations and OASIS training records.',
   'Applies to all CBSE-affiliated schools.',
   'Relevant to Stage 4: the platform''s CPD hour ledger is the school''s internal record and '
   'does not replace either portal. Any export must be reconcilable with both.'),

  ('cbse.cpd.enforcement',
   'Notification TRG-02/2025, Important Instructions; Affiliation Bye-Laws clauses 12.2.9 and 9.1.11',
   'Penalties may be imposed for failing to send staff for mandatory training',
   'Schools must adhere to the directions issued vide Affiliation Notification 16 dated '
   '24.09.2021 on CPD. Clause 12.2.9 of the Affiliation Bye-Laws provides that penalties can be '
   'imposed on schools that fail to send their teachers or principals for mandatory training '
   'programmes as required by the Bye-Laws. Clauses 9.1.11 and 12.2.9 are stated to be '
   'self-explanatory.',
   'Evidence of nomination and attendance for mandatory training.',
   'The penalty attaches to the SCHOOL, not to the individual teacher. Nothing in this '
   'notification authorises an adverse consequence for a teacher who was not sent.',
   'Clauses 9.1.11 and 12.2.9 of the Affiliation Bye-Laws are referenced but their full text has '
   'NOT been read — the Bye-Laws remain unverified. Do not paraphrase either clause beyond what '
   'the CPD notification states.'),

  ('cbse.cpd.official_duty_protection',
   'Notification TRG-02/2025, Important Instructions',
   'CPD attendance is official duty; no salary or leave deduction',
   'Teachers and principals nominated for CPDs, and those assigned Resource Person duty by the '
   'Board for conducting CBPs, shall be treated as on official duty. No deduction of salary or '
   'leave should be made, considering the requirement of NEP 2020 paragraphs 5.15 and 5.16.',
   'Duty records showing CPD attendance treated as official duty.',
   'A protection for the teacher, not an obligation on them. Relevant to Stage 5: CPD attendance '
   'must never reduce pay or leave entitlement.',
   'Worth surfacing to teachers directly — it is the kind of entitlement that goes unexercised '
   'when nobody knows it exists.'),

  ('cbse.cpd.npst_alignment',
   'Notification TRG-02/2025, opening paragraph and scheme table',
   'CPD must align with the NPST standards',
   'CPD efforts must be in the larger ambit of the standards outlined in the National '
   'Professional Standards for Teachers (NPST) as well as the NCERT Guidelines for CPD. '
   'School-delivered hours in each domain may be on Annexure topics or on other topics aligned '
   'with the corresponding NPST Standard — Core Values and Ethics, Knowledge and Practice, or '
   'Professional Growth and Development.',
   'Mapping of school-delivered CPD to the NPST Standard it addresses.',
   'CRITICAL FOR THE NPST QUESTION. NPST §5.2 provides that NPST is implemented through an entity '
   'designated by a State/UT Government "and similarly so in the case of organizations/bodies '
   'under central government". CBSE is such a body, and here requires CPD to sit within the NPST '
   'standards and adopts its three-Standard structure wholesale. This makes NPST operative FOR '
   'CPD PURPOSES for CBSE-affiliated schools. It does NOT make NPST binding as an appraisal or '
   'career-progression standard — the notification says nothing about either.',
   'This narrows, but does not close, the Stage 2 open question. Whether Punjab has separately '
   'designated an implementing entity remains unverified.')

) as v(requirement_key, clause_reference, title, requirement_text,
       evidence_required, applicability_note, notes)
join regulatory.source s
  on s.source_url = 'https://www.cbse.gov.in/cbsenew/documents/CPD_Guidelines2025_01042025.pdf';

insert into regulatory.requirement_school_type (requirement_id, school_type)
select r.id, 'all_school_types'::regulatory.school_type_applicability
from regulatory.requirement r where r.requirement_key like 'cbse.cpd.%';

insert into regulatory.requirement_employee_category (requirement_id, employee_category)
select r.id, 'all_teaching_staff'
from regulatory.requirement r where r.requirement_key like 'cbse.cpd.%';

-- Applicability stays undetermined: the school's own CBSE affiliation number and
-- status are still `unverified`. Confirming those is what flips these to
-- `verified` and permits enforcement.
insert into regulatory.school_requirement_status (
  school_id, requirement_id, applicability, is_enforced, determination_note
)
select s.id, r.id, 'potentially_applicable', false,
  'The requirement itself is verified from the CBSE notification. Applicability to this school '
  'depends on its CBSE affiliation, which is recorded as unverified in the School Regulatory '
  'Profile. Confirm the affiliation number and status to activate CPD compliance reporting.'
from core.school s
cross join regulatory.requirement r
where r.requirement_key like 'cbse.cpd.%'
on conflict (school_id, requirement_id) do nothing;
