# Manager's Guide

For heads of department, coordinators, vice principals and the Principal.

Your role in this platform is to make professional judgements and record them.
The platform does the arithmetic, shows you the evidence, and keeps a record of
what you decided and why. It does not decide anything for you, and it will not
let you pretend it did.

---

## What you can see

You see teachers within your **scope** — a department, a school stage, named
individuals, or the whole school — and only what your **permissions** allow.

Two separations are deliberate and will affect you:

1. **Development supervision does not carry pay information.** You may approve a
   teacher's entire learning plan, verify their evidence and reassess their
   competency, and still see nothing of their increment position. That is
   `increment.read`, held by the Principal, the HR/PD administrator and the
   management approver.
2. **Recommending and approving an increment are different permissions.** One
   person cannot do both. This is not configurable through the interface, by
   design.

---

## Your dashboard

`/manager` shows:

- **Assigned teachers** — everyone in your scope
- **Pending assessments** — what you owe
- **Evidence to verify** — submissions waiting on you
- **Priority gaps across your team** — where development is most needed
- **Development in progress** — active plan items
- **Upcoming reviews** — with slipped dates distinguished from approaching ones

---

## Assessing a teacher

Open a teacher and record a supervisor assessment or an observation.

**Each input is stored separately and none overwrites another.** Your assessment
does not replace the teacher's self-assessment; the two sit side by side, and a
verified level is recorded against them with your name on it.

**Nobody verifies their own competency.** The platform enforces this — you cannot
verify your own.

**Previous assessments are never overwritten.** A new assessment is a new record.
The history of a professional judgement is part of the professional record.

### Observation

Observation narratives are professional feedback and are visible to the teacher.
Write them as you would want one written about you.

---

## Approving development

A teacher proposes an activity from the ranked recommendations; you approve it
before it starts. Approving moves it out of your queue and into _Development in
progress_.

If it is the wrong activity, decline it and say why. A declined item with a
stated reason is more useful than an approved one nobody does.

---

## Verifying evidence and impact

This is the part of the job that matters most, and it is where the platform is
most opinionated.

**Attendance is not impact.** A completed course does not raise a competency
level. The teacher reflects, applies the learning in their practice, submits
evidence, and you verify that the change reached their teaching. Only then can
the competency be reassessed.

When you verify impact, say what you actually observed. "Observed the revised
assessment in use on 12 September; application tasks were genuinely unfamiliar
and the rubric was applied consistently" is a verification. "Looks good" is not.

If evidence does not show what it was submitted for, return it for
clarification with the reason. The reason stays on the record.

---

## Reassessment

Once impact is verified, the competency can be reassessed. This is a fresh
assessment, not an edit of the old one — the previous verified level remains on
the record, and the teacher's growth trend shows the movement.

---

## KPIs

KPIs are agreed with weights totalling 100. The database enforces the total,
so a partial edit that leaves them unbalanced is refused rather than saved.

**Student examination marks are never the sole determinant of teacher
effectiveness.** KPIs that are student-outcome measures are flagged as such on
screen, so their weight in the whole picture is visible rather than implicit.

---

## Appraisal

The appraisal assembles competency movement, KPI outcomes, CPD, professional
goals and evidence into components with weights, and produces a growth score.

The score is labelled everywhere:

> **DEMO SCHOOL POLICY — NOT A CBSE OR PUNJAB GOVERNMENT FORMULA.**

Treat it as an input to your judgement, not as the judgement. If the number and
your professional view disagree, the number is not automatically right, and the
platform gives you the components so you can see where the disagreement is.

### If a teacher challenges the outcome

Their representation goes to the Principal for independent review. **The
original appraisal is never deleted**, and neither is any earlier response.

---

## Increment recommendations

If you hold `increment.read`, you see readiness and recommendations.

Three things constrain what you can do:

1. **Both employment gates are displayed and are currently closed.** The school's
   funding status is unverified, and the applicability of Punjab service rules
   has not been established. Readiness is still computed, because it is a
   development indicator — but no entitlement can be recorded and no final
   decision taken.
2. **A recommendation cannot withhold an entitlement** unless a _verified_ rule
   expressly permits withholding. A growth score is an input to a
   recommendation; it is never by itself a reason to withhold pay.
3. **No AI makes the final employment decision.** There is no mechanism for one
   to.

**The platform holds no salary figures.** It records which pay arrangement
applies and on whose authority.

---

## Analytics

`/analytics` gives you the school picture: a competency heatmap, gap clusters,
CPD completion and impact, and training needs.

### Reading the heatmap

Rows are teachers or groups, columns are competencies. Filter by department,
stage, subject, teacher category, career level or manager.

**Do not use it to rank teachers publicly.** It is a tool for finding where
development is needed, not a league table. Individual performance information
respects your permissions — you see what your scope allows.

### Training needs

The platform states needs in sentences supported by its own counts, for example:

> Competency-Based Assessment is a high-priority development area for 62% of
> Middle Stage Mathematics teachers.

**Only statements supported by stored data are produced.** If the group is too
small to say anything meaningful, nothing is said. A minimum group size prevents
statements that would effectively identify one person.

From a gap cluster you can identify the teacher group, find relevant CPD, and
build a cohort training plan. That creates _proposed_ plan items for each
teacher, which still go through normal approval — a cohort plan is a proposal to
a group of individuals, not an instruction.

### CPD impact

Shown as **association, not cause**. The chain is: training → participation →
application → verified evidence → competency movement. A programme where many
teachers moved may be a good programme, or it may be the one the strongest
teachers chose. The platform uses cautious language deliberately and does not
claim causal impact from correlation.

**Attendance is never treated as impact.**

---

## The Growth Assistant

You can use it to summarise a teacher's reflections and evidence, identify
themes across observations, and draft development plans.

Everything it produces is labelled _AI-assisted recommendation — professional
judgement required_, and shows which records it used.

It cannot change a score, create a hidden score, make an appraisal decision,
promote anyone, determine pay, or override a decision you made. Those are not
policy restrictions — the system provides no mechanism for any of them.

If a suggestion is wrong, it is wrong, and you record what you actually decided.
The platform stores your decision alongside the suggestion, not instead of it.

---

## Things the platform will refuse to do

Knowing these in advance saves confusion:

- Let you verify your own competency
- Let a course completion raise a competency level
- Let you overwrite a previous assessment
- Let you delete an appraisal or a teacher's response to one
- Let you save KPI weights that do not total 100
- Let you enforce a regulatory requirement that is not verified
- Let you record a pay entitlement while the funding gate is closed
- Let you see another school's data, under any circumstances

Each of these is a database-level refusal, not a screen that hides a button.
