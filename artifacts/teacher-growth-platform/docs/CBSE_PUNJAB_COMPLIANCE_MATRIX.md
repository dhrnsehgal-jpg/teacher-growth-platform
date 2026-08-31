# CBSE and Punjab Compliance Matrix

**What is implemented, against what source, and what still needs school or legal
validation.**

This is a statement of position, not a compliance certificate. Read
[`REGULATORY_LIMITATIONS.md`](REGULATORY_LIMITATIONS.md) first — it defines the
five classifications used throughout, and explains why a verified requirement
can still be unenforced.

Status key:

| Symbol | Meaning                                                                  |
| ------ | ------------------------------------------------------------------------ |
| ✅     | Implemented and active                                                   |
| ⏸      | Implemented but **gated** — inert until a person records a determination |
| ○      | Not implemented; out of MVP scope                                        |
| ⚠      | Requires legal or HR verification before use                             |

---

## Part 1 — CBSE

### 1.1 CPD Guidelines 2025 (Notification TRG-02/2025)

**Source status: VERIFIED.** The PDF was supplied by the school and read
visually page by page — it is a scanned document from which text extraction
returns nothing.

| Requirement                          | What CBSE says                                                                                     | Implemented                                                                                            | Status |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| `cbse.cpd.annual_hours`              | 25 hours via CBSE/Government Regional Training Institutes + 25 hours school-organised              | Ledger tracks both source classes separately; a shortfall in one is not offset by surplus in the other | ⏸      |
| `cbse.cpd.domain_allocation`         | Core Values and Ethics 12 h, Knowledge and Practice 24 h, Professional Growth and Development 14 h | Per-domain requirement and per-domain progress; domain names match NPST Standards exactly              | ⏸      |
| `cbse.cpd.academic_task_equivalence` | Academic tasks count toward CPD, capped at 11 hours                                                | Cap enforced by a deferred constraint; hours above it do not credit                                    | ⏸      |
| `cbse.cpd.recording_and_portals`     | Recorded on the CBSE Training Portal and **OASIS**                                                 | Portal fields on every CPD record; export prepared for both                                            | ⏸      |
| `cbse.cpd.enforcement`               | Penalties under Affiliation Bye-Laws 12.2.9                                                        | Recorded as the consequence; the platform does not apply penalties                                     | ⏸      |
| `cbse.cpd.official_duty_protection`  | Teachers on CPD are on official duty; no salary or leave deduction                                 | Recorded; the platform holds no salary or leave data to deduct from                                    | ⏸      |
| `cbse.cpd.npst_alignment`            | CPD domains align to NPST Standards                                                                | Domain keys map to NPST standards with clause citations                                                | ⏸      |

**Why all seven are gated:** the school's CBSE affiliation status is
`unverified`. A verified requirement is not the same as a requirement that binds
_this_ school.

**Note on the 25 + 25 split.** The requirement text quotes CBSE's own sentence,
which specifies 25 and 25 and never writes "50" — that figure is the sum, and it
lives in the title, which is ours to write. Editing CBSE's words to insert a
total we computed would be a small dishonesty that gets copied forward.

**Notification 16/2021**, where the split originates, is recorded separately as
`requires_verification`. It is known only through CBSE's citation of it.

### 1.2 SQAA Framework (April 2023)

**Source status: VERIFIED.** Retrieved in full from
`cbseacademic.nic.in/sqaa/doc/handbook.pdf` — that host, unlike `cbse.gov.in`,
does not block automated requests.

| Requirement                         | What CBSE says                                                                     | Implemented                                                            | Status |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| `cbse.sqaaf.domains`                | 7 domains, 48 sub-domains, 84 standards                                            | All loaded with their text; integrity assertions confirm the counts    | ⏸      |
| `cbse.sqaaf.scoring_scheme`         | 336 marks, 4-point scale (I Inceptive → IV Dynamic Evolving), 40% / 10% weightings | Scoring implemented deterministically with the framework's own weights | ⏸      |
| `cbse.sqaaf.annual_self_assessment` | Annual self-assessment **mandatory** for affiliated schools (eligibility clause)   | Self-assessment by year, with Annexure F improvement-plan template     | ⏸      |

**Not implemented:** maturity-level bands (§1.11.2). That section is an image in
the handbook and could not be read. It is recorded as missing rather than
inferred from the surrounding text. ○

**Evidence mapping** links each standard to platform records that could evidence
it, and the readiness view states plainly which standards the platform **cannot**
evidence — a readiness pack that claims completeness it does not have is worse
than none.

### 1.3 Affiliation Bye-Laws, 2018

**Source status: REQUIRES VERIFICATION.** Not retrieved. Referenced only where
the 2025 CPD notification cites clause 12.2.9. No requirement is derived from
the Bye-Laws directly. ⚠

---

## Part 2 — National frameworks

### 2.1 NPST (Guiding Document 2023)

**Source status: VERIFIED**, with a recorded gap. Retrieved from NCTE's
CloudFront mirror. Domains 9–11 are image pages and are recorded as
unextractable, not summarised from elsewhere.

