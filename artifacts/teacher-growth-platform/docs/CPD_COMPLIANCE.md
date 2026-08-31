# CPD Compliance

**Status:** Implemented — Stage 4
**Rule status:** `VERIFIED` requirement, `POTENTIALLY APPLICABLE` to this school
**Last updated:** 2026-08-21

---

## 1. The requirement

CBSE Notification No. TRG-02/2025, dated 01.04.2025 — the _Continuous
Professional Development (CPD) Guidelines 2025_ — was supplied by the school and
read in full. It is recorded in migration `0030`; see
[`CBSE_COMPLIANCE.md`](CBSE_COMPLIANCE.md) §4 for the verification record.

**50 hours per year**, split:

|                                     | CBSE / Govt Regional Training Institutes | School / School Complex | Total  |
| ----------------------------------- | ---------------------------------------- | ----------------------- | ------ |
| Core Values and Ethics              | 6                                        | 6                       | **12** |
| Knowledge and Practice              | 16                                       | 8                       | **24** |
| Professional Growth and Development | 3                                        | 11                      | **14** |
| **Total**                           | **25**                                   | **25**                  | **50** |

The three domains carry the NPST Standard names. That is CBSE's choice, not an
alignment this platform imposed — recorded as requirement
`cbse.cpd.npst_alignment`.

**None of these numbers appear in application code.** They are rows in
`compliance.cpd_requirement_allocation`, and a test fails the build if a figure
leaks into `src/`. See [`REGULATORY_VERSIONING.md`](REGULATORY_VERSIONING.md).

## 2. Why it is not enforced yet

Applicability is `potentially_applicable` with `is_enforced = false`. The
requirement is certain; whether it binds _this_ school depends on its CBSE
affiliation, which the School Regulatory Profile records as unverified.

The CPD page shows the requirement, the progress and the reason for the gate.
It does not assert compliance. Confirming the affiliation number and status is
the single outstanding step.

## 3. One record, one set of hours

The central rule — _do not count the same clock hours twice merely because one
programme satisfies multiple competencies_ — is enforced by the shape of the
schema rather than by arithmetic care.

```
compliance.cpd_record            the hours live here, once
      │
      ├── cpd_record_competency  many competencies, no hours
      └── sqaaf.evidence_map      many SQAAF standards, no hours
```

A five-hour workshop mapped to four competencies is five hours, because there is
nowhere for the extra fifteen to come from. The ledger function
`compliance.credited_hours()` deliberately contains no join to the mapping
tables; that join is exactly what would inflate it.

The demo data proves it: Neha's CBSE assessment programme is 12 hours linked to
four competencies. A naive `sum` over the join gives **74 hours** for her year.
The ledger gives **38**. Both numbers are asserted in `tests/db/stage4.test.ts`,
so the test would fail if the join were ever reintroduced.

### Two further defences

| Defence                                                                      | Catches                                                                                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unique index on (teacher, year, catalogue activity, start date)              | The same course claimed twice — an honest double entry                                                                                                 |
| Overlap trigger: at most 8 credited hours per day across overlapping records | A claim that cannot physically have happened. It **refuses** rather than flags: a ledger that accepts impossible attendance is not a compliance record |

The overlap ceiling is per day, not per record, so a half-day course and an
evening webinar on one date are both fine.

## 4. Hours are a claim until someone verifies them

```
draft ──► submitted ──► verified          (terminal — credit is now counted)
             │  ├────► returned_for_clarification ──► submitted
             │  └────► rejected           (terminal)
             └────► draft                 (teacher withdraws)
```

Only `credited_hours` on a `verified` record reaches the ledger. `claimed_hours`
never does. Losing verification loses the credit — the transition trigger nulls
it, and `verified` is terminal so it cannot be quietly downgraded.

Rules the database enforces, not the interface:

- A reviewer decision must name **who, when, and how many hours**.
- Credited hours may be **reduced** below the claim but never inflated above it.
- Returning or rejecting needs a **written reason of at least 10 characters**. A
  developmental platform never hands back a bare refusal.
- A record cannot be **created** already verified. Even the seed submits first,
  then verifies, because that is the path a real reviewer takes.

