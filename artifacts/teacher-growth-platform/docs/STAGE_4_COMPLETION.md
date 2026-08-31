# Stage 4 Completion Report

**Date:** 2026-08-21
**Stage:** 4 of 6 — CBSE CPD Compliance and SQAAF
**Status:** Complete. Stage 5 not started, awaiting instruction.

---

## 1. What was built

Eight migrations (`0031`–`0038`), taking the database from 73 to **91 tables**
across two new schemas, `compliance` and `sqaaf`.

| Migration                    | Contents                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `0031_compliance_config`     | Versioned CPD regulatory configuration: categories, source types, requirement versions, the allocation matrix, activity rules and cap groups |
| `0032_cpd_ledger`            | The CPD record, its competency mappings, duplicate prevention and the append-only status trail                                               |
| `0033_sqaaf_framework`       | SQAAF framework versions, performance levels, domains, sub-domains, standards, submission windows                                            |
| `0034_sqaaf_assessment`      | Self-assessment, standard ratings, evidence mapping, evidence gaps, improvement actions                                                      |
| `0035_compliance_engine_rls` | The ledger engine, risk policy, 46 RLS policies, privileges                                                                                  |
| `0036_stage4_roles_views`    | Role grants and four cross-schema API views                                                                                                  |
| `0037_stage4_provisioning`   | The verified SQAAF structure and CPD configuration, as a provisioning function                                                               |
| `0038_hod_cpd_verification`  | Policy change: Heads of Department and Academic Coordinators may verify CPD records                                                          |

Application: `/cpd`, `/compliance`, `/sqaaf`, `/sqaaf/readiness-pack`, and seven
server actions.

Documents: [`CPD_COMPLIANCE.md`](CPD_COMPLIANCE.md),
[`SQAAF_IMPLEMENTATION.md`](SQAAF_IMPLEMENTATION.md),
[`REGULATORY_VERSIONING.md`](REGULATORY_VERSIONING.md).

## 2. Regulatory verification done in this stage

Stage 4 opened with an instruction to verify the current rule before activating
it. Two documents were retrieved and read in full.

**CBSE SQAA Framework, April 2023** — 300 pages, from
`cbseacademic.nic.in`. Previously only the seven domain names were known. Now
verified: 48 sub-domains, 84 standards, 336 marks, the four-point scale (I
Inceptive through IV Dynamic Evolving), the 40%/10% weightings, the domain
weightage formula, Annexure F's Self Improvement Plan template, and — decisively
— the eligibility clause:

> Schools affiliated to CBSE **must undergo the process of SQAA and self-assess
> themselves on the SQAA Framework every year** on SQAA Portal.

That moves SQAAF from Stage 1's `recommended` to **mandatory**, and closes the
open question of whether submission is an affiliation condition.

**CBSE CPD Guidelines 2025** was verified at the end of Stage 3 (migration
`0030`) and is the basis for the whole CPD half.

Also resolved: how a private CBSE school reports CPD. The NCERT mechanism runs
through BRC/BEO/DEO and UDISE+, which a private school does not sit inside. CBSE
specifies its own chain — the **CBSE Training Portal** and **OASIS**.

### Deliberately not verified

- **SQAAF maturity-level bands.** Section 1.11.2 is an image; no bands recorded.
- **SQAAF submission window.** Not stated in the framework. Held per academic
  year at `requires_verification`.
- **Whether DIKSHA, SWAYAM or recognised institutions count** toward the CBSE
  CPD requirement. Not mentioned in the notification; seeded as not counting.

## 3. Regulatory values are configuration, not code

No CPD or SQAAF figure appears in `src/`. The numbers are rows in
`compliance.cpd_requirement_allocation` and `sqaaf.domain`.

`tests/unit/no-hardcoded-regulatory-values.test.ts` reads every source file and
fails if one leaks in. Its first version was **vacuous** — it filtered lines with
`/\bcpd\b/i`, and `_` is a word character, so `ANNUAL_CPD_HOURS = 50` never
matched. It was caught by deliberately introducing that constant and watching the
test still pass. It now fails on that exact line and passes when it is removed.

The allocation matrix is the single source of truth for both axes: category
totals (12/24/14) and the source split (25/25) are SUMs over the same six rows,
so they cannot disagree. A deferred constraint trigger refuses a version whose
matrix does not sum to its declared total.

## 4. Duplicate hours cannot happen

The brief's rule — _do not count the same clock hours twice merely because one
programme satisfies multiple competencies_ — is enforced by shape, not by care.
Hours live on `compliance.cpd_record`; competency and SQAAF mappings are edges
that carry none.

Demonstrated with the seeded data: the CBSE assessment programme is 12 hours
mapped to four competencies. A naive join gives **74 hours** for Neha's year.
The ledger gives **38**. Both are asserted, so reintroducing the join fails the
build.

Two further defences: a unique index blocks the same catalogue activity claimed
twice on one date, and a trigger **refuses** any claim exceeding 8 credited hours
per day across overlapping records. It refuses rather than flags, because a
ledger that accepts impossible attendance is not a compliance record.

## 5. The demo scenario

Neha Sharma, Middle Stage Mathematics, 2026-27:

```
Annual CPD                        38 / 50 hours      On track

CBSE / Government                 18 / 25
In-house / School Complex         20 / 25

Core Values and Ethics            10 / 12
Knowledge and Practice            18 / 24
Professional Growth               10 / 14
```

Exactly as the brief specifies, produced by seven CPD records including two
claimed under CBSE activity rules. All names fictional, all data synthetic.

## 6. What is deliberately not claimed

