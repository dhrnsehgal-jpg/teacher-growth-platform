# Administrator's Guide

For the HR/PD administrator, the compliance administrator and the system
administrator.

You configure what the platform treats as true. That is a larger
responsibility than it sounds, because the difference between a school policy
and a CBSE rule is invisible to a teacher unless somebody keeps it visible.

---

## Roles and permissions

Nine roles: teacher, head of department, academic coordinator, vice principal,
principal, HR/PD administrator, management approver, compliance administrator,
system administrator.

Assignments carry a **scope**: school, department, school stage, or named
individuals. A head of department scoped to Mathematics reaches Mathematics
teachers and nobody else.

Three separations are structural. Do not work around them by granting a role
extra permissions:

| Separation                                                                    | Why                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `increment.recommend` (Principal) ≠ `increment.approve` (management approver) | One person must not complete both stages of a pay decision         |
| Appraisal permissions ≠ compensation permissions                              | Supervising development is not a reason to see pay position        |
| `audit.read` (compliance + system admin only)                                 | The trail records senior staff too. Seniority is not a permission. |

The Principal deliberately does **not** hold `audit.read`.

---

## The competency framework

`/admin/framework`.

Every competency records three things about where it comes from:

- **Framework** — school, NPST, CBSE-related, Punjab-specific, other
- **Alignment** — school-defined, derived, or aligned
- **Clause reference** — required when alignment is `aligned`

**The database refuses `aligned` without a citation.** This is the single most
important rule in the configuration layer: claiming alignment to NPST or CBSE
without citing a clause asserts the school is held to something nobody can
check.

Retiring a competency supersedes it; it does not delete it. Assessments against
the retired version remain valid history.

### Proficiency scales

`/admin/proficiency`. The school holds **two** scales — its own five-point scale
and NPST's. When looking a level up, match on the scale as well as the ordinal:
ordinal alone silently picks NPST's.

### Targets

Expected levels resolve by specificity: an individual target beats a
subject target, which beats a career-level target, which beats a
category or stage target. The resolution is deterministic and the winning
specificity is shown.

---

## KPI templates

`/admin/kpi`. Weights must total 100. A deferred constraint trigger enforces
this at commit, so you can edit several rows in one transaction and only the
final state has to balance.

Flag student-outcome measures as such. They then render with a marker
everywhere, so their weight in the overall picture is visible rather than
implicit. **Student examination marks must never be the sole determinant of
teacher effectiveness.**

---

## Evidence rules

`/admin/evidence`. Minimum evidence counts per requirement, by teacher category
and stage.

---

## The growth model

`/admin/growth`. Component weights for the professional growth score.

Whatever you configure here, it renders with:

> **DEMO SCHOOL POLICY — NOT A CBSE OR PUNJAB GOVERNMENT FORMULA.**

That string is not decoration. It is the difference between a school's model and
a claim about national policy, and it must not be removed.

---

## The regulatory register

`/admin/regulatory`. This is the compliance administrator's area, and the most
consequential screen in the platform.

### The four gates

```
  source verified  →  requirement recorded  →  applicability determined  →  enforcement enabled
```

Keep them distinct. Collapsing them is how a platform starts asserting
compliance it cannot support. A requirement can be perfectly verified — the
document says exactly this — and still not bind your school.

### Handling a new circular or rule

```
New circular → Upload/add source → Compliance admin review → Determine applicability
  → Create rule version → Effective date → Archive/supersede previous → Notify administrators
```

Each stage is recorded with the person who performed it. Notifications go out at
four of them.

### Rules that must not be broken

1. **Never describe a school policy as a CBSE rule.**
2. **Never describe an NPST recommendation as mandatory CBSE law** unless an
   authoritative current source establishes it.
3. **Never assume a Punjab Government employment or pay rule applies to a
   private CBSE school** without checking applicability.
4. **Never infer applicability from the title of a statute.** Act 18 of 1979 is
   named for privately managed recognised schools and _looks_ directly on point.
   It has not been read. A title is not a scope clause.