Every transition is written to `compliance.cpd_record_status_history`, which is
append-only: `INSERT` is revoked from clients and the trigger that writes it is
`SECURITY DEFINER`. That combination is deliberate — Stage 3 shipped this class
of trigger _without_ `SECURITY DEFINER` and every transition failed for real
users while passing every test that ran as superuser.

## 5. Source types and who decides what counts

Nine are seeded, each mapped to one side of the 25 + 25 split:

| Counts toward the requirement                                                               | Does not, pending classification                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| CBSE · CBSE Centre of Excellence · Government training · School / in-house · School Complex | DIKSHA · SWAYAM · Recognised institution · Other approved provider |

The right-hand column is not an oversight. The notification names the
left-hand sources and says nothing about the others. Deciding that a DIKSHA
course counts toward a CBSE requirement is a compliance judgement, and the
schema will not accept it as a default:

```sql
constraint cpd_source_type_counting_needs_classification
  check (not counts_toward_requirement
         or (classified_by is not null and classified_at is not null
             and length(btrim(coalesce(classification_note, ''))) >= 10))
```

An attempt to flip the flag without recording who decided and why is rejected.
Hours from an unclassified source are still **recorded** — the teacher's
professional record is complete — they are simply not counted, and the interface
says so on the record.

## 6. Activity rules: credit for work that is not a course

CBSE allows named academic and developmental tasks to count, within the 11
school-delivered hours of Professional Growth and Development:

| Activity                                                                                 | Credit |
| ---------------------------------------------------------------------------------------- | ------ |
| Board examination evaluation duty (Examiner / AHE / HE), full duty                       | 6 h    |
| SQP, marking scheme, item development, question bank, e-content, practical examiner work | 3 h    |
| Resource Person conducting CBSE Capacity Building Programmes                             | 3 h    |
| DD PM e-Vidya CBSE 15, or sessions such as Eklavya 3030 STEM                             | 3 h    |
| CBSE National Conferences — presentation or participation                                | 3 h    |
| Classroom research, mentoring, reflective journals, blogs, paper publication             | 2 h    |
| Integrating technology into teaching                                                     | 2 h    |

> **"Only 11 hours will be considered. Schools will keep records for
> verification."**

That ceiling is **shared across all seven rules**, not applied to each — which is
why `compliance.cpd_rule_cap_group` exists as a separate table. The ledger
applies the per-rule annual cap first, then the group cap, using window functions
ordered by date then id so the outcome is deterministic.

Tested: four rule-based claims totalling 20 hours are credited as **11**.

Every rule's hour credit cites its clause. The schema refuses `verified` without
one, so an invented credit cannot be recorded as authoritative:

```sql
constraint cpd_activity_rule_verified_needs_source
  check (verification_status <> 'verified'
         or (regulatory_source_id is not null and clause_reference is not null))
```

The teacher-facing form reinforces it: choosing an activity rule takes the hours
**from the rule**, ignoring anything typed in the hours field.

## 7. What the teacher sees

`/cpd` shows the headline, both splits, the full domain × source matrix, and
every record with its status.

```
Annual CPD                        38 / 50 hours      On track

CBSE / Government                 18 / 25
In-house / School Complex         20 / 25

Core Values and Ethics            10 / 12
Knowledge and Practice            18 / 24
Professional Growth               10 / 14
```

Four states, computed by `compliance.cpd_progress()`:

| State         | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| **Compliant** | Completed hours meet or exceed the requirement                      |
| **On track**  | Behind, but at or above the pace expected by this point in the year |
| **At risk**   | Behind that pace                                                    |
| **Not met**   | The year has ended short                                            |

### The pacing threshold is school policy, and says so

CBSE states an annual total. It does not say when during the year a teacher
should be called "at risk". That judgement lives in `compliance.risk_policy`,
classified `school_policy`, defaulting to 75% of the pro-rata expectation, with
its rationale stored alongside it. Presenting it as a CBSE rule would be exactly
the thing this project forbids.

The domain × source matrix matters more than it looks: **a teacher can reach 50
hours and still be non-compliant**, if they are short on a domain or on the Board
side of the split. The table shows where the shortfall actually sits.

## 8. What management sees

`/compliance` shows teachers meeting the requirement, teachers at risk, records
awaiting verification, missing domains and missing source-type hours across the
school, departmental and staff-category roll-ups, the highest competency gaps,
the most recommended courses, and SQAAF evidence readiness.

