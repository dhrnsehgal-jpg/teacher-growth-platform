# Architecture

**Status:** Stage 1 — foundations implemented, application layer to follow
**Last updated:** 2026-08-20

---

## 1. Stack

| Layer       | Choice                                               | Why                                                                                                                                                       |
| ----------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application | Next.js 15 (App Router), React 19, TypeScript strict | Server Components keep teacher data on the server by default; the strictest useful TS settings are on (`noUncheckedIndexedAccess`, `noImplicitOverride`). |
| Database    | PostgreSQL 15 via Supabase                           | Row Level Security is the access boundary. Tenant and scope rules live in the database, not in application code.                                          |
| Auth        | Supabase Auth                                        | Staff accounts are provisioned by the school; self-signup is disabled.                                                                                    |
| Storage     | Supabase Storage                                     | Evidence files: lesson plans, certificates, observation notes.                                                                                            |
| Validation  | Zod                                                  | One schema per boundary, mirroring the database constraints rather than merely echoing them.                                                              |
| UI          | Tailwind CSS + shadcn/ui                             | Owned components, no runtime dependency on a component vendor.                                                                                            |
| Charts      | Recharts                                             | Growth trends, CPD ledgers, competency radars.                                                                                                            |
| Unit tests  | Vitest                                               | Fast invariant tests over RBAC and regulatory logic.                                                                                                      |
| E2E tests   | Playwright                                           | Primarily to prove scope isolation, not just to click through screens.                                                                                    |

### Why the database, not the application, holds the access rules

A teacher's professional record is the most sensitive thing in this system. If
authorisation lives only in the application, then every new route, every export,
every background job is a fresh opportunity to leak. Putting tenant and scope rules
in RLS means a query written carelessly in Stage 5 still cannot return a teacher
from another department — it returns nothing.

The cost is that policies must be written carefully and tested against a live
database. That is a fair trade for this product.

## 2. Schema layout

The domain is deliberately **not** in `public`:

| Schema       | Contents                                                                             |
| ------------ | ------------------------------------------------------------------------------------ |
| `core`       | Tenant, identity, roles, organisational structure, teacher records                   |
| `regulatory` | Regulatory authorities, sources, requirement versions, applicability, rule-set locks |
| `audit`      | Append-only audit trail                                                              |

PostgREST exposes only the schemas named in `supabase/config.toml`. Anything not
listed is unreachable over the API even if a policy were mis-written — defence in
depth, cheaply.

## 3. Multi-tenancy

Every domain table carries `school_id`, and every policy filters through
`core.is_member_of(school_id)`, which resolves from the user's **active** role
assignments. The MVP serves one school; the model assumes many.

```
core.school (tenant root)
   └── everything else, by school_id
```

Two rules make this hold:

1. **No cross-tenant foreign keys.** A row in school A never references a row in
   school B. Where a reference could cross tenants (`user_role_assignment.scope_id`),
   a trigger validates that the target belongs to the same school.
2. **No tenant id from the client.** `school_id` is never taken from a request
   parameter for authorisation purposes; it is resolved from the user's assignments.

## 4. Authorisation model

Three concepts, kept separate on purpose:

- **Permission** — _what_ an action is (`assessment.conduct`). Stable string keys.
- **Role** — a named bundle of permissions (`head_of_department`).
- **Scope** — _whose_ records a role assignment reaches (this department, this
  stage, the whole school, or an explicit list of individuals).

A Head of Department and a Vice Principal may hold overlapping permissions. What
separates them is scope. This is why `core.can_view_staff_record()` exists as a
single function: supervisory visibility is defined once and every policy calls it,
rather than each policy re-implementing the rule slightly differently.

See [`RBAC.md`](RBAC.md) for the full matrix.

## 5. The regulatory subsystem

This is the part of the architecture that is unusual, and it exists because of one
requirement: **never describe a school policy as a CBSE rule, and never describe a
recommendation as mandatory law.**

That cannot be a convention. It is enforced structurally:

```
regulatory.authority       — who issued it, and at which layer
        │                     (central | cbse | state | school)
        ▼
regulatory.source          — the document, versioned, with retrieval evidence
        │                     and a verification status
        ▼
regulatory.requirement     — one immutable version of one requirement, carrying
        │                     classification (mandatory | recommended | school_policy)
        ▼
regulatory.school_requirement_status
                           — this school's determination and sign-off
```

Four gates stand between a requirement and enforcement, all checked by
`regulatory.is_enforceable_for_school()`:

1. the requirement is classified `mandatory`;
2. the requirement version is `verified`;
3. the source document is `verified`;
4. this school has determined applicability `verified` **and** switched it on, with
   a named person and a timestamp.

Anything failing any gate is still _displayed_ — a teacher should see the guidance
that exists — but it is never _applied_.

### Immutability

`regulatory.requirement` rows cannot have their text, classification, clause
reference or effective date edited. A trigger rejects it. Amending a rule means
inserting a new version and marking the old one superseded. Without this, an
appraisal decided in 2026 becomes unexplainable the moment a rule changes.

### Historical protection

- `regulatory.ruleset_snapshot` freezes which requirement versions governed a closed
  academic year.
- `regulatory.recalculation_authorisation` is the only thing that permits
  recalculating a locked year, and it is time-bounded and requires a written reason
  of at least 20 characters.
- `regulatory.may_recalculate_year()` is the gate.

### Verification honesty

Where a source could not be retrieved, the seeded record says so explicitly and
carries `requires_verification`. Nothing about its contents is assumed. During Stage
1 research, `cbse.gov.in` refused automated requests (HTTP 403) and `ncte.gov.in`
was unreachable; those documents are recorded with their official URLs and an
explicit note that their text is unread. See
[`REGULATORY_MATRIX.md`](REGULATORY_MATRIX.md).

