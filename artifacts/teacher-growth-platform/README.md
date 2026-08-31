# Teacher Professional Growth Platform

Competency, KPI, CPD, appraisal and career progression for a CBSE-affiliated school
in Punjab, India — Kindergarten/Balvatika through Class XII.

**Current status: Stage 6 of 6 complete.** See
[`docs/FINAL_MVP_STATUS.md`](docs/FINAL_MVP_STATUS.md) for what is built, what is
tested, what is deferred, and what still needs human verification.

**This platform does not claim to be CBSE compliant or legally compliant.** It
claims something narrower and checkable: every expectation it holds is traceable
to a named source with a recorded verification status, and anything not so
traceable is marked as needing verification rather than presented as a rule. See
[`docs/REGULATORY_LIMITATIONS.md`](docs/REGULATORY_LIMITATIONS.md).

---

## What this is

A developmental platform, not a punitive one. It supports one lifecycle end to end:

```
Standards → Competencies → KPIs → Evidence → Assessment → Gaps → CPD Recommendation
  → Development Plan → CPD Completion → Application in Practice → Evidence of Impact
  → Reassessment → Growth → Career Progression → Increment Readiness → Human Approval
```

Three rules run through the whole design:

1. **A gap is never shown without a route out of it.**
2. **No algorithm ends a career decision.** The system recommends and explains; a
   person decides, and the decision is audited.
3. **Nothing unverified is enforced.** Every expectation is traceable to a named
   source with a visible verification status — and a school policy is never
   presented as a CBSE rule.

## Getting started

Requires **Node 22 LTS** (see `.nvmrc`) and Docker for the full Supabase stack.

Docker Desktop needs an administrator password; **colima** does not, and is what
this project was verified against:

```bash
colima start --vm-type vz --vz-rosetta --cpu 4 --memory 6 --disk 60
```

```bash
npm install && cp .env.example .env.local
```

With Docker:

```bash
npx supabase start && npx supabase db reset && npm run db:types
```

**Without Docker**, a local PostgreSQL harness applies the same migrations and seed:

```bash
./scripts/local-postgres/run.sh start
```

It validates SQL, constraints, triggers and Row Level Security, but provides no
PostgREST, GoTrue, Storage or Realtime — so it cannot catch a malformed PostgREST
query. Use the real stack before shipping. `npm run db:types` needs Docker
regardless, since `supabase gen types` introspects inside a container.

Either path applies `supabase/seed.sql`, which creates a demo school whose regulatory
facts are **all unverified** — so the default state is the correct one, with
employment compliance gated off.

## Looking at it without a password

For a walkthrough, set `DEMO_NO_LOGIN=1` in `.env.local` and open
<http://localhost:3000>. You get a persona chooser instead of a login form, and
a bar at the top to switch between them.

It signs you in for real, so everything downstream behaves exactly as a
deployment would — a teacher still cannot see a colleague's appraisal, and the
Principal still cannot read the audit log. The differences between those people
are the security model working, not a mock of it.

