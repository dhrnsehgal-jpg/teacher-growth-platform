# Security

What is implemented, what is deliberately not, and what an operator must do
before running this with real teacher data.

The threat this design takes most seriously is not an external attacker. It is a
colleague reading a file they have no business reading — a head of department
opening a teacher's appraisal from another department, a teacher finding a
colleague's increment recommendation by changing a number in a URL. Staff
records are read by people who already have accounts.

---

## Where the boundary lives

**Row Level Security is the access boundary, not the application.**

Every access decision is made by Postgres, on the row, using the caller's
identity. The Next.js layer holds no authorisation logic that the database does
not also hold. If the application were bypassed entirely — a stolen anon key
driving PostgREST directly — the same policies apply.

254 policies across 122 tables. The application queries look ordinary because
the boundary is elsewhere.

### Why this matters more than it sounds

The alternative — filtering by `school_id` in TypeScript — fails silently and
completely the first time somebody writes a query and forgets. There is no test
that catches a `where` clause nobody wrote. A policy that is missing, by
contrast, is visible in `pg_policies` and is caught by a structural test.

### The defect this project has already hit

**Permissive RLS policies OR together.** During Stage 6 a malware-scan gate was
added as a _new_ storage policy beside the existing Stage 3 one. Both were
permissive, so access was granted if _either_ passed — the gate looked closed
and was open. It was fixed by dropping and recreating the policy rather than
adding to it.

Adding a policy never tightens access. If you mean to restrict, modify the
existing policy or use `AS RESTRICTIVE`.

### The other one

**RLS policies on custom schemas are dead code without explicit GRANTs.**
Supabase grants default privileges on `public` only. Migration `0008_grants.sql`
fixes this and sets `ALTER DEFAULT PRIVILEGES` so later migrations cannot
reintroduce it. This was invisible to static analysis and surfaced only by
querying as the `authenticated` role.

---

## Authentication

- Supabase GoTrue, email and password.
- **Self-registration is disabled.** Accounts are provisioned by the school.
  `[auth] enable_signup = false` — note that `[auth.email] enable_signup` maps
  to `EXTERNAL_EMAIL_ENABLED` and disables the whole email provider instead.
- Sessions are cookie-based via `@supabase/ssr`, refreshed in middleware.
- Sign-in supports password managers: `autocomplete="username"` and
  `autocomplete="current-password"`, and paste is not blocked (WCAG 3.3.8).

### The password-free demo door

`/open` and `/api/demo-user` sign in as a seeded persona without a password, so
a walkthrough needs no credentials. **They are not a bypass**: the route
performs a real Supabase sign-in and hands back an ordinary session, so every
page afterwards runs under the same RLS, permissions and gates. What is removed
is the typing, not the boundary.

Three conditions must all hold or both return 404 / redirect to the sign-in
form:

1. `NODE_ENV` is not production
2. `DEMO_NO_LOGIN` is set to exactly `1`
3. The requested persona is one of the seeded `@demo-school.example` accounts

The flag is deliberately separate from `NODE_ENV`, because a staging box running
a development build with a copied `.env` is the realistic way this leaks. Eight
unit tests cover the guard, and the Playwright suite pins `DEMO_NO_LOGIN` off so
it always drives the real door — with an assertion that the door is shut, since
otherwise every other boundary test in that file would be worth less than it
looks.

**Never set `DEMO_NO_LOGIN` on a deployment.**

### Rate limiting

8 attempts per 15 minutes per IP on sign-in, keyed on `x-forwarded-for`.

**This is in-process and therefore per-instance.** On a single deployment it
works. Behind a load balancer with several instances, an attacker gets 8
attempts per instance. Before running more than one instance, move this to
Redis or to the edge — see _Before production_, below.

---

## Authorisation

Role-based, with permissions held against roles and roles assigned per school
with a scope.

Nine roles: teacher, head of department, academic coordinator, vice principal,
principal, HR/PD administrator, management approver, compliance administrator,
system administrator.

Three principles the design holds to:

1. **Recommend and approve are never the same role.** `increment.recommend`
   belongs to the Principal; `increment.approve` to the management approver. One
   person cannot complete both stages of the chain.
2. **Compensation permissions are separate from appraisal permissions.**
   Supervising someone's development is not a reason to see their pay position.
   `increment.read` is held by the Principal, HR/PD administrator and management
   approver — not by a head of department who supervises the teacher's entire
   growth lifecycle.
3. **Seniority is not a permission.** `audit.read` belongs to the compliance
   administrator and the system administrator. The Principal does not hold it,
   and the audit trail records the actions of senior staff too.

Scopes: school, department, school stage, individual. A head of department with
a department scope reaches teachers in that department and nobody else.

`core.can_view_staff_record(teacher_profile_id)` is the single function behind
most staff-record reads. It joins the caller's active role assignment to the
subject's own school, so it is school-scoped by construction. Seven tables
depend on it and it has its own cross-tenant test.

