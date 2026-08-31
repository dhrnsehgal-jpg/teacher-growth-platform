# Stage 1 Completion Report

**Date:** 2026-08-20
**Stage:** 1 of 6 — Product Architecture and Regulatory Foundation
**Status:** Complete. Stage 2 not started, awaiting instruction.

---

## 1. What was completed

### 1.1 Repository

A new repository at `~/teacher-growth-platform`, git-initialised.

The session's working directory, `~/Counsela`, holds an unrelated product — the
Counsela legal-AI OS (FastAPI + Jinja2, with its own `docs/ARCHITECTURE.md` and
`docs/PRD.md`). Stage 1 requires creating `docs/ARCHITECTURE.md`, which would have
overwritten Counsela's. This project was therefore given its own repository, as
agreed at the start of the session. **Counsela is untouched.**

### 1.2 Database foundations

Eight migrations under `supabase/migrations/`, **28 tables**, all with Row Level
Security enabled and at least one policy:

| Migration                        | Contents                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_foundation`                | `core` / `regulatory` / `audit` schemas, shared enums, `set_updated_at`, `reject_mutation`                                                               |
| `0002_tenancy_identity`          | School, academic year, users, permissions, roles, scoped role assignments, authorisation helpers                                                         |
| `0003_regulatory_registry`       | Authorities, versioned sources, immutable requirement versions, applicability, per-school determination, rule-set snapshots, recalculation authorisation |
| `0004_school_regulatory_profile` | Stage and class taxonomy, School Regulatory Profile, the employment gate                                                                                 |
| `0005_org_and_teacher_profile`   | Departments, subjects, teacher categories, career levels, teacher profiles, teaching assignments, supervisory scope resolution                           |
| `0006_audit_and_notifications`   | Append-only audit trail, audit triggers, notifications                                                                                                   |
| `0007_seed_reference_data`       | Permission catalogue, role provisioning, regulatory authorities, sources and requirements from Stage 1 research                                          |
| `0008_grants`                    | Role privileges on the custom schemas, plus default privileges for later stages. Without this, RLS never runs — see §2.6                                 |

Plus `supabase/seed.sql` for local development, which deliberately creates a school
whose regulatory facts are **all unverified**, so the default developer experience
is the correct one.

### 1.3 Authentication and RBAC foundations

- Nine roles: Teacher, Head of Department, Academic Coordinator, Vice Principal,
  Principal, HR/PD Administrator, School Management/Authorised Approver, Compliance
  Administrator, System Administrator.
- **35 permissions**, four of them marked compensation-sensitive.
- Four scope types — school, department, school stage, individual — with
  trigger-validated scope targets and time-bounded assignments.
- `core.can_view_staff_record()` as the single definition of supervisory visibility.
- Supabase clients split three ways, with ESLint blocking misuse of the service-role
  client.

### 1.4 School Regulatory Profile

`core.school_regulatory_profile` with location, CBSE affiliation, state recognition,
ownership, funding status, minority status, applicable service/pay/recognition
frameworks, and **per-fact verification columns**. Every status field defaults to
`unverified`.

### 1.5 Regulatory versioning

- Requirement text, classification, clause and effective date are **immutable**; a
  trigger rejects edits. Amending means inserting a new version and superseding.
- Sources cannot be marked `verified` without a URL, a retrieval timestamp and a
  verification timestamp.
- A requirement cannot be enforced unless it is mandatory, verified, from a verified
  source, determined applicable to this school by a named person, and switched on.
- `regulatory.ruleset_snapshot` freezes the rules governing a closed year;
  `regulatory.recalculation_authorisation` is the only route to recalculating one.

### 1.6 Documentation

Eleven documents plus this report, all in `docs/`.

### 1.7 Tests

Three Vitest suites (`tests/unit/`) covering permission and role parity between SQL
and TypeScript, separation of duties, compensation isolation, requirement
attribution, enforceability gating, the employment gate, Punjab applicability logic,
and profile validation. Playwright is configured; its scope-isolation suite is
Stage 2 work.

---

## 2. Verification performed

Node 22.23.2 and PostgreSQL 15.19 were installed into `~/.local` (no sudo) after
the initial write-up, so the checks below **were executed**. Docker remains
unavailable — its installer needs administrator rights — which limits two things,
recorded in §2.4.

### 2.1 Toolchain checks — all passing

| Check                                                | Result                               |
| ---------------------------------------------------- | ------------------------------------ |
| `npm install`                                        | 474 packages, no errors              |
| `npm run lint` (ESLint 9 flat config + `@next/next`) | clean                                |
| `npm run typecheck` (`tsc --noEmit`, strict)         | clean                                |
| `npm run test` (Vitest)                              | **63 tests passing** across 3 suites |
| `npx next build`                                     | compiles, 3 routes generated         |

### 2.2 Database checks — migrations applied to a real server

All eight migrations and `supabase/seed.sql` were applied to a live PostgreSQL
15.19 cluster via `scripts/local-postgres/run.sh`, from a clean `initdb`. Result:
**28 tables, all with RLS enabled, 57 policies, 23 triggers, 35 permissions, 9
roles, 107 role grants.**

Behavioural invariants, each asserted against the running database:

| Invariant                                                          | Result                                         |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| Employment gate closed by default                                  | `false`, with the exact required message       |
| `assert_employment_compliance_enabled()` refuses to return a value | raises `restrict_violation`                    |
| `funding_status` cannot leave `unverified` without a verifier      | rejected by check constraint                   |
| Requirement text is immutable                                      | rejected: "insert a new version and supersede" |
| Audit log `UPDATE` / `DELETE`                                      | both blocked                                   |
| Nothing enforceable yet                                            | all 3 seeded requirements `false`              |
| Enforcement without a verified determination                       | rejected by check constraint                   |
| Role-assignment scope outside the school                           | rejected as `foreign_key_violation`            |

### 2.3 RLS isolation — tested as the `authenticated` role, not as superuser

A fixture of two schools, five users and four teacher profiles:

| Actor                           | Staff records visible | Expected |
| ------------------------------- | --------------------- | -------- |
| Teacher (Alice)                 | 1 — her own only      | 1        |
| Head of Department, Maths       | 2 — Maths only        | 2        |
| Head of Department, Science     | 2 — Science only      | 2        |
| Principal of the _other_ school | 0                     | 0        |

Also confirmed: the Maths HOD cannot reach the Science teacher and vice versa; the
other school's Principal sees 0 departments and 0 regulatory profiles; a teacher
cannot grant herself the Principal role (blocked by RLS); the Compliance
Administrator sees the school audit trail (120 entries) but **0 staff records**,
because compliance is not a staff-record role.

One result initially looked wrong and was not: a teacher can see 12 audit entries
for the _global_ regulatory register, and exactly 1 school-scoped entry — the
creation of **her own** profile. Both are intended (`audit_log_select_global_regulatory`
and `audit_log_select_own`), and the second was confirmed by inspecting the row
rather than assumed.

### 2.4 What Docker still blocks

1. **`supabase start` / `supabase db reset`** — the full local stack (PostgREST,
   GoTrue, Storage, Realtime). The migrations and RLS are validated; the Supabase
   service layer around them is not.
2. **`npm run db:types`** — `supabase gen types` runs its introspection inside a
   container and requires Docker _even when pointed at an existing database with
   `--db-url`_ (verified against CLI 2.115.0, which fails with
   `LegacyContainerRuntimeNotFoundError`). `src/types/database.ts` therefore remains
   the hand-written placeholder.

Installing Docker Desktop needs an administrator password, so it is the user's step,
not one that could be completed here.

### 2.5 Static verification

A Python pass also runs (`45 assertions, all passing`) covering SQL quote and
parenthesis balance, RLS coverage, policy-target existence, `SECURITY DEFINER`
`search_path` pinning, and SQL↔TypeScript parity. It is retained because it checks
things the test suite cannot see, and it caught the following before any of the
toolchain existed:

- `package.json` and `tsconfig.json` parse as valid JSON
- All 8 SQL files: balanced quotes (catching unescaped apostrophes) and parentheses
- All 28 tables have RLS enabled
- Every policy targets an existing table; every table has at least one policy
- Every table carrying `school_id` is filtered by a tenancy or scope predicate
- Every `SECURITY DEFINER` function pins `search_path`
- 35 permissions match exactly between SQL and TypeScript
- 4 compensation-sensitive permissions match
- All nine roles' grants match exactly between SQL and TypeScript
- No role holds both halves of either recommend/approve pair
- `increment.approve` is held only by the Management/Authorised Approver
- No non-compensation role holds a compensation-sensitive permission
- `system_admin` holds no professional or compensation permission
- The employment gate message is byte-identical in SQL and TypeScript

### 2.6 Defects found and fixed

The most serious was only findable by running the database:

0. **No role privileges on the custom schemas — every RLS policy was dead code.**
   Supabase grants default privileges on `public`, but not on `core`, `regulatory`
   or `audit`. Acting as `authenticated`, every query failed with
   `permission denied for schema core` _before RLS was ever consulted_. All 57
   policies would have been unreachable, and Stage 2 would have been blocked on its
   first query. Fixed by migration `0008_grants.sql`, which grants schema usage and
   table privileges to `authenticated` and `service_role`, grants nothing to `anon`,
   narrows the append-only and read-only tables, and sets **default privileges** so
   that tables added in Stages 2–6 cannot reintroduce the same bug.

Found by static analysis before the toolchain existed:

1. **`core.notification` was not tenant-filtered.** Its policies matched on
   recipient only. Fixed by adding `core.is_member_of(school_id)` to both policies,
   and documenting the deliberate absence of INSERT/DELETE policies.
2. **`core.role_permission` audit entries were unattributable.** The table has
   neither `id` nor `school_id`, so the generic audit trigger wrote rows with a null
   `school_id` that no policy could then read. Fixed with a dedicated trigger
   function resolving the school through `core.role`.
3. **Global regulatory audit entries were unreadable.** Changes to global reference
   data carry no `school_id`. Added a policy letting anyone with `regulatory.read`
   see the register's change history.
4. **Schema-qualified column references inside RLS policies** (`core.app_user.id`,
   `audit.audit_log.entity_id`) replaced with the relation-qualified form, which is
   what the policy parser expects.

Two further "failures" reported by the checker were **false positives** caused by an
ambiguous regex in the checker itself (`PRINCIPAL:` also matching inside
`VICE_PRINCIPAL:`). Confirmed by direct inspection and fixed in the checker; the
role tables were correct throughout.

Found by the toolchain once it was installed:

5. **`setAll` callback parameter implicitly `any`** in `src/lib/supabase/server.ts`.
   `CookieMethodsServer.setAll` is optional inside a union, so TypeScript could not
   contextually type it. Annotated explicitly.
6. **ESLint `no-undef` firing on TypeScript files** — 18 false positives for
   `process`, `URL` and `React`. Disabled for `.ts`/`.tsx` per typescript-eslint
   guidance; `tsc` already resolves identifiers with full type information.
7. **The Next.js ESLint plugin was not wired into the flat config**, so
   Next-specific rules never ran. Added `@next/eslint-plugin-next` with its
   recommended and core-web-vitals rules, and pinned it as a direct dependency.
8. **A `require()` in `tailwind.config.ts`** replaced with an ESM import.
9. **`supabase/config.toml` used the deprecated `[inbucket]` section**, flagged by
   CLI 2.115.0. Renamed to `[local_smtp]`.

### 2.7 Reproducing the checks

```bash
npm run check
```

```bash
./scripts/local-postgres/run.sh start
```

The second applies every migration plus the seed to a local PostgreSQL server
without Docker. `run.sh psql` opens a shell against it; `run.sh reapply` rebuilds
from scratch. Use the real Supabase stack before shipping.

---

## 3. Architecture decisions

| #     | Decision                                                              | Rationale                                                                                                 |
| ----- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| AD-1  | Authorisation in RLS, not application middleware                      | A careless query written in Stage 5 returns nothing rather than leaking a teacher from another department |
| AD-2  | Domain in named schemas, not `public`                                 | PostgREST serves only listed schemas; unreachable even if a policy were wrong                             |
| AD-3  | Requirement versions are immutable                                    | Editing regulatory text in place silently rewrites the basis of past decisions                            |
| AD-4  | Verification status is a first-class column                           | "Not checked" is a distinct, queryable state from "does not apply"                                        |
| AD-5  | Enforcement requires four independent gates                           | No single mistake is sufficient to enforce something wrongly against a teacher                            |
| AD-6  | Compensation permissions separated from appraisal                     | Appraising a teacher does not confer sight of their pay; recommend and approve never coincide             |
| AD-7  | System Administrator holds no professional or compensation permission | Platform administration must not be a back door into staff records                                        |
| AD-8  | Teacher categories and career levels are rows, not enums              | PRT/TGT/PGT vocabulary and career ladders vary by school                                                  |
| AD-9  | Applicable service and pay frameworks are free text                   | Naming the binding framework is a legal determination; a dropdown invites a guess                         |
| AD-10 | The employment gate blocks only employment consequences               | Gating the whole product on missing paperwork would make it unusable for its actual purpose               |
| AD-11 | Access to one's own record is structural, not permission-based        | A revoked permission must never cost a teacher sight of their own file                                    |
| AD-12 | Next.js + Supabase retained despite the build machine lacking Node    | Chosen deliberately; the right long-term fit for a multi-tenant RLS product                               |

---

## 4. Assumptions

Each is an assumption because it has **not** been verified. None is enforced.

1. The school is CBSE-affiliated and located in Punjab, covering Balvatika/KG to
   Class XII. Taken from the brief; the affiliation number and status are not yet on
   record.
2. The academic year runs April to March. Seeded as `2026-27` (2026-04-01 to
   2027-03-31); configurable per school.
3. The NEP 2020 50-hour CPD expectation is a policy expectation, not legislation.
   Supported by the verified NCERT guidelines.
4. NCERT's suggested hour equivalences are a reasonable basis for the school's own
   CPD accrual policy — adopted **as school policy**, attributed to the school.
5. The seeded career ladder (Entrant → Developing → Proficient → Expert → Lead
   Practitioner) is a starting point for the school to adapt, not a claim about NPST.
6. The seeded department, subject and teacher-category lists are illustrative and
   expected to be replaced with the school's own.
7. DPDP Act, 2023 obligations are treated as design input pending legal confirmation.
8. Data residency is intended to be Indian (`DATA_REGION=ap-south-1`), to be
   confirmed at deployment.

---

## 5. Regulatory items requiring human verification

### 5.1 Verified during Stage 1 (2 items)

| Item                                                                                                                                                                                                                                                                        | Source                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| NCERT _Guidelines for 50 Hours of CPD_ (Aug 2022) — including the full activity-to-hours equivalence table, the assessment mechanism, and the statement that the guidelines **are suggestive** and may be adapted or adopted by States/UTs and organisations including CBSE | `ncert.nic.in/pdf/Guidelines50HoursCpd.pdf`                     |
| CBSE SQAA Framework — the seven domains, its self-assessment character, and the principle of no differential criteria for government, aided and private schools                                                                                                             | `cbseacademic.nic.in/sqaa/doc/TabC-SQAA Framework Overview.pdf` |

### 5.2 Requiring human verification (10 items)

Ordered by how much they block. Full detail in
[`REGULATORY_MATRIX.md`](REGULATORY_MATRIX.md) §6.

| #   | Item                                                               | Why blocked                                                                                           | Blocks                                         |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | **School funding status (aided / unaided)**                        | Not supplied                                                                                          | All employment and pay compliance; all Stage 5 |
| 2   | CBSE CPD Guidelines 2025                                           | `cbse.gov.in` returned HTTP 403                                                                       | Any statement about CBSE CPD compliance        |
| 3   | CBSE Affiliation Bye-Laws 2018 + Circular 07/2024                  | HTTP 403                                                                                              | Qualification and service-condition rules      |
| 4   | CBSE affiliation number, status, validity, Senior Secondary status | Not supplied                                                                                          | Regulatory profile completeness                |
| 5   | Punjab RTE Rules 2011 (amended)                                    | No authoritative Punjab Government URL found; only commercial reproductions, which are not acceptable | State-layer requirements                       |
| 6   | Punjab Act 18 of 1979 applicability                                | HTTP 403; indications suggest the Rules attach to **aided posts**                                     | Service-security obligations                   |
| 7   | NPST status and structure                                          | `ncte.gov.in` refused connections                                                                     | Competency framework mapping                   |
| 8   | SQAAF sub-domains, indicators, weightings, scoring scale           | Manual exceeded retrieval limits                                                                      | SQAAF module                                   |
| 9   | NCTE qualification regulations                                     | `ncte.gov.in` unreachable                                                                             | Staff qualification verification               |
| 10  | DPDP Act commencement and Rules position                           | Not read in full                                                                                      | Privacy programme specifics                    |

**Nothing was invented.** Where a source could not be retrieved, its official URL is
recorded with an explicit note that the text is unread, and its status is
`REQUIRES VERIFICATION`. No blog, coaching site or commercial summary was used as a
regulatory source.

One near-miss worth flagging: search fragments mentioned a "25 + 25" split between
Board-organised and school-organised CPD hours. That fragment referred to
**government teachers** and could not be verified in context, so it has **not** been
recorded as a requirement and must not be assumed to apply here.

### 5.3 Aided / unaided status — the item that gates most

**The school's funding status is unknown and remains `unverified`.**

Consequently:

- `core.employment_compliance_enabled()` returns `false`;
- `core.assert_employment_compliance_enabled()` raises rather than returning a value,
  so no employment calculation can quietly produce a number;
- the interface displays:

> **School funding/service status requires verification before employment-related
> compliance calculations can be activated.**

Professional growth is unaffected: competency, evidence, CPD and development
planning all run.

To clear this, someone at the school must supply the recognition certificate, grant
records and sanctioned-post documents, and a named person must record the
determination with an evidence note. The schema will not accept the status change
without all three.

---

## 6. Outstanding work for Stage 2

### 6.1 Engineering

1. ~~Install Node, run lint, typecheck and test.~~ **Done** — Node 22.23.2 in
   `~/.local/node`; `npm run check` is green (63 tests).
2. **Install Docker Desktop** (needs an administrator password), then
   `npx supabase start && npx supabase db reset` and `npm run db:types` to replace
   the placeholder in `src/types/database.ts`. Until then,
   `./scripts/local-postgres/run.sh start` applies the migrations without Docker —
   PostgreSQL 15.19 is installed at `~/.local/pg15`.
3. Build the competency framework tables — framework, domain, competency, indicator,
   proficiency level, target — versioned, and differentiated by stage and teacher
   category.
4. Build the `competency_standard_mapping` structure; leave NPST mappings empty.
5. Authentication flows: sign-in, password reset, first-login privacy notice
   acceptance.
6. Application shell: navigation, role-aware layout.
7. Teacher "What is expected of me?" view.
8. Admin framework builder.
9. **Playwright scope-isolation suite** — prove a Head of Department cannot reach
   staff outside their department through the UI _and_ the API. This is the single
   most valuable test in the project.
10. Content Security Policy; dependency scanning in CI.

### 6.2 Deferred from Stage 1 by design

- **Self-appraisal conflict rule** — nobody assesses themselves. Belongs with the
  assessment tables in Stage 3.
- **Delegation model** — acting cover during leave is currently a second
  time-bounded assignment; review with the school whether that suffices.
- **Break-glass access** — none exists. If added, must be time-bounded,
  reason-bearing and separately audited.

### 6.3 Non-engineering, to run in parallel

1. **Chase the funding status.** It gates all of Stage 5 and is a paperwork question,
   not a technical one. It should be resolved during Stage 2, not discovered at
   Stage 5.
2. **Download the CBSE CPD Guidelines 2025.** One PDF, from a browser. It gates the
   compliance half of Stage 4.
3. Agree the data retention schedule; draft and version the privacy notice.
4. Obtain legal advice on Punjab Act 18 of 1979 applicability and on DPDP
   obligations.
5. Confirm district, recognition details, ownership structure and minority status.

---

## 7. Not built, as instructed

Full competency framework, detailed KPI framework, gap algorithm, CPD recommendation
engine, increment algorithm, AI recommendations. All are designed in
[`DATA_MODEL.md`](DATA_MODEL.md) and scheduled in
[`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md).

**Stage 2 has not been started.**
