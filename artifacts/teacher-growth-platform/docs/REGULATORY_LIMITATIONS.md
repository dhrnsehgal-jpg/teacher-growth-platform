# Regulatory Limitations

**This document exists so that nobody has to guess which of the platform's
expectations are law, which are a framework's advice, and which the school made
up. Those three things look identical on a screen unless somebody insists they
be kept apart.**

The platform does not claim to be CBSE compliant, and does not claim to be
legally compliant. It claims something narrower and checkable: every expectation
it holds is traceable to a named source with a recorded verification status, and
anything not so traceable is marked as needing verification rather than
presented as a rule.

Read this before configuring the platform for a real school.

---

## The five classifications

Every regulatory statement the platform holds is one of these. The distinction
is enforced in the database, not merely described here.

### 1. VERIFIED REQUIREMENT

An authoritative primary source was **retrieved and read**, and the platform's
statement of the requirement matches what that document actually says.

Four sources meet this bar:

| Source                       | Reference                            | Retrieved from                                        | What was read                                                                        |
| ---------------------------- | ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| CBSE CPD Guidelines 2025     | Notification TRG-02/2025, 01.04.2025 | PDF supplied directly by the school                   | Scanned document, read visually page by page — text extraction returns nothing       |
| CBSE SQAA Framework          | April 2023                           | `cbseacademic.nic.in/sqaa/doc/handbook.pdf`           | Full handbook: 7 domains, 48 sub-domains, 84 standards, 336 marks, 4-point scale     |
| NPST Guiding Document        | 2023                                 | NCTE CloudFront mirror, linked from `web.ncte.gov.in` | Full document except Domains 9–11, which are image pages and are recorded as missing |
| NCERT 50-hour CPD Guidelines | ISBN 978-93-5580-045-9, August 2022  | NCERT                                                 | Full document                                                                        |

**Verified means the document says this.** It does not mean the requirement
binds this school. That is a separate question, below.

### 2. FRAMEWORK ALIGNMENT

The platform's structure follows a published framework, but the framework itself
is advisory, or its adoption by this school's authority is not established.

The clearest case is **NPST**. The Guiding Document is verified — it was read in
full. But §5.2 says NPST is implemented through an entity designated by the
State or Union Territory, and **no Punjab designation and no CBSE adoption has
been verified**. So NPST is recorded as `recommended`, never as mandatory law,
and eighteen competencies cite specific NPST clauses while remaining school
expectations rather than legal obligations.

Five requirements sit here: NPST applicability, NPST framework structure, NPST
career-progression linkage, and the two NCERT CPD expectations.

### 3. SCHOOL POLICY

The school's own decision. It may be informed by a framework; it is not derived
from law.

Everything in this class carries a visible marker. The professional growth score
is the clearest example — it renders everywhere with the exact string:

> **DEMO SCHOOL POLICY — NOT A CBSE OR PUNJAB GOVERNMENT FORMULA.**

Also in this class: the five-point proficiency scale, the KPI weightings, the
gap-priority scoring, the CPD recommendation ranking, the appraisal component
weights, and every competency marked `school_defined`.

**A school policy must never render as a CBSE rule.** The database stores the
framework, the alignment and the clause citation on every framework item, and
refuses `aligned` without a citation.

### 4. PUNJAB-SPECIFIC REQUIREMENT

A Punjab instrument that _might_ apply to this school. Whether it does depends
on facts about the school that have not been established.

**No Punjab instrument has been retrieved.** `indiacode.nic.in` returns HTTP 403
and `pbhe.punjab.gov.in` refuses connections from the build environment; both
were retried during Stage 5. The following are recorded as _unread_, with
applicability _undetermined_:

- The Punjab Privately Managed Recognised Schools Employees (Security of
  Service) Act, 1979 (Punjab Act No. 18 of 1979)
- Punjab RTE Rules
- Punjab Government pay scales
- Punjab service conditions for private school employees

**Punjab Government pay scales are not imported because the school is in
Punjab.** Being located in a state does not import that state's public-service
pay structure into a privately managed school. The platform records the question
so it is visible, explicitly not because it applies.

### 5. REQUIRES LEGAL/HR VERIFICATION

A question the platform cannot answer and will not guess at. Each of these
**gates** functionality — the feature exists and is inert until a named person
records an answer.

