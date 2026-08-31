# Evidence Framework

**Status:** Stage 2 — schema, types and linking implemented
**Last updated:** 2026-08-20

---

## 1. One artefact, many meanings

A single classroom observation can speak to assessment practice, inclusion and
questioning technique at once. The artefact is stored **once** in
`evidence.evidence` and linked as many times as it is relevant through
`evidence.evidence_link`.

```
evidence.evidence            the artefact — stored once
      │
      └── evidence.evidence_link   (exactly one target per link)
              ├── competency
              ├── indicator
              └── teacher_kpi
```

Duplicating the file per competency would multiply storage, multiply the privacy
surface, and — worst — let two copies of the same artefact drift into different
review outcomes.

A constraint enforces exactly one target per link, and partial unique indexes
prevent linking the same artefact to the same target twice. The seed demonstrates
the pattern: one Physics assessment cycle linked to three competencies and one
KPI. A test asserts the file count stays at one however many links exist.

## 2. Evidence types

Eighteen are seeded, as rows rather than an enum so the school can extend the
list without a migration:

Teacher Diary · Lesson Plan · Classroom Observation · Student Work Sample ·
Assessment Design · Rubric · Project · Portfolio · Experiential Learning
Evidence · Inclusive Practice Evidence · CPD Certificate · Professional
Reflection · Action Research · E-Content · Mentoring Record · Professional
Presentation · School Improvement Project · Supervisor Feedback

Each carries submission guidance and a `contains_student_data` flag. Six types
are flagged — student work, assessment designs, projects, portfolios,
experiential and inclusive-practice evidence — so submission can prompt for
anonymisation. Inclusive-practice evidence carries an explicit warning, since it
often concerns identified students.

## 3. Status lifecycle

```
draft ──► submitted ──► under_review ──► verified
   ▲          │  │            │
   │          │  └────────────┼──► returned_for_clarification ──► submitted
   │          │               └──► rejected
   └──────────┴── (teacher withdraws to draft)
```

Transitions are enforced by trigger, not trusted. `verified` and `rejected` are
terminal in Stage 2; reopening belongs with Stage 3 moderation.

Two constraints matter:

- **A reviewer decision must name who and when.**
- **Returning or rejecting requires a written reason of at least 10 characters.**
  A developmental platform must never hand back a bare refusal.

Every change writes to `evidence.status_history`, which is append-only —
`UPDATE` and `DELETE` are blocked by trigger and privilege.

> **Defect found and fixed here.** The status-history write was originally in the
> same `BEFORE INSERT` trigger as the validation, which violated the history
> table's foreign key: on insert the evidence row does not exist yet. Validation
> now runs `BEFORE`, history `AFTER`. Only applying the migration to a real
> database surfaced this.

## 4. Who can see and do what

| Actor                 | Read                                 | Write                                                      |
| --------------------- | ------------------------------------ | ---------------------------------------------------------- |
| The teacher           | Their own evidence                   | Create; edit while `draft` or `returned_for_clarification` |
| Reviewer in scope     | Evidence of staff within their scope | Review transitions, with `evidence.review`                 |
| Teacher outside scope | Nothing                              | Nothing                                                    |

Once submitted, the teacher can no longer edit — changes belong to the review
process. Enforced by the RLS `USING` clause, not by hiding a button.

Tests confirm: a teacher sees only their own evidence; the Science HOD sees the
Science teacher's evidence; a Languages PRT sees none of it.

## 5. Evidence requirements

`evidence.requirement` configures how much evidence of each type is expected,
from whom, in a given year — scoped by teacher category, stage or role. Classified
`school` / `school_defined` by default and labelled as school policy wherever
shown.

No requirements are seeded. The school should set these deliberately rather than
inherit a guess, and an unmet requirement nobody agreed to would be worse than
none. The teacher profile renders the empty state honestly: _"No evidence
requirements configured for this year. Evidence may still be submitted
voluntarily."_

## 6. Suggested evidence per competency

`competency.evidence_descriptor` maps competencies to the evidence types that
would demonstrate them — 43 mappings seeded. These are **suggestions**:
`is_required` is false throughout until the school decides otherwise. Guidance is
attached where the mapping needs qualifying, for example _"Work showing feedback
acted upon"_ rather than simply "student work".

## 7. Privacy

Evidence is the highest-risk data in the platform: it can contain identifiable
student work alongside judgements about a named teacher.

Position taken in Stage 2:

