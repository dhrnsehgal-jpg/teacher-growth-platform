# Stage 3 Completion Report

**Date:** 2026-08-20
**Stage:** 3 of 6 — Core Teacher Growth MVP
**Status:** Complete. Stage 4 not started, awaiting instruction.

---

## 1. What was built

The working professional-growth lifecycle, end to end:

```
Assessment → Evidence → Gap → Development Goal → CPD Recommendation
  → Learning Plan → CPD Completion → Application → Impact Evidence
  → Reassessment → Growth
```

Nine migrations (`0020`–`0028`), taking the database from 51 to **73 tables**
across three new schemas — `assessment`, `cpd`, and the extended `growth`.

| Migration                         | Contents                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `0020_assessment`                 | Cycles, per-teacher assessments, observations, append-only ratings, evidence strength, verified competency levels |
| `0021_cpd_catalogue`              | Providers, activities, competency mapping, applicability                                                          |
| `0022_growth_tables`              | Priority bands, strategic priorities, gaps, learning plans and items, the stage machine, the reassessment gate    |
| `0023_engines`                    | `growth.compute_gaps()` and `cpd.generate_recommendations()`                                                      |
| `0024_stage3_grants_views`        | Privileges and five cross-schema views                                                                            |
| `0025_stage3_provisioning`        | Priority bands, the Competency-Based Assessment competency, CPD catalogue                                         |
| `0026_hod_plan_approval`          | Policy change: HoDs and Academic Coordinators may approve development plans                                       |
| `0027_fix_appendonly_triggers`    | Fix: append-only trail triggers ran without privilege                                                             |
| `0028_verified_level_scale_guard` | Guard: verified and expected levels must share a proficiency scale                                                |

Application: sign-in and session middleware, teacher dashboard, competency
growth page, Learning Map, manager dashboard, and nine server actions covering
the lifecycle.

## 2. Assessment: separate inputs, explained outcome

Self-assessment, supervisor assessment, observation and evidence strength are
stored as **separate rows** in `assessment.competency_rating`, one per source,
each carrying its own rationale (15+ characters, enforced). Nothing is averaged.

`assessment.verified_competency` records the outcome _with every input beside
it_ — self, supervisor and observation levels, evidence strength and count, a
written rationale of 20+ characters, and a `determined_from` JSON snapshot. The
teacher sees all of it on `/growth/[competency]`.

Rules enforced in the database, not by convention:

- **Ratings are immutable.** Correcting one means a new row superseding the old.
- **Verified levels are append-only.** A reassessment is a new row; the previous
  level stays on the record. That history _is_ the growth trend.
- **Nobody verifies their own competency.** Self-_assessment_ is expected;
  self-_verification_ is refused by trigger. This closes the self-appraisal
  conflict deferred from Stage 1.
- **Verified and expected levels must share a proficiency scale** (migration
  `0028`).

## 3. Gap engine

Deterministic PL/pgSQL, engine version `gap-engine-v1`. Base gap is expected
minus verified; priority is scored 0–100 across nine factors — magnitude,
mandatory status, strategic priority, KPI relevance, observation signal, evidence
strength, previous attempts, target specificity and weighting.

Every point is attributable: `growth.gap.factors` holds `{factor, points, why}`
per contributor, and the score equals their sum (asserted by test). Bands are
configurable; defaults are No Gap / Low / Medium / High / Critical.

**No model participates in the arithmetic.** Full detail and the calibration
reasoning in [`GAP_ENGINE.md`](GAP_ENGINE.md).

## 4. CPD catalogue and recommendation engine

The catalogue carries everything the brief lists — title, provider, description,
learning outcomes, competencies addressed, level, stage, subject, duration, CPD
hours, delivery method, cost, prerequisite, recognition, URL, availability and
evidence requirement.

Recommendations are deterministic (`cpd-recommender-v1`), ranked across ten
factors, with applicability mismatches and already-taken activities **excluded
outright** rather than quietly penalised. Every recommendation stores its
reasoning, rendered as "Why this course?".

Provider recognition reuses the Stage 2 source vocabulary, so an in-house
workshop can never display as accredited. Recognition is worth 5 points of ~95 —
a tiebreaker, not a driver. Detail in
[`CPD_RECOMMENDATION_ENGINE.md`](CPD_RECOMMENDATION_ENGINE.md).

## 5. Completing a course does not improve a competency

Enforced structurally. The plan-item state machine has **no transition from
`completed` to `reassessed`**, and `growth.can_reassess()` refuses until
completion, reflection, application, verified evidence _and_ reviewer
verification are all present — returning the specific missing item so the
interface can say what is outstanding.

Two separate final requirements matter: verified evidence proves the artefact is
genuine; impact verification is a reviewer confirming they saw it in practice. A
teacher could submit a revised plan they never taught — only the second catches
that. Detail in [`LEARNING_MAP.md`](LEARNING_MAP.md).

