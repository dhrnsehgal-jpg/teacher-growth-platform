# Security and Privacy

**Status:** Stage 1 — controls implemented at the data layer; programme items outstanding
**Last updated:** 2026-08-20

---

## 1. What we are protecting

A teacher's professional record is the most sensitive data in this system. It
contains assessments of their competence, observations of their classroom practice,
identified gaps, and — from Stage 5 — information bearing on their pay and career.

Mishandling it does more than breach a rule. It makes the platform unusable for its
stated purpose, because a developmental tool that teachers do not trust will not
receive honest self-assessment.

Two design consequences follow, and they run through everything below:

- **Teachers see their own record in full.** Being appraised by a system you cannot
  inspect is the opposite of developmental.
- **Managers see only their scope.** Not "see everything and behave well" — cannot
  reach it.

## 2. Data classification

| Class                | Examples                                                                                             | Handling                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Highly sensitive** | Assessment scores, observation notes, identified gaps, increment recommendations, approval decisions | Scope-restricted; audited on change; never exported without an audited action |
| **Sensitive**        | Teacher profile, qualifications, employment status, CPD records, development plans                   | Scope-restricted; audited on change                                           |
| **Internal**         | Departments, subjects, stages, competency framework, roles                                           | Readable by all school members                                                |
| **Reference**        | Regulatory sources, requirements, permission catalogue                                               | Readable by all authenticated users                                           |
| **Secrets**          | Service-role key, database credentials                                                               | Server-only; never in client bundles; rotated on personnel change             |

Note that the competency framework is deliberately **internal**, not restricted. Every
teacher should be able to read the standard they are held to.

## 3. Access control

Row Level Security is the boundary, standing on a privilege layer beneath it. See
[`RBAC.md`](RBAC.md) for the matrix; the security-relevant properties:

- **Privileges precede policies** — `authenticated` and `service_role` hold schema
  and table privileges on `core`/`regulatory`/`audit` (migration `0008`); `anon`
  holds none, so there is no unauthenticated view of any data. A grant confers only
  the right to have a policy evaluated, never access itself. Default privileges are
  set so later-stage tables inherit this correctly.

- **Tenant isolation** — every policy filters `school_id` through
  `core.is_member_of()`, which resolves from active role assignments, never from a
  client-supplied parameter.
- **Scope isolation** — `core.can_view_staff_record()` is the single definition of
  supervisory visibility. Defining it once means it cannot drift between tables.
- **Time-bounded authority** — assignments carry `valid_from`/`valid_to`; expired
  authority stops working without anyone remembering to revoke it.
- **`SECURITY DEFINER` hygiene** — every definer function sets `search_path = ''`. A
  definer function with a mutable search path is a privilege-escalation vector.
- **Schema exposure** — PostgREST serves only the schemas named in
  `supabase/config.toml`.
- **Service-role containment** — `src/lib/supabase/admin.ts` bypasses RLS and is
  blocked by ESLint from being imported outside its narrow legitimate uses
  (provisioning, seeding, scheduled regulatory review). Every call through it must
  write an audit entry with source `system`.

### Session policy

`supabase/config.toml` sets a 24-hour session timebox and an 8-hour inactivity
timeout, with refresh-token rotation and a 10-second reuse interval. Staff
self-signup is disabled: accounts are provisioned by the school.

## 4. Auditability

`audit.audit_log` is append-only — `UPDATE` and `DELETE` blocked by trigger and by
revoked privileges. A correction is a new row.

Each high-impact action records: actor, the role they acted under (stored as text so
it survives renaming), action, entity, previous value, new value, reason, source,
policy version, requirement version, academic year, request id, IP address and user
agent.

Audited from Stage 1: the school regulatory profile, role assignments, role
permissions, requirement versions, regulatory sources, per-school requirement
determinations, and teacher profiles.

**A teacher can read audit entries concerning their own record.** "What was changed
on my file, and by whom?" should be answerable by the person it concerns. This is a
privacy feature as much as a security one.

## 5. DPDP Act, 2023

**Status: `REQUIRES VERIFICATION`.** The Act's full text and the current
commencement and Rules position were not confirmed during Stage 1. It is treated as
**design input**, not as a set of enforced platform rules. Legal advice should
confirm the school's obligations. See [`REGULATORY_MATRIX.md`](REGULATORY_MATRIX.md)
§A6.

Working assumptions for engineering, to be confirmed:

- The school is the **Data Fiduciary** for staff personal data; the platform
  processes it on the school's behalf.
- Staff are **Data Principals** with rights to information, correction and erasure,
  and access to grievance redressal.
- The fiduciary must be able to evidence that notice was given.

Controls already built on that basis:

| Obligation           | Control                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Evidence of notice   | `core.app_user.privacy_notice_version` and `privacy_notice_accepted_at`                   |
| Purpose limitation   | Data model carries no field without a stated professional-development purpose             |
| Accuracy             | Teachers can maintain their own factual details; verification remains an HR act           |
| Security safeguards  | RLS, schema isolation, service-role containment, security headers, TLS                    |
| Breach detectability | Append-only audit trail                                                                   |
| Data residency       | `DATA_REGION` recorded in environment configuration so deployment reviews can evidence it |