Three of the seven SQAAF domains — Infrastructure, Management and Governance,
Beneficiary Satisfaction — are marked `platform_coverage = 'none'` with a written
note. 18 of 84 standards are platform-relevant.

The readiness pack opens by stating it is partial, names the uncovered domains,
and reports its score over rated standards while saying plainly that it is **not
a SQAAF score**.

Nothing is submitted to CBSE. `sqaaf.self_assessment` records that a _person_
filed it, and cannot reach `submitted_externally` without naming who and when.

## 7. Verification

| Check                              | Result                                        |
| ---------------------------------- | --------------------------------------------- |
| `npm run lint`                     | clean                                         |
| `npm run typecheck`                | clean                                         |
| `npm run test`                     | **266 tests** — 68 unit, 173 database, 25 API |
| `npx playwright test`              | **23 passing**                                |
| `npx next build`                   | compiles                                      |
| Migrations + seed from clean reset | apply cleanly to both databases               |

New this stage: 24 CPD database tests, 39 SQAAF tests, 12 PostgREST contract
tests, 5 hard-coding guards, 8 Playwright specs.

### Two gaps found on review, and closed

Re-reading the brief against what was built surfaced two instructions that the
data model satisfied but no screen did:

- _"Integrate this information with the Teacher Service/Profile record."_ The CPD
  ledger existed but `/me` did not show it. The profile now carries a training
  record — programme, provider, dates, domain, source, hours, certificate and
  approval — which is what makes it a service record rather than a dashboard.
- _"department/stage CPD trends."_ Department and staff category were there;
  **stage** was not, even though stage is a first-class dimension everywhere else
  in the platform. Added, with the caveat stated on the card: a teacher who
  teaches two stages is counted in both, so stage totals deliberately do not sum
  to the whole-school figure.

### Defects found and fixed

1. **A PostgREST embed returned nothing, silently.** `getRatings()` used
   `level:level_id(...)`. Both FKs to `performance_level` are composite, and
   composite FKs reject column-name embeds — the Stage 2 lesson (migration
   `0019`) recurring in a new place. Because the data layer returns `data ?? []`,
   the readiness pack showed _"0 of 84 standards rated"_ while the database held
   four. Fixed with the relation name plus constraint; a contract test now pins
   both the working form and the failing one.
2. **Provisioning ran against an empty table.** Migration `0037` originally
   looped over `core.school`, which is empty at migration time on a fresh reset —
   the school is created by the seed. The migration succeeded and did nothing.
   Converted to `sqaaf.provision_framework()`, called by the seed. Migration
   `0030` had shipped the same mistake; the applicability update it intended is
   now also seed-time.
3. **Heads of Department could not verify CPD.** `cpd.approve` was VP, Principal
   and HR/PD only, making routine verification a whole-school bottleneck.
   Migration `0038`, recorded as a policy change rather than edited into `0036`.
4. **The Playwright suite ran in parallel across files.**
   `describe.configure({ mode: 'serial' })` orders tests within a file, not
   across them, and `fullyParallel: true` with default workers meant the two
   suites interleaved their writes to one shared database as the same users. It
   surfaced as a client-side exception in a Stage 3 spec that passed perfectly
   well on its own. Config is now `fullyParallel: false, workers: 1`, with the
   reason recorded — DB-backed e2e against shared fixtures cannot be parallel.
5. **`core.teacher_profile` had no `(id, school_id)` unique constraint,** so
   child tables could not enforce tenancy by composite FK and relied on RLS
   alone. Added; `id` is already unique so it costs nothing.
6. **The API tests hard-coded 38 hours** against the same stack Playwright
   mutates, so `npm run check` broke after an e2e run. They now assert the
   invariant — total equals the sum of each split — with the exact figures pinned
   in the database suite, which runs against a server Playwright never touches.

## 8. Assumptions

1. The 8-hours-per-day overlap ceiling is a plausibility check, not a CBSE rule.
   It is not configurable; if a school runs 10-hour training days it will need to
   become one.
2. The at-risk pacing threshold (75% of pro-rata) is school policy, stored in
   `compliance.risk_policy` with its rationale, and labelled as such wherever
   shown.
3. Which 18 standards are platform-relevant is a judgement, recorded per standard
   with a note. It should be reviewed with academic leadership.
4. All 84 standards are loaded, including those for hostels and canteens, marked
   `residential_only` and `day_school_canteen_only` so a day school is not marked
   down for a hostel it does not have.
5. Activity rules are seeded against the school-delivered side of Professional
   Growth and Development, which is where the notification places them.

## 9. Outstanding

**Regulatory**

1. **CBSE affiliation number and status** — now the single gate on both CPD and
   SQAAF compliance reporting. Everything else is verified.
2. School funding status — still gates Stage 5, unchanged since Stage 1.
3. SQAAF maturity-level bands; submission window.
4. Classification of DIKSHA, SWAYAM and recognised institutions.
5. CBSE Affiliation Bye-Laws, Notification 16/2021, Punjab RTE Rules, NCTE
   qualification regulations, DPDP commencement — unchanged.

**Engineering** 6. Bulk CPD entry for whole-school training days. 7. Notification of at-risk teachers; the state is computed, nothing chases it. 8. Malware scanning before serving uploaded files — inherited, still the main
reason for caution about enabling upload. 9. Year-on-year SQAAF comparison.
_(The compliance dashboard's SQAAF evidence-gaps panel, missing at first
delivery, was added 2026-08-21.)_ 10. Observation capture UI, moderation, KPI outcome recording — carried from
Stage 3.

## 10. Not built, as instructed

The Punjab salary and increment engine. Increment readiness, recommendation and
approval remain Stage 5, behind the funding-status gate closed since Stage 1.

**Stage 5 has not been started.**
