# Competency Framework

**Status:** Stage 2 — implemented and seeded
**Last updated:** 2026-08-20

---

## 1. Structure

```
Framework  →  Standard  →  Domain  →  Competency  →  Indicator
                                          ├── Proficiency Descriptor  (per level)
                                          └── Evidence Descriptor     (suggested evidence)
```

Two frameworks are provisioned per school:

| Framework                      | Role                                                                                               | Contents                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npst_2023`                    | **Reference.** Recorded so the school framework can be mapped against it. No targets attach to it. | NCTE's 3 Standards, 10 verified Domains, and its own 3-level scale                  |
| `school_professional_practice` | **Operating.** Targets, evidence and (from Stage 3) assessment attach here.                        | 3 Standards, 9 Domains, 23 Competencies, 63 Indicators, 115 Proficiency Descriptors |

Frameworks are versioned. A revision is a new version row, not an edit — an
appraisal recorded in 2026 stays explainable under the 2026 wording.

## 2. NPST, and what it does and does not oblige

The NPST Guiding Document, 2023 was **retrieved in full and verified** during
Stage 2 (56 pages, from NCTE's own CloudFront distribution — `ncte.gov.in`
refuses direct connections from this environment).

**Verified structure:**

| NPST Standard                           | Verified Domains                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Core Values and Ethics              | D1 Constitutional values · D2 Professional Relationships                                                                                                         |
| 2 — Knowledge and Practice              | D3 Unique capabilities of each child · D4 Subject knowledge · D5 Curriculum · D6 Content development · D7 Learning plans · D8 Assessment of, for and as learning |
| 3 — Professional Growth and Development | D12 Reflective practice · D13 Engagement in a learning community                                                                                                 |

NPST levels: **Proficient → Advanced → Expert** (three, not five).

> **Domains 9, 10 and 11 are missing on purpose.** They could not be extracted
> from the source PDF — the surrounding pages appear to be images — so they are
> recorded as REQUIRES VERIFICATION rather than invented. The seeded NPST
> reference framework is therefore incomplete and says so.

**What NPST obliges.** NPST calls itself a guiding document. §5.2 provides that
it _"shall be implemented by a suitable entity designated by the appropriate
State/UT Government"_, and similarly by bodies under the central government.

So NPST does **not** bind this school directly. It reaches a school only once
Punjab designates an implementing entity and issues instructions, or once CBSE
adopts it for affiliated schools. **Neither is verified.** NPST is therefore
classified `recommended` in the regulatory register, its per-school applicability
is `potentially_applicable`, and it is not enforced.

NEP 2020 Para 5.20 — quoted inside the NPST document — envisages NPST determining
"tenure, professional development efforts, salary increases, promotions". That is
conditional on State adoption. It is **not** authority for tying increments to an
NPST appraisal here, and Stage 5 must not treat it as such.

## 3. Source classification

Every item carries two axes, and `aligned` cannot be saved without a citation —
enforced by a database constraint, not convention.

| Axis               | Values                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_framework` | `npst` · `cbse` · `punjab` · `school` · `other_framework`                                                                                     |
| `source_alignment` | `aligned` (traceable to a named clause) · `derived` (informed by, reworded/extended) · `school_defined` (the school's own, no external claim) |

### Official-framework aligned — 18 of 23

Each cites a clause of a **verified** source.

| #   | Competency                              | Source | Citation                                                                                                 |
| --- | --------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| 1   | Core Values and Professional Ethics     | NPST   | Standard 1, Domain 1 (SD 1.1–1.4)                                                                        |
| 3   | Communication                           | NPST   | Standard 2, Domain 8 (SD 8.3)                                                                            |
| 4   | Parent and Community Engagement         | NPST   | Standard 1, Domain 2 (SD 2.2, SD 2.3)                                                                    |
| 5   | Collaboration                           | NPST   | Standard 1, Domain 2 (SD 2.1)                                                                            |
| 6   | Subject and Content Knowledge           | NPST   | Standard 2, Domain 4 (SD 4.1)                                                                            |
| 7   | Pedagogical Knowledge                   | NPST   | Standard 2, Domain 6 (SD 6.1)                                                                            |
| 8   | Pedagogical Content Knowledge           | NPST   | §4.2 — Standard 2 expressly encompasses "pedagogical content knowledge"                                  |
| 9   | Lesson and Learning Design              | NPST   | Standard 2, Domain 7 (SD 7.1, 7.2)                                                                       |
| 10  | Competency-Based Education              | CBSE   | SQAA Framework Overview — "Competency Based Teaching"                                                    |
| 11  | Experiential Learning                   | CBSE   | SQAA Framework Overview — "Experiential Learning"                                                        |
| 13  | Assessment and Feedback                 | NPST   | Standard 2, Domain 8 (SD 8.1–8.3)                                                                        |
| 14  | Inclusive Education                     | NPST   | Standard 2, Domain 3 (SD 3.3)                                                                            |
| 15  | Differentiated Instruction              | NPST   | Standard 2, Domain 6 (SD 6.2)                                                                            |
| 18  | Computational Thinking and AI Readiness | CBSE   | SQAA Framework Overview — "Mathematical and Computational Thinking"; "AI, Data Science, Design Thinking" |
| 19  | Reflective Practice                     | NPST   | Standard 3, Domain 12                                                                                    |
| 20  | Professional Development                | NPST   | Standard 3, Domain 13                                                                                    |
| 22  | Mentoring                               | NPST   | Standard 3, Domain 12, indicator 12.5                                                                    |
| 23  | Leadership and School Contribution      | NPST   | Standard 1, Domain 2 (SD 2.5)                                                                            |

### Derived — 2 of 23

Informed by an external framework, but reworded or broadened. **No clause is
claimed**, because the school's version goes beyond what the source says.

| #   | Competency                         | From | Why only "derived"                                                                                                                           |
| --- | ---------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | Classroom and Learning Environment | NPST | Built out from indicator 1.1.2 ("a safe environment where people feel free to share their ideas"). NPST has no classroom-environment domain. |
| 17  | Digital Pedagogy                   | CBSE | SQAAF lists "Digital Literacy". Digital literacy and digital pedagogy are not the same thing.                                                |

### School-defined — 3 of 23

The school's own. **No external framework claim of any kind.**

| #   | Competency                    | Note                                                                                                                                                                                                                              |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | Child Safety and Safeguarding | India has statutory instruments here (for example the POCSO Act) and CBSE has issued school-safety guidance. **None were verified in Stages 1–2.** Until they are, this must not be presented as a statutory or CBSE requirement. |
| 16  | Student Wellbeing             | Implied across NPST Domains 2 and 3 but has no domain of its own, and no verified CBSE instrument on teacher responsibility for wellbeing was located.                                                                            |
| 21  | Innovation                    | No verified external framework names innovation as a teacher competency. Included because the school wants evaluated experimentation, not novelty.                                                                                |

## 4. Indicators

63 behavioural indicators. Where a competency is NPST-aligned, **NPST's own
indicator text is used verbatim** and cited by NPST number — the strongest
provenance available. For example:

> "Uses assessment data to modify lesson plans and pedagogy adequately to suit
> specific learning needs of students." — _NPST 2023, indicator 8.2.2_

Indicators must be observable. A check constraint rejects verdict-style
statements ("Is a good teacher…") and requires a minimum length. It is not a
substitute for review, but it stops the most obvious failure reaching the
database, and `tests/db/stage2.test.ts` asserts the rejection.

## 5. Proficiency

The school's operating scale is five levels — **Foundation, Developing,
Proficient, Advanced, Expert/Lead**. These are **product descriptors**, chosen
for the MVP. They are not NPST terminology; NPST's own three levels are recorded
separately on the reference framework, as the brief requires.

All 23 competencies carry a descriptor at all five levels — 115 in total — so no
assessment can rest on an undefined expectation.

## 6. Targets: why a PRT and an HOD differ

A target row may specify any combination of six dimensions. Every unspecified
dimension means "any". **The row specifying the most dimensions wins**, because
it is the most deliberate statement about that particular teacher.

| Dimension                 | Example                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| Teacher category          | PGT subject knowledge → Advanced                                               |
| School stage              | Computational thinking at Foundational → Foundation; at Secondary → Proficient |
| Career level              | Entrant assessment target → Developing                                         |
| RBAC role                 | `head_of_department` leadership → Advanced                                     |
| Leadership responsibility | Any post carrying it → Proficient on leadership and mentoring                  |
| Subject                   | Available; unused in the seed                                                  |

Resolution is `competency.resolve_targets(teacher_profile_id, academic_year_id)`.
Ties of equal specificity resolve **upward** — an ambiguous configuration keeps
the higher expectation explicit rather than silently softening it.

### Seeded outcome

| Teacher          | Post         | Leadership      | Mentoring      | Subject knowledge | Assessment     | Differentiation | Comp. thinking |
| ---------------- | ------------ | --------------- | -------------- | ----------------- | -------------- | --------------- | -------------- |
| Simran Kaur      | Foundational | Foundation      | Foundation     | Proficient        | **Developing** | **Advanced**    | **Foundation** |
| Harpreet Singh   | PRT          | Foundation      | Foundation     | Proficient        | Proficient     | Proficient      | Developing     |
| Neha Sharma      | TGT          | Foundation      | Foundation     | Proficient        | Proficient     | Proficient      | Developing     |
| Rajesh Verma     | PGT          | Foundation      | **Developing** | **Advanced**      | **Advanced**   | Proficient      | **Proficient** |
| Anjali Mehta     | HOD          | **Advanced**    | **Advanced**   | Proficient        | Proficient     | Proficient      | Proficient     |
| Gurpreet Dhillon | Principal    | **Expert/Lead** | Proficient     | Proficient        | Proficient     | Proficient      | Developing     |

Simran's assessment target is _lower_ than her colleagues' because she is an
entrant, and her differentiation target is _higher_ because the attainment spread
at Foundational stage is widest. Expectations move in both directions — that is
the point.

## 7. Retirement, not deletion

`competency.retire_competency(id, reason, replaced_by)`:

- requires `competency.manage`;
- requires a reason of at least 10 characters, enforced by constraint;
- records who and when;
- retires the competency's indicators with it;
- writes an audit entry;
- **deletes nothing.**

A retired competency stops appearing in resolved expectations but remains on
record with its targets intact, so past assessments stay readable. Tested in
`tests/db/stage2.test.ts`.

## 8. Administration

`/admin/framework` lists the frameworks and every competency grouped by standard
and domain, each with its provenance badge. `/admin/framework/[key]` shows the
indicators, all five proficiency descriptors, the full target table with the
population each row applies to, suggested evidence, and the retirement form.

## 9. Open items

1. **NPST Domains 9–11** — unextractable; the reference framework is incomplete.
2. **Child safeguarding statutes** — POCSO and CBSE school-safety guidance need
   verifying; until then competency #2 stays school-defined.
3. **Punjab-sourced competencies** — none. No verified Punjab instrument bearing
   on teacher competencies was located; the `punjab` source value exists and is
   unused, which is the honest state.
4. **Subject-specific targets** — the dimension exists and is unused.

---

## Addendum — the admin configuration surface

Stage 2 asked for an interface letting authorised users configure the
framework. It shipped with the read views and the retirement flow only, recorded
as outstanding item 7 in [`STAGE_2_COMPLETION.md`](STAGE_2_COMPLETION.md), and
was carried unaddressed through Stages 3 and 4. A line-by-line audit of the
briefs surfaced it; it is now built.

| Capability                         | Where                    |
| ---------------------------------- | ------------------------ |
| Create a competency framework      | `/admin/framework`       |
| Add a competency                   | `/admin/framework`       |
| Edit a competency                  | `/admin/framework/[key]` |
| Add an indicator                   | `/admin/framework/[key]` |
| Define role/stage targets          | `/admin/framework/[key]` |
| Retire a competency                | `/admin/framework/[key]` |
| Define proficiency levels          | `/admin/proficiency`     |
| Create KPI templates · assign KPIs | `/admin/kpi`             |
| Configure evidence requirements    | `/admin/evidence`        |

### What the forms refuse

The interface is where the framework's honesty rules are most easily broken, so
each is enforced at entry as well as in the database:

- **Alignment needs a citation.** Marking a competency or indicator as aligned to
  NPST or CBSE without naming the clause is refused. If you cannot cite one, it
  is _derived_ or _school-defined_ — those are the honest options, and the form
  says so.
- **Indicators must be observable.** "is a good teacher" is rejected with an
  explanation, not a constraint violation.
- **Levels need descriptors.** A level named but not described cannot be applied
  consistently by two assessors, which defeats having a scale.
- **Targets need a rationale.** A teacher is entitled to the reasoning behind an
  expectation.
- **KPIs need a data source and a reviewer.** A KPI whose data nobody can point
  at, or that nobody is accountable for reviewing, is not an agreement.

### What cannot be edited

Editing a competency changes its wording only. The key, the domain and the
source labels are fixed: changing a key breaks every reference to it, and
changing a source label silently rewrites the claim about where the standard
came from. Either is a retirement and a replacement, which the platform supports
and keeps on the record.

Creating a framework also creates its first standard and domain. A framework
with nothing under it cannot hold a competency, and three separate steps just
leave an unusable shell if someone stops after the first.

### Defects found while building it

All three were invisible to SQL tests, because those tests write their own SQL
rather than exercising the actions:

1. **Three composite-FK embeds returned nothing, silently** — domain→standard,
   scale→framework and template→category. The domain dropdown was empty, so the
   competency form could never be submitted. The Stage 2 lesson (migration
   `0019`) recurring for the third time; the fix is the relation name, not the
   column.
2. **A cross-schema embed** from `evidence.requirement` into `core` meant the
   evidence-requirement list rendered empty even after a successful insert.
   Resolved in TypeScript rather than with a view, since it is one admin list.
3. **`kpi.template.description` and `kpi.teacher_kpi.target` are NOT NULL**, but
   the form marked description optional and the assign action allowed a null
   target. Both would have failed on first real use.
