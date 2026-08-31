# Punjab Compliance

**Status:** Stage 1 — all items unverified; employment calculations gated off
**Last updated:** 2026-08-20

---

## 1. The governing principle

> **Never assume a Punjab Government employment or pay rule applies to a private
> CBSE school without checking applicability.**

Punjab's education and service law does not reach every school in the state
uniformly. Whether a given rule binds this school turns on facts about the school —
above all whether it is **private aided**, **private unaided** or **government**.
Applying an aided-sector service framework to an unaided school would be a serious
error, and so would the reverse.

The platform therefore does not guess. It gates.

## 2. The funding-status gate

`core.school_regulatory_profile.funding_status` defaults to `unverified` and can
only leave that state together with a named verifier, a timestamp and a note
recording which document was seen.

While it is `unverified`:

- `core.employment_compliance_enabled(school_id)` returns `false`;
- `core.assert_employment_compliance_enabled()` raises rather than returning a value,
  so no calculation can quietly produce a number;
- the interface displays exactly:

> **School funding/service status requires verification before employment-related
> compliance calculations can be activated.**

That sentence is defined once in SQL (`core.employment_gate_message()`) and once in
TypeScript (`EMPLOYMENT_GATE_MESSAGE`), with a test asserting they are identical.

### What is gated

`increment_readiness`, `increment_recommendation`, `increment_approval`,
`pay_framework_calculation`, `service_rule_compliance`,
`statutory_employment_reporting`.

### What is _not_ gated

Competency frameworks, evidence, assessment, gap identification, CPD tracking,
development planning, growth scores. A teacher can use the entire developmental
cycle while the school's funding status is being confirmed. Gating the whole product
on a piece of missing paperwork would make it unusable for its actual purpose.

## 3. Facts that must be established

| Fact                                   | Field                                        | Current      | Why it matters                                                                            |
| -------------------------------------- | -------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| **Funding status**                     | `funding_status`                             | `unverified` | Determines whether Punjab aided-sector service and pay rules reach the school at all      |
| District                               | `district`                                   | Not recorded | Determines the local recognition authority                                                |
| State recognition number and authority | `state_recognition_*`                        | Not recorded | Recognition conditions may carry staffing obligations                                     |
| Ownership structure                    | `ownership_type`                             | `unverified` | Society / trust / Section 8 company affects which registration and governance rules apply |
| Managing body                          | `managing_body_name`, `_registration_number` | Not recorded | The employer of record                                                                    |
| Minority status                        | `minority_status`                            | `unverified` | Minority institutions have distinct constitutional protections in staffing matters        |
| Applicable service framework           | `applicable_service_framework`               | Not recorded | Free text: naming it is a legal determination                                             |
| Applicable pay framework               | `applicable_pay_framework`                   | Not recorded | Same                                                                                      |

## 4. Punjab instruments identified

### C1. Punjab Right of Children to Free and Compulsory Education Rules, 2011 (as amended)

**Status: `REQUIRES VERIFICATION`**

Made under §38 of the RTE Act, 2009. Rules relevant to this product concern the
requirement of teachers, minimum qualifications, salary, allowances and conditions of
service, and duties of teachers.

**No authoritative Government of Punjab URL was established during Stage 1.** Search
returned commercial legal-database reproductions, which are not acceptable sources
for a regulatory register. A person must obtain the Rules — and the amendments up to
2023 — from an official Punjab School Education Department or Punjab Government
gazette source.

Applicability to an unaided CBSE school, and to classes above the elementary stage,
must be established rather than assumed.

### C2. Punjab Privately Managed Recognised Schools Employees (Security of Service) Act, 1979

**Status: `REQUIRES VERIFICATION` / `POTENTIALLY APPLICABLE`**
**Reference:** Punjab Act No. 18 of 1979
**Source:** `https://www.indiacode.nic.in/bitstream/123456789/14731/1/punjab_act_18_of_1979_punjab_privately_managed_recognised_schools_employees_security_of_service_rules_1979_-converted.pdf` (HTTP 403 to automated retrieval)

