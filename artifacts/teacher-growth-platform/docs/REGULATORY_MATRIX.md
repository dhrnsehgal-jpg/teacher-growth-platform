# Regulatory Matrix

**Status:** Stage 1 research complete; most items require human verification
**Research date:** 2026-08-20
**Next review due:** 2026-11-20 for unverified items, 2027-08-20 for verified items

---

## 1. How to read this document

Every requirement carries a **verification status**. Only five are permitted:

| Status                   | Meaning                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `VERIFIED`               | The source document was retrieved and read.                                               |
| `REQUIRES VERIFICATION`  | Believed relevant; the text has **not** been read. Nothing about its contents is assumed. |
| `SUPERSEDED`             | Replaced by a later version.                                                              |
| `NOT APPLICABLE`         | Confirmed not to apply to this school.                                                    |
| `POTENTIALLY APPLICABLE` | May apply; depends on school facts not yet confirmed.                                     |

And a **classification**:

| Classification  | Meaning                                          |
| --------------- | ------------------------------------------------ |
| `Mandatory`     | Legally or contractually binding on this school. |
| `Recommended`   | Advisory or guidance from a competent authority. |
| `School Policy` | The school's own rule, adopted voluntarily.      |

**Nothing in this matrix is currently enforced against any member of staff.** Every
requirement's school-level applicability is `requires_verification` and its
`is_enforced` flag is `false`. Enforcement requires four independent gates — see
[`ARCHITECTURE.md` §5](ARCHITECTURE.md).

### Research constraints encountered

Three sources could not be retrieved during Stage 1:

- **`cbse.gov.in` returned HTTP 403** to automated requests. This blocked the CBSE
  Affiliation Bye-Laws 2018, the CBSE CPD Guidelines 2025 and CBSE circulars. Their
  official URLs are recorded; their contents are unread.
- **`ncte.gov.in` refused connections.** This blocked the NPST Guiding Document.
- **`indiacode.nic.in` returned HTTP 403** for the Punjab Act PDF.

Per the project rule, none of these were filled in from memory, blogs or commercial
summaries. They are recorded as `REQUIRES VERIFICATION` with the exact URL a person
should open.

---

## 2. Layer A — Central / National

### A1. NEP 2020 — 50 hours of CPD per year

| Field                  | Value                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Authority              | Ministry of Education, Government of India                                                                                                     |
| Framework              | National Education Policy 2020                                                                                                                 |
| Clause                 | CPD provisions (exact paragraph not confirmed)                                                                                                 |
| Requirement            | Teachers and head teachers are expected to participate in at least 50 hours of CPD per year.                                                   |
| Classification         | **Recommended** — NEP is a policy, not legislation                                                                                             |
| Verification           | `REQUIRES VERIFICATION` for the policy text itself; the expectation is **corroborated** by the NCERT 2022 guidelines (A2), which were verified |
| Effective date         | 2020-07-29                                                                                                                                     |
| Source                 | `https://www.education.gov.in/sites/upload_files/mhrd/files/NEP_Final_English_0.pdf`                                                           |
| Applicability          | All school types                                                                                                                               |
| Evidence required      | CPD portfolio                                                                                                                                  |
| Employee applicability | All teaching staff, head teachers                                                                                                              |

> **Do not describe this as a legal requirement.** NEP 2020 is a policy document. Its
> expectations become binding only where an authority with power to bind — CBSE for
> affiliation, or a State for recognition — adopts them.

### A2. NCERT — Guidelines for 50 Hours of CPD (2022) ✅ VERIFIED