## 6. The demo scenario

Neha Sharma, Middle Stage Mathematics. Competency-Based Assessment.

|                    |                                                    |
| ------------------ | -------------------------------------------------- |
| Expected           | **4** (Advanced)                                   |
| Verified           | **2** (Developing)                                 |
| Gap                | **2**                                              |
| Priority score     | **80**                                             |
| Priority band      | **High**                                           |
| Top recommendation | Designing Competency-Based Assessments (score 95)  |
| Outcome            | Reassessed to **3** (Proficient); gap narrows to 1 |

Exactly as the brief specifies. The full loop — selection, approval, completion,
reflection, application, verification, reassessment — is driven through the real
UI by `tests/e2e/growth-lifecycle.spec.ts`, not seeded.

All names fictional; all data synthetic.

## 7. Verification

| Check                              | Result                                                  |
| ---------------------------------- | ------------------------------------------------------- |
| `npm run lint`                     | clean                                                   |
| `npm run typecheck`                | clean                                                   |
| `npm run test`                     | **145 tests** — 63 unit, 69 database, 13 API            |
| `npx playwright test`              | **2 passing** — the full lifecycle, and scope isolation |
| `npx next build`                   | compiles                                                |
| Migrations + seed from clean reset | apply cleanly                                           |

The Playwright spec signs in as a teacher and a manager in turn and walks all ten
steps of the scenario. It asserts **outcomes** rather than transient confirmation
messages — after approval the item must leave the queue and appear under
development in progress — because a toast disappears when the form that produced
it unmounts.

### Defects found and fixed

Four, three of which only an end-to-end run could surface:

1. **Append-only trail triggers ran without privilege.** `plan_item_event` and
   `evidence.status_history` have INSERT revoked from clients so entries cannot
   be forged, but the trigger functions were not `SECURITY DEFINER` — so they ran
   as the caller who had just been denied. Every plan transition and every
   evidence status change failed for real users with _"permission denied for
   table plan_item_event"_. The seed and SQL tests never hit it because they run
   as superuser. Fixed in `0027`.
2. **Reassessment recorded a level from the wrong scale.** The action looked up
   the new level by ordinal alone, matching the NPST reference scale before the
   school's — recording "Expert Teacher" where "Proficient" was meant. Fixed in
   the action, plus a database guard (`0028`) so the class of bug cannot recur.
3. **PostgREST could not see the new schemas.** `config.toml` changes need a full
   stack restart, not `db reset` — `assessment` and `cpd` returned _"Invalid
   schema"_ until the stack was stopped and started.
4. **The assigned manager could not approve.** Stage 2 gave
   `development_plan.approve` to VP and Principal only, so the Head of Department
   who assesses, observes and verifies a teacher could not approve their plan.
   Changed in `0026` — recorded as a deliberate policy change rather than edited
   into the Stage 2 migration.

Two Stage 2 tests were also **strengthened rather than re-baselined**. They
asserted a teacher saw zero evidence and zero KPIs — which passed only because
Neha had none. They now assert _ownership_: every visible row belongs to her.

## 8. Assumptions

1. The five-point school scale is the operating scale; NPST's three-point scale
   remains reference only.
2. Gap factor weights are fixed in the function. Bands are configurable; weights
   are not.
3. `Critical` starts at 85 so that a two-level gap is distinguishable from a
   four-level one — see [`GAP_ENGINE.md`](GAP_ENGINE.md) §3.
4. Reassessment sets evidence strength to `adequate` by default; the reviewer
   sets the real value at verification.
5. The demo CPD catalogue is illustrative. Only the DIKSHA/NISHTHA provider
   carries a verified citation; the rest are school-defined.

## 9. Outstanding for Stage 4

**Engineering**

1. **Evidence file upload and storage bucket policies** — still outstanding from
   Stage 2. Upload must not be enabled in a real deployment until the bucket
   policies mirror the RLS rules.
2. Assessment capture UI — self-assessment and supervisor assessment forms.
   Stage 3 seeds the ratings; it does not yet let a manager enter them.
3. Observation capture UI.
4. Moderation across a group (the `moderation` rating source exists, unused).
5. KPI outcome recording — Stage 3 shows what was agreed, not what happened.
6. Notification and reminders; nothing chases a due date.
7. Bulk approval for managers.

**Regulatory verification** — unchanged from Stage 2, and all still open:
school funding status (gates Stage 5), CBSE CPD Guidelines 2025 (gates Stage 4
compliance claims), NPST implementation in Punjab, NPST Domains 9–11,
child-safeguarding instruments, CBSE Affiliation Bye-Laws, Punjab RTE Rules,
SQAAF manual, NCTE qualification regulations, DPDP commencement.

## 10. Not built, as instructed

The Punjab salary and increment engine. Increment readiness, recommendation and
approval remain Stage 5, and remain behind the funding-status gate that has been
closed since Stage 1.

