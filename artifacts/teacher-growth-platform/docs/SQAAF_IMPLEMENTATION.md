# SQAAF Implementation

**CBSE School Quality Assessment and Assurance Framework**
**Status:** Framework `VERIFIED`; applicability `POTENTIALLY APPLICABLE`
**Last updated:** 2026-08-21

---

## 1. The framework is no longer a guess

Stage 1 deferred these tables deliberately: _"building indicator tables before
the indicator text is verified would mean guessing at the shape."_ The manual
has now been retrieved and read in full.

**Source:** `https://cbseacademic.nic.in/sqaa/doc/handbook.pdf` — _School Quality
Assessment and Assurance Framework_, CBSE Academic Unit, April 2023. 300 pages,
retrieved 2026-08-20.

Verified and loaded:

|                    |                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------- |
| Domains            | **7**                                                                              |
| Sub-domains        | **48**                                                                             |
| Standards          | **84**                                                                             |
| Maximum marks      | **336**                                                                            |
| Performance levels | **4** — I Inceptive (1), II Transient (2), III Stable (3), IV Dynamic Evolving (4) |

| #   | Domain                                                          | Standards | Marks | Weightage |
| --- | --------------------------------------------------------------- | --------- | ----- | --------- |
| 1   | Curriculum, Pedagogy and Assessment                             | 26        | 104   | **40%**   |
| 2   | Infrastructure – Adequacy, Functionality, Aesthetics and Safety | 20        | 80    | 10%       |
| 3   | Human Resources                                                 | 10        | 40    | 10%       |
| 4   | Inclusive Practices                                             | 7         | 28    | 10%       |
| 5   | Management and Governance                                       | 10        | 40    | 10%       |
| 6   | Leadership                                                      | 5         | 20    | 10%       |
| 7   | Beneficiary Satisfaction                                        | 6         | 24    | 10%       |

Curriculum, Pedagogy and Assessment is treated as the core domain because it
holds teaching-learning processes, learning outcomes and assessment practices;
the framework describes the other six as enablers.

### The transcription checks itself

The standard codes were extracted independently of the scoring table, and the
counts match it exactly: 26 / 20 / 10 / 7 / 10 / 5 / 6 = 84, and 84 × 4 = 336.
Tests assert per-domain that `standard_count` equals the number of standards
actually loaded and that `max_score` equals `standard_count × 4`. Had the
transcription dropped or duplicated a standard, the totals would stop agreeing.

## 2. Self-assessment is mandatory and annual

The eligibility section settles a question Stage 1 could not:

> Schools affiliated to CBSE **must undergo the process of SQAA and self-assess
> themselves on the SQAA Framework every year** on SQAA Portal.

Recorded as `cbse.sqaaf.annual_self_assessment`, classification **mandatory**,
verification **verified**. This supersedes the Stage 1 position that SQAAF was
`recommended` and that whether submission was an affiliation condition was
unknown.

Two things stay distinct, as Stage 1 insisted they should:

- The **obligation to self-assess** is mandatory.
- The **practice standards** the framework contains remain guidance.

Applicability to this school is `potentially_applicable` and unenforced, gated on
the same unverified CBSE affiliation as the CPD requirement. The framework itself
notes a guiding principle of _no differential assessment criteria for government,
government-aided and private schools_, so applicability does **not** turn on
funding status — unlike the Punjab service layer.

## 3. What this platform can and cannot evidence

This is the part most likely to mislead a school, so it is stated per domain in
the database and shown on `/sqaaf`.

| Domain                                 | Coverage                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Curriculum, Pedagogy and Assessment | **Partial** — teacher practice, assessment design and pedagogy. Not curriculum policy, teaching days, teacher-student ratio or facilities |
| 3. Human Resources                     | **Primary** — appraisal, capacity building and CPD. Recruitment, salary and non-teaching staff only partly                                |
| 4. Inclusive Practices                 | **Partial** — inclusive pedagogy and assessment. Not physical accessibility, transport or facilities                                      |
| 6. Leadership                          | **Partial** — leadership development of teachers. Not wider leadership practice                                                           |
| 2. Infrastructure                      | **None**                                                                                                                                  |
| 5. Management and Governance           | **None**                                                                                                                                  |
| 7. Beneficiary Satisfaction            | **None**                                                                                                                                  |

