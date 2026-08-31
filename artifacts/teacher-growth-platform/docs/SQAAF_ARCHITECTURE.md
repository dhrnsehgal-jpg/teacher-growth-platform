# SQAAF Architecture

**CBSE School Quality Assessment and Assurance Framework**
**Status:** Framework `VERIFIED` in Stage 4 — domains, sub-domains, standards
and scoring all read from the manual. Maturity-level bands still unverified.
**Last updated:** 2026-08-21

> **Sections 1-6 record the Stage 1 position and are kept as written.** Most of
> their open questions have since been answered from the manual itself — see
> **§7**, and [`SQAAF_IMPLEMENTATION.md`](SQAAF_IMPLEMENTATION.md) for the built
> system. Read §7 first for the current position; read §1-6 to see what was
> known before the document was in hand.

---

## 1. What was verified

Retrieved and read 2026-08-20 from CBSE's academic unit:
`https://cbseacademic.nic.in/sqaa/doc/TabC-SQAA%20Framework%20Overview.pdf`

**The seven SQAA domains:**

1. Curriculum, Pedagogy and Assessment
2. Infrastructure
3. Human Resources
4. Inclusive Practices
5. Management and Governance
6. Leadership
7. Beneficiary Satisfaction

**Also verified from that document:**

- SQAAF is described as a set of standards and best practices, a tool for individual
  and institutional excellence.
- It is a **self-assessment** instrument, aligned to NEP 2020, aimed at continuous
  school improvement and self-improvement plans.
- A stated guiding principle: **no differential set of assessment criteria for
  government, government-aided and private schools.** This is useful — it means the
  framework's applicability does not turn on the school's funding status, unlike the
  Punjab service layer.
- Continuous Professional Development of teachers is named among the NEP 2020
  recommendations the framework reflects.
- The framework's stated spirit: self-reflection, accountability, innovation,
  collaboration.

## 2. What was NOT verified

| Item                                                                 | Status                  | Note                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sub-domains under each domain                                        | `REQUIRES VERIFICATION` | The full SQAAF manual exceeded the retrieval size limit                                                                                                                                      |
| Standards and performance indicator statements                       | `REQUIRES VERIFICATION` |                                                                                                                                                                                              |
| Domain weightings                                                    | `REQUIRES VERIFICATION` | The overview shows the seven domains numbered but does not confirm relative weights                                                                                                          |
| Scoring scale                                                        | `REQUIRES VERIFICATION` | Search fragments suggested a 4-point benchmarking scale where the top statement carries a weightage of 4; **not confirmed from the source text** and therefore not recorded as a requirement |
| Whether SQAAF submission is an affiliation condition for this school | `REQUIRES VERIFICATION` | Depends on the Affiliation Bye-Laws and current circulars, both unread                                                                                                                       |
| Submission cadence and portal workflow                               | `REQUIRES VERIFICATION` | `https://saras.cbse.gov.in/sqaa/`                                                                                                                                                            |

Official documents to retrieve:

- `https://cbseacademic.nic.in/sqaa/doc/handbook.pdf`
- `https://cbseacademic.nic.in/web_material/Manuals/SQAA_FINAL.pdf`
- `https://cbseacademic.nic.in/sqaa/doc/Self-Assessment-User-Guide.pdf`
- `https://saras.cbse.gov.in/sqaa/`

## 3. Why SQAAF matters to this product

Domain 3, **Human Resources**, is where a teacher professional growth platform earns
its keep at the institutional level. The same evidence a teacher generates for their
own development — competency assessments, CPD hours, observation records,
development plans, impact evidence — is what the school needs when it self-assesses
against Human Resources standards.

Domain 6, **Leadership**, and Domain 5, **Management and Governance**, likely draw on
appraisal process quality and staff development governance.

This creates a genuine design opportunity: **collect once, use twice**. Evidence
gathered for individual growth should roll up to institutional self-assessment
without a second data-collection exercise. That is the point of
`sqaaf_evidence_map`.

It also creates a risk worth naming. If teachers come to see their development
evidence as primarily feeding an institutional accreditation exercise, the
developmental character of the platform erodes. Mitigation: the teacher-facing
experience never frames evidence as "for SQAAF"; roll-up is an administrative view,
and individual attribution is aggregated wherever the indicator does not require
person-level detail.

## 4. Design

**Deferred to Stage 6.** Nothing is built now, because building indicator tables
before the indicator text is verified would mean guessing at the shape.

```
sqaaf_framework_version     — SQAAF edition, tied to a regulatory.source
   └── sqaaf_domain         — the seven domains (verified)
        └── sqaaf_sub_domain
             └── sqaaf_indicator      — statement, level descriptors
                      │
                      │  sqaaf_evidence_map
                      ▼
             evidence in the platform:
               competency assessments, CPD ledger entries,
               observation records, development plans,
               impact assessments, policy documents

sqaaf_self_assessment       — per school, per cycle: status, submitted_at
   └── sqaaf_domain_score   — score, rationale, evidence references
sqaaf_improvement_action    — arising action, owner, target date, status
```

Design commitments:

- **Versioned like everything regulatory.** A SQAAF edition is a
  `regulatory.source`; its indicators hang off a framework version. A revised
  edition does not rewrite last cycle's self-assessment.
