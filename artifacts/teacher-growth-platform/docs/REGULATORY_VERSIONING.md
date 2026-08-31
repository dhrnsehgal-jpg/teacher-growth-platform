# Regulatory Versioning

**Status:** Implemented — Stage 4
**Last updated:** 2026-08-21

---

## 1. The problem this solves

A compliance platform has to answer two different questions:

1. _What is the rule?_ — a question about today.
2. _Was this teacher compliant in 2026-27?_ — a question about a year that may
   now be closed, under a rule that may since have changed.

A constant in application code can only answer the first. The moment CBSE
revises the CPD scheme, `const ANNUAL_CPD_HOURS = 50` starts answering the
second question wrongly, silently, and retrospectively — every historical
report re-renders under a rule that did not exist at the time.

So no regulatory value lives in `src/`. They are rows, with effective periods.

## 2. Where the values actually live

```
regulatory.source              the document      (CBSE Notification TRG-02/2025)
   └── regulatory.requirement  the obligation    (cbse.cpd.annual_hours)
          └── compliance.cpd_requirement_version   the operational numbers
                 ├── cpd_requirement_allocation    category × source matrix
                 └── cpd_activity_rule             hour credits, with caps
```

`sqaaf.framework_version` does the same job for SQAAF: an edition, its domains,
sub-domains, standards and performance levels, all hanging off one version row.

### The allocation matrix is the single source of truth

CBSE's scheme has two axes — three NPST-aligned domains, and the 25 + 25 split
between Board-delivered and school-delivered hours. It would be natural to store
three category totals and two source totals. That would be five numbers that can
disagree.

Instead there are six rows, one per cell:

| Domain                              | CBSE / Government | School / Complex |
| ----------------------------------- | ----------------- | ---------------- |
| Core Values and Ethics              | 6                 | 6                |
| Knowledge and Practice              | 16                | 8                |
| Professional Growth and Development | 3                 | 11               |

Both the category totals (12 / 24 / 14) and the source totals (25 / 25) are SUMs
over this table, so they cannot drift apart. A deferred constraint trigger
asserts the matrix sums to the version's declared total; a version that does not
balance cannot be committed.

## 3. Which rule governs which year

`compliance.requirement_version_for_year(school, year)` resolves it, in this
order:

1. **An explicit binding** in `compliance.cpd_year_requirement`. This records a
   decision somebody made, and for a closed year it is the only defensible
   answer.
2. **The effective period** — the version whose `effective_from` / `effective_to`
   covers the year. Ordered by `effective_from desc, version desc`, so the
   result is deterministic and two runs of the ledger cannot disagree.

Nothing falls back to "the latest version". A rule that was not in force is
never applied to a year it did not govern.

## 4. What happens when CBSE changes a rule

A revision is a **new row**, never an edit:

```sql
-- The 2025 scheme stops here...
update compliance.cpd_requirement_version
   set effective_to = date '2028-03-31'
 where key = 'cbse.cpd' and version = 1;

-- ...and version 2 begins, with its own allocation matrix.
insert into compliance.cpd_requirement_version
  (key, version, total_hours, effective_from, ...)
values ('cbse.cpd', 2, 60, date '2028-04-01', ...);
```

Consequences, each of which is asserted by a test in
`tests/db/stage4.test.ts`:

- 2026-27 still reports against 50 hours, because it is bound to version 1.
- 2028-29 resolves to version 2 and reports against 60.
- Every `compliance.cpd_record` carries `requirement_version_id`, so the record
  itself remembers which rule it was judged under. A later revision cannot
  retroactively change what a reviewer decided.

### Closed years are protected twice

`compliance.cpd_year_requirement` is immutable in the direction that matters: a
trigger refuses to change `version_id` once the academic year is locked. Doing
so is precisely how a past compliance judgement gets quietly rewritten. Changing
a locked year requires the Stage 1 machinery —
`regulatory.recalculation_authorisation` and `regulatory.may_recalculate_year()`.

## 5. Verification status is separate from applicability

Four gates, and they are genuinely different questions:

| Gate                     | Question                               | Where                                                |
| ------------------------ | -------------------------------------- | ---------------------------------------------------- |
| Source verified          | Has anyone actually read the document? | `regulatory.source.verification_status`              |
| Requirement recorded     | What exactly does it say?              | `regulatory.requirement`                             |
| Applicability determined | Does it bind _this_ school?            | `regulatory.school_requirement_status.applicability` |
| Enforcement enabled      | Do we act on it?                       | `.is_enforced`                                       |

Both Stage 4 frameworks sit at gate two. The CBSE CPD Guidelines 2025 and the
SQAA Framework April 2023 are `verified` — they have been read in full. Their
applicability to this school is `potentially_applicable`, not verified, because
the school's CBSE affiliation is still recorded as unverified in the School
Regulatory Profile.

That is the gate working, not a gap. The platform shows the requirement, tracks
progress against it, and declines to assert compliance until somebody confirms
the affiliation number and status.

## 6. Statuses in use

Only the five permitted values appear anywhere: `VERIFIED`,
`REQUIRES VERIFICATION`, `SUPERSEDED`, `NOT APPLICABLE`,
`POTENTIALLY APPLICABLE`.

## 7. What refuses to be invented

The schema declines several things rather than guessing:

| Constraint                                       | What it refuses                                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cpd_activity_rule_verified_needs_source`        | An hour credit marked `verified` with no source and clause. This is what makes "do not invent activity-credit hours" structural rather than aspirational |
| `cpd_requirement_version_mandatory_needs_source` | A `mandatory` rule with no citation                                                                                                                      |
| `cpd_source_type_counting_needs_classification`  | A source counted toward the requirement without a named person, timestamp and note                                                                       |
| `sqaaf_window_verified_complete`                 | A submission window marked verified without dates and a source                                                                                           |
| `sqaaf.reject_standard_text_edit`                | Editing published standard text — a revision is a new framework version                                                                                  |
| `regulatory.reject_requirement_text_edit`        | The same, for requirement text (Stage 1)                                                                                                                 |

## 8. Things deliberately left unverified

Recorded as unknown rather than filled in:

- **The SQAAF maturity-level bands.** Section 1.11.2 of the framework — which
  would give the overall percentage-to-maturity-level mapping — is an image and
  could not be read. No bands are recorded. Anything claiming a maturity level
  from a percentage would be invented.
- **The SQAAF submission window.** The framework mandates annual self-assessment
  but does not state the window. `sqaaf.submission_window` exists per academic
  year and holds `requires_verification` with a note pointing at the SQAA Portal.
  Hard-coding a 2025 window into 2027 is how compliance tooling starts lying.
- **Whether DIKSHA, SWAYAM, recognised institutions or other approved providers
  count** toward the CBSE requirement. The notification does not mention them.
  They are seeded with `counts_toward_requirement = false`; classifying them is
  a compliance judgement for the school to make and record.
- **CBSE Affiliation Notification 16/2021**, the instrument the 25 + 25 split
  originates in. Registered as its own source at `requires_verification`; only
  CBSE's 2025 citation of it has been read.

## 9. How the rule is tested

`tests/unit/no-hardcoded-regulatory-values.test.ts` reads every `.ts`/`.tsx`
file under `src/`, strips comments, and fails if any CPD or SQAAF figure appears
as a numeric literal on a line mentioning hours, requirements or standards.

The first version of that test was vacuous: it filtered lines with `/\bcpd\b/i`,
and `_` is a word character, so `ANNUAL_CPD_HOURS = 50` did not match the word
boundary and sailed through. It was checked by deliberately introducing that
exact constant and confirming the test failed. A guard nobody has watched fail
is not a guard.
