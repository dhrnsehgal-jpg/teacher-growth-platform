# Stage 2 Completion Report

**Date:** 2026-08-20
**Stage:** 2 of 6 — Teacher Competency, KPI and Evidence Framework
**Status:** Complete. Stage 3 not started, awaiting instruction.

---

## 1. Headline: NPST is now verified

Stage 1 recorded the NPST Guiding Document as REQUIRES VERIFICATION because
`ncte.gov.in` refused connections. During Stage 2 it was **retrieved in full and
read** — 56 pages, from NCTE's own CloudFront distribution, reached via
`web.ncte.gov.in`.

That changed what the framework may honestly claim. It did **not** make NPST
binding:

- NPST calls itself a **guiding document**.
- **§5.2**: it _"shall be implemented by a suitable entity designated by the
  appropriate State/UT Government"_, and likewise by bodies under the central
  government.
- So NPST reaches this school only if Punjab designates an implementing entity,
  or CBSE adopts it for affiliated schools. **Neither is verified.**

NPST is therefore `recommended`, its per-school applicability is
`potentially_applicable`, and it is not enforced. Migration `0009` records three
NPST requirements — structure, applicability, and the NEP 5.20 career-management
linkage — the last specifically so that Stage 5 cannot later cite NEP 5.20 as if
it authorised tying increments to an NPST appraisal.

**Still unverified:** NPST Domains 9, 10 and 11 could not be extracted from the
PDF (the surrounding pages appear to be images). They are recorded as missing
rather than invented, so the NPST reference framework is knowingly incomplete.

## 2. What was built

Ten migrations (`0009`–`0018`), taking the database from 28 to **51 tables**,
all with RLS and at least one policy — 105 policies in total.

| Migration                        | Contents                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `0009_npst_verified`             | NPST source verified; three NPST requirements recorded                                                                               |
| `0010_competency_framework`      | `competency` schema: framework → standard → domain → competency → indicator, proficiency scales, descriptors, applicability, targets |
| `0011_competency_resolution_rls` | `resolve_targets()`, `teacher_dimensions()`, `retire_competency()`, RLS, audit triggers                                              |
| `0012_kpi_framework`             | `kpi` schema: categories, templates, per-teacher assignments, school KPI policy, `validate_teacher_kpi_set()`                        |
| `0013_evidence_framework`        | `evidence` + `growth` schemas: types, artefacts, many-to-many linking, status lifecycle, requirements, professional goals            |
| `0014_stage2_permissions_grants` | `kpi.manage` / `kpi.assign`; role grants refreshed; privileges and default privileges for the four new schemas                       |
| `0015_framework_provisioning`    | NPST reference framework + the school's operating framework (23 competencies)                                                        |
| `0016_indicators_descriptors`    | 63 behavioural indicators, 115 proficiency descriptors                                                                               |
| `0017_evidence_kpi_targets`      | 18 evidence types, 43 evidence descriptors, 12 KPI categories, 12 KPI templates, 49 competency targets                               |

Seeded content, per school, via provisioning functions (so a second school gets
the same starting point and can then diverge):

|                            | Count                       |
| -------------------------- | --------------------------- |
| Competencies               | 23                          |
| Behavioural indicators     | 63                          |
| Proficiency descriptors    | 115 (all 23 × all 5 levels) |
| Evidence descriptors       | 43                          |
| Competency targets         | 49                          |
| KPI categories / templates | 12 / 12                     |
| Evidence types             | 18                          |
| NPST reference domains     | 10                          |

## 3. Source classification — the honesty requirement

Every item carries two axes, and `aligned` **cannot be saved without a
citation** (database constraint, not convention).

| Classification                 | Count  | Meaning                                                                        |
| ------------------------------ | ------ | ------------------------------------------------------------------------------ |
| Official-framework **aligned** | **18** | Traceable to a named clause of a verified source — 15 NPST, 3 CBSE             |
| **Derived**                    | **2**  | Informed by an external framework but reworded or broadened; no clause claimed |
| **School-defined**             | **3**  | The school's own; no external claim of any kind                                |