| Question                                        | What it gates                               | Gate message shown                                                                                                        |
| ----------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Is the school aided or unaided?                 | All increment and pay-related calculation   | _School funding/service status requires verification before employment-related compliance calculations can be activated._ |
| Which service rules apply?                      | Employment/service-rule enforcement         | _Employment/service-rule applicability requires authorised verification._                                                 |
| What is the CBSE affiliation number and status? | CBSE CPD and SQAAF **compliance reporting** | Recorded on the school regulatory profile                                                                                 |
| Does DPDP 2023 apply, and in what capacity?     | Retention periods and erasure handling      | See `PRIVACY.md`                                                                                                          |

---

## The four gates, and why they are separate

It is tempting to collapse these. Collapsing them is how a platform starts
asserting compliance it cannot support.

```
  source verified  →  requirement recorded  →  applicability determined  →  enforcement enabled
```

The CBSE CPD requirements demonstrate all four. The notification was read, so
the source is `verified`. Seven requirements were recorded from it, all
`verified` and `mandatory`. But applicability is `potentially_applicable`,
because the school's CBSE affiliation status is `unverified` — and so
`is_enforced` is `false` for every one of them.

The platform therefore knows exactly what CBSE requires and declines to enforce
it against a school it cannot confirm is affiliated. Three tests assert this
directly, including that `regulatory.is_enforceable_for_school()` refuses every
CPD requirement.

---

## Current state of the register

As built and seeded, at Stage 6 completion:

|                                           | Count |
| ----------------------------------------- | ----- |
| Requirements recorded                     | 15    |
| — mandatory                               | 9     |
| — recommended                             | 6     |
| Requirements whose **source** is verified | 15    |
| Applicability `potentially_applicable`    | 10    |
| Applicability `requires_verification`     | 5     |
| **Requirements actually enforced**        | **0** |

Sources marked `requires_verification` (recorded, not read):

- CBSE Affiliation Notification 16/2021 — known only through CBSE's own citation
  of it in the 2025 notification. Marking it verified would launder a citation
  into a source.
- CBSE Affiliation Bye-Laws, 2018
- Punjab Act No. 18 of 1979
- Punjab RTE Rules
- The Digital Personal Data Protection Act, 2023
- National Education Policy 2020

---

## Rules the build followed, and that a maintainer must keep

These are enforced by tests where a test is possible, and stated here where one
is not.

1. **Never describe a school policy as a CBSE rule.**
2. **Never describe an NPST recommendation as mandatory CBSE law** unless an
   authoritative current source establishes it.
3. **Never assume a Punjab Government employment or pay rule applies to a
   private CBSE school** without checking applicability.
4. **Never infer applicability from the title of a statute or rule.** A title
   containing "Privately Managed Recognised Schools" is not proof it reaches
   this school.
5. **If source access is unavailable, do not invent the requirement.** Mark it
   REQUIRES VERIFICATION.
6. **Do not rely on blogs, coaching websites or commercial summaries** for
   regulatory requirements. Several such sources state the CPD split correctly;
   none of them is a source.
7. **Never let AI activate a regulatory requirement.** A database trigger
   requires a signed-in person holding `regulatory.manage` before
   `is_enforced` can be set true. There is no path for an automated actor.

Allowed statuses, and no others: `VERIFIED`, `REQUIRES VERIFICATION`,
`SUPERSEDED`, `NOT APPLICABLE`, `POTENTIALLY APPLICABLE`.

---

## What a school must do before relying on this

None of these can be done by the software, and none should be guessed.

1. **Supply the CBSE affiliation number and current status.** This unlocks CPD
   and SQAAF compliance reporting. It is one question to the school office.
2. **Record the funding status** (aided / unaided / partially aided) with
   evidence. This unlocks the employment and increment layer.
3. **Have a lawyer or HR adviser determine** whether the Punjab Privately
   Managed Recognised Schools Employees (Security of Service) Act, 1979 reaches
   this school, and record the determination with its basis.
4. **Obtain the school's own service rules and pay arrangement** and record
   which framework applies.
5. **Take a data protection view on DPDP 2023** — see `PRIVACY.md`, which lists
   the specific questions.
6. **Confirm the retention periods** for each of the eight record classes. All
   eight are currently `requires_verification` with no period set, because
   retention interacts with service-record obligations that are themselves
   unverified.

Until these are done the platform runs as a professional development system with
its compliance reporting inert — which is the correct behaviour, not a
limitation to work around.