| Field             | Value                                                                                                                                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authority         | National Council of Educational Research and Training                                                                                                                                                                                                                                                     |
| Framework         | _Guidelines for 50 Hours of Continuous Professional Development for Teachers, Head Teachers and Teacher Educators_, First Edition, August 2022, ISBN 978-93-5580-045-9                                                                                                                                    |
| Requirement       | Operationalises the NEP 2020 50-hour expectation through a blended, "cafeteria" approach across face-to-face, online/distance and other academic activities.                                                                                                                                              |
| Classification    | **Recommended**                                                                                                                                                                                                                                                                                           |
| Verification      | **`VERIFIED`** — retrieved and read 2026-08-20                                                                                                                                                                                                                                                            |
| Source            | `https://ncert.nic.in/pdf/Guidelines50HoursCpd.pdf`                                                                                                                                                                                                                                                       |
| Applicability     | The document states the guidelines **are suggestive** and may be adapted or adopted by States/UTs and by organisations such as NVS, KVS, **CBSE**, EMRS, NIOS and NIEPA. It further states they may be implemented in state-government-recognised and state-board-affiliated aided and non-aided schools. |
| Evidence required | e-portfolio with certificates/evidence per activity                                                                                                                                                                                                                                                       |
| Review due        | 2027-08-20                                                                                                                                                                                                                                                                                                |

**Verified content — hour equivalences:**

| Activity                                                      | Credited hours                               |
| ------------------------------------------------------------- | -------------------------------------------- |
| Face-to-face session                                          | 1 hour 30 minutes; 4 sessions = a 6-hour day |
| NISHTHA module on DIKSHA                                      | 4 hours per module                           |
| Local/regional paper publication or presentation              | 3 hours                                      |
| National-level paper                                          | 6 hours                                      |
| International-level paper                                     | 12 hours                                     |
| E-content / module / book / chapter / translation development | 12 hours                                     |
| Action research / innovative project / case study             | 18 hours                                     |
| Field visit to a model or innovative school or community      | 6 hours                                      |
| Live session or discussion, half hour                         | 3 hours                                      |
| Live session or discussion, one hour or more                  | 6 hours                                      |
| Expert or resource person; speaker at workshop/seminar        | 3 hours                                      |
| Paper setting for a school subject                            | 3 hours                                      |
| Examiner / external examiner work                             | As decided by the appropriate authority      |

**Verified content — assessment mechanism:** teachers submit completed CPD to an
e-portfolio and inform their BRC/BEO/DEO; a committee (Head teacher + CRCC +
BRCC/BEO) assesses, the DEO reports the final result, and data is uploaded to
UDISE+. The document also notes the e-portfolio links to Career Management and
Progression (CMP) and NPST.

> **Important caveat for this school.** That assessment mechanism is built around
> government and state-board structures — BRC, BEO, DEO, UDISE+. A private CBSE
> school in Punjab does not sit inside that chain.
>
> **Now answered from B2.** CBSE's own 2025 notification specifies the reporting
> chain for affiliated schools: teacher registration on the **CBSE Training
> Portal**, and school-conducted training recorded in **OASIS** — not UDISE+, and
> not through BRC/BEO/DEO. The open question is closed on CBSE's own authority.

**Design consequence:** the platform ships these equivalences as a _proposed school
CPD accrual policy_, classified `School Policy`, attributed to the school, with the
NCERT guideline cited as its basis. Presenting them as a CBSE or central mandate
would be wrong.

### A3. NCTE — teacher qualification requirements

| Field          | Value                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Authority      | National Council for Teacher Education                                                               |
| Framework      | NCTE regulations on minimum qualifications                                                           |
| Requirement    | Minimum qualifications for teachers at each stage. **Text not read.**                                |
| Classification | To be determined — likely Mandatory where adopted through RTE §23 and affiliation conditions         |
| Verification   | `REQUIRES VERIFICATION` — `ncte.gov.in` unreachable                                                  |
| Source         | `https://ncte.gov.in`                                                                                |
| Applicability  | `POTENTIALLY APPLICABLE`                                                                             |
| Action         | A person must retrieve the current NCTE qualification regulations and record the applicable version. |

### A4. NPST — National Professional Standards for Teachers