Outstanding programme items are listed in §9.

## 6. Retention

**Not yet decided — this is a gap.** Retention must be set with the school and its
legal adviser, because it interacts with service-record obligations that are
themselves unverified (CBSE Bye-Laws, Punjab Act 18 of 1979).

Positions to establish:

- How long assessment and observation records are kept after a teacher leaves.
- Whether increment recommendations and approvals have a separate, longer period as
  employment records.
- What is deleted, what is anonymised, and what is retained because a statutory
  service-record obligation requires it.
- Audit log retention — likely the longest, since it evidences everything else.

Until this is decided the platform deletes nothing automatically. Deleting on a
guessed schedule is worse than retaining pending a decision.

## 7. Evidence files

Stored in Supabase Storage. **Implemented in Stage 3** (migration `0029`):

| Requirement                                      | Position                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bucket policies mirroring the RLS scope rules    | **Done.** The storage policies call the same `core.can_view_staff_record()` the evidence table's RLS uses, so a file cannot be reachable by someone who cannot read its row. A test asserts the policy expression references that function |
| Content-type validation and size limits          | **Done.** 50 MiB cap and an allow-list of MIME types on the bucket                                                                                                                                                                         |
| No public buckets; signed URLs with short expiry | **Done.** The bucket is private; files are served only through 5-minute signed URLs created server-side with the caller's session                                                                                                          |
| Filenames must not leak personal data            | **Partial.** Filenames are sanitised to a safe character set, but a teacher can still name a file after a student. Submission guidance warns about this; it is not enforced                                                                |
| Malware scanning before a file is served back    | **Outstanding.** The main remaining reason for caution before enabling upload for real users                                                                                                                                               |

Ownership is decided by the storage path itself —
`<teacher_profile_id>/<evidence_id>/<filename>` — so the first segment is part of
the security model, not a convention. Deletion closes once evidence is
submitted, so a verified review decision can never point at a file that has been
removed.

## 8. Application security

Implemented in `next.config.mjs`: `X-Frame-Options: DENY`, `X-Content-Type-Options:
nosniff`, `Referrer-Policy: same-origin`, a restrictive `Permissions-Policy`, and
HSTS with preload. `poweredByHeader` disabled.

Outstanding for Stage 2:

- Content Security Policy with nonces.
- Rate limiting on authentication endpoints.
- CSRF protection review for server actions.
- Dependency scanning in CI.

## 9. Outstanding programme items

| #   | Item                                                    | Stage       | Note                                                                                                        |
| --- | ------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Data retention schedule agreed with the school          | Stage 2     | Blocks nothing technically; blocks a defensible privacy position                                            |
| 2   | Privacy notice drafted and versioned                    | Stage 2     | The `privacy_notice_version` field is ready for it                                                          |
| 3   | Grievance redressal contact and process                 | Stage 2     | DPDP working assumption                                                                                     |
| 4   | Legal confirmation of DPDP obligations and commencement | Stage 2     | Depends on external advice                                                                                  |
| 5   | Data Processing Agreement between school and platform   | Stage 2     |                                                                                                             |
| 6   | ~~Storage bucket policies~~                             | ~~Stage 3~~ | **Done** — migration `0029`. Private bucket, policies mirroring `can_view_staff_record()`, signed URLs only |
| 7   | Content Security Policy                                 | Stage 2     |                                                                                                             |
| 8   | Playwright scope-isolation suite                        | Stage 2     | Proves §3 rather than asserting it                                                                          |
| 9   | Penetration test before production                      | Stage 6     |                                                                                                             |
| 10  | Incident response runbook                               | Stage 6     |                                                                                                             |

## 10. Threats specifically considered

| Threat                                               | Control                                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A manager reads staff outside their department       | `can_view_staff_record()` in RLS; to be proven by E2E tests                                                                                         |
| Cross-tenant leakage                                 | `school_id` on every table; `is_member_of()` in every policy; trigger-validated scope targets                                                       |
| A developer's careless query leaks data              | RLS applies to the anon-key client used in all request paths                                                                                        |
| Service-role key used in a request path              | ESLint import restriction; browser construction throws; audit requirement                                                                           |
| Silent tampering with an appraisal record            | Append-only audit; immutable requirement versions; ruleset snapshots                                                                                |
| Retroactive rule change altering a past decision     | `ruleset_snapshot` + `recalculation_authorisation` + `may_recalculate_year()`                                                                       |
| Administrator self-elevation                         | Unavoidable with `rbac.manage`; mitigated by trigger-audited assignment changes and `audit.read` held independently by the Compliance Administrator |
| Appraisal used for undisclosed disciplinary purposes | Out of scope by product design; separation of appraisal and compensation permissions; full teacher visibility of their own record                   |