`none` is a deliberate, visible statement rather than an omission, and each
carries a written note explaining what the school must gather elsewhere. A test
asserts no standard inside an uncovered domain is marked platform-relevant, and
another asserts every relevant standard carries a note saying what evidence
supports it.

**18 of 84 standards** are marked platform-relevant. Presenting a
teacher-growth platform as covering more than that would produce a
self-assessment the school could not defend under scrutiny.

### The strongest link: standard 3.1.4

> _The school is committed to achieving student learning outcomes by building
> the capacity of teachers through collaborative, reflective and experiential
> processes._

The framework's own evidence list for this standard asks for, among other things,
an **"Annual Training Calendar for each teacher — 50 hours"**, certificates of
participation, impact analysis of CBPs on learner outcomes, reflections on
training, and DIKSHA registration records.

That is the CPD ledger, almost item for item. Collect once, use twice is not a
design aspiration here; it is what CBSE is already asking for.

## 4. Evidence mapping references, never copies

```
Teacher evidence ─┐
Verified competency ─┤
KPI ─┼─► sqaaf.evidence_map ─► SQAAF standard
CPD record ─┤
Development plan item ─┘
```

`sqaaf.evidence_map` points at records that already exist elsewhere in the
platform. A constraint enforces **exactly one target** per row — one of five
foreign keys, or an aggregate note for standards about school-wide practice
rather than any individual's record. Partial unique indexes prevent mapping the
same record to the same standard twice.

### Only verified evidence counts

A mapping records that a platform record _supports_ a standard. Whether that
record is worth anything yet is a separate question, and the answer is read from
the record itself — never stored on the mapping, because two copies of a status
diverge the first time a reviewer returns something.

| Mapped record         | Counts as evidence when                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| Evidence file         | `verified`                                                               |
| CPD record            | `verified` — hours credited, not merely claimed                          |
| Verified competency   | always; the row exists only because someone recorded it with a rationale |
| KPI                   | `active` or `closed`                                                     |
| Development plan item | `impact_verified` or `reassessed` — completing a course proves nothing   |
| Aggregate note        | never. It is a person's assertion, honest but not a record               |

`sqaaf.evidence_readiness` therefore reports three numbers: everything mapped,
what is verified, and what is mapped but unverified. The actionable column —
`platform_relevant_without_evidence` — counts only verified evidence.

> **This was a defect, found by auditing the brief line by line.** Before
> migration `0039` the readiness view counted every mapping. A draft CPD record —
> hours claimed, nothing checked — made a standard read as evidenced, and the
> readiness pack overstated what the school could defend. The seeded data hid it
> because everything mapped there happened to be verified. A test now maps a
> draft, a submitted record and a verified one in turn and asserts which of them
> move the numbers.

Two further consequences worth stating:

- **Mapping to SQAAF never changes CPD hours.** The map carries no hours, for the
  same reason `cpd_record_competency` does not.
- **A CPD record used here is the same record the teacher sees.** There is one
  source of truth, so an artefact cannot drift into two different outcomes.

### The privacy risk, and the mitigation

Stage 1 named it: if teachers come to see their development evidence as primarily
feeding an institutional accreditation exercise, the developmental character of
the platform erodes.

The mitigation is unchanged. The teacher-facing experience never frames evidence
as "for SQAAF" — nothing on `/cpd`, `/dashboard` or `/learning-map` mentions it.
Roll-up is an administrative view behind `sqaaf.read`, and `aggregate_note`
exists so a standard about school practice can be evidenced by a count rather
than by naming individuals.

## 5. Rating standards

One rating per standard per cycle, in `sqaaf.standard_rating`:

- Current level, from the four verified performance levels.
- **Aspirational level** — CBSE's own Annexure F column.
- **Prioritized area** — CBSE's L/M/H.
- **A rationale of at least 20 characters, required.** CBSE's stated framing is
  self-reflection and accountability; a score without its reasoning is an audit
  artefact rather than an improvement tool.
- The responsible person.

A trigger asserts the standard, the level and the aspirational level all belong
to the **same framework version** as the self-assessment. This is the Stage 3
scale-mixing defect (migration `0028`) pre-empted in a new place: two scales in
one system will eventually be mixed unless something refuses.

