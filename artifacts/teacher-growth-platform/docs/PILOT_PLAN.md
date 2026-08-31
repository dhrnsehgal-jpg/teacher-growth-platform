# Pilot Plan

A twelve-week pilot for one CBSE-affiliated school in Punjab.

The purpose of the pilot is **not** to prove the platform works. It is to find
out whether teachers experience it as a development system or as a scoring
system — because that distinction cannot be established by testing, and getting
it wrong is not recoverable. A platform that teachers decide is surveillance
will be treated as surveillance no matter what the documentation says.

---

## Before week 1 — the two documents

Two things must be in hand before the pilot starts. Neither needs a lawyer.
Both are documents in the school's own files, and between them they gate almost
every compliance feature.

| #   | What                                                              | Who               | Unlocks                                                   |
| --- | ----------------------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| 1   | CBSE affiliation number and current status                        | School office     | CBSE CPD and SQAAF compliance reporting — 10 requirements |
| 2   | Funding status (aided / unaided / partially aided), with evidence | School management | The increment and pay layer                               |

**If these are not available, run the pilot anyway.** The platform is designed to
work with its compliance layer inert, and that is the correct behaviour rather
than a limitation. But the gates will be visible to teachers, and somebody
should be able to explain why they are there — the honest answer, that the
school has not yet confirmed its own status, is a better answer than a vague one.

The remaining verification questions (Punjab service rules, DPDP position,
retention periods) are **not** blockers for a pilot. They are blockers for using
the increment layer and for setting retention.

---

## Scope

**One school. One academic year. Two departments.**

Pick departments that differ — one large and one small, or one primary and one
senior — so the pilot surfaces problems that a single homogeneous group would
hide.

**Twelve to twenty teachers.** Enough for the analytics to say anything
meaningful; small enough that every participant can be talked to individually.

### In scope

Competency framework, self-assessment, observation, gaps, CPD recommendation,
Learning Map, CPD recording, evidence, impact verification, reassessment, KPIs,
the dashboard, the assistant.

### Out of scope for the pilot

- **Increment recommendations.** The employment gates are closed and should
  stay closed. Do not use this to inform a real pay decision.
- **Appraisal as the school's official appraisal.** Run it alongside the
  existing process, not instead of it. See week 9.
- **SQAAF submission.** Use it to see readiness, not to file anything.

---

## The twelve weeks

### Weeks 1–2 — Setup and framing

- Configure the framework, targets, KPIs and CPD catalogue.
- Create accounts. **Rotate every demo credential** and confirm no real data
  went into a demo environment.
- Brief the teachers. This is the most important two hours of the pilot.

**What the briefing must say, in this order:**

1. What the platform is for: identifying development needs and evidencing
   growth.
2. What it will not do: it will not decide anyone's appraisal outcome,
   progression or pay during the pilot.
3. Who can see what, concretely — including that a head of department cannot see
   pay information, and that teachers can see who opened their own record.
4. That completing a course does not raise a competency level, and why that is
   deliberate.
5. That the growth score is the school's own model, not a CBSE or Punjab
   formula, and can be argued with.
6. How to raise a problem, and that doing so is expected rather than tolerated.

**What the briefing must not do:** present it as a monitoring tool, or imply
that the numbers will feed into anything during the pilot. If they will, say so
plainly instead.

### Weeks 3–4 — Self-assessment and observation

Teachers self-assess. Managers observe and assess.

**Watch for:** self-assessments clustering at the top. That is the signal
teachers do not believe the pilot is safe, and it is a finding about trust, not
about the teachers. Address it directly rather than adjusting the data.

### Weeks 5–6 — Gaps and development plans

Gaps are calculated; teachers choose CPD from the recommendations; managers
approve.

**Watch for:** teachers who cannot explain why a gap was flagged. The explanation
is on the screen — if it is not landing, that is a design problem worth fixing
before wider rollout.

### Weeks 7–10 — Learning, application, evidence

The longest phase, and the one that matters. Teachers complete CPD, reflect,
apply it, and submit evidence. Managers verify impact.

**Watch for:**

- Evidence being verified without genuine scrutiny. "Looks good" verifications
  hollow out the whole model, and this is where it happens if it happens.
- Managers finding impact verification too slow. If it is genuinely too slow,
  that is a real finding — the honest response is to reduce the number of
  competencies in scope, not to weaken the verification step.

### Week 9 — Appraisal, run in parallel

Run the platform's appraisal **alongside** the school's existing process for the
same teachers.

Compare the two. Where they disagree, find out why. Some disagreements will
expose a badly weighted component; others will expose something the existing
process was missing. Both are worth knowing, and neither is discoverable any
other way.

**Do not substitute the platform's outcome for the school's this year.**

### Weeks 11–12 — Review and decision

- Analytics review: gap clusters, training needs, CPD impact.
- Structured feedback from every participant (below).
- Decision: extend, revise, or stop.

---

## Feedback

Ask everyone individually, not in a group, and not through the platform.

**Teachers:**

1. Did you understand why each gap was flagged?
2. Did the platform help you improve at anything specific?
3. Did it feel like development, or like assessment?
4. Was anything unfair, or wrong about you?
5. What would you remove?

Question 3 is the one that decides whether to proceed.

**Managers:**

1. How long did impact verification actually take?
2. Did the analytics tell you anything you did not already know?
3. Did you ever record a decision you disagreed with because the platform
   suggested it?

Question 3 is the one that matters most. If any manager answers yes, the
platform is doing the opposite of what it was built for and the design needs
changing before rollout.

---

## Success criteria

Deliberately not "the platform worked".

| Criterion                                                    | Threshold                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Teachers who can explain their own top gap without help      | 80%                                                                                   |
| Development items reaching verified impact                   | 60%                                                                                   |
| Managers reporting impact verification as sustainable        | All                                                                                   |
| Teachers describing it as development rather than assessment | 75%                                                                                   |
| Managers who recorded a decision they disagreed with         | **Zero**                                                                              |
| Data protection or access incidents                          | **Zero**                                                                              |
| Competency levels raised by course completion alone          | **Zero** — this is structurally impossible; the criterion confirms nobody found a way |

---

## Stop conditions

Stop the pilot if any of these occur:

- Teacher personal data is exposed to anyone who should not have it.
- The platform's output is used in a real pay or employment decision during the
  pilot.
- A manager reports being pushed toward a decision by the platform.
- Self-assessment participation collapses, indicating teachers do not consider
  it safe.

The first two are hard stops.

---

## After the pilot

If it proceeds:

1. Complete the remaining regulatory verifications — Punjab service rules, DPDP
   position, retention periods. These become blockers once the platform informs
   real decisions.
2. Work through the pre-production checklist in [`SECURITY.md`](SECURITY.md).
   MFA for privileged accounts is the first item.
3. Set retention periods with the data protection adviser.
4. Decide whether appraisal moves onto the platform, and announce that decision
   before the year in which it applies — not during it.
5. Extend to the remaining departments one at a time.

If it does not proceed: export what teachers contributed and give it to them.
Their reflections and evidence are their professional record, and it should not
disappear because a software pilot ended.
