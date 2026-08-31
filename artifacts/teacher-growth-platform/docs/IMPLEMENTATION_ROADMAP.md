# Implementation Roadmap

**Last updated:** 2026-08-20
**Current position:** Stage 3 complete, awaiting Stage 4 instruction

---

## Stage 1 — Foundations and regulatory architecture ✅

**Delivered**

- Multi-tenant PostgreSQL schema across `core`, `regulatory` and `audit`
- Row Level Security on every table; scope resolution via
  `core.can_view_staff_record()`
- Nine roles, 36 permissions, separation of duties enforced and tested
- School Regulatory Profile with per-fact verification and the funding-status gate
- Regulatory register with immutable requirement versioning, applicability,
  rule-set snapshots and recalculation authorisation
- Append-only audit trail
- Regulatory research: two sources verified, eight recorded as requiring
  verification with official URLs
- Eleven documents plus the completion report

**Not built, deliberately:** competency framework, KPI framework, gap algorithm, CPD
recommendation engine, increment algorithm, AI recommendations.

---

## Stage 2 — Competency framework and expectations ✅

**Goal:** a teacher can answer _"What is expected of me?"_

**Delivered:** 23 competencies (18 official-framework aligned, 2 derived, 3 school-defined), 63 indicators, 115 proficiency descriptors, 49 targets across six dimensions, 12 KPI templates with a student-outcome cap, 18 evidence types with many-to-many linking, and the teacher profile. NPST verified and mapped. 49 database tests, and the UI verified by rendering. See [`STAGE_2_COMPLETION.md`](STAGE_2_COMPLETION.md).

**Deferred to Stage 3:** Playwright scope-isolation specs, the supabase-js query path (preview uses SQL), admin create/edit forms.

| Work                                    | Notes                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Competency framework tables, versioned  | Framework, domain, competency, indicator, proficiency level, target               |
| Differentiation by stage and category   | A Balvatika teacher and a PGT must see different expectations                     |
| `competency_standard_mapping` structure | Empty until NPST is verified — see [`NPST_ARCHITECTURE.md`](NPST_ARCHITECTURE.md) |
| Authentication flows                    | Sign-in, password reset, first-login privacy notice acceptance                    |
| Application shell                       | Navigation, role-aware layout, school switcher (multi-tenant ready)               |
| Teacher "My Expectations" view          | Competencies, indicators, target level, attributed source                         |
| Admin framework builder                 | Create and version the framework                                                  |
| Playwright scope-isolation suite        | Proves a HOD cannot reach staff outside their department, via UI **and** API      |
| Generated database types                | `npm run db:types` once the local stack runs                                      |

**Dependencies:** none regulatory. The framework is the school's own.

**Parallel non-engineering work:** funding status verification, CBSE document
retrieval (worklist items 1–4 in [`REGULATORY_MATRIX.md`](REGULATORY_MATRIX.md)).

---

## Stage 3 — Evidence, assessment and gaps ✅

**Goal:** a teacher can answer _"Where am I? Where are my gaps? What evidence says so?"_

**Delivered:** the full lifecycle from assessment through gap, recommendation,
learning plan, application and verified impact to reassessment. Deterministic gap
and recommendation engines, both fully explained. 73 tables, 145 tests, and a
Playwright spec walking the demo scenario end to end. See
[`STAGE_3_COMPLETION.md`](STAGE_3_COMPLETION.md).

**Deferred to Stage 4:** evidence file upload and storage bucket policies,
assessment and observation capture UI, moderation, KPI outcome recording.

| Work                                      | Notes                                                   |
| ----------------------------------------- | ------------------------------------------------------- |
| Evidence submission and storage           | Bucket policies mirroring RLS scope                     |
| Evidence → competency mapping             |                                                         |
| Classroom observation capture             | Structured against focus competencies                   |
| Self-assessment and reviewer assessment   |                                                         |
| Moderation with mandatory recorded reason |                                                         |
| Gap identification                        | Current level vs `competency_target`                    |
| Self-appraisal conflict rule              | Nobody assesses themselves — deferred from Stage 1 RBAC |
| Teacher dashboard                         | Position, gaps, evidence trail                          |

**Product rule to enforce here:** a gap must never be displayed without a route out
of it. From Stage 3 that route is a professional goal; from Stage 4 it is a CPD
recommendation.