## 6. Self-improvement plan

CBSE's Annexure F supplies the first seven columns. The last four are this
platform's, and the readiness pack says so in print:

| Column                                      | Whose        |
| ------------------------------------------- | ------------ |
| Domain / sub-domain / performance indicator | CBSE         |
| Level of maturity                           | CBSE         |
| Aspirational level                          | CBSE         |
| Prioritized area (L/M/H)                    | CBSE         |
| Area of improvement                         | CBSE         |
| Proposed action                             | CBSE         |
| Convenor / team                             | CBSE         |
| Target date                                 | **Platform** |
| Status                                      | **Platform** |
| Evidence                                    | **Platform** |
| Review and completion                       | **Platform** |

A school reading its own improvement plan should be able to tell which columns
CBSE asked for and which we added. That is the same discipline as never
describing a school policy as a CBSE rule.

### The workflow refuses to skip review

```
proposed ──► approved ──► in_progress ──► evidence_submitted ──► under_review ──► completed
     └──────────┴──────────────┴────► abandoned (written reason required)
```

`completed` and `abandoned` are terminal. Completing requires a **reviewer** —
`reviewed_by`, `reviewed_at` and `completed_at` are all enforced by check
constraint. The owner marking their own work done is the conflict the platform
refuses everywhere else, and it is refused here too.

An improvement action is visible to anyone with `sqaaf.read` **and** to its
convenor: someone assigned work must be able to see the work, whether or not they
hold the institutional permission.

## 7. Nothing is submitted to CBSE

The platform produces a **readiness pack** at `/sqaaf/readiness-pack` — ratings
with their rationales, the evidence map, recorded gaps and the improvement plan —
for a person to take to the SQAA Portal.

It does not file anything. Automating a regulatory submission would mean the
platform asserting, in the school's name, that its self-assessment is complete
and true. That is the school's assertion to make.

`sqaaf.self_assessment` records that a person filed it —
`externally_submitted_by` and `externally_submitted_at` are both required before
the status may become `submitted_externally`. A test asserts nothing reaches that
status by itself.

The pack opens by saying what it is not: partial by design, covering only the
standards this platform holds evidence for, and naming the three domains it does
not cover at all.

## 8. Submission window

The framework mandates annual self-assessment but does not state a window.
`sqaaf.submission_window` is per academic year and currently holds
`requires_verification` with a note pointing at the SQAA Portal. A check
constraint refuses to mark a window `verified` without dates and a source.

Hard-coding a 2025 window into 2027 is exactly the failure Stage 4 was told to
avoid.

## 9. Still unverified

| Item                                                               | Status                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Overall maturity-level bands (what % maps to which maturity level) | `REQUIRES VERIFICATION` — section 1.11.2 is an image and could not be read. No bands recorded |
| Submission window and portal workflow                              | `REQUIRES VERIFICATION`                                                                       |
| The school's SQAAF history on `saras.cbse.gov.in`                  | Unknown — school office                                                                       |
| Whether this school is CBSE-affiliated                             | `unverified` — gates enforcement                                                              |

The readiness pack reports a score over _rated_ standards and states plainly that
it is **not a SQAAF score**, because a domain score needs every standard in the
domain rated and the weightage formula applied. Reporting a partial total as a
SQAAF result would be the most plausible way for this module to mislead.

## 10. Open items

1. Rate the remaining platform-relevant standards; 4 of 18 are rated in the demo.
2. Map evidence for Inclusive Practices and Leadership — 5 relevant standards
   there currently have none.
3. Verify the maturity-level bands so domain maturity can be computed.
4. Decide who owns the non-covered domains' evidence, and where it lives.
5. ~~Prior-cycle comparison~~ — **built**: `sqaaf.self_assessment_by_year`.

   > It reports the score over **rated** standards only and says so. A partial
   > total presented as a SQAAF score is the most plausible way this module could
   > mislead, so the view names both numbers.
   >
   > The first version of that view joined ratings, gaps and actions in one
   > query and fanned the rows out — reporting four open gaps where there was
   > one. Each aggregate now comes from its own lateral subquery, and a test
   > cross-checks the gap count against the table.
