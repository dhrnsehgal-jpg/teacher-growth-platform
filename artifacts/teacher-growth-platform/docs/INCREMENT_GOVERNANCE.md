# Increment Governance

**Status:** Implemented — Stage 5. Final decisions disabled pending funding-status verification.
**Last updated:** 2026-08-21

---

## 1. Three concepts, never merged

The brief requires these be kept apart. They are three tables, and no query in
the platform joins them into a single answer:

|                                       | Table                | What it is                                                                            |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| **1. Pay framework**                  | `pay.framework`      | Which pay arrangement applies, on whose authority, to which school and employee types |
| **2. Statutory / policy entitlement** | `pay.entitlement`    | An increment arising under an applicable rule or an adopted employment policy         |
| **3. Growth recommendation**          | `pay.recommendation` | A performance and development based recommendation                                    |

The first is a question of law and applicability. The second is a question of
what someone is owed. The third is a question of judgement about performance.
Collapsing them is how a performance score comes to look like a reason not to
pay somebody.

## 2. Readiness, not a salary decision

The platform produces **Increment Readiness** and a **recommendation**. It
computes no salary and stores no salary figure anywhere.

```
Increment Readiness: 0%
Requirements complete: 0/5

Outstanding:
  Professional growth score      28.90% of 60 required   (mandatory)
  CPD requirement                76.00% of 100 required  (mandatory)
  Competency attainment          0.00% of 70 required
  Development applied in practice — not yet verified
  KPI achievement                50.00% of 60 required
```

Every outstanding item carries its current value, the threshold, whether it is
mandatory, a detail line and — from `threshold_note` — why that bar exists. A
threshold nobody can explain is not a bar anyone can fairly be held to, so the
note is required by check constraint.

`pay.compute_increment_readiness()` is deterministic, engine
`increment-readiness-v1`. Requirements needing a human judgement are reported
**outstanding** rather than assumed satisfied: the safer direction to be wrong in.

## 3. The human approval chain

```
system analysis → supervisor recommendation → principal review →
HR/management review → authorised approval → final decision
```

Configurable per school in `pay.approval_step`, because governance differs;
where another authority is required, a step is added rather than the code
changed. Each step names the permission a person must hold.

Two independence rules, enforced by trigger:

- **No teacher may decide anything about their own increment.**
- **No one person may complete two stages of the same recommendation.**
  Concentrating the chain in one pair of hands is the failure the chain exists
  to prevent.

`pay.approval` is append-only. An approval that can be edited is not an approval.

**No AI makes the final employment decision.** The system analysis stage produces
evidence; every stage after it is a named person recording a decision with a
note, and the final decision is gated (§5).

## 4. The protection that matters most

> The system must not automatically reduce, remove or block a legal or
> contractual entitlement because of a competency score unless the verified
> applicable rule expressly permits it.

This is enforced structurally, not by convention and not by hiding a button.

`pay.entitlement.withholding_permitted_by_rule` defaults to **false**. Setting it
true requires naming the rule and citing its source — a check constraint refuses
the flag without both.

A recommendation that proposes withholding must name the entitlement it affects,
and a trigger then checks that entitlement's flag. If no verified rule permits
withholding, the recommendation is **refused** with:

> _"This recommendation would withhold an entitlement, but no verified rule
> permits withholding it on performance grounds. A growth score is an input to a
> recommendation. It is not, by itself, a reason to withhold something a teacher
> is owed."_

Separately, an entitlement cannot be marked `withheld` at all unless the same
flag is true and a note of at least twenty characters explains it.

Three tests cover this: the refusal when no rule permits it, the success when a
verified rule does, and the refusal to mark an entitlement withheld regardless of
any recommendation.

## 5. Both gates, and what they stop

The school's funding status is `unverified`, so:

- **No entitlement can be recorded.** An entitlement asserts something is owed
  under a rule, and no rule has been verified as reaching this school.
- **No final decision can be taken.** A final decision asserts that a pay
  arrangement applies. The trigger on `pay.approval` refuses stage
  `final_decision` outright.
- **Readiness is still computed**, and the recommendation can still be prepared
  and moved through the earlier stages of the chain. Withholding the
  developmental half would stop the school doing useful work for a reason
  unrelated to development.

The increment page shows both gate messages, in the exact words held in the
database, and states the recorded funding status.

## 6. Privacy

| Actor                     | Sees                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Teacher                   | Their own entitlement, readiness and recommendation                                                   |
| Head of Department        | **Nothing.** HoDs hold no pay permission at all                                                       |
| Principal, HR, Management | Per permission — `increment.read`, `increment.recommend`, `increment.approve`, `pay_framework.manage` |

The pay policies key on `increment.read`, deliberately **not** on
`can_view_staff_record()`. A Head of Department supervising a teacher's
development is exactly not a reason to show them that teacher's pay. A test
asserts a Head of Department sees nothing in `pay.recommendation`.

`pay_framework.manage` is compensation-sensitive and held by HR only —
deliberately not by the Management Approver, who holds `increment.approve`.
Configuring the model and approving against it are the two halves that must stay
apart.

Every pay table is audited: `pay.framework`, `pay.entitlement`,
`pay.recommendation` and `pay.approval` all write to `audit.audit_log`.

## 7. Open items

1. **Funding status verification** — until then, no entitlement and no final
   decision. Everything else is built and tested against both states.
2. Whether any applicable rule expressly permits withholding on performance
   grounds. Until one is verified, the answer is no and the platform enforces it.
3. ~~Readiness thresholds are configurable in the database; no admin screen~~ —
   **built** at `/admin/growth`. Editing a threshold requires restating what it
   means: a bar nobody can explain is not a bar anyone can fairly be held to.
4. The approval chain is configurable but seeded with one shape; a school with
   different governance edits `pay.approval_step`.