The three school-defined competencies are **Child Safety and Safeguarding**,
**Student Wellbeing** and **Innovation**. Safeguarding is deliberately _not_
labelled statutory: India has instruments here (POCSO, CBSE school-safety
guidance) but **none were verified in Stages 1–2**, so claiming them would breach
the project's own rule.

The two derived items are **Classroom and Learning Environment** (built out from
NPST indicator 1.1.2, which has no matching domain) and **Digital Pedagogy**
(SQAAF lists "Digital Literacy", which is not the same thing).

Where a competency is NPST-aligned, **NPST's own indicator text is used verbatim**
and cited by NPST number.

Full table in [`COMPETENCY_FRAMEWORK.md`](COMPETENCY_FRAMEWORK.md) §3.

## 4. Targets visibly differ

Six targeting dimensions: teacher category, school stage, career level, RBAC
role, leadership responsibility, subject. The most specific matching row wins;
equal specificity resolves upward.

| Teacher          | Post         | Leadership      | Mentoring      | Subject      | Assessment     | Differentiation | Comp. thinking |
| ---------------- | ------------ | --------------- | -------------- | ------------ | -------------- | --------------- | -------------- |
| Simran Kaur      | Foundational | Foundation      | Foundation     | Proficient   | **Developing** | **Advanced**    | **Foundation** |
| Harpreet Singh   | PRT          | Foundation      | Foundation     | Proficient   | Proficient     | Proficient      | Developing     |
| Neha Sharma      | TGT          | Foundation      | Foundation     | Proficient   | Proficient     | Proficient      | Developing     |
| Rajesh Verma     | PGT          | Foundation      | **Developing** | **Advanced** | **Advanced**   | Proficient      | **Proficient** |
| Anjali Mehta     | HOD          | **Advanced**    | **Advanced**   | Proficient   | Proficient     | Proficient      | Proficient     |
| Gurpreet Dhillon | Principal    | **Expert/Lead** | Proficient     | Proficient   | Proficient     | Proficient      | Developing     |

Expectations move in **both** directions: Simran's assessment target is lower
than her colleagues' because she is an entrant, and her differentiation target is
higher because the attainment spread at Foundational stage is widest. A newly
appointed PRT and a Head of Department demonstrably do not share leadership
expectations.

All names are fictional; all data synthetic.

## 5. Student outcomes are capped, not banned

`is_student_outcome_measure` is flagged on templates and assignments, and
`kpi.school_policy` caps the share of a teacher's KPI weight those measures may
carry — default **30%**, and explicitly **school policy, not a CBSE or State
requirement**.

`kpi.validate_teacher_kpi_set()` enforces it. The seeded sets sit at 25%
(Rajesh) and 20% (Anjali); a test adds a 100-weight board-results KPI and asserts
`student_outcome_share_exceeded` fires.

The student-progress template also measures progress **against each student's own
baseline** rather than raw attainment, so a teacher is not rewarded or punished
for their intake.

## 6. Verification

### Checks run — all passing

| Check                                 | Result                               |
| ------------------------------------- | ------------------------------------ |
| `npm run lint`                        | clean                                |
| `npm run typecheck`                   | clean                                |
| `npm run test`                        | **112 tests** — 63 unit, 49 database |
| `npx next build`                      | 7 routes compile                     |
| Migrations + seed from clean `initdb` | apply cleanly                        |
| Static verifier                       | 51 assertions                        |

The 49 database tests run against a real PostgreSQL 15 server as the
`authenticated` role, covering every area the brief names:

- **Role-specific targets** — PRT vs HOD vs Principal on leadership; mentoring rising with seniority
- **Stage-specific targets** — computational thinking Foundational vs Secondary; differentiation higher at Foundational
- **Category and career-level targets** — PGT subject knowledge; entrant assessment
- **KPI assignment** — weights total 100, policy validation, student-outcome cap, reviewer required
- **Evidence linking** — one file, four links; single-target constraint; status transitions; reason required to return
- **RBAC** — teacher sees only own evidence and KPIs; Science HOD sees Science staff; a Languages PRT sees neither; a teacher cannot edit the framework or self-assign a KPI
- **Historical preservation** — retirement keeps the competency, its targets and its indicators; drops out of resolved expectations; reason required
- **Schema-wide invariants** — every table has RLS and a policy; `authenticated` can reach every schema, `anon` none; every `SECURITY DEFINER` function pins `search_path`

### Defects found and fixed

Running the real Supabase stack found five defects that neither the SQL tests
nor the local preview could reach — every one of them in the production path:

1. **Four of the app's queries were broken.** PostgREST rejects an embed naming
   the foreign-key COLUMN when the key is composite: `domain:domain_id!inner`
   fails where `domain!inner` works. Single-column FKs accept either form, which
   is why some queries passed and hid the pattern.
2. **Cross-schema embedding is impossible in PostgREST**, in any syntax.
   `kpi.teacher_kpi → core.app_user` (the reviewer) and
   `competency.competency_target → core.teacher_category / school_stage /
career_level` could never work. Fixed with two views in migration `0019`,
   both `security_invoker = true` — without that a view becomes a way around RLS.
3. **The Stage 2 schemas were not exposed over the API.** `config.toml` still
   listed only the Stage 1 schemas, so every Stage 2 page would have returned
   nothing through PostgREST.
4. **Email logins were disabled entirely.** `[auth.email] enable_signup` maps to
   GoTrue's `EXTERNAL_EMAIL_ENABLED`, which gates the whole email provider rather
   than registration. Every staff login failed with "Email logins are disabled".
   Self-registration is correctly closed by `[auth] enable_signup` instead.
