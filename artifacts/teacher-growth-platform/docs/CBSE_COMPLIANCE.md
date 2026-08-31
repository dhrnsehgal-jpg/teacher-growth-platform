# CBSE Compliance

**Status:** CPD Guidelines 2025 verified; Bye-Laws and circulars still unverified.
Read §1 before using anything here.
**Last updated:** 2026-08-20

---

## 1. Read this first

**`cbse.gov.in` refused automated retrieval (HTTP 403) throughout Stage 1
research.** The CBSE Affiliation Bye-Laws, the CBSE CPD Guidelines 2025 and CBSE
circulars could not be read. Their official URLs are recorded below so a person can
open them directly.

**Update, 2026-08-20:** the school supplied the **CBSE CPD Guidelines 2025** PDF
directly. It has been read in full and is now `VERIFIED` — see §4, which is no
longer a list of open questions.

**Update, 2026-08-20:** the **SQAA Framework (April 2023)** was retrieved
successfully from `cbseacademic.nic.in`, which — unlike `cbse.gov.in` — does not
block automated requests. Read in full and `VERIFIED`; see §6.

The Affiliation Bye-Laws and circulars remain unread.

Nothing in those documents has been assumed, inferred or filled in from memory or
from secondary sources. Where this document says a requirement is unverified, the
platform will not enforce it and will not state it to a teacher as a CBSE rule.

One CBSE source **was** verified: the SQAA Framework overview published on
`cbseacademic.nic.in`, which is a different host and was reachable.

## 2. The school's CBSE position

Recorded in `core.school_regulatory_profile`, all currently `unverified`:

| Fact                 | Field                                 | Status       |
| -------------------- | ------------------------------------- | ------------ |
| Affiliation number   | `cbse_affiliation_number`             | Not recorded |
| School code          | `cbse_school_code`                    | Not recorded |
| Affiliation status   | `cbse_affiliation_status`             | `unverified` |
| Affiliation validity | `cbse_affiliation_valid_from` / `_to` | Not recorded |
| Senior Secondary     | `is_senior_secondary`                 | Not recorded |

The schema will not accept `is_senior_secondary = true` while
`cbse_affiliation_status` is `unverified`. Senior Secondary status is a claim about
the affiliation; it cannot be asserted before the affiliation is.

**Action:** the school office should supply the affiliation certificate and current
status. This is straightforward and unblocks a large part of the CBSE layer.

## 3. CBSE Affiliation Bye-Laws, 2018

**Status: `REQUIRES VERIFICATION`**
**Official source:** `https://www.cbse.gov.in/cbsenew/aff_bye_laws.html` (chapter-wise PDFs)
**Amendment noted:** Circular 07/2024 —
`https://www.cbse.gov.in/cbsenew/documents/Cricular_Amendment_Aff_01062024.pdf`

The Bye-Laws are the primary instrument through which CBSE binds affiliated schools,
including on staffing. The provisions this product needs are:

| Topic                                                            | Why the platform needs it                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Minimum qualifications by post (PRT / TGT / PGT and pre-primary) | Drives `teacher_profile.qualification_verification` and the qualification rules attached to `teacher_category` |
| Terms and conditions of service of employees                     | Determines what the platform may say about service conditions                                                  |
| Salary and allowances provisions                                 | Governs whether and how any pay-related output is permissible                                                  |
| Staff strength and teacher–section norms                         | School-level compliance reporting                                                                              |
| Appraisal / performance requirements, if any                     | Whether appraisal is an affiliation obligation or purely school policy                                         |
| Teacher training obligations                                     | Whether CPD is an affiliation condition                                                                        |
| Service records and documentation                                | Retention obligations                                                                                          |

**None of these have been read.** Until they are, the platform:

- does not assert any minimum qualification as a CBSE requirement;
- does not compute service-condition compliance;
- classifies the school's own appraisal and CPD rules as **School Policy**, not as
  CBSE requirements.

**Action:** a person downloads the current chapter-wise Bye-Laws plus Circular
07/2024, records each relevant clause as a `regulatory.requirement` version with its
clause reference, and sets the verification status.

