# Learning Map (IPDP)

**Status:** Stage 3 — implemented
**Last updated:** 2026-08-20

---

## 1. The rule this exists to enforce

> **Completing a course does not improve a competency.**

That is not a UI convention. It is a state machine in the database
(`growth.validate_plan_item_transition`) with no edge from `completed` to
`reassessed`, plus a gate function (`growth.can_reassess`) that refuses until
every intermediate stage has produced something real.

Attendance is easy to record and easy to game. What matters is whether practice
changed, and whether anyone saw it change.

## 2. The stages

```
proposed → approved → in_progress → completed → reflected → applied
                                                    → impact_verified → reassessed
```

| Stage               | Who acts | What it requires                                                                                             |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| **proposed**        | Teacher  | Selects a recommended activity; the recommendation's reasoning is copied onto the item                       |
| **approved**        | Manager  | Approves; declining requires a written reason of 10+ characters                                              |
| **in_progress**     | Teacher  | Starts the activity                                                                                          |
| **completed**       | Teacher  | Participation only. **Changes nothing about the competency**, and the interface says so at this exact moment |
| **reflected**       | Teacher  | A reflection of 30+ characters — what they took from it and what will change                                 |
| **applied**         | Teacher  | An application summary of 30+ characters, plus evidence attached                                             |
| **impact_verified** | Manager  | Verifies the evidence _and_ that they saw it in practice; sets evidence strength                             |
| **reassessed**      | Manager  | Records a NEW verified level — the only route to a changed competency                                        |

`declined` returns to `proposed`. `abandoned` is terminal from most stages.

Every transition writes to `growth.plan_item_event`, an append-only trail the
Learning Map renders directly as the teacher's own history.

## 3. The gate

`growth.can_reassess(plan_item_id)` returns `(allowed, reason)` and refuses with
a specific reason at each stage:

| Missing               | Reason returned                                                      |
| --------------------- | -------------------------------------------------------------------- |
| Completion            | "The CPD activity has not been completed."                           |
| Reflection            | "The teacher has not yet recorded a reflection."                     |
| Application           | "The teacher has not yet applied the learning and described how."    |
| Verified evidence     | "No verified evidence of application in practice has been attached." |
| Reviewer verification | "A reviewer has not yet verified the application in practice."       |

Returning the specific reason rather than a bare refusal means the interface can
tell a teacher exactly what is outstanding.

Note the two separate requirements at the end: **verified evidence** (the
artefact is genuine) and **impact verification** (a reviewer saw it in practice).
A teacher could upload a beautiful revised assessment plan they never taught;
only the second requirement catches that.

## 4. What the teacher sees

`/learning-map` shows, per item:

- a milestone bar across all eight stages, with the current position;
- **next action** and **who owns it** — teacher or reviewer;
- due date and owner;
- evidence outstanding (`n verified of m submitted`);
- the record so far: why it was chosen, the reflection, the application summary,
  and the reviewer's verification note;
- exactly one control — the action for the current stage, and nothing else.

The dashboard carries a condensed version, plus current milestone and next
action per item.

## 5. What the manager sees

`/manager` groups work by what it needs:

- **Awaiting approval** — approve or decline, with the teacher's stated reason
  for choosing the activity visible;
- **Application awaiting verification** — the reflection and application summary
  in full, with evidence strength to set;
- **Ready for reassessment** — only items that passed the gate;
- assigned teachers, priority gaps across the team, development in progress, and
  pending assessments.

Scope is enforced by RLS, not by filtering: a Head of Department sees their
department because `core.can_view_staff_record()` says so. A teacher opening
`/manager` is told they supervise nobody — verified by a Playwright test.

## 6. The demo scenario, end to end

Neha Sharma, Middle Stage Mathematics. Competency-Based Assessment, expected 4,
verified 2, gap 2, priority High.

1. Dashboard shows the gap and the seven factors behind its priority.
2. The competency page shows how level 2 was reached — self, supervisor and
   observation ratings listed **separately**, each with its own reasoning, plus
   evidence strength and the verifier's rationale.
3. Three ranked recommendations, each with "Why this course?".
4. Neha adds the top one to her Learning Map.
5. Vikram Rao (HOD Mathematics) approves it.
6. Neha starts it, then completes it — **and the page states plainly that this
   has not changed her competency level**.
7. She records a reflection, then applies it and submits evidence.
8. Vikram verifies the evidence and the application in practice.
9. Only now does the item appear under "Ready for reassessment". Vikram records
   level 3 with a rationale.
10. Neha's dashboard shows the reassessment; the competency history shows
    **both** level 2 and level 3, because verified levels are append-only; the
    gap has narrowed from 2 to 1 and been rescored.

`tests/e2e/growth-lifecycle.spec.ts` walks exactly this through the real UI.

## 7. Audit

Every high-impact action records actor, action, previous and new value,
timestamp, and reason:

- `audit.audit_log` — via triggers on `verified_competency`,
  `competency_rating` and `learning_plan_item`;
- `growth.plan_item_event` — every stage transition with its note;
- `evidence.status_history` — every evidence status change;
- `assessment.verified_competency.determined_from` — a JSON snapshot of the
  inputs at the moment of verification, so the record survives later edits to
  anything it drew on.

Nothing is overwritten. A correction is a new row.

## 8. Limits worth knowing

1. **Evidence is metadata only.** There is no file upload yet, and storage bucket
   policies are still outstanding from Stage 2. Upload must not be enabled in a
   real deployment until they exist.
2. **Due dates are not set automatically** and nothing chases them. There is no
   reminder or escalation.
3. **One evidence type is assumed** on submission (`assessment_design`); the
   teacher cannot yet choose.
4. **No bulk approval.** A manager approves items one at a time, which is correct
   at this scale and will not be at 60 staff.
5. **Reassessment is per plan item**, so a competency developed through two
   activities is reassessed against whichever completes first.