See [`NPST_ARCHITECTURE.md`](NPST_ARCHITECTURE.md). Status: `REQUIRES VERIFICATION`.
NEP 2020 tasks NCTE, as a Professional Standard Setting Body, with developing NPST;
an NPST Guiding Document dated 2023 is published at
`https://ncte.gov.in/website/PDF/NPST/NPST-Book.pdf`. **Whether any part has been
notified as binding on private CBSE schools is unconfirmed and must not be assumed.**

### A5. RTE Act, 2009

| Field          | Value                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authority      | Parliament of India                                                                                                                                                |
| Framework      | Right of Children to Free and Compulsory Education Act, 2009                                                                                                       |
| Relevance      | §23 (teacher qualifications), §24 (duties of teachers), and recognition conditions                                                                                 |
| Classification | **Mandatory** where applicable                                                                                                                                     |
| Verification   | `REQUIRES VERIFICATION`                                                                                                                                            |
| Applicability  | `POTENTIALLY APPLICABLE` — the Act's reach over an unaided CBSE school for elementary classes needs confirmation, as does its interaction with Punjab's Rules (C1) |

### A6. Digital Personal Data Protection Act, 2023

| Field          | Value                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Authority      | Parliament of India                                                                                                                          |
| Framework      | Act No. 22 of 2023                                                                                                                           |
| Relevance      | The school is a Data Fiduciary for staff personal data; the platform processes it.                                                           |
| Classification | **Mandatory** once commenced for the relevant obligations                                                                                    |
| Verification   | `REQUIRES VERIFICATION` — full text and current commencement/Rules position not confirmed in Stage 1                                         |
| Source         | `https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf`                                                                      |
| Applicability  | All school types                                                                                                                             |
| Treatment      | Used as **design input** for privacy engineering, not as a set of enforced platform rules. See [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md). |

---

## 3. Layer B — CBSE

Full detail in [`CBSE_COMPLIANCE.md`](CBSE_COMPLIANCE.md).

### B1. CBSE Affiliation Bye-Laws, 2018

`REQUIRES VERIFICATION`. Chapter-wise PDFs published at
`https://www.cbse.gov.in/cbsenew/aff_bye_laws.html`; HTTP 403 to automated requests.
Provisions on teaching staff qualifications, service conditions, salary and appraisal
are **unread**. Circular 07/2024 appears to amend the Bye-Laws and must be read with
them.

### B2. CBSE CPD Guidelines 2025 — `VERIFIED`

Notification No. TRG-02/2025 (No. CBSE/Training Unit/2025), dated 01.04.2025,
signed by the Director (Training). Supplied by the school as the official PDF
after `cbse.gov.in` refused automated retrieval; read page by page (the file is
a scan, so no text extraction was possible or relied upon).

Seven mandatory requirements recorded in migration `0030`:

| Key                                  | Substance                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `cbse.cpd.annual_hours`              | 50 h/yr — 25 h via CBSE/Govt Regional Training Institutes + 25 h school-organised                                      |
| `cbse.cpd.domain_allocation`         | Core Values and Ethics 12 h (6+6); Knowledge and Practice 24 h (16+8); Professional Growth and Development 14 h (3+11) |
| `cbse.cpd.academic_task_equivalence` | Named academic tasks count, capped at 11 h                                                                             |
| `cbse.cpd.recording_and_portals`     | CBSE Training Portal; school-conducted training in OASIS                                                               |
| `cbse.cpd.enforcement`               | Penalties under Affiliation Bye-Laws clause 12.2.9                                                                     |
| `cbse.cpd.official_duty_protection`  | Official duty; no deduction of salary or leave                                                                         |
| `cbse.cpd.npst_alignment`            | CPD domains aligned to NPST                                                                                            |

**Applicability for this school: `POTENTIALLY APPLICABLE`, not enforced.** The
requirement is verified; the school's CBSE affiliation is still `unverified`, so
the third and fourth gates remain closed. Confirming the affiliation number and
status activates CPD compliance reporting.