The Act provides security of service to employees of privately managed **recognised**
schools in Punjab. A privately managed recognised school is one not run by the
Central Government, State Government or a local authority, and recognised by the
State Government.

**Secondary indications encountered during research suggest the associated Rules
attach to employees on aided posts.** That would make applicability turn directly on
the school's funding status — precisely the determination the gate protects. This
indication is **not verified** and is recorded only as the reason to check.

What must be established:

1. Does the Act extend to this school, given its recognition and funding status?
2. Do its Rules apply only to aided posts, or more broadly?
3. What obligations follow for termination, disciplinary process and service
   records — and do any of them constrain how appraisal outcomes may be used?

Question 3 matters for product design. If the Act imposes procedural requirements
before adverse service action, then any appraisal outcome capable of feeding such
action must carry a correspondingly rigorous evidence and approval trail.

### C3. Recognition requirements

**Status: `REQUIRES VERIFICATION`**

The recognition authority (`applicable_recognition_authority`), renewal conditions,
and any staffing, qualification or service conditions attached to recognition need
confirmation from official Punjab School Education Department sources.

### C4. Punjab Government pay and service rules

**Status: `REQUIRES VERIFICATION`** — presumptively `NOT APPLICABLE` to an unaided
private school, but the presumption has not been checked.

State pay commission scales and government servant conduct/service rules apply to
government employees. They must **not** be applied to a private school's staff
without establishing that they bind it — for example through an aided-post
condition or a recognition term.

This is recorded as unverified rather than not-applicable precisely because the
school's funding status is unknown. Recording it as "not applicable" would be an
assumption dressed as a determination.

### C5. Punjab Regulation of Fee of Unaided Educational Institutions Act, 2016

**Status: `REQUIRES VERIFICATION` — likely out of scope**

Concerns fee regulation rather than teacher professional development. Noted because
it is a marker of the unaided-institution regulatory regime in Punjab and may carry
incidental staff-related disclosure obligations. No requirement recorded.

## 5. How applicability is computed

`punjabEmploymentRuleApplicability()` in `src/lib/regulatory/employment-gate.ts`
returns, for a Punjab employment rule:

| School funding status | Rule's stated applicability  | Result                   |
| --------------------- | ---------------------------- | ------------------------ |
| `unverified`          | anything                     | `requires_verification`  |
| any                   | not yet established (`null`) | `potentially_applicable` |
| `private_unaided`     | aided posts only             | `not_applicable`         |
| `private_aided`       | aided posts only             | `verified`               |

The middle row is the important one: when a rule's own applicability has not been
read from its text, the honest answer is "potentially applicable", not a decision.

## 6. Verification worklist

| #   | Action                                                                                                 | Owner                      | Blocks                                            |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------- |
| 1   | Establish funding status from the recognition certificate, grant records and sanctioned-post documents | School management          | Everything in this layer                          |
| 2   | Record district, recognition number and recognition authority                                          | School office              | Recognition-linked requirements                   |
| 3   | Obtain Punjab RTE Rules 2011 (amended) from an official source                                         | Compliance Administrator   | C1                                                |
| 4   | Obtain Punjab Act 18 of 1979 and its Rules; take legal advice on applicability                         | Legal adviser              | C2, and any use of appraisal in service decisions |
| 5   | Confirm ownership structure and managing body registration                                             | School management          | Employer-of-record questions                      |
| 6   | Confirm minority status                                                                                | School management          | Staffing-autonomy questions                       |
| 7   | Name the applicable service and pay frameworks in writing                                              | Legal adviser + management | Increment module (Stage 5)                        |

Items 1 and 7 are the ones that gate Stage 5. They should be started now, not when
Stage 5 begins.

## 7. Standing rule for this layer

Any statement the platform makes about Punjab employment or pay must be traceable to
a verified source **and** to a verified determination that it applies to this
school's funding status. Absent either, the platform reports the gate message and
computes nothing.
