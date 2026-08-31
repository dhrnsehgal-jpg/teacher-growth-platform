# Privacy

**This document makes no compliance claim.** Technical controls existing is not
the same as an organisation meeting its obligations, and no test in this
repository asserts otherwise. What follows is what was built, and what a data
protection adviser still has to decide.

The Digital Personal Data Protection Act, 2023 is recorded in the regulatory
register as `requires_verification` — recorded, not read. The machinery its
obligations imply is built. Whether the school is a Data Fiduciary, in what
capacity, and what that requires of it, is a question for a lawyer.

---

## What data this holds

All of it is about employed adults, in a professional capacity. There is no
student personal data in the platform, and no biometric, health or financial
data.

| Class                  | Examples                                                                     | Sensitivity                                             |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| Identity               | Name, work email, employee code                                              | Ordinary                                                |
| Employment             | Post, department, career level, service record, designation history          | Ordinary                                                |
| Professional judgement | Competency ratings, observation narratives, appraisal outcomes, growth score | **Elevated** — these are opinions about a person's work |
| Development            | CPD records, learning plan, reflections, evidence                            | Ordinary                                                |
| Compensation position  | Increment readiness and recommendation                                       | **Elevated**                                            |

**The platform holds no salary figures.** It records which pay arrangement
applies and on whose authority, never an amount. A permission guarding a field
is only as good as the next feature that forgets it; a field that does not exist
cannot leak.

---

## Data minimisation and purpose limitation

Two things were deliberately not collected: date of birth and home address.
Neither is needed for professional development, and the fact that an HR system
would normally hold them is not a reason for this one to.

Purpose is recorded on access rather than assumed. `privacy.log_access` takes a
purpose argument, so an entry says _why_ a record was opened, not only that it
was.

---

## Access logging

Postgres has no `SELECT` trigger, and logging every row read would be enormous
and useless — the entries that matter would be buried in millions that do not.

What is practical, and what would actually matter in an investigation, is
recording when somebody opens **another person's** pay or appraisal record. That
is what the two surfaces log.

**Reading your own record is deliberately not logged.** It is not an access
worth investigating, and logging it would bury the ones that are.

**A teacher can see who opened their record**, on their own profile page. A log
kept for someone's benefit that they cannot read is a log kept for somebody
else.

The log is append-only: a trigger refuses updates and deletes.

### Known limitation

This covers two surfaces — increment recommendations and appraisals — not every
read of every table. A determined insider reading a competency rating through
PostgREST directly is subject to RLS but is not logged. Extending coverage means
choosing more surfaces deliberately, not switching on blanket logging.

---

## Retention

**Nothing deletes automatically. A test asserts that no function in the
`privacy` schema issues a DELETE.**

Eight record classes are defined. All eight are `requires_verification`, with
`retain_months` null and `disposal_action` set to `undecided`.

| Class                          | Why the period is not set                                                      |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Identity and employment record | Interacts with service-record obligations that are themselves unverified       |
| Competency assessments         | May be needed to justify a past appraisal                                      |
| Observation records            | Same                                                                           |
| Appraisal records              | Likely to have a statutory minimum; unknown until service rules are determined |
| CPD records                    | CBSE requires portal recording; local retention period unknown                 |
| Evidence files                 | Attached to appraisals and reassessments                                       |
| Increment recommendations      | Employment record                                                              |
| Audit and access logs          | Retention of a log is itself a policy question                                 |

**A default period would be a guess wearing a policy's clothes.** The platform
surfaces the classes so a person can set them, and refuses to invent one.

This is a deliberate trade. An appraisal erased on a schedule is evidence
destroyed, and a teacher may need it years later — to contest a decision, to
evidence experience to another employer, to answer a question about their own
past. Erasing early is the failure that cannot be undone.

---

## Subject requests

Four kinds: access, correction, erasure, objection.

- A person can raise a request only about themselves, and sees only their own.
- **Identity must be confirmed before anything is handed over.** Handing a
  teacher's file to whoever asked for it is the failure this guards against, and
  the constraint is in the database, not in a procedure.
- **A refusal must state its basis.** For erasure this will often be a service
  record the school is obliged to keep — which is a legitimate answer, and has
  to be given as one rather than by ignoring the request.

### Correction

Correction never overwrites. Assessments, appraisals and evidence decisions are
append-only by design: a correction supersedes, and the original stays on the
record with the correction linked to it. This is deliberate — the history of a
professional judgement is itself part of the professional record.

---

## Sensitive fields

Compensation information requires permissions separate from appraisal
permissions. A head of department who supervises a teacher's entire growth
lifecycle — approves their plan, verifies their impact — sees nothing of their
increment position. This is asserted in the acceptance suite.

---

## Export and subject access

A subject access request is fulfilled from the teacher's own profile view, which
already assembles their complete record: profile, targets, KPIs, assessments,
CPD, evidence, goals, service record, and who has opened their file.

**Not implemented:** a one-click machine-readable export. A request is currently
fulfilled by an administrator working from that view. For a school of this size
that is workable; it is recorded here as a gap rather than described as a
feature.

---

## Privacy notice

`core.app_user` carries `privacy_notice_version` and
`privacy_notice_accepted_at`, so acceptance is recorded per version and a new
version can be required.

**The notice text itself is not written.** It cannot be, without the school's
data protection position: who the Data Fiduciary is, the retention periods, the
grievance officer, and the lawful basis. Those are the six questions below.

---

## Breach response

If teacher personal data may have been exposed:

1. **Assume it from the moment of suspicion, not from confirmation.** The clock
   starts at suspicion.
2. Preserve `audit.audit_log` and `privacy.access_log`. Do not truncate or
   rotate them.
3. Establish scope from the access log: whose records, opened by whom, when.
4. Notify the school's data protection adviser and the school management.
5. DPDP 2023 imposes notification duties on a Data Fiduciary. **Whether the
   school is one, and what those duties are, must be established in advance** —
   a breach is the wrong time to find out.
6. Record the incident, the scope, the decisions taken and by whom.

Steps 1 to 4 and 6 are within the school's control today. Step 5 depends on
question 1 below.

---

## What a data protection adviser must decide

None of these can be answered by the software.

1. **Is the school a Data Fiduciary under DPDP 2023, and in what capacity?**
   Everything else follows from this.
2. **What is the lawful basis** for processing professional judgement data about
   employees — and does it differ for appraisal outcomes and increment
   recommendations?
3. **What retention period applies to each of the eight classes?** Note the
   interaction with service-record obligations, which are themselves unverified
   pending the Punjab applicability question.
4. **When is erasure legally available**, given that much of this is an
   employment record the school may be obliged to keep?
5. **Who is the grievance officer**, and what is the response time?
6. **What must the privacy notice say**, and in which languages? Teachers in a
   Punjab school may reasonably expect Punjabi and Hindi alongside English.

Until these are answered, the platform runs with retention undecided and nothing
deleting — which is the safe direction to be wrong in.

---

## What this platform does not claim

It does not claim DPDP compliance. It does not claim the school is compliant
with any data protection law. It claims that the controls described above exist
and are tested, and that the questions above remain open.
