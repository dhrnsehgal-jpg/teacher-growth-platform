# Final MVP Status

**Stage 6 of 6 complete.** Teacher Professional Growth, Competency, KPI, CPD,
Appraisal and Career Progression Platform, for a CBSE-affiliated school in
Punjab, India (Balvatika/KG – Class XII).

|                              |                                                 |
| ---------------------------- | ----------------------------------------------- |
| Migrations                   | 56                                              |
| Tables                       | 122                                             |
| RLS policies                 | 254                                             |
| Application routes           | 26                                              |
| Unit, database and API tests | **456**, across 25 files                        |
| Playwright end-to-end specs  | **62**, across 9 files                          |
| `npm audit`                  | **0 vulnerabilities**                           |
| Production build             | Clean                                           |
| Demo staff                   | 24 accounts, 23 teacher profiles, all fictional |

---

## 1. Features completed

### Regulatory foundation (Stage 1)

Regulatory register with authorities, sources, requirements, versions and
per-school applicability. Five permitted statuses, four separate gates between a
source being read and a requirement being enforced. School regulatory profile
recording affiliation, funding, ownership, recognition and which frameworks the
school has determined apply.

### Competency framework (Stage 2)

24 competencies — 18 aligned to NPST with clause citations, 3 derived, 3
school-defined. Two proficiency scales (the school's five-point scale and
NPST's). Targets resolving by specificity: individual beats subject beats career
level beats category or stage. The database refuses an `aligned` claim without a
clause citation.

**NPST was verified** from the NCTE Guiding Document 2023, retrieved from NCTE's
CloudFront mirror. It remains `recommended`, not mandatory: §5.2 implements it
via a State/UT-designated entity, and no Punjab designation or CBSE adoption is
verified.

### The growth lifecycle (Stage 3)

```
assessment (self / supervisor / observation, stored separately, append-only)
  → deterministic gap engine → deterministic CPD recommender → Learning Map
  → completion → reflection → application → evidence → verified impact
  → reassessment
```

Nobody verifies their own competency. Previous assessments are never
overwritten. **The plan-item state machine has no edge from `completed` to
`reassessed`** — completing a course cannot raise a competency level, enforced
structurally rather than by policy.

Every gap priority and every CPD recommendation is explained factor by factor.
No LLM is involved in either calculation.

### CBSE CPD compliance and SQAAF (Stage 4)

CPD ledger against the **verified** CBSE CPD Guidelines 2025: 25 + 25 hour split
by source class, three domains with their own allocations, academic tasks capped
at 11 hours, CBSE Training Portal and OASIS recording. Hours do not count until
verified, and a surplus in one part never offsets a shortfall in another.

SQAAF module against the **verified** SQAA Framework April 2023: 7 domains, 48
sub-domains, 84 standards, 336 marks, the 4-point scale, 40%/10% weightings,
Annexure F improvement plans, evidence mapping, and a readiness view that states
what it **cannot** evidence.

### Appraisal, growth score and increment governance (Stage 5)

Appraisal with weighted components, teacher acknowledgement and challenge, and
independent review of a representation. The original appraisal and every teacher
response are preserved.

Professional growth score, labelled everywhere: _DEMO SCHOOL POLICY — NOT A CBSE
OR PUNJAB GOVERNMENT FORMULA._

Increment readiness behind two gates, a six-stage approval chain in which one
person cannot complete two stages, and the rule that a recommendation cannot
withhold an entitlement unless a **verified** rule expressly permits it. The
platform holds no salary figures at all.

Service record, career events, designations, and Punjab instruments recorded
unread with applicability undetermined.

### Stage 6

**AI Growth Assistant.** Eleven permitted suggestion kinds, none of which
corresponds to a forbidden action, and all eleven implemented — an audit found
five of them returning nothing, including four the brief names outright. Each is
composed from stored records and quotes rather than paraphrases: a summary that
rewords a colleague's professional judgement changes it, and post-CPD support
offers prompts rather than writing a reflection into someone's professional
record. Every output labelled _AI-assisted
recommendation — professional judgement required_, showing the records it used.
A database trigger refuses any output asserting a CBSE, Punjab, NCTE, NPST or
SQAAF requirement unless it cites a requirement key that is `verified`. External
assistance is off by default and requires a provider, data region, processing
agreement, privacy review, and a named enabler to switch on.

**Analytics.** Competency heatmap filterable by all six dimensions the brief
lists — department, stage, subject, teacher category, career level and manager.
Stage, subject and manager are arrays rather than columns, because each is
many-to-many with a teacher and joining them would fan every row out and inflate
every count built on the view.

School analytics covering common gaps, gaps by stage, department and subject,
KPI coverage and weighting, competency improvement, teachers needing support,
teachers growing strongly, CPD completion and impact, development investment,
the progression pipeline, increment recommendation distribution and SQAAF
readiness.

**No public ranking of teachers**, enforced rather than intended: a test asserts
that none of the school-level aggregates carries a teacher name or id. Two of
them state what they are not — the KPI view reports no achievement figure
because the platform stores none, and the career pipeline is a distribution
rather than a promotion queue.

**Training Needs Analysis.** Statements assembled from the platform's own
counts, with a minimum group size so nothing effectively identifies one person.
Gap cluster → teacher group → relevant CPD → cohort training plan, which creates
_proposed_ items that still go through normal approval.

**CPD impact.** Training → participation → application → verified evidence →
competency movement, presented as association and never as cause. Attendance is
never treated as impact.

**Regulatory change management.** Circular → source → review → applicability →
version → effective date → supersede → notify, with a named person at each
stage. A trigger requires a signed-in holder of `regulatory.manage` before
`is_enforced` can be set true. **No automated actor can activate a requirement.**

**Security hardening.** Nonce-based CSP, security headers, rate limiting, input
validation, tenant isolation tested in both directions, dependency advisories
cleared (Next 15→16, vitest 2→4).

**Privacy.** Eight retention classes (all undecided, nothing deleting), subject
requests with identity confirmation before fulfilment, append-only access
logging that records when someone opens _another_ person's file, visible to the
teacher concerned.

**Accessibility.** WCAG 2.2 AA, nine defects found and fixed, verified by
axe-core across 21 pages and five roles, plus reflow, spacing, title and
keyboard checks.

**Audit log UI.** 811 entries, 36 action types, filterable, readable only with
`audit.read` — which the Principal deliberately does not hold.

**Teacher dashboard** answering the eight required questions in sentences.

**Demo environment.** 24 accounts across every post the brief names, 23 teacher
profiles, KG–XII, multiple departments, varied gap profiles, a CPD catalogue,
evidence, SQAAF mappings, appraisal history — and learning plans spread across
the lifecycle, which an audit found missing entirely. Items are seeded as
`proposed` and stepped forward one status at a time, so they pass the same
transition gate a real one does, including the one with no edge from
`completed` to `reassessed`. Twelve tests hold the demo to what the brief asks
of it.

**Acceptance walk.** One test, twenty steps, login through to the audit trail,
plus role boundaries.

---

## 2. Tests passed

```
npm run check          456 passed (456)     lint · typecheck · unit · db · api
npm run test:e2e:clean  62 passed (62)      Playwright, full lifecycle
npm run build          clean
npm audit              0 vulnerabilities
```

| Suite         | Tests | What it holds                                              |
| ------------- | ----- | ---------------------------------------------------------- |
| `tests/db/`   | 319   | Constraints, triggers, RLS, engines against real Postgres  |
| `tests/api/`  | 40    | PostgREST contract, including all 13 embed-bearing selects |
| `tests/unit/` | 97    | RBAC parity, regulatory rules, contrast, security          |
| `tests/e2e/`  | 62    | Real UI, real database, all roles                          |

Notable suites: `tenant-isolation` (both directions, plus a structural check
that no `school_id` table lacks scoping), `ai-guardrails` (16), `privacy` (13),
`accessibility` (9), `zz-acceptance` (7), `embed-contract` (15, running every
embed against the live stack).

---

## 3. Known limitations

**Regulatory**

- No Punjab instrument has been read. `indiacode.nic.in` returns HTTP 403 and
  `pbhe.punjab.gov.in` refuses connections. Four instruments are recorded
  unread with applicability undetermined.
- NPST Domains 9–11 are image pages and are recorded as missing.
- SQAAF maturity-level bands (§1.11.2) are an image and are not implemented.
- CBSE Affiliation Bye-Laws 2018 and Notification 16/2021 are recorded but not
  read.

**Functional**

- No machine-readable subject-access export. Requests are fulfilled by an
  administrator from the teacher's profile view.
- Access logging covers two surfaces (increment recommendations, appraisals),
  not every read.
- Retention periods are all unset. Nothing deletes automatically.
- No offline or mobile-app support; the web interface is responsive to 320px.
- English only. **Teachers in a Punjab school may reasonably expect Punjabi and
  Hindi** — this is an accessibility limitation, not just a missing feature.

**Technical**

- Rate limiting is in-process, so it is per-instance. Fine on one instance,
  inadequate behind a load balancer.
- No CI. Every check is run manually.
- Playwright runs Chromium only.
- The E2E suite is not idempotent by design; it must run against a fresh
  database.
- Next 16 deprecates the `middleware` convention in favour of `proxy`. The
  rename carries the session refresh and CSP nonce, so it was deferred rather
  than done carelessly.

---

## 4. Security issues requiring attention

Ordered by consequence. None is a defect in what was built; all are things a
deployment must add.

1. **No multi-factor authentication.** Accounts holding `increment.*`,
   `audit.read`, `regulatory.manage` or system administration can see or change
   things that affect people's careers. **Enable MFA on these before real
   data.**
2. **Rate limiting is in-process.** Multi-instance deployments get 8 attempts
   _per instance_. Move to a shared store before scaling out.
3. **CSP `style-src` permits `unsafe-inline`.** Next injects inline styles that
   cannot currently carry a nonce. A real reduction in CSP strength, recorded
   rather than hidden.
4. **Demo credentials must be rotated.** All 23 accounts use
   `demo-password-not-for-production`.
5. **`SUPABASE_SERVICE_ROLE_KEY` must be absent** from the deployed
   application's runtime environment. It is used only by the seed.
6. **No penetration test has been performed.** No claim of resistance to a
   determined attacker is made.
7. **No automated dependency scanning.** `npm audit` is currently manual.
8. **Role changes take effect on the next token refresh**, not immediately.

---

## 5. Regulatory matters requiring human verification

| #   | Question                                            | Who                              | What it unlocks                                    | Blocker for pilot?              |
| --- | --------------------------------------------------- | -------------------------------- | -------------------------------------------------- | ------------------------------- |
| 1   | CBSE affiliation number and status                  | School office                    | CPD + SQAAF compliance reporting (10 requirements) | No                              |
| 2   | Funding status: aided / unaided / partially aided   | School management, with evidence | The whole increment and pay layer                  | No                              |
| 3   | Does Punjab Act 18 of 1979 reach this school?       | Lawyer or HR adviser             | Service-rule enforcement                           | No — yes for real pay decisions |
| 4   | The school's own service rules and pay arrangement  | School management                | Which framework applies                            | No                              |
| 5   | DPDP 2023 position, lawful basis, grievance officer | Data protection adviser          | Retention and erasure handling                     | No — yes before wide rollout    |
| 6   | Retention period for each of the 8 record classes   | Data protection adviser          | Retention policy                                   | No                              |
| 7   | Punjab RTE Rules applicability                      | Lawyer or HR adviser             | Recognition reporting                              | No                              |

Items 1 and 2 are documents in the school's own files and need no legal advice.
Between them they gate almost every compliance feature.

**Never infer applicability from the title of a statute.** Act 18 of 1979 is
named for privately managed recognised schools and looks directly on point. It
has not been read.

---

## 6. Recommended pilot process

Full plan in [`PILOT_PLAN.md`](PILOT_PLAN.md). In summary:

**Twelve weeks, one school, two contrasting departments, 12–20 teachers.**

- Weeks 1–2: setup and briefing. The briefing is the most important two hours.
- Weeks 3–4: self-assessment and observation.
- Weeks 5–6: gaps and development plans.
- Weeks 7–10: learning, application, evidence, impact verification.
- Week 9: appraisal run **in parallel** with the school's existing process,
  never in place of it.
- Weeks 11–12: review and decision.

**Out of scope for the pilot:** increment recommendations (the gates are closed
and should stay closed), appraisal as the official process, SQAAF submission.

The criterion that decides whether to proceed is not whether the platform
worked. It is whether teachers experienced it as development or as assessment,
and whether any manager recorded a decision they disagreed with because the
platform suggested it. That last number must be zero.

---

## 7. Features intentionally deferred

Deferred with a reason, not forgotten.

| Deferred                                   | Reason                                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-school / multi-tenant administration | Isolation is built and tested; there is no UI for running several schools. Deliberate — the MVP is one school.                                                               |
| Machine-readable subject-access export     | Fulfilment from the profile view is workable at this scale. Recorded as a gap.                                                                                               |
| Automatic retention enforcement            | Cannot be built before the periods are decided. Building it with defaults would be worse than not building it.                                                               |
| Punjabi and Hindi interface                | Strings are not externalised. Real work, and it should be scoped rather than assumed.                                                                                        |
| SQAAF maturity-level bands                 | The source section is an image. Not inferred.                                                                                                                                |
| Mobile applications                        | The web interface is responsive; a native app adds distribution and update burden a single school does not need.                                                             |
| Direct CBSE portal integration             | No public API is verified to exist. Export files are prepared instead.                                                                                                       |
| Timetable and substitution management      | Different product.                                                                                                                                                           |
| Student data of any kind                   | Deliberately out of scope. Student examination marks must never be the sole determinant of teacher effectiveness, and the surest way to honour that is not to hold the data. |
| Peer assessment                            | Valuable, and needs a trust model the pilot has not yet established.                                                                                                         |
| Notification email delivery                | Notifications are recorded in-platform. Email needs the school's own infrastructure.                                                                                         |
| MFA                                        | Not built; **required before production**. See section 4.                                                                                                                    |

---

## What this platform does not claim

It does not claim the school is fully CBSE compliant. It does not claim the
school is fully legally compliant. It does not claim DPDP compliance.

What it claims is checkable: 15 requirements recorded against 4 sources that
were actually read; every expectation carrying a visible verification status;
nothing enforced against a school whose affiliation and funding remain
unverified; no automated actor able to change that; and 518 tests holding it in
place.

The system it implements is **a professional growth and school improvement
system**, not a teacher scoring system. Every design decision that could have
gone either way went that way: gaps always carry a route out, course completion
cannot raise a level, attendance is never impact, correlation is never presented
as cause, no algorithm ends a career decision, and the analytics deliberately
refuse to rank teachers publicly.