---

## Tenant isolation

One school must never reach another's data.

`core.user_school_ids()` derives the caller's schools from their active role
assignments. 189 policies scope through it or through `can_view_staff_record`.

`tests/db/tenant-isolation.test.ts` builds a second school inside a
transaction that is always rolled back, and tests **both directions** — a policy
can be right one way and wrong the other. It also checks structurally that no
table carrying `school_id` has policies that never mention a school.

---

## Storage

Evidence files live in Supabase Storage with policies mirroring the database
ones. Uploads are gated on a malware-scan status; an unscanned or failed object
is not readable, and the gate is a single policy rather than an additional one
(see above).

---

## Input validation

Zod schemas on every server action. Validation failures return a message to the
form rather than throwing.

Validation is **not** the security boundary. Every action's effect is also
constrained by RLS and by database constraints, so a malformed or hostile
request that gets past a schema still cannot write a row the caller has no right
to write.

---

## Audit logging

`audit.audit_log` — append-only, written by database triggers as changes happen,
811 entries across 36 action types in the demo environment.

It records: school, actor, actor's role, action, entity, previous value, new
value, reason, source, policy version, requirement, academic year, request id,
IP, user agent, timestamp.

The UI at `/admin/audit` deliberately **omits previous and new values**. Those
blobs can carry any column of any table, including ones the reader has no right
to see through their own permissions, and RLS on the audit row cannot filter
inside a jsonb document. They remain in the database for a DBA-level
investigation.

Separately, `privacy.access_log` records when someone opens **another person's**
pay or appraisal record. See `PRIVACY.md`.

---

## Secrets

- No secret is committed. `.env.local` is gitignored; `.env.example` documents
  the required names.
- The service-role key is used in exactly one place: the seed. It is never
  imported into application code, and there is no server action that uses it.
- `SUPABASE_SERVICE_ROLE_KEY` must not be set in the runtime environment of the
  deployed application. If it is absent, code that would misuse it fails loudly.

---

## HTTP headers

Content Security Policy with a per-request nonce, applied in middleware via an
`x-nonce` request header so Next's inline scripts carry the nonce.

Also set: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive
`Permissions-Policy`.

**Stated weakness:** `style-src` permits `unsafe-inline`. Next injects inline
styles that cannot currently carry a nonce. This is a real reduction in CSP
strength and is recorded rather than hidden.

`robots: { index: false, follow: false }` — staff professional records must not
be indexed under any circumstances.

---

## Dependencies

`npm audit` reports **0 vulnerabilities** at Stage 6 completion.

Two upgrades were needed to get there: Next 15 → 16 (three high-severity
advisories) and vitest 2 → 4 (the esbuild dev-server advisory chain). Both were
verified by the full suite afterwards rather than assumed safe.

---

## What is deliberately not implemented

Naming these is more useful than a longer list of what is.

| Not implemented                     | Why                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Multi-factor authentication         | Out of MVP scope. **Strongly recommended before real data** — see below.                                      |
| Field-level encryption at rest      | Supabase encrypts at rest at the volume level. Column-level encryption would break RLS predicates and search. |
| Distributed rate limiting           | In-process only. Single-instance deployments are covered; multi-instance are not.                             |
| Automated dependency scanning in CI | No CI is configured. `npm audit` is manual.                                                                   |
| Penetration testing                 | **Not performed.** No claim of resistance to a determined attacker is made.                                   |
| Session revocation on role change   | A role change takes effect on the next token refresh, not immediately.                                        |
| IP allow-listing                    | Not appropriate for staff working from home.                                                                  |

---

## Before production

Ordered by how much harm the omission causes.

1. **Enable MFA** for every account holding `increment.*`, `audit.read`,
   `regulatory.manage` or a system administrator role. These accounts can see or
   change things that affect people's careers.
2. **Replace in-process rate limiting** with a shared store if running more than
   one instance.
3. **Rotate the demo credentials.** The seed uses
   `demo-password-not-for-production` for all 23 accounts. It is named that way
   so it cannot be mistaken for a real one.
4. **Confirm `SUPABASE_SERVICE_ROLE_KEY` is absent** from the application's
   runtime environment.
5. **Set up dependency scanning** in whatever CI the school uses.
6. **Commission a penetration test** if the deployment is internet-facing.
7. **Restore-test the backups.** An untested backup is not a backup. See
   `DEPLOYMENT.md`.
8. **Review who holds `audit.read` and `increment.*`** against the school's
   actual staffing, not the demo's.

---

## Reporting a security issue

Do not open a public issue. Contact the school's system administrator directly.
If teacher personal data may have been exposed, the breach-response note in
`PRIVACY.md` applies from the moment of suspicion, not from confirmation.
