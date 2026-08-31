# Data Model

**Status:** Stage 1 entities implemented; later-stage entities specified, not built
**Last updated:** 2026-08-20

Entities marked **[S1]** exist in `supabase/migrations`. Entities marked **[S2]**–**[S6]**
are designed here and created in that stage. The split is deliberate: designing the
whole model now prevents the foundations from boxing us in, while building only the
foundations avoids shipping tables nobody has yet agreed the shape of.

---

## 1. Tenancy and identity **[S1]**

| Table                               | Purpose                                             | Notes                                                                                                                      |
| ----------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `core.school`                       | Tenant root                                         | Every row in the database belongs to exactly one.                                                                          |
| `core.academic_year`                | Appraisal and CPD period                            | `locked_at` closes the year. One `is_current` per school, enforced by partial unique index.                                |
| `core.app_user`                     | Application user, 1:1 with `auth.users`             | Deletion restricted so audit rows never point at a missing actor. Carries privacy-notice version and acceptance timestamp. |
| `core.permission`                   | Global permission catalogue                         | `is_compensation_sensitive` marks pay-exposing permissions.                                                                |
| `core.role`                         | Per-school role                                     | `is_system` protects the nine seeded roles.                                                                                |
| `core.role_permission`              | Grants                                              |                                                                                                                            |
| `core.user_role_assignment`         | Who holds which role, over what scope, for how long | Time-bounded, so "who was entitled to approve this in March 2026?" is answerable.                                          |
| `core.role_assignment_subject_user` | Explicit staff list for `individual` scope          | Mentors, acting cover.                                                                                                     |

### Why role assignments are time-bounded

Authority changes mid-year. A Head of Department appointed in September must not
retroactively appear to have been entitled to approve something in July, and a
departed HOD's past approvals must remain valid. `valid_from`/`valid_to` make the
authority question answerable as-of a date.

## 2. School Regulatory Profile **[S1]**

`core.school_regulatory_profile` — one row per school, holding everything that
decides which rules reach it.

| Group             | Fields                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Location          | `country` (India), `state` (Punjab), `district`, `block_or_tehsil`, `postal_code`                                                           |
| CBSE affiliation  | `cbse_affiliation_number`, `cbse_school_code`, `cbse_affiliation_status`, validity dates, `is_senior_secondary`                             |
| State recognition | `state_recognition_number`, `state_recognition_authority`, validity dates                                                                   |
| Ownership         | `ownership_type` (society / trust / Section 8 company / government body / other), `managing_body_name`, `managing_body_registration_number` |
| Funding           | `funding_status` (private unaided / private aided / government / other)                                                                     |
| Minority          | `minority_status`                                                                                                                           |
| Frameworks        | `applicable_service_framework`, `applicable_pay_framework`, `applicable_recognition_authority`                                              |
| Verification      | Per-fact `*_verified_at`, `*_verified_by`, plus `funding_status_evidence_note`                                                              |
| Review            | `last_reviewed_on`, `review_due_on`                                                                                                         |

**Every status field defaults to `unverified`.** That is the single most important
default in the schema. A plausible-looking default here would silently activate the
wrong body of employment law.

A constraint enforces that `funding_status` can only leave `unverified` together
with a named verifier, a timestamp, and an evidence note of at least ten characters
recording which document was seen.

Classes offered live in `core.class_level` (Balvatika through Class XII), each
optionally mapped to a `core.school_stage`. Stages are rows, not an enum, because
pre-primary nomenclature varies; `nep_stage` optionally aligns each to the NEP 2020
5+3+3+4 structure.

## 3. Regulatory register **[S1]**

| Table                                      | Purpose                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `regulatory.authority`                     | Who issued a rule, at which layer. School-layer authorities are tenant-scoped; the rest are global.                        |
| `regulatory.source`                        | One version of one document, with `source_url`, `retrieved_at`, `content_sha256`, verification status and review schedule. |
| `regulatory.requirement`                   | One **immutable** version of one requirement. Keyed by `(requirement_key, version)`.                                       |
| `regulatory.requirement_school_type`       | Which funding/management categories it reaches.                                                                            |
| `regulatory.requirement_employee_category` | Which staff categories it reaches.                                                                                         |
| `regulatory.school_requirement_status`     | This school's determination and enforcement switch.                                                                        |
| `regulatory.ruleset_snapshot`              | Frozen rule versions for a closed year. Append-only.                                                                       |
| `regulatory.recalculation_authorisation`   | Time-bounded permission to recalculate a closed year.                                                                      |

### Stored per requirement