- `contains_student_data` flags the types that carry the risk.
- Submission guidance tells teachers to redact before uploading.
- Files live in Supabase Storage; only the path is in the database.
- **Storage bucket policies are implemented** (migration `0029`). The `evidence`
  bucket is private, and its policies route through the same
  `core.can_view_staff_record()` the evidence table's own RLS uses — so a file
  can never be reachable by someone who cannot read the row it belongs to.

### Path convention is part of the security model

```
<teacher_profile_id>/<evidence_id>/<filename>
```

Every policy reads the first segment to decide ownership, so the application
must never write outside it.

| Operation       | Rule                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Upload          | Only into your own folder. A reviewer cannot upload on a teacher's behalf — evidence is the teacher's claim to make |
| Read            | Anyone who can read the teacher's record                                                                            |
| Update / delete | The owning teacher, and only while the evidence is `draft` or `returned_for_clarification`                          |
| `anon`          | Nothing. The bucket is not public                                                                                   |

Deletion closes once evidence is submitted: removing a file behind verified
evidence would leave a review decision pointing at nothing.

Files are served only through **short-lived signed URLs** (5 minutes), created
server-side with the caller's session — so the policies have already decided
whether they may see it before a URL exists.

## 8. Deliberately not built in Stage 2

- ~~File upload UI and storage bucket policies~~ — **delivered in Stage 3**
- Review queue and reviewer workflow (Stage 3)
- Evidence-to-assessment linkage — evidence supports assessment, and assessment
  itself is Stage 3

## 9. Open items

1. ~~Storage bucket policies~~ — **done** (migration `0029`).
2. ~~Malware scanning before an uploaded file is served back~~ — **done**
   (migration `0048`). See §10.
3. A retention position for evidence containing student data, which interacts
   with the retention schedule still outstanding from Stage 1.
4. Bulk evidence submission for a cohort (for example a whole-department CPD day).

---

## 10. Malware scanning

Open since Stage 2 and named in every completion report since as the main reason
to be careful about enabling upload. Closed in migration `0048`.

The platform does not scan files itself — that is a deployment concern, and
which engine a school runs is their choice. What it does is **refuse to hand
anyone a file that has not been scanned clean**.

### How it works

`evidence.evidence.scan_status` defaults to **`pending`**, never `clean`. A file
whose scan never runs stays unservable, because the failure mode of the opposite
default is serving malware to a colleague.

| Status                | Servable                                                       |
| --------------------- | -------------------------------------------------------------- |
| `pending`, `scanning` | No — _"awaiting a virus scan and cannot be opened yet"_        |
| `clean`               | **Yes** — the only state in which a file is served             |
| `infected`            | No — _"found to be unsafe and will not be served"_             |
| `failed`              | No — a scan that did not complete is not a clean scan          |
| `skipped`             | No — and skipping requires a named person and a written reason |

Two independent doors, both closed:

1. **`evidence.file_servable()`** is the only sanctioned route to a download. It
   returns the storage path **only** when the scan is clean, so a caller that
   ignores the flag still cannot mint a signed URL.
2. **The storage policy** requires `evidence.object_is_clean(name)` as well as
   scope. Reading the object directly is refused too.

> **A mistake worth recording.** The first version added a _new_ storage policy
> beside the Stage 3 one. Permissive policies OR together, so the original's
> permission survived — the gate looked closed and was open. The Stage 3 policy
> is now dropped and recreated with the scan condition inside it, and a test
> asserts there is exactly **one** SELECT policy on the bucket.

Recording a result is service-role only: `evidence.record_scan_result()` is
revoked from everyone else, because a teacher marking their own upload clean
would defeat the gate entirely. A test confirms an ordinary user is refused.

### The operational consequence, stated plainly

**Until a scanner is wired up, no uploaded evidence file can be opened — by its
owner or by a reviewer.** Evidence review that depends on opening an attachment
is blocked until the school runs a scanner and calls `record_scan_result()`.

That is the intended trade and the school should make it knowingly. The
alternatives are worse: serving unscanned files, or defaulting them to clean and
calling the gate done. If a school wants to accept the risk for a particular
file, `skipped` exists — and demands a named person and a written reason.

### What a deployment needs to add

A worker that watches for `scan_status = 'pending'`, scans the object, and calls:

```sql
select evidence.record_scan_result(
  '<evidence-id>', 'clean', 'clamav', '1.3.1', 'No signatures matched.'
);
```

Anything that can hold a service-role key will do. The platform provides the
gate and the record; the engine is the school's choice.
