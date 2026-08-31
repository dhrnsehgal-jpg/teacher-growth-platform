# KPI Framework

**Status:** Stage 2 — implemented and seeded
**Last updated:** 2026-08-20

---

## 1. Why KPIs are kept apart from competencies

|              | Competency                                                 | KPI                                                         |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------------------- |
| Question     | How does this teacher demonstrate professional capability? | What agreed, measurable responsibilities apply this period? |
| Lifespan     | Develops over years                                        | Set and closed within a review period                       |
| Source       | Framework, mostly external                                 | Negotiated between teacher and reviewer                     |
| Changes when | Practice matures                                           | The year's priorities change                                |

A teacher can be highly competent and still miss an agreed responsibility, and a
teacher can hit every KPI in a year where their practice did not develop at all.
Merging the two would make both unreadable, so they are separate schemas
(`competency` and `kpi`) joined only through shared evidence.

## 2. Structure

```
Category  →  Template  →  (assignment)  →  Teacher KPI
                 └── Applicability (category / stage / role)
```

**Twelve categories** are seeded: Teaching & Learning, Curriculum Planning,
Assessment, Student Progress, Professional Development, Inclusion, Innovation,
Collaboration, Parent Engagement, Professional Responsibilities, School
Contribution, Leadership.

**Twelve templates** are seeded across them. Templates are per school and
applicability-scoped: there is deliberately **no single hard-coded KPI model**
that every teacher receives.

## 3. What every KPI records

| Field                 | Required        | Note                                                                                                                   |
| --------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Name, description     | ✓               |                                                                                                                        |
| Metric                | ✓               | How it is measured                                                                                                     |
| Unit                  |                 | e.g. `%`, `hours`, `rubric points (1-5)`                                                                               |
| Direction             | ✓               | `increase` · `decrease` · `maintain` · `qualitative`                                                                   |
| Target                | ✓               | Text, so qualitative targets are first-class                                                                           |
| Weight                | ✓               |                                                                                                                        |
| **Data source**       | ✓               | Constraint-enforced. A KPI whose source is unstated cannot be scored fairly, because nobody can check it.              |
| Frequency             | ✓               | `continuous` · `monthly` · `termly` · `semester` · `annual`                                                            |
| Evidence requirement  |                 | Links to the evidence framework                                                                                        |
| **Reviewer**          | ✓ once assigned | A KPI cannot leave `draft` without a named reviewer — an unowned KPI is one nobody is accountable for reviewing fairly |
| Applicability         |                 | Teacher category, stage, role                                                                                          |
| Academic year         | ✓               |                                                                                                                        |
| Source classification | ✓               | Same `source_framework` / `source_alignment` axes as competencies                                                      |

### Values are snapshotted, not referenced

`kpi.teacher_kpi` copies the metric, target, weight and data source from the
template at assignment time. A template edited in March must not silently rewrite
a KPI agreed in April. `template_id` is kept for provenance only.

## 4. Student outcomes are capped, not banned

> Student examination marks must never be the sole determinant of teacher
> effectiveness.

This is enforced, not asserted. Every template and assignment carries
`is_student_outcome_measure`, and `kpi.school_policy` sets a cap on the share of
a teacher's total KPI weight that those measures may carry — **default 30%**.

`kpi.validate_teacher_kpi_set(teacher, year)` returns one row per problem:

| Issue code                       | Meaning                                |
| -------------------------------- | -------------------------------------- |
| `no_policy`                      | No policy configured; defaults applied |
| `no_kpis`                        | Nothing assigned                       |
| `too_few_kpis`                   | Below the policy minimum (default 4)   |
| `weights_not_100`                | Weights do not total 100               |
| `student_outcome_share_exceeded` | The cap is breached                    |

The seeded assignments sit at 25% (Rajesh) and 20% (Anjali). A test deliberately
adds a 100-weight board-results KPI and asserts
`student_outcome_share_exceeded` fires.

Note also the design of the student-progress template itself: it measures
progress **against each student's own baseline**, not raw attainment, so a
teacher is not rewarded or punished for the intake they were given.

**This cap is school policy.** It is not a CBSE or Punjab requirement, and the
interface says so wherever it appears.

## 5. Assignment and scope

`kpi.assign` is held by Head of Department, Academic Coordinator, Vice Principal,
Principal and HR/PD Admin. `kpi.manage` — the template and policy catalogue — is
narrower: Principal and HR/PD Admin only.

The RLS policy requires **both** the permission and
`core.can_view_staff_record()`. Permission alone would have let a Head of
Department set KPIs school-wide; that gap was found and closed during Stage 2
before the migration was first applied.

A teacher sees their own KPIs. A named reviewer sees the KPIs they review, even
outside their normal scope — otherwise they could be asked to review something
they cannot open.

## 6. Seeded example: two very different teachers

| Rajesh Verma (PGT, Physics)                         | Weight  |     | Anjali Mehta (HOD, Science)                         | Weight  |
| --------------------------------------------------- | ------- | --- | --------------------------------------------------- | ------- |
| Lesson Observation Outcomes                         | 30      |     | **Team Leadership**                                 | **35**  |
| Assessment Design and Moderation                    | 20      |     | Lesson Observation Outcomes                         | 20      |
| Class Progress Against Baseline _(student outcome)_ | 25      |     | Curriculum Planning and Coverage                    | 15      |
| CPD Participation                                   | 15      |     | Class Progress Against Baseline _(student outcome)_ | 20      |
| Parent Partnership                                  | 10      |     | CPD Participation                                   | 10      |
| **Total**                                           | **100** |     | **Total**                                           | **100** |
| Student-outcome share                               | 25%     |     | Student-outcome share                               | 20%     |

Both total 100 and both sit under the cap, but the shape is different: the Head
of Department carries leadership weight a classroom teacher does not.

## 7. Administration

`/admin/kpi` lists templates by category, flags student-outcome measures, and
states the cap and that it is the school's own rule.

## 8. Deliberately not built in Stage 2

KPI **scoring** and progress tracking. Stage 2 defines and assigns KPIs; it does
not evaluate them. Recording an outcome without the assessment and moderation
machinery of Stage 3 would produce numbers nobody could defend.

## 9. Open items

1. Weight totals are validated on demand rather than enforced by constraint —
   a partially configured set must be saveable mid-conversation.
2. No KPI templates are sourced from a verified external framework; all are
   `school` / `school_defined`. That is the honest position: no verified CBSE or
   Punjab instrument prescribing teacher KPIs was located in Stages 1–2.
3. Bespoke (non-template) KPIs are supported by the schema but have no admin UI.