Authority (via source), framework/document, clause reference, requirement text,
effective dates, version, source URL and retrieval evidence, applicability note,
classification, school-type applicability, employee applicability, evidence
required, verification status, last reviewed date, review due date.

### Constraints that carry meaning

- `source_verified_requires_evidence` — a source cannot be `verified` without a URL,
  a retrieval timestamp and a verification timestamp.
- `requirement_immutable_text` — text, classification, clause and effective date
  cannot be edited; supersede instead.
- `school_requirement_enforce_requires_verified` — `is_enforced` cannot be true
  unless applicability is `verified` by a named person.

## 4. Organisation and teachers **[S1]**

| Table                                | Purpose                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `core.school_stage`                  | Foundational / Preparatory / Middle / Secondary, or the school's own.                           |
| `core.class_level`                   | Balvatika 1 → Class XII.                                                                        |
| `core.department`                    | Optionally confined to a stage.                                                                 |
| `core.subject`                       | Optional CBSE subject code.                                                                     |
| `core.teacher_category`              | PRT / TGT / PGT / pre-primary / special educator / librarian / counsellor. Rows, not an enum.   |
| `core.career_level`                  | The school's ladder, ordered. Separate from category: a TGT and a PGT can both be "Proficient". |
| `core.teacher_profile`               | One staff member in one school.                                                                 |
| `core.teacher_teaching_assignment`   | Subject × class × stage per academic year.                                                      |
| `core.teacher_department_membership` | Secondary departments for staff teaching across teams.                                          |

### Qualification as a verification state

`teacher_profile.qualification_verification` is a `verification_status`, not a
boolean. "We have not checked" and "checked and not met" are different facts, and
only the second should ever be acted on. A teacher can maintain their own factual
details but cannot self-verify — RLS blocks it.

## 5. Competency framework **[S2]**

Not yet built. Designed shape:

| Entity                 | Key fields                                                                                   | Notes                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `competency_framework` | school_id, key, name, version, status, effective dates                                       | Versioned like regulatory requirements: a framework revision must not rewrite last year's assessments.         |
| `competency_standard`  | framework_id, external reference                                                             | Where the school maps to NPST or another published standard. Stored as a _mapping_, labelled as such.          |
| `competency_domain`    | framework_id, name, sort order                                                               |                                                                                                                |
| `competency`           | domain_id, key, name, description, applies-to filters                                        | Filters by `school_stage` and `teacher_category`, so a Balvatika teacher and a PGT see different expectations. |
| `competency_indicator` | competency_id, descriptor, observable behaviour                                              | What an assessor actually looks for.                                                                           |
| `proficiency_level`    | framework_id, key, name, ordinal, descriptor                                                 | e.g. Emerging → Developing → Proficient → Advanced.                                                            |
| `competency_target`    | competency_id, career_level_id / teacher_category_id, proficiency_level_id, academic_year_id | The expected level for a given person in a given year. Gaps are computed against this.                         |

**Design rule:** a competency framework is the _school's_. Any relationship to NPST
is a mapping row, never an implication that the school framework is NPST.

## 6. KPI **[S2]**

| Entity        | Notes                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| `kpi`         | school_id, key, name, definition, measurement method, unit, direction, data source, weight |
| `teacher_kpi` | teacher_profile_id, kpi_id, academic_year_id, target, actual, status                       |

KPIs that draw on student outcome data must record their source and are subject to
the privacy constraints in [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md). A KPI whose
data source is not recorded cannot be scored.

## 7. Evidence and assessment **[S3]**

| Entity                    | Notes                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `evidence`                | teacher_profile_id, academic_year_id, type, title, description, storage path, submitted_at, reviewer, review status |
| `evidence_competency_map` | Which competencies a piece of evidence speaks to                                                                    |
| `observation`             | Structured classroom observation: observer, date, class, subject, focus competencies, notes                         |
| `assessment`              | Cycle: teacher_profile_id, academic_year_id, type (self / reviewer / moderated), status, assessor, dates            |
| `assessment_score`        | assessment_id, competency_id, proficiency_level_id, rationale, evidence references                                  |
| `gap`                     | teacher_profile_id, competency_id, current level, target level, severity, identified_at, status                     |
| `professional_goal`       | teacher-owned goal linked to competencies                                                                           |

**Rule:** an `assessment_score` below target must produce a `gap`, and a `gap` must
be linkable to a development action. The product never shows a deficit without a
route out of it.

## 8. CPD **[S4]**