The per-teacher rows run the **same engine** as the teacher's own page, once per
teacher, rather than a separate aggregate query. The management dashboard and
the teacher's page therefore cannot show different numbers for the same person.

### CPD impact is answered elsewhere, on purpose

The dashboard counts hours. Whether CPD changed practice is a different question,
and the platform answers it through the Stage 3 machinery: a competency is
reassessed only after application in practice has been evidenced and verified by
a reviewer. Hours are an input; the reassessment is the outcome. Conflating them
would reintroduce exactly the "course completion improves competency" fallacy
Stage 3 was built to prevent.

## 9. Who may do what

| Act                                        | Permission          | Held by                                               |
| ------------------------------------------ | ------------------- | ----------------------------------------------------- |
| Log own CPD                                | `cpd_record.submit` | Everyone, including teachers                          |
| Verify and credit hours                    | `cpd.approve`       | HoD, Academic Coordinator, VP, Principal, HR/PD Admin |
| Configure categories, sources, risk policy | `compliance.manage` | Compliance Administrator                              |
| Create or supersede a requirement version  | `regulatory.manage` | Compliance Administrator                              |

Reading a CPD record follows `core.can_view_staff_record()` — the same single
definition of scope used everywhere else, so CPD visibility cannot drift from
evidence or assessment visibility.

> **Policy change, migration `0038`.** Stage 2 gave `cpd.approve` to the Vice
> Principal, Principal and HR/PD Administrator only. Verifying a completed CPD
> record is a new act that permission now governs, and leaving it there made
> routine verification a whole-school bottleneck. The Head of Department who
> assesses, observes and approves a teacher's development plan is the person who
> knows whether they attended. Recorded as its own migration so the earlier
> position stays on the record — the same treatment migration `0026` gave the
> identical problem for plan approval.

## 10. Audit trail

Every decision-bearing CPD and SQAAF table carries the same
`audit.record_row_change` trigger the regulatory profile and role assignments
have used since Stage 1, so the Compliance Administrator's audit view
(`audit.read`) sees them alongside everything else:

`cpd_record` · `cpd_requirement_version` · `cpd_requirement_allocation` ·
`cpd_year_requirement` · `cpd_activity_rule` · `cpd_source_type` ·
`sqaaf.self_assessment` · `sqaaf.standard_rating` · `sqaaf.evidence_gap` ·
`sqaaf.improvement_action`

Verifying CPD hours records the previous and new row in full, so the trail shows
`submitted → verified` with the hours credited and who credited them.

`sqaaf.evidence_map` is deliberately **not** audited: mapping is a clerical act
with no judgement in it, it happens in bulk, and the mapped record carries its
own history. Auditing it would bury the decisions above in noise.

> Added in migration `0039`. Stage 4 originally shipped with dedicated
> append-only trails — `cpd_record_status_history` — but nothing in the central
> audit log, so CPD verification and SQAAF ratings were invisible to the person
> whose job is to review them.

## 11. Recording and portals

CBSE requires registration on the **CBSE Training Portal** and school training
records on **OASIS** (requirement `cbse.cpd.recording_and_portals`). This
resolved a Stage 1 open question: the NCERT mechanism runs through BRC/BEO/DEO
and UDISE+, which a private CBSE school does not sit inside.

`compliance.cpd_record.external_reference` holds the portal record id. The
platform does **not** write to either portal. Nothing here submits anything to
CBSE.

## 12. Open items

1. **Affiliation verification** — the only thing between the verified
   requirement and enforced compliance reporting.
2. **Classify DIKSHA, SWAYAM and recognised institutions**, or confirm with CBSE
   that they do not count.
3. **Bulk CPD entry** for a whole-school training day; currently one record at a
   time.
4. **Notification of at-risk teachers.** The state is computed but nothing
   chases it.
5. **Certificate upload** reuses the evidence bucket, so it inherits the
   outstanding malware-scanning gap recorded in
   [`EVIDENCE_FRAMEWORK.md`](EVIDENCE_FRAMEWORK.md) §9.
6. **Principals and Heads of School** have the same 50-hour requirement under the
   notification; whether the school wants a different internal expectation for
   them is a school policy question, not a CBSE one.
