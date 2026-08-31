# Stage 5 Completion Report

**Date:** 2026-08-21
**Stage:** 5 of 6 — Punjab Service Conditions, Appraisal, Career Progression and Increment Readiness
**Status:** Complete. Stage 6 not started, awaiting instruction.

---

## 1. What was built

Eight migrations (`0040`–`0047`), taking the database from 91 to **112 tables**
across three new schemas.

| Schema      | Holds                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------- |
| `service`   | Designations, service records, career events, qualifications, service policies              |
| `appraisal` | Cycles, the 13-stage workflow, teacher responses, representations, growth models and scores |
| `pay`       | Pay frameworks, entitlements, readiness models, recommendations, the approval chain         |

Application: `/appraisal`, `/increment`, `/service`, and seven server actions.

Documents: [`PUNJAB_SERVICE_RULES.md`](PUNJAB_SERVICE_RULES.md),
[`APPRAISAL_MODEL.md`](APPRAISAL_MODEL.md),
[`PROFESSIONAL_GROWTH_SCORE.md`](PROFESSIONAL_GROWTH_SCORE.md),
[`INCREMENT_GOVERNANCE.md`](INCREMENT_GOVERNANCE.md).

## 2. The regulatory position, which is the headline

**No Punjab instrument was retrieved, so none is treated as applying.**

`indiacode.nic.in` returned HTTP 403 — retried in this stage, not merely assumed
from Stage 1 — and `pbhe.punjab.gov.in` refused the connection. Four instruments
are recorded by name, unread, with applicability undetermined. Nothing about
their content, scope or amendment status is asserted.

This is the correct outcome, not a shortfall. The brief's rule — _never infer
applicability solely from the title of a statute_ — has exactly this consequence
when the statutes cannot be read.

Two gates, with two different messages, both held in the database:

| Gate                                 | Message                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Funding status (Stage 1)             | _School funding/service status requires verification before employment-related compliance calculations can be activated._ |
| Service-rule applicability (Stage 5) | _Employment/service-rule applicability requires authorised verification._                                                 |

While they are closed: no entitlement can be recorded, no final increment
decision can be taken, and no rule can be marked applicable. Appraisal and
readiness still run, because withholding the developmental half would stop the
school doing useful work for a reason unrelated to development.

## 3. The protection at the centre of the stage

> The system must not automatically reduce, remove or block a legal or
> contractual entitlement because of a competency score unless the verified
> applicable rule expressly permits it.

`pay.entitlement.withholding_permitted_by_rule` defaults to **false**, and
setting it true requires naming the rule and citing its source. A recommendation
proposing to withhold is refused unless that flag is true on the entitlement it
names — by trigger, with an error that explains why:

> _"A growth score is an input to a recommendation. It is not, by itself, a
> reason to withhold something a teacher is owed."_

Three tests cover it: refused without a rule, permitted with one, and refused
when marking an entitlement withheld regardless of any recommendation.

## 4. Three separations held structurally

| Kept apart                                   | How                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Pay framework · entitlement · recommendation | Three tables, no query joining them into one answer                                                                                  |
| Professional capability · employment rank    | `core.career_level` and `service.designation`, with **no mapping** between them. A Lead Practitioner is not thereby a Vice Principal |
| Configuring the model · approving against it | `pay_framework.manage` is HR only, deliberately not the Management Approver who holds `increment.approve`                            |

## 5. Appraisal

Thirteen stages in the brief's order, enforced by trigger. The only permitted
move backwards is to the appraisal discussion, and only before a recommendation
exists.

- **Nobody appraises themselves** — not as appraiser, recommender or approver.
- **The recommendation freezes when made.** The brief's _"maintain the original
  appraisal if a teacher challenges it"_ is met by making the original
  physically unchangeable rather than by remembering to copy it.
- **Acknowledgement is not a signature box.** Five response statuses, all
  append-only; acknowledging later does not erase a comment made earlier.
- **A representation is reviewed by someone independent** of both the decision
  and the teacher, requires reasons, and produces a revised position _beside_
  the original — never instead of it.

## 6. Growth score

Configurable, versioned, and carrying **DEMO SCHOOL POLICY — NOT A CBSE OR
PUNJAB GOVERNMENT FORMULA.** on a NOT NULL column that a check constraint
requires for any school-policy model. The disclaimer is copied onto every score,
so a later edit to the model cannot change what a past appraisal was told.

Every score decomposes into component, weight, result, weighted points, evidence
and basis — which is what "WHY THIS SCORE?" renders. A deferred constraint
asserts the total reconciles with its parts.

The seeded example scores **28.9%** and explains why: an open competency gap, a
CPD shortfall, and development not yet applied in practice. A low score that
explains itself is more useful than a high one that does not.

Components with no defensible automatic measure — collaboration, conduct,
leadership — score zero and say so, rather than being inferred from proxy data.

## 7. Verification

| Check                              | Result                                        |
| ---------------------------------- | --------------------------------------------- |
| `npm run lint`                     | clean                                         |
| `npm run typecheck`                | clean                                         |
| `npm run test`                     | **313 tests** — 68 unit, 220 database, 25 API |
| `npx playwright test`              | **30 passing**                                |
| `npx next build`                   | compiles                                      |
| Migrations + seed from clean reset | apply to both databases                       |

New this stage: 47 database tests and 7 Playwright specs.

### Defects found and fixed

1. **A composite-FK embed returned nothing, silently** — `service_record` →
   `designation`. The service record page rendered _"No service record has been
   created for you"_ while the record existed. The Stage 2 lesson (migration
   `0019`) recurring for the fourth time.
2. **Then the fix broke it again**: the explanatory comment was placed _inside_
   the template literal, so it was sent to PostgREST as part of the select
   string. Same symptom, different cause. Comments now sit outside.
3. **`select ... into` cannot target a record and a scalar together** in
   PL/pgSQL — the growth-score engine needed two statements.
4. **RBAC parity** — four permissions added in SQL and not mirrored in
   TypeScript, caught by the Stage 1 parity test.
5. **A start-order trap worth recording**: adding a schema to
   `config.toml` before its migration has run makes PostgREST fail its health
   check with _"schema does not exist"_, and `supabase start` never comes up.
   The sequence is: start without the new schemas, `db reset` to create them,
   add them to config, then restart.

## 8. Assumptions

1. Probation and confirmation dates in the demo data are illustrative. Actual
   periods depend on the school's employment policy, which has not been supplied.
2. The employment designation ladder is school-defined. No Punjab or CBSE
   designation structure has been verified.
3. Readiness thresholds and growth weights are school policy, labelled as such
   wherever shown, and configurable in the database.
4. The seeded appraisal reflects a mid-year state, because Stage 3 deliberately
   leaves the competency journey for the Playwright spec to drive. Two KPIs
   closed and one goal achieved represent a year in progress — the score is
   genuinely computed from that state, not arranged to reach a flattering number.

## 9. Outstanding

**Regulatory — every item in [`PUNJAB_SERVICE_RULES.md`](PUNJAB_SERVICE_RULES.md) §7.**
The first unlocks the most: the school's funding status, with documentary
evidence. It is the single fact between a built system and an operating one, and
it now gates two stages rather than one.

**Engineering**

1. Admin screens for growth weights and readiness thresholds — configurable in
   the database, not yet in the interface.
2. Moderation across appraisers; the `assessment.moderation` source has been
   unused since Stage 3.
3. Bulk opening of appraisals for a cohort.
4. Year-on-year comparison of growth scores.
5. Malware scanning before serving uploaded files — inherited, still open.

## 10. Not built, as instructed

**Stage 6 has not been started.**