5. **If you cannot obtain the source, do not record the requirement.** Mark it
   REQUIRES VERIFICATION.
6. **Do not use blogs, coaching sites or commercial summaries** as sources.
7. **Never let the assistant activate a requirement.** A database trigger
   requires a signed-in person holding `regulatory.manage`. There is no path for
   an automated actor, and this must stay true.

Allowed statuses, and no others: VERIFIED, REQUIRES VERIFICATION, SUPERSEDED,
NOT APPLICABLE, POTENTIALLY APPLICABLE.

### Two questions worth answering first

Both are documents in the school's own files, not legal questions, and between
them they gate almost every compliance feature:

1. **The CBSE affiliation number and status.** Unlocks CPD and SQAAF compliance
   reporting — ten requirements.
2. **The funding status** (aided / unaided / partially aided), with evidence.
   Unlocks the entire increment and pay layer.

See [`REGULATORY_LIMITATIONS.md`](REGULATORY_LIMITATIONS.md) for the full list.

---

## The audit log

`/admin/audit`, requiring `audit.read`.

Written by database triggers as changes happen, append-only, and not editable
through the application. Filter by area of activity and by part of the system.

The screen shows who, what, where, when and why. It deliberately omits the
before and after values: those can carry any column of any table, including ones
you have no right to see through your own permissions, and row-level security
cannot filter inside a JSON document. They remain in the database for a
DBA-level investigation.

---

## Privacy administration

### Subject requests

Access, correction, erasure, objection. **Confirm identity before fulfilling
anything** — the database enforces this, but the confirmation is a human act.

A refusal must state its basis. For erasure this will often be a service record
the school is obliged to keep. That is a legitimate answer and must be given as
one.

### Retention

Eight record classes, all currently `requires_verification` with no period set.

**Do not set these from intuition.** They interact with service-record
obligations that are themselves unverified. An appraisal erased on a schedule is
evidence destroyed, and a teacher may need it years later. See
[`PRIVACY.md`](PRIVACY.md) for the six questions a data protection adviser must
answer.

### Access logging

Records when somebody opens **another person's** pay or appraisal record. The
teacher concerned can see this on their own profile.

---

## The AI assistant

External AI assistance is **off by default** and cannot be switched on casually.
Enabling it requires recording, in the database: a provider, a data region, a
processing agreement reference, a privacy review reference, who enabled it,
when, and a note on the controls in place.

That is deliberate friction. _"Do not transmit sensitive teacher information to
an external AI service unless appropriate security and privacy controls and
configuration exist"_ is not a policy you can honour with a checkbox.

The assistant's prohibitions are structural, not configured: there is no
suggestion kind for changing a score, no path to an appraisal decision, no
mechanism for a hidden score. A trigger also refuses any output asserting a
CBSE, Punjab, NCTE, NPST or SQAAF requirement unless it cites a requirement key
that is `verified` in the register.

---

## Demo environment

23 staff, 16 in the teacher cohort, KG–XII, multiple departments, 24
competencies, KPIs, a CPD catalogue, evidence, learning plans, SQAAF mappings
and appraisal histories.

**Every person is fictional and every record is synthetic. Never load real
employee data into a demo environment**, and never use the demo password —
`demo-password-not-for-production` — for a real account.

---

## Running the platform

```bash
npm run check
```

Runs lint, typecheck, unit and database tests. 456 tests.

```bash
npm run test:e2e:clean
```

Resets the database and runs 62 Playwright specs. **The suite is not
idempotent** — it drives the real lifecycle, so a second run against the same
database fails on what looks like a regression and is not one. Always reset
first.

```bash
npm run db:bootstrap
```

Use this if `supabase start` hangs. Adding a schema to `config.toml` before its
migration has run makes PostgREST fail its health check and the stack never
comes up.

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for deployment, backups and upgrades, and
[`SECURITY.md`](SECURITY.md) for the pre-production checklist.
