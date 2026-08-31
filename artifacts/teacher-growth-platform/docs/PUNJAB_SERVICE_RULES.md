# Punjab Service Rules

**Status:** Every Punjab instrument `REQUIRES VERIFICATION`. Applicability
undetermined. Employment and pay calculations disabled.
**Last updated:** 2026-08-21

---

## 1. The position, stated plainly

**No Punjab service or pay rule has been read, and none is treated as applying
to this school.**

That is not an oversight. It is the correct outcome of the rule the brief sets:
_never infer applicability solely from the title of a statute_. Two facts hold
the position:

1. **The sources could not be retrieved.** `indiacode.nic.in` returns HTTP 403 to
   automated requests — attempted in Stage 1 and again in Stage 5 — and
   `pbhe.punjab.gov.in` refuses the connection outright. Nothing about the
   content, scope or amendment status of any Punjab instrument is known.
2. **The school's funding status is unverified.** Whether a rule reaches this
   school depends on whether it is private aided, private unaided, government or
   other. Until someone confirms that, applicability cannot be determined even
   for a rule whose text we did have.

So the platform records the questions and refuses to answer them.

## 2. What the platform does about it

Two gates, with two different messages, because they answer two different
questions.

| Gate                                 | Question                          | Message                                                                                                                   |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Funding status (Stage 1)             | May we calculate at all?          | _School funding/service status requires verification before employment-related compliance calculations can be activated._ |
| Service-rule applicability (Stage 5) | Does this rule reach this school? | _Employment/service-rule applicability requires authorised verification._                                                 |

Both live in the database — `core.employment_gate_message()` and
`core.service_rule_gate_message()` — so every screen, report and API response
quotes the same words.

### What the gate actually stops

| Action                             | While the gate is closed                                                  |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Record a pay entitlement           | **Refused** — an entitlement asserts something is owed under a rule       |
| Take a final increment decision    | **Refused** — a final decision asserts a pay arrangement applies          |
| Mark a service rule as applicable  | **Refused** — the applicability trigger checks funding status first       |
| Mark a pay framework as applicable | **Refused**                                                               |
| Compute increment readiness        | **Allowed** — readiness is a development indicator, not a pay decision    |
| Run an appraisal                   | **Allowed** — appraisal is developmental and does not depend on pay rules |

Withholding the developmental half would stop the school doing useful work for a
reason that has nothing to do with development. Withholding the pay half is the
whole point.

## 3. The instruments on record

All four are in `service.policy`, versioned, with applicability undetermined.

| Key                                       | Instrument                                                                                                    | Status                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `punjab.security_of_service_1979`         | Punjab Privately Managed Recognised Schools Employees (Security of Service) Act, 1979 — Punjab Act 18 of 1979 | Named, **not read**. Whether it reaches a privately managed CBSE school, and whether it distinguishes aided from unaided, cannot be stated without the extent and application sections |
| `punjab.rte_rules_2011`                   | Punjab RTE Rules, 2011 (as amended)                                                                           | Named, **not read**. May carry qualification, salary and service-condition provisions. The "as amended" position is unknown                                                            |
| `punjab.service_conditions_notifications` | Punjab School Education Department notifications on teacher service conditions                                | A **category**, not an instrument. No specific notification has been identified                                                                                                        |
| `school.employment_policy`                | The school's own employment policy                                                                            | The only instrument treated as governing anything — and it is school policy, not a Punjab or CBSE rule. `potentially_applicable`, because the document itself has not been supplied    |

### Applicability is a determination, not a default

`service.policy` carries `applies_to_funding_status`, `applies_to_employee_categories`,
`applicability`, and — required by check constraint before applicability may be
settled either way — `applicability_determined_by`, `applicability_determined_at`
and a note of at least twenty characters.

Two triggers enforce what the brief demands:

- Applicability cannot be set to `verified` or `not_applicable` while the
  school's funding status is `unverified`.