---

## Stage 4 — CPD, development planning and impact

**Goal:** questions 5 to 8 — what CPD, why, am I compliant, did it work?

| Work                                                   | Notes                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| CPD catalogue, providers, competency mapping           | The mapping is what makes a recommendation explainable                                     |
| CPD hour ledger                                        | Append-only accrual entries                                                                |
| CPD accrual policy, versioned                          | Seeded from the verified NCERT equivalences **as school policy**, attributed to the school |
| CPD compliance reporting                               | Against **verified** requirements only; shows "not yet verified" otherwise                 |
| Individual Professional Development Plan               | Goals, chosen CPD, timeline, success measures, approval                                    |
| Reflection, application in practice, impact assessment |                                                                                            |
| Reassessment cycle                                     | Closes the loop back to Stage 3                                                            |
| CPD recommendation                                     | Rule-based, gap-driven, explainable. **Not** AI.                                           |

**Regulatory dependency:** CBSE CPD Guidelines 2025 must be verified before the
platform makes any statement about CBSE CPD compliance. The module ships without it
by reporting against school policy and stating plainly that the CBSE requirement is
unverified.

**Design constraint:** every recommendation must be explainable as "this gap, from
this evidence, addressed by this activity, which maps to this competency". A
recommendation the system cannot explain is one it should not make.

---

## Stage 5 — Growth, progression and increment

**Goal:** questions 9 and 10 — next career stage, and increment readiness.

| Work                                         | Notes                                                  |
| -------------------------------------------- | ------------------------------------------------------ |
| Growth score                                 | Must store its inputs and weights, not only its output |
| Career progression readiness                 | Against `core.career_level` criteria                   |
| Increment policy, versioned                  | School policy                                          |
| Increment readiness calculation              | **Behind the employment gate**                         |
| Increment recommendation → approval workflow | Separate records, separate roles, mandatory reasons    |
| Approval audit trail                         | Actor, decision, reason, policy version                |

**Hard dependency: school funding status must be verified.** Without it,
`core.employment_compliance_enabled()` returns false and nothing in this stage
computes. This is the item to start chasing now — it is a paperwork question, and it
gates an entire stage.

**Design constraints:**

- No automated decision on pay. The system produces a recommendation and an
  explanation; a person decides.
- Recommendation and approval are held by different roles, enforced by tests.
- A growth score without recorded inputs cannot be used in a career decision.

---

## Stage 6 — SQAAF, compliance and reporting

**Goal:** institutional quality assurance and the compliance picture.

| Work                                       | Notes                                                      |
| ------------------------------------------ | ---------------------------------------------------------- |
| SQAAF framework tables                     | Domains verified; indicators pending verification          |
| SQAAF self-assessment and evidence roll-up | Collect once, use twice                                    |
| Improvement actions                        | A self-assessment producing no action is an audit artefact |
| Compliance dashboard                       | Requirement, source, clause, version, status, last review  |
| Regulatory review scheduling               | Notifications from `review_due_on`                         |
| Reporting and exports                      | Every export audited                                       |
| Penetration test, incident runbook         | Pre-production                                             |

---

## Cross-cutting, by stage

| Item                      | Stage |
| ------------------------- | ----- |
| Data retention schedule   | 2     |
| Privacy notice, versioned | 2     |
| Content Security Policy   | 2     |
| Data Processing Agreement | 2     |
| Storage bucket policies   | 3     |
| Dependency scanning in CI | 2     |
| Penetration test          | 6     |
| Incident response runbook | 6     |

---

## The critical path

Two non-engineering items gate more work than any code:

1. **School funding status.** Gates all of Stage 5. It is a documents question, not
   a technical one, and it should be resolved during Stage 2 rather than discovered
   at Stage 5.
2. **CBSE CPD Guidelines 2025.** Gates the compliance half of Stage 4. Someone with
   browser access needs to download one PDF.

Neither blocks Stages 2 or 3. Both should be in motion now.

---

## What is deliberately never built

- Automated decisions on pay or career outcomes
- Disciplinary case management
- Parent or student access to teacher records
- Any presentation of a school policy as a regulatory requirement
- Enforcement of an unverified requirement
- Recalculation of a closed year without explicit, time-bounded authorisation