**Stage 4 has not been started.**

---

## 11. Addendum — the two gaps flagged at handover, now closed

### Evidence file storage (migration `0029`)

Outstanding since Stage 2: evidence rows carried a storage path, but no bucket
existed and no policies governed it, so upload could not safely be enabled.

Now implemented. The `evidence` bucket is **private**, and its policies route
through the same `core.can_view_staff_record()` that the evidence table's own
RLS uses — mirroring the rule rather than reimplementing it, so the two cannot
drift apart. A test asserts the policy expression actually references that
function.

The path convention `<teacher_profile_id>/<evidence_id>/<filename>` is part of
the security model: every policy reads the first segment to decide ownership.

| Operation       | Rule                                                              |
| --------------- | ----------------------------------------------------------------- |
| Upload          | Only into your own folder; a reviewer cannot upload for a teacher |
| Read            | Anyone who can read that teacher's record                         |
| Update / delete | The owner, and only while the evidence is still theirs to edit    |
| `anon`          | Nothing                                                           |

Files are served only through 5-minute signed URLs created with the caller's
session. Upload is wired into the application step of the Learning Map, and the
Playwright spec **uploads a real file** and asserts it comes back as an openable
link.

### Assessment capture UI

Stage 3 seeded the ratings; there was no way for a manager to enter them. Now:

- **`/self-assessment`** — a teacher rates their own practice against each
  expected competency, with a required rationale. Amending inserts a new rating
  and supersedes the old one, which stays on the record.
- **`/assess/[teacherProfileId]`** — reachable from the manager's team list.
  Shows every standing input in one table, then offers three separate acts:
  record a supervisor rating, record a classroom observation (narrative
  required), and verify a level. Verification snapshots every input, requires a
  rationale, and recomputes gaps and recommendations.

Self-verification is refused, and the page 404s for staff outside scope rather
than showing an empty shell.

### Defects found while doing this

1. **`COMMENT ON storage.buckets` failed** — the table is owned by
   `supabase_storage_admin`, not `postgres`. The comment now lives as a SQL
   comment.
2. **Form labels wrapped their controls**, so a `<select>`'s accessible name
   included the selected option — "Level" read as "Level 4 — Advanced", changing
   as the value changed. Every field now uses explicit `htmlFor`/`id`. That is an
   accessibility fix as much as a test fix; it was only noticed because a test
   asked for an exact label match.
3. The local PostgreSQL shim had **no `storage` schema**, so migration `0029`
   could not apply there. The shim now mimics `storage.buckets`,
   `storage.objects` and `storage.foldername()`, as it already did for `auth`.

### Verification after the addendum

| Check                 | Result                                                                               |
| --------------------- | ------------------------------------------------------------------------------------ |
| `npm run check`       | **151 tests** — 63 unit, 75 database, 13 API                                         |
| `npx playwright test` | **3 passing** — lifecycle with real file upload, scope isolation, assessment capture |

Remaining evidence-related gap: **malware scanning** before an uploaded file is
served back. That is the main reason to stay cautious about enabling upload for
real users, and it is recorded in `EVIDENCE_FRAMEWORK.md` §9.

---

## 12. Addendum — dashboard panels the brief listed but Stage 3 did not build

A line-by-line audit against the Stage 3 brief found four panels absent. The
data existed in every case; nothing rendered it, and §1 of this report described
"teacher dashboard, manager dashboard" without noting the omissions. Closed
2026-08-21.

| Panel                        | Where it now reads from                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| Recommended CPD              | The top of the deterministic ranking, across all open gaps           |
| Goals                        | `growth.professional_goal`, with the success measure                 |
| Evidence                     | The teacher's own evidence, with reviewer notes on anything returned |
| Recent feedback              | Observation narratives, evidence decisions, impact verifications     |
| Upcoming reviews _(manager)_ | Assessment cycles closing and plan items falling due, overdue first  |

**Recent feedback** deliberately gathers only what a _manager_ wrote — the
observation narrative, the note on an evidence decision, the note on verifying
that development was applied. It excludes the teacher's own reflections:
"feedback" means feedback received, and showing someone their own words back
pads the panel while telling them nothing. The three sources live in three
schemas, so they are assembled in the data layer rather than in a view, because
PostgREST cannot embed across schemas.

**Upcoming reviews** sorts overdue first. A review that has already slipped
matters more than one approaching, and a list that buries it under future dates
is the wrong shape for the person who has to act.

`tests/e2e/dashboard-panels.spec.ts` now asserts every panel both briefs name,
by heading. That list is the cheapest guard against a panel going missing again.

### A note on empty states

Neha has no professional goal, so her dashboard says so rather than sitting
blank. The test asserts that empty state explicitly, because an honest "nothing
here yet" is the correct rendering and not a fallback to be papered over.
