# CPD Recommendation Engine

**Status:** Stage 3 — implemented as `cpd.generate_recommendations()`, engine version `cpd-recommender-v1`
**Last updated:** 2026-08-20

---

## 1. What it matches

```
Teacher gap → competency → activities addressing that competency → ranked
```

The join that makes this possible is `cpd.activity_competency`: every activity
declares which competencies it addresses, at what level, and whether that is its
primary focus. Without that mapping, "why this course?" has no answer.

## 2. Exclusions come before scoring

Two things remove an activity outright rather than scoring it down:

- **Applicability mismatch.** If an activity declares stage, subject or category
  applicability and none matches the teacher, it is not offered. A
  Foundational-stage phonics course should not appear in a Class XI Physics
  teacher's list with a quiet penalty attached.
- **Already taken.** An activity already on the teacher's plan (and not declined
  or abandoned) is excluded.

Also filtered: inactive activities, and anything with availability
`unavailable` or `retired`.

An activity with **no** applicability rows suits everyone — the common case.

## 3. Ranking factors

| Factor                                  | Points     | When                                                |
| --------------------------------------- | ---------- | --------------------------------------------------- |
| Directly addresses this competency      | 40         | The competency is the activity's primary focus      |
| Covers this competency                  | 20         | Addressed, but not the main focus                   |
| Pitched at or above your expected level | 20         | Targets a level ≥ the teacher's expected level      |
| Moves you forward                       | 10         | Targets above the verified level but below expected |
| Matches the stage you teach             | 10         | Stage applicability matches                         |
| Matches your subject                    | 10         | Subject applicability matches                       |
| Matches your post                       | 5          | Teacher-category applicability matches              |
| Availability                            | 10 / 7 / 3 | available / scheduled / waitlist                    |
| No cost                                 | 5          | No fee to the school                                |
| Recognised provision                    | 5          | Recognition is `aligned` with a citation            |

Ranked by score descending, ties broken by activity id for determinism. The top
five per gap are kept.

Note the level factors are mutually exclusive: an activity either reaches the
expected level (20) or merely moves the teacher forward (10), never both.

## 4. Every recommendation explains itself

`cpd.recommendation.reasons` stores `{factor, points, why}` per contributing
factor, and the score is exactly their sum — asserted in
`tests/db/stage3.test.ts`. The teacher-facing "Why this course?" panel renders
from that array.

For the demo scenario, the top recommendation scores 95:

| Factor                                  | Points | Why                                                                 |
| --------------------------------------- | ------ | ------------------------------------------------------------------- |
| Directly addresses this competency      | 40     | Competency-Based Assessment is its primary focus                    |
| Pitched at or above your expected level | 20     | Develops practice towards Advanced, meeting the expected level of 4 |
| Matches the stage you teach             | 10     | Designed for the Middle stage                                       |
| Matches your subject                    | 10     | Designed for Mathematics                                            |
| Availability                            | 10     | Currently available                                                 |
| No cost                                 | 5      | No fee to the school                                                |

The ranked list for that gap:

| Rank | Activity                               | Score | Provider                        |
| ---- | -------------------------------------- | ----- | ------------------------------- |
| 1    | Designing Competency-Based Assessments | 95    | School PD Team                  |
| 2    | Rubric Design Intensive                | 67    | Regional Institute of Education |
| 3    | NISHTHA: Assessment for Learning       | 40    | DIKSHA / NISHTHA (NCERT)        |

Rank 3 scores lower because it covers the competency only incidentally and is
pitched at a lower level — not because of anything about the provider.

## 5. No model determines the ranking

The whole thing is one PL/pgSQL function. No language model participates in
selection, scoring or ordering, and none can. The reasons shown to a teacher are
the actual scoring factors, not a post-hoc explanation generated to fit a ranking
produced some other way — which is the failure mode this design exists to avoid.

`engine_version` is recorded on every row.

## 6. Provider recognition is never inflated

`cpd.provider.recognition` and `cpd.activity.recognition` reuse the Stage 2
source vocabulary, and `aligned` cannot be stored without a citation. So an
in-house workshop shows as **School-defined**, while the NISHTHA module shows as
recognised with its citation — _NCERT Guidelines for 50 Hours of CPD (2022),
Section A — Online Mode_.

Recognition earns 5 points out of ~95. It is a tiebreaker, not a driver: a
recognised course that does not address the gap still ranks below an in-house one
that does.

## 7. Limits worth knowing

1. **Cost is binary** — free or not. There is no budget model, no cost-benefit
   trade-off, and no school CPD budget to spend against.
2. **No scheduling awareness.** A course scheduled for November ranks the same in
   August as in December; `next_offering_on` is displayed but not scored.
3. **No peer signal.** Nothing considers what colleagues found useful. That would
   need outcome data the platform does not yet have.
4. **Prerequisites are displayed, not enforced.** A teacher can select an
   activity whose prerequisite they do not meet; the manager approval step is
   where that is caught.
5. **Recommendations regenerate wholesale.** Selecting an activity does not
   preserve the ranking that produced it — but the reasoning is copied onto the
   plan item at selection time, so the record of _why_ survives.
