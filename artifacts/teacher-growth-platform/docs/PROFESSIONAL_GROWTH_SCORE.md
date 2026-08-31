# Professional Growth Score

**Status:** Implemented — Stage 5
**Classification:** SCHOOL POLICY
**Last updated:** 2026-08-21

---

## 1. This is not a CBSE or Punjab formula

> **DEMO SCHOOL POLICY — NOT A CBSE OR PUNJAB GOVERNMENT FORMULA.**

Those exact words are stored on `appraisal.growth_model.disclaimer`, copied onto
every score computed from it, and rendered beside every percentage the platform
shows. The column is NOT NULL and a check constraint requires any
school-policy model to carry them, so a score cannot reach a screen without its
provenance attached.

No CBSE or Punjab growth-score formula has been established. The weights below
are the school's own decision and the school may change them.

## 2. The model

`appraisal.growth_model` is versioned and dated. Components hang off it, and a
deferred constraint refuses a model whose weights do not total 100 — a model that
does not sum to a whole produces a number nobody can interpret.

| Component             | Weight | What it measures                                                        |
| --------------------- | ------ | ----------------------------------------------------------------------- |
| Competency attainment | 25%    | Verified levels at or above the level expected of the post              |
| Competency growth     | 15%    | Whether verified movement has occurred this year                        |
| KPI achievement       | 15%    | Agreed KPIs closed against those assigned                               |
| CPD compliance        | 15%    | Credited CPD hours against the requirement in force                     |
| CPD impact            | 15%    | Development **applied in practice and verified** — not merely completed |
| Professional goals    | 10%    | Goals achieved against those set                                        |
| Classroom practice    | 5%     | Whether observation evidence exists                                     |

Available but unweighted in this model: collaboration, school contribution,
professional conduct, leadership. They exist as component sources so a school can
weight them; see §4 for why they score zero automatically.

## 3. WHY THIS SCORE?

Every score decomposes. `appraisal.growth_score_component` records, per
component: the name, the weight, the raw result, the weighted points, the
evidence it was drawn from, how many items that was, and the basis on which the
raw result was arrived at.

A worked example from the seeded data:

| Component             | Weight   | Result | Points   | Evidence                                          |
| --------------------- | -------- | ------ | -------- | ------------------------------------------------- |
| Competency attainment | 25%      | 0%     | 0.0      | 0 of 1 verified competencies at or above expected |
| Competency growth     | 15%      | 0%     | 0.0      | 0 verified reassessments this year                |
| KPI achievement       | 15%      | 50%    | 7.5      | 2 of 4 assigned KPIs closed                       |
| CPD compliance        | 15%      | 76%    | 11.4     | 38.00 of 50.00 CPD hours credited                 |
| CPD impact            | 15%      | 0%     | 0.0      | 0 development items with impact verified          |
| Professional goals    | 10%      | 50%    | 5.0      | 1 of 2 professional goals achieved                |
| Classroom practice    | 5%       | 100%   | 5.0      | 1 classroom observation recorded                  |
| **Total**             | **100%** |        | **28.9** |                                                   |

That is a teacher mid-year with an open competency gap, a CPD shortfall and
development not yet applied — and the breakdown says so, component by component.
A low score that explains itself is more useful in an appraisal conversation
than a high one that does not.

A deferred constraint asserts the total reconciles with the sum of its parts to
within rounding. A headline that does not match its own breakdown is worse than
no headline.

## 4. What the engine will not do

**It will not invent a judgement.** Collaboration, school contribution,
professional conduct and leadership have no defensible automatic measure. The
engine scores them zero and records the basis as _"This component has no
defensible automatic measure; the appraiser sets it with a rationale"_ — rather
than inferring them from proxy data that was never collected for the purpose.
A test asserts this behaviour directly.

**It will not treat completion as impact.** The CPD impact component counts only
plan items at `impact_verified` or beyond. This is the Stage 3 rule — completing
a course improves nothing until application has been evidenced and verified —
carried into the score that has employment consequences.

**No model participates.** `appraisal.compute_growth_score()` is deterministic
PL/pgSQL, engine `growth-score-v1`, recorded on every score it produces. A figure
that feeds an employment conversation must be reproducible, and a teacher must be
able to be told exactly how it was reached.

## 5. Versioning

The score copies the model's version and disclaimer onto itself at computation.
A later edit to the model cannot change what a past appraisal was told. The
model itself is versioned and supersedable, so a revision is a new row with its
own effective period.

## 6. Where it is used, and where it is not

It is an **input** to increment readiness, weighted at 30% of that separate
model, with a threshold of 60%.

It is **not** a pay decision, and it cannot by itself block anything a teacher is
owed. See [`INCREMENT_GOVERNANCE.md`](INCREMENT_GOVERNANCE.md) §4.

## 7. Open items

1. ~~Weights are configurable in the database but there is no admin screen~~ —
   **built.** `/admin/growth` edits the weights, and the readiness thresholds
   beside them. All weights submit together, because the deferred constraint
   requires the set to total 100 — saving one at a time would be refused at the
   first field, so there is no half-saved state.
2. No component measures collaboration, conduct or leadership automatically, and
   arguably none should. If the school wants them weighted, the appraiser needs
   a way to record the judgement, which does not exist yet.
3. ~~Year-on-year comparison of growth scores~~ — **built**:
   `appraisal.growth_score_by_year` carries the previous year alongside, **and
   the model version with it**. Comparing scores computed under different models
   is a real hazard, so the view surfaces the version rather than silently
   placing them on one axis.
