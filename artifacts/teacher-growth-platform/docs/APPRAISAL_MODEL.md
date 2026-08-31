# Appraisal Model

**Status:** Implemented — Stage 5
**Last updated:** 2026-08-21

---

## 1. The workflow

Thirteen stages, in the order the brief sets out, enforced by trigger rather
than convention:

```
self-assessment → competency review → KPI review → classroom observation →
evidence review → CPD compliance → CPD impact → professional goals →
supervisor review → appraisal discussion → final recommendation →
teacher acknowledgement → authorised approval → closed
```

Stages advance one at a time. The single permitted move backwards is to
**appraisal discussion**, and only from before the recommendation — because a
discussion can legitimately reopen a review, but nothing reopens a decision
already made.

Every transition writes to `appraisal.stage_event`, which is append-only and
whose INSERT is revoked from clients: the trail is written by a
`SECURITY DEFINER` trigger, so entries cannot be forged.

## 2. What the appraisal draws on

Nothing in this stage re-measures anything. The appraisal reads what the earlier
stages already established:

| Stage                 | Source                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Competency review     | `assessment.verified_competency` — self, supervisor, observation and evidence, each recorded separately (Stage 3) |
| KPI review            | `kpi.teacher_kpi` for the year                                                                                    |
| Classroom observation | `assessment.observation`                                                                                          |
| Evidence review       | `evidence.evidence` with its verification status                                                                  |
| CPD compliance        | `compliance.cpd_progress()` against the CBSE requirement (Stage 4)                                                |
| CPD impact            | Plan items at `impact_verified` or beyond — completion alone counts for nothing                                   |
| Professional goals    | `growth.professional_goal`                                                                                        |

## 3. Three refusals that define the model

### Nobody appraises themselves

A trigger refuses a teacher as their own appraiser, their own recommender or
their own approver. This is the Stage 3 self-verification rule applied to the
act that carries employment consequences.

### The recommendation freezes when made

Once `recommendation` is written it cannot be edited, and an approved appraisal
cannot be re-approved or un-approved. The brief's requirement — _maintain the
original appraisal if a teacher challenges it_ — is met by making the original
physically unchangeable rather than by remembering to keep a copy.

### Acknowledgement is not a signature box

`appraisal.teacher_response` is append-only and holds five positions:

| Status                    | Meaning                                         |
| ------------------------- | ----------------------------------------------- |
| `reviewed`                | I have read it                                  |
| `acknowledged`            | I acknowledge it — **not** the same as agreeing |
| `comments_submitted`      | I want something recorded alongside it          |
| `clarification_requested` | I am asking a question before responding        |
| `finalised`               | The response process is closed                  |

Comments and clarification requests require at least ten characters, because an
empty comment is not a comment. Every response a teacher makes stays on the
file: acknowledging later does not erase a comment made earlier, and a test
asserts exactly that.

## 4. Representation — the grievance route

```
view appraisal → view evidence → request clarification →
submit representation → review → decision
```

`appraisal.representation` copies the original recommendation, its rationale and
its author onto itself at the moment of challenge. Belt and braces: the appraisal
row is already frozen, but a representation that cannot show what was originally
decided is not much of a record.

The rules the schema enforces:

- **The reviewer may not be the person whose decision is challenged**, nor the
  person who submitted it. A grievance reviewed by its own subject is not a
  grievance procedure.
- **A decision requires a reason** of at least twenty characters. An outcome
  without reasons is precisely what the procedure exists to prevent.
- **If it succeeds in any part, say what the position now is.** `upheld` and
  `partly_upheld` require a revised recommendation.
- **The original and the grounds are immutable.** Neither can be edited after
  submission.

The revised position sits _beside_ the original. Both remain readable, and the
teacher's page shows both.

## 5. Who can see what

| Actor                 | Appraisal                                                                       |
| --------------------- | ------------------------------------------------------------------------------- |
| The teacher           | Their own, in full — every input, the score breakdown, the reasoning, the trail |
| Supervisor in scope   | Appraisals of staff within `can_view_staff_record()`                            |
| Teacher outside scope | Nothing                                                                         |

Being appraised by a process you cannot inspect is the opposite of
developmental, so the teacher's read is unrestricted on their own record. Only
the teacher may record their own response — a policy checks the signed-in user
owns the appraisal, so an acknowledgement entered by somebody else is refused.

## 6. Audited

`appraisal.appraisal`, `appraisal.representation` and `appraisal.growth_score`
all carry `audit.record_row_change`, so every recommendation, every
representation and every score reaches the Compliance Administrator's audit view
with its before and after values.

## 7. Open items

1. The appraisal **discussion** is recorded as a date and a note. Whether the
   school wants a structured agenda is a policy question not yet asked.
2. ~~Moderation across appraisers~~ — **built** (migration `0049`). See §8.
3. Bulk opening of appraisals for a whole cohort; currently one at a time.
4. Whether any applicable rule prescribes a grievance procedure this flow must
   match — see [`PUNJAB_SERVICE_RULES.md`](PUNJAB_SERVICE_RULES.md) §7 item 10.

---

## 8. Moderation across assessors

The `moderation` rating source existed from Stage 3 and went unused until
migration `0049`, which meant consistency between assessors rested on trust: two
Heads of Department could rate the same practice differently and nothing would
notice.

**Moderation is a meeting, not a correction.** A panel examines a set of ratings
together and, for each, either upholds it or adjusts it — with reasons either
way. Upholding is a real outcome: it records that the rating was examined, which
is what "moderated" means.

### What the schema enforces

- **An adjustment writes a new rating**, source `moderation`, and supersedes the
  original. Stage 3's rule holds: ratings are immutable and a correction is a new
  row, so the original assessor's judgement stays visible beside the panel's.
- **The moderated level must come from the same proficiency scale** as the
  rating being moderated — the Stage 3 scale-mixing defect (migration `0028`)
  pre-empted once more.
- **Reasons are required either way**, at least twenty characters. Upholding
  without a reason tells a teacher nothing about why their rating was examined
  and left alone.
- **A teacher cannot sit on a panel moderating their own rating.** A second look
  by the same eyes is not a second look.
- **Completing a session requires a written conclusion** of at least thirty
  characters. A moderation that produced no view of consistency has not
  moderated anything.
- **The panel is on the record.** `moderation_participant` names who was in the
  room, because a moderation decision carries the weight of the people who made
  it.

A teacher can see moderation of **their own** ratings: the outcome affects their
record, so they are entitled to see that it happened and why.
