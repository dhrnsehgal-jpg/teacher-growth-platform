# MVP Scope

**Product:** Teacher Professional Growth, Competency, KPI, CPD, Appraisal and Career Progression Platform
**First customer:** one CBSE-affiliated school in Punjab, India, covering Kindergarten/Balvatika to Class XII
**Document status:** Stage 1 — agreed scope, not yet built
**Last updated:** 2026-08-20

---

## 1. What this product is for

The platform supports one lifecycle, end to end:

```
Teacher Standards → Competencies → KPIs → Evidence → Assessment → Gap Identification
  → CPD Recommendation → Individual Professional Development Plan → CPD Completion
  → Application in Practice → Evidence of Impact → Reassessment → Professional Growth
  → Career Progression → Increment Readiness → Human Approval
```

It is **developmental, not punitive**. That is a design constraint with teeth, not a
slogan. Concretely it means:

- A gap is always paired with a route out of it. The product must never display a
  deficit without a corresponding development action.
- Assessment feeds development planning first and compensation second, and the two
  are separated by role, by permission and by approval step.
- Every judgement is traceable to evidence the teacher can see.
- No algorithm ends a career decision. **A human approves every consequential
  outcome**, and the system records who, when and on what basis.

## 2. The ten questions

The product is complete when a teacher can answer all ten from their own login.
Each maps to a stage:

| #   | Teacher's question                                    | Delivered in |
| --- | ----------------------------------------------------- | ------------ |
| 1   | What is expected of me?                               | Stage 2      |
| 2   | Where am I currently?                                 | Stage 3      |
| 3   | Where are my competency gaps?                         | Stage 3      |
| 4   | What evidence supports those conclusions?             | Stage 3      |
| 5   | What professional development should I undertake?     | Stage 4      |
| 6   | Why was that CPD recommended?                         | Stage 4      |
| 7   | Am I meeting applicable CBSE CPD requirements?        | Stage 4      |
| 8   | Have I improved after completing CPD?                 | Stage 4      |
| 9   | What do I need for my next professional/career stage? | Stage 5      |
| 10  | What is my progression/increment readiness?           | Stage 5      |

Question 6 — _why was that CPD recommended_ — is the hardest and the most important.
Any recommendation the system cannot explain in terms of a specific competency gap
and the evidence behind it is a recommendation the system should not make.

Question 7 carries a caveat that runs through the whole product: the platform can
only report against requirements it has **verified**. Until CBSE's own CPD guidelines
have been read by a person, the honest answer to question 7 is "the applicable
requirement has not yet been confirmed" — and that is what the product will say.

## 3. In scope for the MVP

### 3.1 Foundations (Stage 1 — this stage)

- Multi-tenant database with Row Level Security
- Nine roles with scoped authority
- School Regulatory Profile with per-fact verification
- Regulatory register with immutable requirement versioning
- Append-only audit trail
- Documentation set

### 3.2 Competency and expectations (Stage 2)

- School competency framework: domains, competencies, indicators, proficiency levels
- Mapping to NPST where NPST has been verified, and clearly labelled as a mapping
- Teacher-facing "what is expected of me" view, differentiated by stage and category

### 3.3 Evidence and assessment (Stage 3)

- Evidence submission and review
- Classroom observation capture
- Self-assessment and reviewer assessment
- Gap identification against target proficiency
- Moderation, with a recorded reason for any override

### 3.4 CPD (Stage 4)

- CPD catalogue, providers and competency mapping
- CPD hour ledger with a configurable accrual policy
- Compliance reporting against _verified_ CPD requirements only
- Individual Professional Development Plans
- Post-CPD reflection, application in practice, evidence of impact, reassessment

### 3.5 Growth, progression and increment (Stage 5)

- Growth score and trend
- Career progression readiness against the school's career ladder
- Increment readiness and recommendation
- Multi-step human approval with mandatory reasons

### 3.6 Compliance and quality (Stage 6)

- SQAAF self-assessment and evidence mapping
- Compliance dashboard
- Regulatory review scheduling
- Reporting and exports

## 4. Explicitly out of scope for the MVP

| Excluded                                | Why                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Payroll processing, salary disbursement | The platform recommends increments; it does not pay them.                                                                                  |
| Student assessment and results          | Different product. Student outcome data may later be an _input_ to a KPI, under strict privacy controls.                                   |
| Attendance and leave management         | Existing school systems handle this. Integration, not replacement.                                                                         |
| Recruitment and applicant tracking      | Separate lifecycle.                                                                                                                        |
| Disciplinary case management            | Deliberately excluded. Mixing developmental appraisal with disciplinary process is the fastest way to make teachers distrust the platform. |
| Automated decision-making on pay        | Prohibited by design. The system produces a recommendation and an explanation; a person decides.                                           |
| Parent or student access                | No external stakeholder sees a teacher's professional record.                                                                              |

## 5. Scope boundaries that protect the product

**The platform does not state a legal position.** It records what an authority
requires, cites the source, and records whether that source has been verified. Where
a requirement has not been verified, the product says so rather than guessing.

**The platform does not activate employment or pay compliance for a school whose
funding status is unconfirmed.** Until the school's aided/unaided status is
established from documents, those calculations stay off and the interface shows:

> School funding/service status requires verification before employment-related
> compliance calculations can be activated.

Professional growth — competencies, evidence, CPD, development planning — is **not**
gated by this. A teacher can use the entire developmental cycle while the school's
regulatory facts are still being confirmed. Only consequences that touch employment
or pay wait.

**The platform does not recalculate history.** A closed appraisal year stands as
decided, under the rules that were in force. Reopening one requires an explicit,
time-bounded, audited authorisation.

## 6. Success criteria for the MVP

1. A teacher logs in and sees their expectations, their current position, their
   gaps, the evidence behind each, and their development plan.
2. Every gap on that screen is accompanied by a development action.
3. Every expectation is traceable to a named source with a visible verification
   status and a correct attribution — school policy shown as school policy, CBSE
   requirements shown as CBSE requirements.
4. A Head of Department can see their department and demonstrably cannot reach any
   staff member outside it, including through the API.
5. No increment recommendation reaches an approver without a complete evidence
   trail, and no approval is recorded without an identified approver and a reason.
6. The Compliance Administrator can produce, for any requirement, its source,
   clause, version, effective date, verification status and last review date.
7. A closed academic year cannot be silently recalculated.

## 7. Assumptions carried into Stage 2

These are recorded as assumptions because they are **not yet verified**. Each is
tracked in [`REGULATORY_MATRIX.md`](REGULATORY_MATRIX.md).

- The school's aided/unaided status is unknown. All Punjab employment and pay logic
  is inactive until it is established.
- Whether CBSE mandates a specific annual CPD hour requirement for its affiliated
  private schools is unconfirmed. The 50-hour figure originates in NEP 2020 policy
  and NCERT's 2022 guidelines, which describe themselves as suggestive.
- NPST's status — guiding document versus binding standard — is unconfirmed.
- Whether SQAAF submission is an affiliation condition for this school is
  unconfirmed.

None of the above blocks Stage 2. The competency framework is the school's own, and
mappings to external frameworks are added — clearly labelled as mappings — once
those frameworks are verified.