The 25 + 25 split flagged in Stage 1 as an unverified fragment is confirmed and
sourced: it comes from **CBSE Affiliation Notification 16/2021 dated 24.09.2021**,
cited by the 2025 notification. Stage 1 was right to refuse it — the fragment then
in hand described government teachers, and the correct provenance only became
visible with the notification itself. 16/2021 is registered as a separate source
at `REQUIRES VERIFICATION`; its own text is unread, and the requirement rests on
the 2025 notification's authority.

Full detail in [`CBSE_COMPLIANCE.md`](CBSE_COMPLIANCE.md) §4.

### B3. SQAAF — School Quality Assessment and Assurance Framework — `VERIFIED`

The full framework document was retrieved and read on 2026-08-20:
`https://cbseacademic.nic.in/sqaa/doc/handbook.pdf` — _School Quality Assessment
and Assurance Framework_, CBSE Academic Unit, April 2023, 300 pages.

Verified and loaded: **7 domains, 48 sub-domains, 84 standards, 336 marks**; the
four-point scale (I Inceptive, II Transient, III Stable, IV Dynamic Evolving);
weightings of 40% for Curriculum, Pedagogy and Assessment and 10% for each of the
other six; the domain weightage formula; and Annexure F's Self Improvement Plan
template.

**Annual self-assessment is mandatory**, from the framework's own eligibility
section: schools affiliated to CBSE must undergo the SQAA process and self-assess
every year on the SQAA Portal. This supersedes the Stage 1 position that SQAAF
was `recommended` and that whether submission was an affiliation condition was
unknown.

Recorded as `cbse.sqaaf.annual_self_assessment` and `cbse.sqaaf.scoring_scheme`,
both `mandatory` and `verified`. Applicability for this school is
`POTENTIALLY APPLICABLE` and unenforced, on the same affiliation gate as the CPD
requirement. Note that the framework states a guiding principle of no
differential criteria for government, aided and private schools, so applicability
does **not** turn on funding status.

Still `REQUIRES VERIFICATION`: the overall maturity-level bands (section 1.11.2
is an image and could not be read) and the annual submission window (the
framework does not state one).

Full detail in [`SQAAF_IMPLEMENTATION.md`](SQAAF_IMPLEMENTATION.md);
[`SQAAF_ARCHITECTURE.md`](SQAAF_ARCHITECTURE.md) §7 records what changed.

---

## 4. Layer C — Punjab

Full detail in [`PUNJAB_COMPLIANCE.md`](PUNJAB_COMPLIANCE.md).

**All items in this layer are `POTENTIALLY APPLICABLE` and gated on the school's
funding status, which is currently `unverified`.**

### C1. Punjab RTE Rules, 2011 (as amended)

`REQUIRES VERIFICATION`. Made under §38 of the RTE Act, 2009. Rules on teacher
requirement, minimum qualification, salary and conditions of service, and duties of
teachers are relevant. **No authoritative Punjab Government URL was established in
Stage 1** — only commercial reproductions, which are not acceptable sources.

### C2. Punjab Privately Managed Recognised Schools Employees (Security of Service) Act, 1979

`REQUIRES VERIFICATION` / `POTENTIALLY APPLICABLE`. Punjab Act No. 18 of 1979.
Secondary indications suggest the associated Rules attach to employees on **aided
posts**, which would make applicability turn precisely on the school's funding
status. Text not retrieved (HTTP 403).

> This is exactly the situation the employment gate exists for. Applying a
> security-of-service or pay framework to an unaided school that it does not bind
> would be a serious error, and so would the reverse.

### C3. Punjab recognition requirements

`REQUIRES VERIFICATION`. The recognition authority, renewal conditions and any
staffing or service conditions attached to recognition need confirmation from
official Punjab School Education Department sources.

### C4. Punjab Government pay and service rules

`NOT APPLICABLE` **presumptively for an unaided private school** — but this is
recorded as `REQUIRES VERIFICATION` because the presumption has not been checked
against the school's actual funding status and recognition terms. Punjab Government
employee pay rules must **not** be applied to a private school's staff without
establishing that they bind it.

---

## 5. Layer D — School policy

