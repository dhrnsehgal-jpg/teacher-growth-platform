# Role-Based Access Control

**Status:** Stage 1 — implemented in `supabase/migrations` and `src/lib/rbac`
**Last updated:** 2026-08-20

---

## 1. The model

Three separate concepts:

- **Permission** — what an action is. Stable string keys such as
  `assessment.conduct`. Global catalogue, seeded in migration `0007`.
- **Role** — a named bundle of permissions. Nine system roles per school.
- **Scope** — _whose_ records an assignment reaches: the whole school, one
  department, one stage, or an explicit list of individuals.

A Head of Department and a Vice Principal hold overlapping permissions; **scope** is
what separates them. This is why supervisory visibility is defined once, in
`core.can_view_staff_record()`, and every policy calls it.

## 2. Scope types

| Scope          | Reaches                                                                | Typical holder                                                |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| `school`       | All staff in the tenant                                                | Principal, HR/PD Admin, Compliance Admin, Management Approver |
| `department`   | Staff whose primary department matches, plus secondary members         | Head of Department                                            |
| `school_stage` | Staff teaching in that stage, plus staff in departments confined to it | Academic Coordinator                                          |
| `individual`   | An explicitly enumerated list                                          | Mentor, acting cover                                          |

`scope_id` is validated by trigger against the same school, so a department in
school A can never scope an assignment in school B.

Assignments are time-bounded (`valid_from`, `valid_to`). Authority is evaluated
as-of the current date, and historical authority remains reconstructible.

## 3. Role matrix

Legend: ● granted · ○ not granted

