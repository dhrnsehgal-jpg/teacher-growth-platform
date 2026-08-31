# Gap Engine

**Status:** Stage 3 — implemented as `growth.compute_gaps()`, engine version `gap-engine-v1`
**Last updated:** 2026-08-20

---

## 1. The base calculation

```
gap size = expected level ordinal − verified level ordinal   (floored at 0)
```

Both ordinals must come from the **same proficiency scale**. The school holds
more than one — its own five-point operating scale and the three-point NPST
reference scale — and comparing across them is meaningless. A trigger
(`assessment.enforce_level_scale_consistency`) rejects any verified competency
whose verified and expected levels belong to different scales. That guard exists
because the reassessment action originally got this wrong and recorded "Expert
Teacher" (NPST ordinal 3) where "Proficient" (school ordinal 3) was meant.

**Only competencies with a verified level are scored.** A competency that has
never been assessed is reported as unassessed, not as a gap of unknown size.
Inventing a starting level to make the arithmetic work would put a number on the
teacher's record that nobody had ever judged.

## 2. Priority is not the same as gap size

A gap of 1 on a mandatory, strategically prioritised competency matters more
than a gap of 2 on something peripheral. Priority is scored 0–100 from nine
factors, each contributing a fixed number of points:

| #   | Factor                            | Max points | When it applies                                        |
| --- | --------------------------------- | ---------- | ------------------------------------------------------ |
| 1   | Gap magnitude                     | 30         | `min(gap, 4) × 30 ÷ 4` — a gap of 4+ earns the full 30 |
| 2   | Mandatory competency              | 15         | The matched target is flagged `is_mandatory`           |
| 3   | School strategic priority         | 15         | The competency is a named priority this year           |
| 4   | KPI relevance                     | 10         | An assigned KPI depends on this competency             |
| 5   | Observed below expectation        | 10         | A recorded observation rated it below target           |
| 6   | Evidence strength                 | 10 / 5 / 0 | none or weak / adequate / strong                       |
| 7   | Previous development attempted    | 10         | Earlier CPD targeted it and the gap remains            |
| 8   | Specifically expected of the post | 5          | The matched target had specificity > 0                 |
| 9   | Weighting                         | 5          | The school weighted the target above default           |

Total is capped at 100. **A gap of zero short-circuits everything**: at or above
expectation scores 0 and lands in "No Gap", however heavily weighted the
competency is.

Factor 7 is deliberate escalation. A gap that has already survived one round of
development is a harder problem than a fresh one, and should surface higher.

## 3. Bands

Configurable per school in `growth.priority_band`. Defaults:

| Band     | Score  |
| -------- | ------ |
| No Gap   | 0      |
| Low      | 1–29   |
| Medium   | 30–54  |
| High     | 55–84  |
| Critical | 85–100 |

**Why Critical starts at 85.** The compounding factors — mandatory, strategic,
KPI-relevant, observed below, weak evidence — total 60 on their own, before any
gap magnitude. If Critical began at 80, a two-level gap would be
indistinguishable from a four-level one. Setting it at 85 means Critical
requires a gap of 3 or more _in addition to_ compounding factors. The demo
scenario scores 80 — a genuine High, not a Critical.

## 4. Every priority is explained

`growth.gap.factors` stores a JSON array of `{factor, points, why}`, and
`explanation` holds the same thing as prose. The teacher-facing "Why is this a
priority?" panel renders directly from these — the reasoning is data, not text
regenerated on each view.

For the demo scenario:

| Factor                             | Points | Why                                                      |
| ---------------------------------- | ------ | -------------------------------------------------------- |
| Gap magnitude                      | 15     | Expected level 4, verified at level 2 — a gap of 2       |
| Mandatory competency               | 15     | School policy marks this as required                     |
| School strategic priority          | 15     | The school's stated improvement priority for 2026-27     |
| KPI relevance                      | 10     | One of your agreed KPIs depends on this competency       |
| Observed below expectation         | 10     | A recorded observation rated it below the expected level |
| Evidence strength                  | 10     | Supporting evidence is currently weak (1 item)           |
| Specifically expected of your post | 5      | Set for the Middle stage, not applied school-wide        |
| **Total**                          | **80** | **High**                                                 |

## 5. No model participates in the arithmetic

The whole calculation is one PL/pgSQL function. There is no model call, no
embedding, no similarity score. The same inputs always produce the same output,
and `tests/db/stage3.test.ts` asserts that recomputing changes nothing.

`engine_version` is stored on every row. Changing the method means bumping it, so
an old score is never silently reinterpreted under new rules — the same
principle applied to regulatory requirement versions in Stage 1.

## 6. Recomputation and history

Gaps are **derived**, so recomputing is not overwriting a judgement. The
judgements themselves — ratings and verified levels — are append-only in the
`assessment` schema, and competency movement over time is read from
`assessment.competency_history`.

`compute_gaps()` runs:

- when a competency is reassessed (from the reassessment action);
- when the seed provisions a school;
- on demand.

## 7. Limits worth knowing

1. **Weights are fixed in the function**, not configurable per school. The bands
   are configurable; the factor weights are not. If a school disagrees with the
   30-point magnitude budget, that is currently a code change.
2. **"Previous development attempted" counts attempts, not their quality.** Two
   half-hearted courses score the same as one serious one.
3. **Subject-specific targets are supported but unused**, so no factor
   distinguishes a gap in a teacher's main subject from a secondary one.
4. Priority does not consider workload — a teacher with six Critical gaps and one
   with a single Critical gap are scored identically per competency. Sequencing
   across a teacher's whole set is Stage 4 work.
