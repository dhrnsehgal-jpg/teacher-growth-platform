-- ===========================================================================
-- 0055 — Reading the trails
-- ===========================================================================
-- Both trails record WHO did something as a `core.app_user` id, and both live
-- in their own schema. PostgREST cannot embed across schemas, so the name has
-- to be joined in the database or fetched in a second round-trip and stitched
-- together by hand — the same problem migration 0019 solved for two other
-- reads, solved the same way.
--
-- `security_invoker = true` is what makes this safe. The view runs with the
-- CALLER's privileges, so the policies on `audit.audit_log` and
-- `privacy.access_log` still decide what comes back. Without it the view would
-- run as its owner and become a way around RLS — for an audit log, which
-- exists precisely to record what people are not otherwise supposed to hide,
-- that would be a serious hole.
-- ===========================================================================

create or replace view audit.audit_log_detail
with (security_invoker = true) as
select
  a.id,
  a.school_id,
  a.action,
  a.entity_schema,
  a.entity_table,
  a.entity_id,
  a.actor_user_id,
  a.actor_role_key,
  a.reason,
  a.source,
  a.occurred_at,
  u.full_name as actor_name
from audit.audit_log a
left join core.app_user u on u.id = a.actor_user_id;

comment on view audit.audit_log_detail is
  'The audit trail with the actor named. security_invoker, so audit_log RLS applies. '
  'Deliberately omits previous_value/new_value: those blobs can carry any column '
  'of any table, including ones the reader has no right to see through their own '
  'permissions, and RLS on the audit row cannot filter inside a jsonb document.';

create or replace view privacy.access_log_detail
with (security_invoker = true) as
select
  l.id,
  l.school_id,
  l.subject_teacher_profile_id,
  l.record_type,
  l.purpose,
  l.occurred_at,
  u.full_name as actor_name
from privacy.access_log l
left join core.app_user u on u.id = l.actor_user_id;

comment on view privacy.access_log_detail is
  'Who opened a teacher''s pay or appraisal record, named. security_invoker, so '
  'the access_log policies decide who sees which rows — a teacher sees their own '
  'subject rows and nothing else.';

grant select on audit.audit_log_detail to authenticated;
grant select on privacy.access_log_detail to authenticated;