- A rule declared to apply to `private_aided` schools **cannot** be marked
  verified against a school recorded as `private_unaided`. The database raises
  rather than accepting it. A test confirms the school-as-unaided case
  explicitly.

## 4. Pay frameworks: recorded, not imported

`pay.framework` holds two rows, and neither applies.

**`punjab.government_pay_scales`** exists so the question is visible, not because
it is answered. Its `base_structure` reads _"Not recorded — no structure has been
verified"_ and its `increment_rule` the same. Being located in Punjab does not
import Punjab Government pay scales into a privately managed school, and the
platform will not pretend otherwise.

**`school.pay_arrangement`** is the school's own. Undetermined here only because
the document has not been supplied.

**This platform holds no salary figures at all.** It records which arrangement
applies and on whose authority. What anyone is paid is not its business, which
also means a breach of it cannot disclose anyone's pay.

## 5. The two ladders, kept apart

The brief requires professional capability progression to be separate from
employment progression. They are two tables with no mapping between them:

|                       |                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `core.career_level`   | Entrant → Developing → Proficient → Expert → Lead Practitioner                                   |
| `service.designation` | Teacher → Senior Teacher → Coordinator → HOD → Academic Coordinator → Vice Principal → Principal |

A teacher assessed as a Lead Practitioner is not thereby a Vice Principal, and a
Vice Principal is not thereby an expert teacher. The platform provides no
automatic conversion, and NPST levels — recorded in the competency framework as
reference — are equated with neither.

## 6. The service record

`service.service_record`, one per teacher, holding what the brief lists:
employee id, appointment date and letter reference, designation, employment
category, probation and confirmation, qualifications, experience, career
changes, and the governing service policy with its version.

Two properties worth stating:

- **`service.career_event` is append-only.** A correction is a new event. A
  service record whose past can be edited cannot evidence anything, which is the
  only reason to keep one.
- **It holds no salary, no bank details, and no personal identifiers beyond the
  employee id.** Only what the school needs for the authorised purpose.

Qualifications carry their own verification status, separate from the claim.
NCTE qualification regulations remain unverified, so nothing asserts eligibility
against them.

## 7. Every Punjab item still requiring legal or HR verification

| #   | Question                                                                                                                                                    | Who                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | **The school's funding status** — private aided, private unaided, government or other, with documentary evidence                                            | School management  |
| 2   | Punjab Act 18 of 1979: full text, extent and application; whether it reaches privately managed CBSE schools; whether it distinguishes aided from unaided    | Legal adviser      |
| 3   | Punjab RTE Rules 2011 as currently amended: qualification, salary and service-condition provisions, and which reach an unaided school                       | Legal adviser      |
| 4   | Which Punjab School Education Department notifications exist on teacher service conditions, and which apply                                                 | Legal adviser / HR |
| 5   | Whether any Punjab Government pay scale applies to this school in any respect                                                                               | Legal adviser      |
| 6   | The school's own employment policy document, and its current version                                                                                        | HR                 |
| 7   | Whether any applicable rule expressly permits withholding an increment on performance grounds — see [`INCREMENT_GOVERNANCE.md`](INCREMENT_GOVERNANCE.md) §4 | Legal adviser      |
| 8   | Probation and confirmation periods actually applicable, as against those recorded from practice                                                             | HR                 |
| 9   | NCTE qualification regulations, and whether staff qualifications satisfy them                                                                               | HR                 |
| 10  | Whether Punjab Act 18 of 1979 (if applicable) prescribes a grievance procedure the platform's representation flow must match                                | Legal adviser      |

Item 1 unlocks the most: it is the single fact standing between a built system
and an operating one.

## 8. What would change on verification

Nothing in the schema. The gate opens, applicability determinations become
recordable, entitlements can be created, and a final increment decision becomes
possible. Every table and constraint already exists and is tested against both
the closed and the open state — the aided/unaided refusal test opens the gate
inside a transaction precisely to prove the rule bites when it is open.