| Permission                           | Teacher | HOD | Acad. Coord. | Vice Principal | Principal | HR/PD | Mgmt Approver | Compliance | Sys Admin |
| ------------------------------------ | :-----: | :-: | :----------: | :------------: | :-------: | :---: | :-----------: | :--------: | :-------: |
| `staff_directory.read`               |    ●    |  ●  |      ●       |       ●        |     ●     |   ●   |       ●       |     ●      |     ○     |
| `school.manage`                      |    ○    |  ○  |      ○       |       ○        |     ●     |   ○   |       ○       |     ○      |     ●     |
| `rbac.read`                          |    ○    |  ○  |      ○       |       ○        |     ●     |   ●   |       ○       |     ●      |     ●     |
| `rbac.manage`                        |    ○    |  ○  |      ○       |       ○        |     ○     |   ○   |       ○       |     ○      |     ●     |
| `teacher_record.read.scope`          |    ○    |  ●  |      ●       |       ●        |     ●     |   ●   |       ○       |     ○      |     ○     |
| `teacher_record.manage`              |    ○    |  ○  |      ○       |       ○        |     ○     |   ●   |       ○       |     ○      |     ○     |
| `competency.read`                    |    ●    |  ●  |      ●       |       ●        |     ●     |   ●   |       ○       |     ○      |     ○     |
| `competency.manage`                  |    ○    |  ○  |      ○       |       ○        |     ●     |   ○   |       ○       |     ○      |     ○     |
| `assessment.read.scope`              |    ○    |  ●  |      ●       |       ●        |     ●     |   ●   |       ●       |     ○      |     ○     |
| `assessment.conduct`                 |    ○    |  ●  |      ●       |       ●        |     ●     |   ○   |       ○       |     ○      |     ○     |
| `assessment.moderate`                |    ○    |  ○  |      ○       |       ●        |     ●     |   ○   |       ○       |     ○      |     ○     |
| `observation.conduct`                |    ○    |  ●  |      ●       |       ●        |     ●     |   ○   |       ○       |     ○      |     ○     |
| `evidence.submit`                    |    ●    |  ●  |      ●       |       ○        |     ○     |   ○   |       ○       |     ○      |     ○     |
| `evidence.review`                    |    ○    |  ●  |      ●       |       ●        |     ●     |   ○   |       ○       |     ○      |     ○     |
| `cpd.read.scope`                     |    ○    |  ●  |      ●       |       ●        |     ●     |   ●   |       ○       |     ○      |     ○     |
| `cpd.manage`                         |    ○    |  ○  |      ○       |       ○        |     ○     |   ●   |       ○       |     ○      |     ○     |
| `cpd.approve`                        |    ○    |  ○  |      ○       |       ●        |     ●     |   ●   |       ○       |     ○      |     ○     |
| `development_plan.read.scope`        |    ○    |  ●  |      ●       |       ●        |     ●     |   ●   |       ○       |     ○      |     ○     |
| `development_plan.approve`           |    ○    |  ○  |      ○       |       ●        |     ●     |   ○   |       ○       |     ○      |     ○     |
| `appraisal.read.scope`               |    ○    |  ●  |      ●       |       ●        |     ●     |   ●   |       ●       |     ○      |     ○     |
| `appraisal.conduct`                  |    ○    |  ●  |      ○       |       ●        |     ●     |   ○   |       ○       |     ○      |     ○     |
| `appraisal.finalise`                 |    ○    |  ○  |      ○       |       ○        |     ●     |   ○   |       ○       |     ○      |     ○     |
| **`increment.read`**                 |    ○    |  ○  |      ○       |       ○        |     ●     |   ●   |       ●       |     ○      |     ○     |
| **`increment.recommend`**            |    ○    |  ○  |      ○       |       ○        |     ●     |   ○   |       ○       |     ○      |     ○     |
| **`increment.approve`**              |    ○    |  ○  |      ○       |       ○        |     ○     |   ○   |       ●       |     ○      |     ○     |
| `career_progression.read.scope`      |    ○    |  ●  |      ●       |       ●        |     ●     |   ●   |       ●       |     ○      |     ○     |
| `career_progression.recommend`       |    ○    |  ○  |      ○       |       ○        |     ●     |   ○   |       ○       |     ○      |     ○     |
| **`career_progression.approve`**     |    ○    |  ○  |      ○       |       ○        |     ○     |   ○   |       ●       |     ○      |     ○     |
| `regulatory.read`                    |    ●    |  ●  |      ●       |       ●        |     ●     |   ●   |       ●       |     ●      |     ○     |
| `regulatory.manage`                  |    ○    |  ○  |      ○       |       ○        |     ○     |   ○   |       ○       |     ●      |     ○     |
| `regulatory.authorise_recalculation` |    ○    |  ○  |      ○       |       ○        |     ○     |   ○   |       ○       |     ●      |     ○     |
| `compliance.read`                    |    ○    |  ○  |      ○       |       ●        |     ●     |   ●   |       ●       |     ●      |     ○     |
| `compliance.manage`                  |    ○    |  ○  |      ○       |       ○        |     ○     |   ○   |       ○       |     ●      |     ○     |
| `audit.read`                         |    ○    |  ○  |      ○       |       ○        |     ○     |   ○   |       ○       |     ●      |     ●     |
| `system.admin`                       |    ○    |  ○  |      ○       |       ○        |     ○     |   ○   |       ○       |     ○      |     ●     |

Bold rows are compensation-sensitive.

## 4. Access to one's own record is structural

A teacher reads their own profile, evidence, assessments, CPD and development plan
because RLS matches `user_id = auth.uid()` — **not** because of a permission. There
is deliberately no `teacher_record.read.self` key: a permission can be revoked by
mistake, and a teacher losing sight of their own professional record would be a
serious failure of a developmental product.

Teachers can also read the regulatory register (`regulatory.read`). The product
promises they can see the rule behind every expectation; that promise needs a grant.

## 5. Separation of duties

Enforced in `src/lib/rbac/permissions.ts` and asserted in `tests/unit/rbac.test.ts`:

| Recommend                      | Approve                      | Held by                                                       |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------- |
| `increment.recommend`          | `increment.approve`          | Principal recommends; Management/Authorised Approver approves |
| `career_progression.recommend` | `career_progression.approve` | Principal recommends; Management/Authorised Approver approves |

No role holds both halves of either pair. The tests fail the build if that changes.

**The Management/Authorised Approver holds no assessment or observation
permission.** Approval is meant to be an independent check on the professional
judgement, not a continuation of it.

## 6. Compensation is a separate grant

Appraising a teacher does not confer sight of their pay outcome. Heads of
Department, Academic Coordinators, Vice Principals, Compliance Administrators and
System Administrators hold **no** compensation-sensitive permission, though several
of them conduct or moderate appraisal.

`core.permission.is_compensation_sensitive` marks these in the database;
`COMPENSATION_SENSITIVE_PERMISSIONS` mirrors it in TypeScript; a test asserts the
two lists match.

## 7. System Administrator is a technical role

It holds `system.admin`, `school.manage`, `rbac.read`, `rbac.manage` and
`audit.read` — and nothing about assessment, appraisal, teacher records or
compensation. Platform administration must not become a back door into staff
records. A test asserts this directly.

Note the residual risk: `rbac.manage` means a System Administrator could grant
themselves another role. That is unavoidable in any system with an administrator,
and it is why role-assignment changes are audited by trigger and why `audit.read` is
also held by the Compliance Administrator — a second pair of eyes outside the
technical function.

## 8. Enforcement

| Layer       | Mechanism                                                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privileges  | Migration `0008` grants schema and table privileges to `authenticated`, nothing to `anon`. RLS cannot run without this — see [`ARCHITECTURE.md` §10](ARCHITECTURE.md) |
| Database    | RLS on every table; `core.has_permission()` and `core.can_view_staff_record()`                                                                                        |
| API         | PostgREST exposes only named schemas; the anon key plus the user's session is the only client used in request paths                                                   |
| Application | `src/lib/rbac` for UI decisions — **presentation only**, never the access boundary                                                                                    |
| Tests       | Vitest for the matrix and separation of duties; Playwright (Stage 2) for scope isolation against a live database                                                      |

Helper functions are `SECURITY DEFINER` with `set search_path = ''`. A
`SECURITY DEFINER` function with a mutable search path is a privilege-escalation
vector; pinning it is not optional.

## 9. Known gaps for later stages

- **Delegation** — an acting Head of Department during leave is currently modelled
  as a second time-bounded assignment. Whether that is sufficient needs review with
  the school in Stage 2.
- **Self-appraisal conflict** — a Head of Department is also a teacher with their own
  record. The rule that nobody assesses themselves is not yet enforced; it belongs
  with the assessment tables in Stage 3.
- **Break-glass access** — no emergency access path exists. If one is added it must
  be time-bounded, reason-bearing and separately audited.
- **Scope isolation E2E tests** — specified in `playwright.config.ts`, written in
  Stage 2 once there are screens to drive. Note that the _database-level_ isolation
  below is already proven; Playwright will cover the UI and API paths on top of it.

## 10. Isolation verified against a live database

Executed as the `authenticated` role (not superuser) on PostgreSQL 15.19, using a
fixture of two schools, five users and four teacher profiles:

| Actor                           | Staff records visible | Expected |
| ------------------------------- | --------------------- | -------- |
| Teacher                         | 1 — her own only      | 1        |
| Head of Department, Maths       | 2 — Maths only        | 2        |
| Head of Department, Science     | 2 — Science only      | 2        |
| Principal of the _other_ school | 0                     | 0        |

Also confirmed: neither Head of Department can reach the other's staff; the other
school's Principal sees 0 departments and 0 regulatory profiles; a teacher attempting
to grant herself the Principal role is blocked by RLS; and the Compliance
Administrator sees the school audit trail but **0 staff records**, because compliance
is not a staff-record role.

Reproduce with `./scripts/local-postgres/run.sh start`.