- **Evidence is referenced, not copied.** `sqaaf_evidence_map` points at the
  existing record. One source of truth.
- **Scores carry rationale.** A domain score without its reasoning is not auditable,
  and CBSE's own framing — self-reflection and accountability — implies the reasoning
  is the substance.
- **Improvement actions close the loop.** A self-assessment that produces no action
  is an audit artefact, not an improvement tool.

## 5. Classification

SQAAF requirements are currently recorded as **`recommended`**, attributed to CBSE,
with per-school applicability `requires_verification` and enforcement off.

If verification establishes that SQAAF submission is an affiliation condition, the
relevant requirement is superseded by a new version classified `mandatory` — a new
row, not an edit, so the earlier position stays on record.

The framework's own content — its standards and best practices — remains guidance
even if submission is mandatory. Those are different things and the register keeps
them apart: a mandatory _submission_ requirement, and recommended _practice_
standards.

## 6. Verification actions

| #   | Action                                                                                    | Owner                            |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Retrieve the SQAAF handbook and manual; record sub-domains and indicators                 | Compliance Administrator         |
| 2   | Confirm the scoring scale and any domain weightings from the source text                  | Compliance Administrator         |
| 3   | Establish whether submission is an affiliation condition for this school, and the cadence | Compliance Administrator         |
| 4   | Check the school's SQAAF history on `saras.cbse.gov.in`                                   | School office                    |
| 5   | Map Human Resources domain indicators to platform evidence types                          | Academic leadership + Compliance |

Action 5 depends on 1 and should shape the Stage 2 competency framework, so it is
worth starting early: if a Human Resources indicator expects a particular kind of
evidence, the competency framework should be capable of producing it as a
by-product rather than as extra work.

---

## 7. Addendum — the manual was retrieved and read

`https://cbseacademic.nic.in/sqaa/doc/handbook.pdf`, 300 pages, read in full on
2026-08-20. Stage 1 had only the framework overview.

### What §2's table of unknowns now says

| Item                                           | Stage 1                 | Now                                                                                                 |
| ---------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| Sub-domains                                    | `REQUIRES VERIFICATION` | **48, loaded**                                                                                      |
| Standards and performance indicators           | `REQUIRES VERIFICATION` | **84, loaded verbatim**                                                                             |
| Domain weightings                              | `REQUIRES VERIFICATION` | **Verified** — Curriculum, Pedagogy and Assessment 40%, the other six 10% each                      |
| Scoring scale                                  | `REQUIRES VERIFICATION` | **Verified** — four levels, I Inceptive (1) to IV Dynamic Evolving (4), 336 marks over 84 standards |
| Whether submission is an affiliation condition | `REQUIRES VERIFICATION` | **Verified: yes.** Affiliated schools must self-assess every year on the SQAA Portal                |
| Submission cadence and portal workflow         | `REQUIRES VERIFICATION` | **Cadence verified (annual). Window still unverified** — the manual does not state one              |

Stage 1 recorded a search fragment suggesting a 4-point benchmarking scale and
declined to treat it as a requirement. The fragment was right, and declining was
still correct: it is now recorded from the manual, with the level names the
fragment did not carry.

### What changes in classification

Stage 1 classified SQAAF as `recommended` (§5). The eligibility clause makes
annual self-assessment **mandatory** for affiliated schools, and it is now
recorded as such. The distinction §5 drew survives intact and is load-bearing:
the _obligation to self-assess_ is mandatory; the _practice standards_ remain
guidance.

Applicability stays `potentially_applicable` and unenforced, gated on the
school''s unverified CBSE affiliation. Usefully, the framework states a guiding
principle of no differential criteria for government, aided and private schools —
so applicability does not turn on funding status.

### §4''s design, as built

The shape sketched in §4 survived contact with the real document, with two
changes worth noting:

- `sqaaf_domain_score` was not built. Domain scores need every standard in a
  domain rated **and** the weightage formula applied; with 18 of 84 standards
  platform-relevant, a computed domain score would be misleading. The readiness
  pack reports a score over rated standards and says explicitly that it is not a
  SQAAF score.
- `platform_coverage` was added per domain, and `platform_relevant` per standard.
  Stage 1 anticipated the "collect once, use twice" opportunity but not the need
  to state, in the data, what this platform **cannot** evidence.

### §6 verification actions

| #   | Action                                                              | Status                                                                                                                               |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Retrieve the handbook and manual; record sub-domains and indicators | **Done**                                                                                                                             |
| 2   | Confirm the scoring scale and weightings                            | **Done**                                                                                                                             |
| 3   | Establish whether submission is an affiliation condition            | **Done — it is**                                                                                                                     |
| 4   | Check the school''s SQAAF history on `saras.cbse.gov.in`            | **Open** — school office                                                                                                             |
| 5   | Map Human Resources indicators to platform evidence                 | **Done** — and standard 3.1.4''s own evidence list asks for an annual 50-hour training calendar per teacher, which is the CPD ledger |
| 6   | Maturity-level bands (§1.11.2)                                      | **New, open** — that page is an image and could not be read                                                                          |