None recorded yet. When the school's competency framework, KPI policy, appraisal
policy, CPD policy, promotion policy, increment policy, service rules and staff
handbook are loaded, each becomes a `regulatory.source` under a school-layer
authority with every requirement classified **`School Policy`**.

The presentation layer attributes school-layer requirements to the school
regardless of subject matter. A CPD policy written to mirror CBSE guidance is still
the school's policy — `tests/unit/regulatory.test.ts` asserts this specific case.

---

## 6. Verification worklist

Ordered by how much they block.

| #   | Item                                                                              | Blocks                                                                                                                                            | Owner                    |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | **School funding status** (aided / unaided) with documentary evidence             | All employment and pay compliance; all Punjab service rules                                                                                       | School management        |
| 2   | ~~CBSE CPD Guidelines 2025 (B2)~~ — **verified 2026-08-20**                       | ~~Any statement about CBSE CPD compliance~~ — now unblocked, subject to item 4                                                                    | Compliance Administrator |
| 3   | CBSE Affiliation Bye-Laws 2018 + Circular 07/2024 (B1)                            | Qualification and service-condition rules                                                                                                         | Compliance Administrator |
| 4   | CBSE affiliation number, status, validity, Senior Secondary status                | Regulatory profile completeness — **and now the only thing standing between the verified CPD requirements and enforced CPD compliance reporting** | School office            |
| 5   | Punjab RTE Rules 2011, from an official source (C1)                               | State-layer requirements                                                                                                                          | Compliance Administrator |
| 6   | Punjab Act 18 of 1979 applicability (C2)                                          | Service-security obligations                                                                                                                      | Legal adviser            |
| 7   | NPST current status and structure (A4)                                            | Competency framework mapping                                                                                                                      | Academic leadership      |
| 8   | ~~SQAAF manual: sub-domains, indicators, scoring (B3)~~ — **verified 2026-08-20** | ~~SQAAF self-assessment module~~ — built. Outstanding: maturity-level bands and the submission window                                             | Compliance Administrator |
| 9   | NCTE qualification regulations (A3)                                               | Qualification verification of staff                                                                                                               | HR                       |
| 10  | DPDP Act commencement and Rules position (A6)                                     | Privacy programme specifics                                                                                                                       | Legal adviser            |
| 11  | CBSE Affiliation Notification 16/2021, dated 24.09.2021                           | Reading the 25+25 split at its own source rather than through the 2025 citation                                                                   | Compliance Administrator |

## 7. Sources consulted

Verified (retrieved and read):

- [CBSE — School Quality Assessment and Assurance Framework, April 2023](https://cbseacademic.nic.in/sqaa/doc/handbook.pdf) — read in full, 300 pages
- **CBSE — CPD Guidelines 2025**, Notification TRG-02/2025 dated 01.04.2025 —
  supplied by the school as the official PDF; read page by page (scanned document)
- [NCERT — Guidelines for 50 Hours of CPD (2022)](https://ncert.nic.in/pdf/Guidelines50HoursCpd.pdf)
- [CBSE — SQAA Framework Overview](https://cbseacademic.nic.in/sqaa/doc/TabC-SQAA%20Framework%20Overview.pdf)

Located but not retrievable:

- [CBSE Affiliation Bye-Laws](https://www.cbse.gov.in/cbsenew/aff_bye_laws.html) — HTTP 403
- [CBSE Affiliation Notification 16/2021](https://www.cbse.gov.in/cbsenew/aff_bye_laws.html) — not retrieved; known only through the 2025 notification
- [NPST Guiding Document, 2023](https://ncte.gov.in/website/PDF/NPST/NPST-Book.pdf) — connection refused
- [DPDP Act, 2023](https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf) — not read in full
- [Punjab Act 18 of 1979](https://www.indiacode.nic.in/bitstream/123456789/14731/1/punjab_act_18_of_1979_punjab_privately_managed_recognised_schools_employees_security_of_service_rules_1979_-converted.pdf) — HTTP 403
