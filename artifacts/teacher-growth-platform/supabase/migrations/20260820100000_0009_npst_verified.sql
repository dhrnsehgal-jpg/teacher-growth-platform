-- ===========================================================================
-- 0009 — NPST: source verified, requirements recorded
-- ===========================================================================
-- Stage 1 recorded the NPST Guiding Document as REQUIRES VERIFICATION because
-- ncte.gov.in refused connections. During Stage 2 the document was retrieved in
-- full (56 pages) from NCTE's own CloudFront distribution and read.
--
-- What that changed, and what it did NOT change:
--
--   * The source is now verified, and the framework structure can be recorded
--     and mapped against.
--   * NPST remains classified `recommended`. The document calls itself a
--     "guiding document", and §5.2 provides that it "shall be implemented by a
--     suitable entity designated by the appropriate State/UT Government".
--   * Whether it reaches THIS school therefore depends on whether Punjab has
--     designated such an entity and issued implementation instructions — which
--     is unverified. Applicability stays undetermined and unenforced.
-- ===========================================================================

update regulatory.source
set
  verification_status = 'verified',
  retrieved_at        = timestamptz '2026-08-20 01:23:00+05:30',
  verified_at         = timestamptz '2026-08-20 01:23:00+05:30',
  version_label       = 'NPST Guiding Document, 2023',
  issued_on           = date '2023-01-01',
  last_reviewed_on    = date '2026-08-20',
  review_due_on       = date '2027-08-20',
  notes               = 'Retrieved and read in full during Stage 2 (56 pages). '
                        'ncte.gov.in refuses direct connections from this environment; the document '
                        'was obtained from NCTE''s own CloudFront distribution at '
                        'https://d3swgpghzvje7l.cloudfront.net/website/PDF/NPST/NPST-Book.pdf, linked '
                        'from web.ncte.gov.in. Structure verified: 3 Standards, numbered Domains with '
                        'Sub-Domains (SD x.y) and numbered indicators, and 3 levels (Proficient, '
                        'Advanced, Expert). NOTE: Domains 9, 10 and 11 could not be extracted from the '
                        'PDF — the surrounding pages appear to be images — so the domain list recorded '
                        'here is incomplete and those three REQUIRE VERIFICATION.'
where source_url = 'https://ncte.gov.in/website/PDF/NPST/NPST-Book.pdf';

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
  v.classification::regulatory.requirement_classification,
  v.verification_status::regulatory.verification_status,
  null::date, v.evidence_required, v.applicability_note,
  date '2026-08-20', date '2027-08-20', v.notes
from (values

  ('central.npst.framework_structure',
   '§3.2(b), §3.2(c); Chapter 4',
   'NPST defines three Standards and three levels of teaching proficiency',
   'The National Professional Standards for Teachers identifies three domains as standards: '
   '(1) Core Values and Ethics, (2) Knowledge and Practice, and (3) Professional Growth and '
   'Development. Three levels are proposed as applicable to all domains and competencies of '
   'teaching, across the different stages of schooling and subject teaching area: Proficient, '
   'Advanced and Expert. Standards are elaborated as numbered Domains, each containing '
   'Sub-Domains (SD x.y) and numbered behavioural indicators, with separate descriptors for the '
   'Proficient, Advanced and Expert Teacher.',
   'recommended', 'verified',
   'Evidence of competencies acquired, used to place a teacher at a level.',
   'The document describes itself as a guiding document. Domains 1-8 (under Standards 1 and 2) '
   'and Domains 12-13 (under Standard 3) were extracted and verified. Domains 9, 10 and 11 could '
   'not be extracted and REQUIRE VERIFICATION before any claim of complete NPST coverage.',
   'Structure verified against the NPST Guiding Document, 2023 during Stage 2 research.'),

  ('central.npst.applicability',
   '§5.2 Applicability',
   'NPST is implemented through an entity designated by the State/UT Government',
   'NPST shall be implemented by a suitable entity designated by the appropriate State/UT '
   'Government, and similarly for organisations or bodies under the central government. The '
   'designated entity formulates the detailed procedure and instructions for implementation and '
   'integration with the NPST Guiding Document for teacher professional development and career '
   'management. The appropriate Government appoints a Nodal Officer to liaise with NCTE.',
   'recommended', 'verified',
   'Any State/UT or central-body notification designating an implementing entity and issuing '
   'implementation instructions.',
   'CRITICAL FOR THIS SCHOOL. NPST does not bind a school directly. It reaches one only through '
   'an implementing entity designated by the State/UT Government, or by a body under the central '
   'government (CBSE is such a body). Whether the Government of Punjab has designated an entity '
   'and issued instructions, and whether CBSE has adopted NPST for affiliated schools, are both '
   'UNVERIFIED. Until one of them is established, NPST is a voluntary reference framework for '
   'this school and must be presented as recommended, never as required.',
   'Recorded verbatim in substance from §5.2. This is the clause that determines whether the '
   'school''s NPST mapping is a compliance obligation or a professional reference.'),

  ('central.npst.career_progression_linkage',
   'NEP 2020 Para 5.20, quoted in the NPST Guiding Document',
   'NEP 2020 envisages NPST informing teacher career management where adopted by States',
   'NEP 2020 Para 5.20 provides that the National Professional Standards for Teachers could be '
   'adopted by States and determine all aspects of teacher career management, including tenure, '
   'professional development efforts, salary increases, promotions and other recognitions, and '
   'that promotions and salary increases will not occur based on length of tenure or seniority '
   'but only on the basis of such appraisal.',
   'recommended', 'verified',
   'State adoption instrument, where one exists.',
   'This is a policy aspiration expressed in NEP 2020 and quoted by NCTE. It is conditional — '
   '"could be then adopted by States". It is NOT authority for this school to tie increments to '
   'an NPST appraisal. Any such linkage would be school policy and is additionally gated by the '
   'school''s unverified funding/service status.',
   'Relevant to Stage 5. Recorded now so the increment design cannot later cite NEP 5.20 as if it '
   'were binding.')

) as v(requirement_key, clause_reference, title, requirement_text, classification,
       verification_status, evidence_required, applicability_note, notes)
join regulatory.source s
  on s.source_url = 'https://ncte.gov.in/website/PDF/NPST/NPST-Book.pdf';

insert into regulatory.requirement_school_type (requirement_id, school_type)
select r.id, 'all_school_types'::regulatory.school_type_applicability
from regulatory.requirement r
where r.requirement_key like 'central.npst.%';

insert into regulatory.requirement_employee_category (requirement_id, employee_category)
select r.id, 'all_teaching_staff'
from regulatory.requirement r
where r.requirement_key like 'central.npst.%';

-- Applicability to this school remains undetermined and unenforced, exactly as
-- for every other requirement in the register.
insert into regulatory.school_requirement_status (school_id, requirement_id, applicability, is_enforced)
select s.id, r.id, 'potentially_applicable', false
from core.school s
cross join regulatory.requirement r
where r.requirement_key like 'central.npst.%'
on conflict (school_id, requirement_id) do nothing;