## 4. CBSE CPD Guidelines 2025 — VERIFIED

**Status: `VERIFIED`** (migration `0030`, 2026-08-20)
**Source:** Notification No. TRG-02/2025 (No. CBSE/Training Unit/2025), dated
01.04.2025, signed by the Director (Training), CBSE.
**Retrieved:** supplied directly by the school as the official PDF, after
`cbse.gov.in` refused automated retrieval throughout Stage 1 research. The
document is a scanned notification; its text was read page by page, not
extracted, and nothing below is inferred.

This was the most important unverified document in the project. It is now read,
and the teacher's seventh question — _"Am I meeting applicable CBSE CPD
requirements?"_ — has an answer whose CBSE half is no longer a placeholder.

### What it establishes

| #   | Requirement key                      | Substance                                                                                                                                 |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `cbse.cpd.annual_hours`              | **50 hours per year**, split **25 hours through CBSE / Government Regional Training Institutes** and **25 hours organised by the school** |
| 2   | `cbse.cpd.domain_allocation`         | Hours allocated across three domains that match the NPST Standards by name                                                                |
| 3   | `cbse.cpd.academic_task_equivalence` | Named academic tasks count toward CPD, **capped at 11 hours**                                                                             |
| 4   | `cbse.cpd.recording_and_portals`     | Recorded on the CBSE Training Portal and, for school-conducted training, the **OASIS** portal                                             |
| 5   | `cbse.cpd.enforcement`               | Penalties available under Affiliation Bye-Laws clause 12.2.9                                                                              |
| 6   | `cbse.cpd.official_duty_protection`  | Teachers on CPD or Resource Person duty are **on official duty — no deduction of salary or leave**                                        |
| 7   | `cbse.cpd.npst_alignment`            | CBSE's CPD domains are aligned to NPST                                                                                                    |

All seven are recorded as `mandatory` and `verified`.

### The domain allocation, exactly as notified

| Domain                              | Total    | Via CBSE / Govt RTIs                         | Via school          |
| ----------------------------------- | -------- | -------------------------------------------- | ------------------- |
| Core Values and Ethics              | 12 h     | 6 h                                          | 6 h                 |
| Knowledge and Practice              | 24 h     | 16 h (12 offline subject-specific + 4 other) | 8 h (6 offline + 2) |
| Professional Growth and Development | 14 h     | 3 h                                          | 11 h                |
| **Total**                           | **50 h** | **25 h**                                     | **25 h**            |

### Academic tasks counted as CPD (within the 11 school hours of Domain 3)

Board examination evaluation 6 h · SQP / marking scheme / item development /
e-content / practical examiner 3 h · research, mentoring, reflective journals,
blogs or paper publication 2 h · Resource Person for CBSE Capacity Building
Programmes 3 h · DD PM e-Vidya CBSE 15 or Eklavya 3030 STEM 3 h · integrating
technology 2 h · CBSE National Conferences 3 h.

The notification caps the total: **"Only 11 hours will be considered. Schools
will keep records for verification."**

### The 25 + 25 fragment, resolved

Stage 1 research encountered a "25 + 25" fragment and recorded it as unverified,
noting it appeared to describe government teachers. It did not: it originates in
**CBSE Affiliation Notification 16/2021 dated 24.09.2021**, which the 2025
notification cites as the source of the split. Recording it then would have been
right by luck and wrong by method, so the caution was correct.

Notification 16/2021 is now registered as its own `regulatory.source` at
`requires_verification` — its own text has not been read, only CBSE's 2025
citation of it. The requirement is carried on the 2025 notification's authority,
not on an unread document.

### What is still not enforced, and why

Applicability for this school is **`potentially_applicable`** with
`is_enforced = false`. The requirement is verified; the school's CBSE affiliation
is still recorded as `unverified` in the School Regulatory Profile, and a verified
requirement is not the same as an established obligation for a particular school.