| Requirement                               | Classification | Implemented                                                 | Status |
| ----------------------------------------- | -------------- | ----------------------------------------------------------- | ------ |
| `central.npst.framework_structure`        | recommended    | 18 of 24 competencies aligned to NPST with clause citations | ⏸      |
| `central.npst.applicability`              | recommended    | Recorded as advisory                                        | ⚠      |
| `central.npst.career_progression_linkage` | recommended    | Career levels exist; NPST linkage recorded as advisory only | ⚠      |

**NPST is not law here.** §5.2 states it is implemented via an entity designated
by the State/UT. No Punjab designation and no CBSE adoption is verified, so NPST
remains `recommended`. A platform that rendered NPST as a CBSE mandate would be
telling teachers they are legally bound by something nobody has established
binds them.

### 2.2 NCERT 50-hour CPD Guidelines (August 2022)

**Source status: VERIFIED.**

| Requirement                             | Classification | Status |
| --------------------------------------- | -------------- | ------ |
| `central.cpd.annual_hours_expectation`  | recommended    | ⚠      |
| `central.cpd.activity_hour_equivalence` | recommended    | ⚠      |

These were the platform's original CPD basis and are now **superseded in
practice** by the CBSE 2025 notification for an affiliated school. They remain
recorded because the applicability question is open: the NCERT chain runs
through UDISE+/BRC/BEO/DEO, which is the mechanism for _government_ schools.
CBSE's 2025 notification answers the Stage 1 open question by naming the CBSE
Training Portal and OASIS instead.

### 2.3 National Education Policy 2020

**Source status: REQUIRES VERIFICATION.** Recorded; nothing derived from it. ○

---

## Part 3 — Punjab

**Nothing in this section is verified. No Punjab instrument was retrieved.**
`indiacode.nic.in` returns HTTP 403 and `pbhe.punjab.gov.in` refuses
connections; both were retried.

| Instrument                                                                                             | Recorded | Read   | Applicability                       | Status |
| ------------------------------------------------------------------------------------------------------ | -------- | ------ | ----------------------------------- | ------ |
| Punjab Privately Managed Recognised Schools Employees (Security of Service) Act, 1979 (Act 18 of 1979) | Yes      | **No** | Undetermined                        | ⚠      |
| Punjab RTE Rules                                                                                       | Yes      | **No** | Undetermined                        | ⚠      |
| Punjab Government pay scales                                                                           | Yes      | **No** | **Explicitly not assumed to apply** | ⚠      |
| Punjab service conditions for private school employees                                                 | Yes      | **No** | Undetermined                        | ⚠      |

The platform records these **so the question is visible**, not because they
apply. The increment page says so in as many words:

> Recorded so that the question is visible, NOT because it applies. Being
> located in Punjab does not import Punjab Government pay scales into a
> privately managed school.

**What this gates.** Everything employment-related. Two gate messages are
displayed, in these exact words:

- _School funding/service status requires verification before employment-related
  compliance calculations can be activated._
- _Employment/service-rule applicability requires authorised verification._

**A note on titles.** Act 18 of 1979 is named for privately managed recognised
schools, which makes it look directly on point. Applicability was still not
inferred from the title — the Act has not been read, and a title is not a scope
clause. This is the rule that most invites being broken.

---

## Part 4 — Data protection

| Instrument                                                  | Source status         | Position                                                                                                                                                              |
| ----------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Digital Personal Data Protection Act, 2023 (Act 22 of 2023) | REQUIRES VERIFICATION | Recorded. The machinery its obligations imply is built — subject requests, access logging, retention classes, correction workflow. **No compliance claim is made.** ⚠ |

See [`PRIVACY.md`](PRIVACY.md) for the specific questions a data protection
adviser needs to answer, and for why no retention period has a default value.

---

## Part 5 — Summary of what still requires human verification

| #   | Question                                           | Who answers it                   | What it unlocks                                         |
| --- | -------------------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| 1   | CBSE affiliation number and status                 | School office                    | CBSE CPD + SQAAF compliance reporting (10 requirements) |
| 2   | Funding status: aided / unaided / partially aided  | School management, with evidence | The entire increment and pay layer                      |
| 3   | Does Act 18 of 1979 reach this school?             | Lawyer or HR adviser             | Service-rule enforcement                                |
| 4   | The school's own service rules and pay arrangement | School management                | Which framework applies                                 |
| 5   | DPDP 2023 position and retention periods           | Data protection adviser          | Retention and erasure handling                          |
| 6   | Punjab RTE Rules applicability                     | Lawyer or HR adviser             | Recognition-related reporting                           |

Items 1 and 2 are the highest-value: between them they gate almost every
compliance feature in the platform, and neither requires legal advice — only a
document from the school's own files.

---

## What this platform does **not** claim

It does not claim the school is CBSE compliant. It does not claim the school is
legally compliant. It does not claim DPDP compliance. Technical controls
existing is not the same as an organisation meeting its obligations, and no test
in this repository asserts otherwise.

What it claims is this: fifteen requirements are recorded against four sources
that were actually read, every one of them carries a visible verification status,
none of them is enforced against a school whose affiliation and funding status
remain unverified, and no automated actor can change that.