## 6. The employment gate

Punjab service and pay rules do not reach every school in Punjab. Which reach this
one turns on funding status — private aided, private unaided, government — and that
is a determination made from documents.

Until it is made:

- `core.employment_compliance_enabled(school_id)` returns `false`;
- every employment, service-rule, pay and increment calculation refuses to run;
- the interface shows `core.employment_gate_message()`, which is the exact sentence
  required, defined once in SQL and once in TypeScript with a test asserting they
  match.

Professional growth is **not** gated. Competency, evidence, CPD and development
planning run regardless. Only consequences that touch employment or pay wait.

## 7. Audit

`audit.audit_log` is append-only: `UPDATE` and `DELETE` are blocked by trigger _and_
by revoked privileges. A correction is a new row.

Each entry records actor, the role they acted under (as text, so it survives the
role being renamed), action, entity, previous value, new value, reason, source,
policy version, and — where relevant — the specific requirement version and
academic year.

Two write paths:

- `audit.record_row_change()`, a generic trigger attached to tables whose change
  history is itself regulated (the regulatory profile, requirement determinations,
  role assignments, teacher profiles);
- `audit.log_event()`, called explicitly for domain actions that carry a reason.

A teacher can read audit entries about their own record. "What was changed on my
file, and by whom?" should be answerable by the person it concerns.

## 8. Application structure

```
src/
  app/                    # Next.js App Router
  components/             # shadcn/ui primitives and composed components
  lib/
    rbac/                 # permission catalogue, role definitions
    regulatory/           # classification vocabulary, enforceability, employment gate
    supabase/             # server / browser / admin clients
    validation/           # Zod schemas
  types/                  # generated database types
supabase/
  migrations/             # ordered, immutable once applied
  seed.sql                # local development data
tests/
  unit/                   # Vitest invariants
  e2e/                    # Playwright, from Stage 2
docs/
```

### Client discipline

- `lib/supabase/server.ts` — anon key plus the caller's session. **Everything uses
  this.** Queries run under RLS as that user.
- `lib/supabase/client.ts` — browser, anon key.
- `lib/supabase/admin.ts` — service role, **bypasses RLS**. Narrow legitimate uses
  only: provisioning, seeding, scheduled regulatory review. ESLint blocks importing
  it from anywhere else, and every call through it must write an audit entry with
  source `system`.

## 9. Architecture decisions

**AD-1 — Rules in the database.** Authorisation is RLS, not middleware. Cost: policies
need a live database to test. Benefit: a careless query in a later stage cannot leak
across departments.

**AD-2 — Domain outside `public`.** Named schemas plus explicit PostgREST exposure.

**AD-3 — Requirements are immutable versions.** Editing regulatory text in place would
silently rewrite the basis of past decisions.

**AD-4 — Verification status is a first-class column, not a comment.** "We have not
checked this" is a distinct, queryable state from "this does not apply".

**AD-5 — Enforcement requires four independent gates.** No single mistake — a
mis-classified requirement, an unverified source, a missing determination — is
enough to enforce something wrongly against a teacher.

**AD-6 — Compensation permissions are separated from appraisal permissions.**
Appraising a teacher does not confer sight of their pay. Recommending an increment
and approving one are never held by the same role; tests enforce this.

**AD-7 — System Administrator holds no professional or compensation permission.**
Platform administration must not be a back door into staff records.

**AD-8 — Teacher categories and career levels are rows, not enums.** PRT/TGT/PGT
vocabulary and career ladders vary between schools; a closed enum would force the
next school to misdescribe itself.

**AD-9 — Applicable service and pay frameworks are free text.** Naming the framework
that binds a school is a legal determination. A dropdown would invite a guess.

**AD-10 — The employment gate blocks only employment consequences.** Gating the whole
product on an unconfirmed funding status would make it unusable for its actual
purpose while the paperwork is found.

## 10. Privileges: why RLS alone is not enough

Row Level Security only runs if the role can reach the table at all. Supabase grants
default privileges on `public`, but **not** on custom schemas — so `core`,
`regulatory` and `audit` needed explicit grants (migration `0008`). Without them,
every query from a signed-in user failed with `permission denied for schema core`
_before any policy was consulted_, making all 57 policies unreachable. This was
found by running the database, not by reading it.

The model is the standard Supabase one, and it works only as a pair:

- table privileges are broad — `SELECT/INSERT/UPDATE/DELETE` for `authenticated`;
- **RLS is the actual boundary**, enabled on every table in these schemas.

A grant therefore does not confer access; it confers the right to have a policy
evaluated. `anon` receives nothing at all: there is no unauthenticated view of this
product.

`0008` also sets `ALTER DEFAULT PRIVILEGES`, so a table added in Stage 2–6 inherits
the grants automatically. Otherwise the first migration that forgot would silently
reintroduce the same bug — and it would look like a policy problem, not a privilege
one.

## 11. Environment note

Stage 1 was authored on a machine without Node.js, npm, PostgreSQL or Docker. Node
22.23.2 and PostgreSQL 15.19 were subsequently installed into `~/.local` without
sudo, so lint, typecheck, tests, `next build`, the migrations and RLS isolation have
all been executed — see [`STAGE_1_COMPLETION.md`](STAGE_1_COMPLETION.md) §2.

Docker remains unavailable (its installer needs administrator rights), which blocks
the full Supabase stack and `supabase gen types`. `scripts/local-postgres/run.sh`
applies the migrations to a plain PostgreSQL server as a stand-in; it validates SQL,
constraints, triggers and RLS, but not PostgREST, GoTrue, Storage or Realtime.