The determination note carried in the database states the condition for lifting
it: _confirm the affiliation number and status to activate CPD compliance
reporting._ This is the same four-gate discipline applied everywhere else — source
verified, requirement recorded, applicability determined, enforcement enabled —
and only the last two gates remain.

**Consequence for Stage 4:** the CPD hour ledger can now be built against a real,
cited CBSE structure — 50 hours, three domains, a 25/25 split and an 11-hour
equivalence cap — rather than against school policy alone. Compliance _reporting_
stays behind the affiliation gate.

### Clauses referenced but not yet read

The notification cites Affiliation Bye-Laws clauses **9.1.11** and **12.2.9**. The
Bye-Laws themselves remain unread (§3), so the enforcement requirement records
what CBSE says those clauses provide, attributed to the 2025 notification, rather
than quoting the Bye-Laws directly.

## 5. What the NEP/NCERT 50-hour material does and does not establish

This distinction matters enough to state plainly.

**Verified:** NCERT's _Guidelines for 50 Hours of Continuous Professional
Development_ (First Edition, August 2022) exists, describes NEP 2020 as expecting at
least 50 hours of CPD per year, and provides a suggested activity-to-hours
equivalence table. The document states its guidelines **are suggestive** and may be
adapted or adopted by States/UTs and by organisations **including CBSE**.

**Not established:** that CBSE has adopted them; that they bind this school; that 50
hours is a CBSE affiliation condition.

"May be adopted by CBSE" is not "CBSE requires". The platform holds this distinction
structurally: the NCERT requirement rows are classified `recommended`, and their
per-school applicability is `requires_verification` with enforcement off.

## 6. SQAAF — VERIFIED

The full framework document was retrieved and read on 2026-08-20 (April 2023
edition, 300 pages): 7 domains, 48 sub-domains, 84 standards, 336 marks, and a
four-point scale from Level I Inceptive to Level IV Dynamic Evolving.

**Annual self-assessment is mandatory for affiliated schools** — the framework's
eligibility section says so directly. That answers the Stage 1 question of
whether submission is an affiliation condition.

As with CPD, the requirement is verified while applicability to this school is
`POTENTIALLY APPLICABLE`, gated on the unverified CBSE affiliation.

Still unverified: the overall maturity-level bands and the submission window.

See [`SQAAF_IMPLEMENTATION.md`](SQAAF_IMPLEMENTATION.md).

## 7. How CBSE requirements enter the platform

1. Compliance Administrator retrieves the document from an official CBSE URL.
2. Creates a `regulatory.source` row with the URL, retrieval timestamp and, ideally,
   the file's SHA-256 so a silently reissued PDF is detectable.
3. Records each obligation as a `regulatory.requirement` version with its clause
   reference, classification and effective dates.
4. Records applicability: school types, employee categories, evidence required.
5. Sets `regulatory.school_requirement_status` for this school — applicability
   determination, determiner, timestamp.
6. Only then may `is_enforced` be set true.

Every step is audited. Requirement text is immutable once written: an amendment is a
new version marked as superseding the old, so a decision taken in 2026 stays
explainable under the 2026 text.

## 8. Review cadence

CBSE issues circulars frequently, and an unreviewed "verified" is worse than an
honest "unverified" — it looks trustworthy and is not.

- Verified CBSE sources: `review_due_on` set six months out.
- Unverified CBSE sources: `review_due_on` 2026-11-20.
- `regulatory.source.review_due_idx` supports a scheduled job that raises a
  `regulatory_review_due` notification to the Compliance Administrator.

## 9. Open questions for the school

1. What is the CBSE affiliation number, current status and validity period?
2. Is the school affiliated up to Senior Secondary?
3. ~~Does the school already hold a copy of the CBSE CPD Guidelines 2025?~~ —
   **answered**; the school supplied it and it is verified (§4). What remains: is
   the school currently tracking hours against it, and are its teachers registered
   on the CBSE Training Portal with school training recorded in OASIS?
4. Has the school completed a SQAAF self-assessment, and was it required to?
5. Which CBSE circulars has the school been asked to act on in the last two years
   that touch teacher training, appraisal or service conditions?