5. **Seeded staff had unusable auth accounts.** The seed wrote `auth.users` rows
   with only an id — NULL `aud`, `role`, `instance_id` — and NULL token columns,
   which GoTrue scans into non-nullable Go strings ("Database error querying
   schema"). **Stage 3 sign-in would not have worked.** The seed now creates real
   accounts on Supabase while staying compatible with the local shim.

Found earlier, by running the database and the UI:

1. **Evidence status history violated its own foreign key.** The history write
   sat in the `BEFORE INSERT` trigger, where the evidence row does not exist yet.
   Split: validation `BEFORE`, history `AFTER`. Only applying the migration to a
   real database surfaced this.
2. **`kpi.assign` was not scope-checked.** The policy required the permission but
   not `can_view_staff_record()`, which would have let a Head of Department set
   KPIs school-wide. Caught during review, fixed before first application.
3. **A PostgREST filter on an unselected relation.** `listCompetencies` filtered
   on `domain.standard.framework.key` while selecting only `framework_id`.
   PostgREST can only filter on an embedded resource; the relation is now
   embedded.
4. **`run.sh start` re-applied migrations over a populated database.** It now
   detects an existing schema and directs you to `reapply`.
5. **The staff directory was invisible to everyone.** `app_user_select_colleagues`
   (from Stage 1) tested colleague visibility with an inline subquery over
   `core.user_role_assignment` — a table that is itself RLS-protected, so the
   subquery only ever saw the caller's own assignments and the policy was always
   false. Every user could see exactly one row in `core.app_user`: themselves,
   and `staff_directory.read` did nothing. Found only by rendering the UI, where
   a teacher's KPI reviewer displayed as "Not yet named" despite one being
   assigned. Fixed in migration `0018` by resolving the check through a
   `SECURITY DEFINER` function, with three regression tests. The lesson
   generalises: **a policy that reads an RLS-protected table must go through a
   definer function**, or it silently evaluates against a filtered world.
6. **My own static verifier reported 18 false failures** — it cannot see RLS or
   policies created through `execute format(...)`, and still read only the Stage 1
   migration for permissions. RLS coverage is now asserted against the live
   database instead, which is authoritative; the verifier's permission and grant
   parsing reads all migrations.

### UI and API verification

The UI **has been rendered and inspected** against real seeded data. All seven
routes return 200, the console is clean, and switching persona visibly changes
the resolved expectations — Rajesh (PGT) shows Subject Knowledge at Advanced and
Leadership at Foundation; Anjali (HOD) shows Collaboration at Advanced.

Two data paths exist and both are now verified:

| Path                    | How it reads                               | Verified by                       |
| ----------------------- | ------------------------------------------ | --------------------------------- |
| Local preview           | PostgreSQL directly, under RLS. No Docker. | Rendering every route             |
| supabase-js / PostgREST | The production path.                       | 13 contract tests in `tests/api/` |

Docker was obtained via **colima** on Apple Virtualization.framework — no
administrator password required — so the full Supabase stack runs locally. That
unblocked `npm run db:types` (`src/types/database.ts` is now genuinely generated
across all eight schemas) and exposed five defects listed above.

## 7. Assumptions

1. NPST's three Standards are a reasonable spine for the school's own framework.
   The school's framework mirrors that structure but is explicitly its own.
2. The five-point proficiency scale is a **product descriptor**, not NPST
   terminology. NPST's three levels are recorded separately.
3. Seeded targets are a **starting proposal** for the school to review, not a
   recommendation with evidential backing. The rationale on each row states the
   reasoning so it can be argued with.
4. The 30% student-outcome cap and the 4-KPI minimum are defaults for the school
   to set deliberately.
5. Leadership posts (HOD, Academic Coordinator, Vice Principal, Principal) exist
   both as teacher categories and as RBAC roles. Category = the post; role =
   authority in the platform. A person normally holds both.

## 8. Outstanding for Stage 3

**Engineering**

1. Render and verify the UI; add Playwright scope-isolation specs.
2. Assessment tables: self-assessment, reviewer assessment, moderation, scores
   against proficiency descriptors.
3. Gap identification — assessed ordinal below target ordinal — with the product
   rule that a gap is never shown without a route out of it.
4. Evidence upload UI **and storage bucket policies mirroring the RLS rules**.
   Upload must not be enabled in a real deployment until these exist.
5. Classroom observation capture.
6. The self-appraisal conflict rule (nobody assesses themselves), deferred from
   Stage 1.
7. ~~Admin create/edit forms for competencies, indicators and targets~~ —
   **closed 2026-08-21.** All nine configuration capabilities the brief lists are
   now built; see the addendum to
   [`COMPETENCY_FRAMEWORK.md`](COMPETENCY_FRAMEWORK.md). This item was carried
   unaddressed through Stages 3 and 4 and was found by auditing the briefs
   line by line.

**Regulatory verification** (unchanged from Stage 1 unless noted)

1. **School funding status** — still gates all of Stage 5.
2. **CBSE CPD Guidelines 2025** — still unread; gates Stage 4 compliance claims.
3. **NPST implementation in Punjab** — _new_. Has Punjab designated an
   implementing entity under NPST §5.2? Has CBSE adopted NPST? Either would
   change NPST from reference to obligation.
4. **NPST Domains 9–11** — _new_. Unextractable from the PDF.
5. **Child-safeguarding instruments** — _new_. POCSO and CBSE school-safety
   guidance need verifying before competency #2 can be described as statutory.
6. CBSE Affiliation Bye-Laws, Punjab RTE Rules, SQAAF manual, NCTE qualification
   regulations, DPDP commencement — all still outstanding.

## 9. Not built, as instructed

CPD system, increment/appraisal calculation, gap algorithms, AI recommendations,
KPI scoring. Stage 2 defines expectations; it does not evaluate against them.

The teacher profile deliberately shows **no assessment results** and says so
rather than leaving a blank panel.

**Stage 3 has not been started.**