| Entity                | Notes                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `cpd_provider`        | Internal, CBSE, NCERT/DIKSHA, university, other. Verification status of recognition.             |
| `cpd_activity`        | Title, mode (face-to-face / online / distance / other), nominal hours, provider                  |
| `cpd_competency_map`  | Which competencies an activity develops. This is what makes a recommendation explainable.        |
| `teacher_cpd`         | Enrolment, completion, certificate evidence, hours claimed, hours approved, approver             |
| `cpd_hour_ledger`     | Append-only accrual entries: activity, hours, accrual rule applied, academic year                |
| `cpd_compliance_rule` | The school's adopted accrual policy, versioned, each rule citing the requirement it derives from |

### Hour accrual

NCERT's 2022 guidelines supply a suggested equivalence table (verified — see
[`REGULATORY_MATRIX.md`](REGULATORY_MATRIX.md)): 3 hours for a local/regional paper,
6 national, 12 international; 12 for e-content or module development; 18 for action
research; 6 for a model-school field visit; 3 for a short live session, 6 for a
longer one; 3 for acting as a resource person; 3 for paper setting. Face-to-face
sessions run 1½ hours, four to a 6-hour day. NISHTHA modules on DIKSHA carry 4 hours.

These are **recommendations addressed primarily to state-recognised and state-board
schools**. If this school adopts them, they become `cpd_compliance_rule` rows
classified `school_policy` and must be shown to teachers as school policy — not as a
CBSE or central mandate.

## 9. Development planning and impact **[S4]**

| Entity               | Notes                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `learning_plan`      | The Individual Professional Development Plan: teacher, year, status, approver |
| `learning_plan_item` | Goal, target competency, chosen CPD, timeline, success measure                |
| `reflection`         | Post-CPD reflection by the teacher                                            |
| `impact_assessment`  | Application in practice and evidence of impact; links back to reassessment    |

## 10. Growth, progression, increment **[S5]**

| Entity                     | Notes                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `growth_score`             | Computed per teacher per year, with the inputs and weights recorded alongside the score |
| `career_progression`       | Movement between `career_level` rows, with criteria evidence                            |
| `increment_policy`         | The school's increment rules, versioned                                                 |
| `increment_recommendation` | Recommender, basis, growth score reference, status                                      |
| `increment_approval`       | Approver, decision, reason, timestamp                                                   |

**Constraints by design:** recommendation and approval are separate records made by
different roles. A `growth_score` must store its inputs, not just its output — an
unexplainable score is not usable in a career decision. All of this is behind the
employment gate.

## 11. SQAAF **[S6]**

| Entity                     | Notes                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `sqaaf_domain`             | The seven CBSE domains (verified — see [`SQAAF_ARCHITECTURE.md`](SQAAF_ARCHITECTURE.md))                          |
| `sqaaf_indicator`          | Sub-domain and indicator statements. **Not yet verified** — the full SQAAF manual was not retrievable in Stage 1. |
| `sqaaf_evidence_map`       | Links platform evidence to SQAAF indicators                                                                       |
| `sqaaf_improvement_action` | School improvement actions arising from self-assessment                                                           |

## 12. Compliance **[S6]**

| Entity                   | Notes                                                                    |
| ------------------------ | ------------------------------------------------------------------------ |
| `compliance_requirement` | View over `regulatory.requirement` joined to this school's determination |
| `compliance_evidence`    | Evidence produced against a requirement, with reviewer and status        |

## 13. Cross-cutting **[S1]**

| Table               | Notes                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit.audit_log`   | Append-only. Actor, role, action, entity, previous/new value, reason, source, policy version, requirement version, academic year, request id, IP, user agent. |
| `core.notification` | Categorised, with unread partial index.                                                                                                                       |

## 14. Normalisation decisions

**Split from the original entity list:**

- `SchoolRegulatoryProfile` gained per-fact verification columns rather than a single
  "verified" flag, because the facts are verified at different times by different
  people and gate different things.
- `RegulatorySource` and `ComplianceRequirement` were separated into
  `regulatory.source` (the document) and `regulatory.requirement` (the obligation),
  because one document carries many obligations and they supersede independently.
- `TeacherCategory` and `CareerLevel` are distinct tables rather than one ladder.

**Merged or deferred:**

- `Role` and `Permission` did not need a separate `RolePermission` abstraction beyond
  the join table.
- `CompetencyStandard` is a mapping table rather than a parallel hierarchy; modelling
  NPST as a second full framework would duplicate structure for no gain.

**Added beyond the original list:**

- `regulatory.ruleset_snapshot` and `regulatory.recalculation_authorisation` —
  required by the auditability rules, absent from the entity list.
- `core.role_assignment_subject_user` — individual-scope supervision.
- `core.teacher_teaching_assignment` — needed to attribute evidence to subject and
  stage, and to resolve stage-scoped supervision.