Both routes 404 unless the build is non-production **and** the flag is exactly
`1`. See [SECURITY](docs/SECURITY.md#the-password-free-demo-door).

## Previewing the UI without Docker

The interface reads from Supabase, which needs Docker. Where Docker is
unavailable, a development-only path reads the same schema straight from
PostgreSQL:

```bash
./scripts/local-postgres/run.sh start
```

```bash
echo 'PREVIEW_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/tgp' > .env.local && npm run dev
```

Then open <http://localhost:3000/me>.

This is a **faithful** preview, not a bypass: every query runs inside a
transaction that sets the JWT subject claim and switches to the `authenticated`
role, so Row Level Security applies exactly as in production. A banner lets you
view as each seeded persona — a teacher genuinely cannot see a colleague's
records, and the expectations shown really do change with post, stage and career
level.

The preview path is inert unless `PREVIEW_DATABASE_URL` is set, and the
user-switching route returns 404 outside it.

## Checks

```bash
npm run check
```

Runs lint, typecheck and the unit/API suites, including a sign-in check for
every demo chooser account. The database and API suites skip themselves when
nothing is running.

For release validation against the seeded hosted Supabase project, run the
read-only preflight with the project's public key:

```bash
npm run check:hosted -- https://YOUR-PROJECT.supabase.co YOUR_ANON_KEY
```

This signs in as every email in `DEMO_PERSONAS`, reporting the email and
persona role for any broken account before checking schemas and authorization
boundaries. It accepts only an anon/publishable key and never changes
production authentication.

To run the real PostgREST contract suites against a dedicated seeded project,
provide its URL and anon/publishable key through CI secrets or environment
variables:

```bash
API_CONTRACT_SUPABASE_URL=https://YOUR-SEEDED-PROJECT.supabase.co \
API_CONTRACT_SUPABASE_ANON_KEY=YOUR_ANON_KEY \
npm run check:api-contracts
```

The command first runs the read-only hosted preflight, then executes
`postgrest.test.ts`, `stage4-postgrest.test.ts` and `embed-contract.test.ts`
with that endpoint. It never runs `supabase db reset`, applies seed data, or
uses a service-role key. In a checkout that already has
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set, those
variables are accepted as a fallback.

```bash
npm run test:e2e:clean
```

Resets the database and runs **62 Playwright specs** — the full lifecycle through
the real UI for every role, the twenty-step acceptance walk, the role
boundaries, and axe-core accessibility scans of 21 pages across five roles.

**The E2E suite is not idempotent**, by design: it drives the real lifecycle, so
a second run against the same database fails on what looks like a regression and
is not one. Always reset first — `test:e2e:clean` does.

```bash
npm audit    # 0 vulnerabilities
```

If `initdb`/`psql` are missing, a no-sudo install:

```bash
curl -sSL https://micro.mamba.pm/api/micromamba/osx-arm64/latest | tar -xj bin/micromamba && ./bin/micromamba create -y -p ~/.local/pg15 -c conda-forge postgresql=15
```

## Layout

```
src/lib/rbac/          permission catalogue and role definitions
src/lib/regulatory/    classification vocabulary, enforceability, employment gate
src/lib/supabase/      server / browser / admin clients
src/lib/validation/    Zod schemas
supabase/migrations/   ordered, immutable once applied
tests/unit/            invariants that must not drift
docs/                  architecture, data model, RBAC, regulatory analysis
```

## Documentation

### Start here

| Document                                                               | Covers                                                                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [FINAL_MVP_STATUS](docs/FINAL_MVP_STATUS.md)                           | Features, tests, limitations, security, regulatory gaps, pilot, deferrals                           |
| [REGULATORY_LIMITATIONS](docs/REGULATORY_LIMITATIONS.md)               | **Read before configuring for a real school.** What is law, what is advice, what the school made up |
| [CBSE_PUNJAB_COMPLIANCE_MATRIX](docs/CBSE_PUNJAB_COMPLIANCE_MATRIX.md) | Every requirement, its source, and its enforcement status                                           |
| [PILOT_PLAN](docs/PILOT_PLAN.md)                                       | Twelve weeks, and the criteria that decide whether to proceed                                       |

### Using it

| Document                                         | Covers                                                  |
| ------------------------------------------------ | ------------------------------------------------------- |
| [USER_GUIDE_TEACHER](docs/USER_GUIDE_TEACHER.md) | For teachers                                            |
| [USER_GUIDE_MANAGER](docs/USER_GUIDE_MANAGER.md) | For heads of department, coordinators and the Principal |
| [USER_GUIDE_ADMIN](docs/USER_GUIDE_ADMIN.md)     | For HR/PD, compliance and system administrators         |

### Running it

| Document                               | Covers                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------- |
| [DEPLOYMENT](docs/DEPLOYMENT.md)       | Deploying, backups, upgrades, rollback                                  |
| [SECURITY](docs/SECURITY.md)           | Where the boundary lives, and the pre-production checklist              |
| [PRIVACY](docs/PRIVACY.md)             | Retention, subject requests, access logging, and the six open questions |
| [ACCESSIBILITY](docs/ACCESSIBILITY.md) | WCAG 2.2 AA: what was tested, what was found, what was not tested       |

### Design and analysis

| Document                                                       | Covers                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| [MVP_SCOPE](docs/MVP_SCOPE.md)                                 | What is in, what is out, and why                              |
| [ARCHITECTURE](docs/ARCHITECTURE.md)                           | Stack, schemas, tenancy, the regulatory subsystem, decisions  |
| [DATA_MODEL](docs/DATA_MODEL.md)                               | Every entity, built and planned                               |
| [RBAC](docs/RBAC.md)                                           | Nine roles, 44 permissions, scope model, separation of duties |
| [REGULATORY_MATRIX](docs/REGULATORY_MATRIX.md)                 | Every requirement, its source and its verification status     |
| [CBSE_COMPLIANCE](docs/CBSE_COMPLIANCE.md)                     | The CBSE layer                                                |
| [PUNJAB_COMPLIANCE](docs/PUNJAB_COMPLIANCE.md)                 | The Punjab layer and the funding-status gate                  |
| [NPST_ARCHITECTURE](docs/NPST_ARCHITECTURE.md)                 | How NPST maps in, once verified                               |
| [SQAAF_ARCHITECTURE](docs/SQAAF_ARCHITECTURE.md)               | The seven domains and the evidence roll-up                    |
| [SECURITY_PRIVACY](docs/SECURITY_PRIVACY.md)                   | Access control, audit, DPDP position, retention gap           |
| [COMPETENCY_FRAMEWORK](docs/COMPETENCY_FRAMEWORK.md)           | Structure, NPST mapping, source classification, targets       |
| [KPI_FRAMEWORK](docs/KPI_FRAMEWORK.md)                         | Categories, templates, the student-outcome cap                |
| [EVIDENCE_FRAMEWORK](docs/EVIDENCE_FRAMEWORK.md)               | Evidence types, many-to-many linking, review lifecycle        |
| [GAP_ENGINE](docs/GAP_ENGINE.md)                               | How a gap is scored and why it is a priority                  |
| [CPD_RECOMMENDATION_ENGINE](docs/CPD_RECOMMENDATION_ENGINE.md) | Deterministic ranking and "why this course?"                  |
| [LEARNING_MAP](docs/LEARNING_MAP.md)                           | The IPDP, its stages, and the reassessment gate               |
| [PROFESSIONAL_GROWTH_SCORE](docs/PROFESSIONAL_GROWTH_SCORE.md) | The school's own model, and why it is labelled as one         |
| [INCREMENT_GOVERNANCE](docs/INCREMENT_GOVERNANCE.md)           | The approval chain and the separation of duties               |
| [IMPLEMENTATION_ROADMAP](docs/IMPLEMENTATION_ROADMAP.md)       | Stages 4–6, as planned                                        |

Stage completion reports: [1](docs/STAGE_1_COMPLETION.md) ·
[2](docs/STAGE_2_COMPLETION.md) · [3](docs/STAGE_3_COMPLETION.md) ·
[4](docs/STAGE_4_COMPLETION.md) · [5](docs/STAGE_5_COMPLETION.md) ·
[6](docs/FINAL_MVP_STATUS.md)

## Two documents that unlock most of the compliance layer

Both are paperwork, not code. Neither needs a lawyer — they are documents in the
school's own files — and between them they gate almost every compliance feature.

1. **The CBSE affiliation number and current status.** Unlocks CPD and SQAAF
   compliance reporting: ten requirements, all verified, all currently
   unenforced because the platform cannot confirm the school is affiliated.
2. **The school's funding status** (aided / unaided / partially aided), with
   documentary evidence. Unlocks the entire increment and pay layer.

Until they arrive the platform runs as a professional development system with
its compliance reporting inert. That is the correct behaviour, not a limitation
to work around.

The remaining verification questions — Punjab service rules, the DPDP position,
retention periods — are in
[`docs/REGULATORY_LIMITATIONS.md`](docs/REGULATORY_LIMITATIONS.md) and
[`docs/PRIVACY.md`](docs/PRIVACY.md).
