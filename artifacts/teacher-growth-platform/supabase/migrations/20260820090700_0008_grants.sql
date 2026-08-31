-- ===========================================================================
-- 0008 — Role privileges for the custom schemas
-- ===========================================================================
-- Supabase grants default privileges on `public` to anon/authenticated, but NOT
-- on custom schemas. Without the grants below every query from a signed-in user
-- fails with "permission denied for schema core" *before* RLS is consulted, so
-- the policies never run at all.
--
-- The privilege model here is the standard Supabase one, and it only works
-- because of the second half of it:
--
--   * table privileges are broad — SELECT/INSERT/UPDATE/DELETE for authenticated
--   * Row Level Security is the actual access boundary, and it is enabled on
--     every table in these schemas
--
-- Granting a privilege therefore does not grant access; it grants the right to
-- have a policy evaluated. Anything without a matching policy still returns
-- nothing.
--
-- `anon` receives NOTHING. There is no unauthenticated view of this product:
-- staff accounts are provisioned by the school and signup is disabled.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Schema usage
-- ---------------------------------------------------------------------------

grant usage on schema core        to authenticated, service_role;
grant usage on schema regulatory  to authenticated, service_role;
grant usage on schema audit       to authenticated, service_role;

-- Explicitly withhold from anon, so a misconfigured client cannot read
-- reference data without a session.
revoke all on schema core        from anon;
revoke all on schema regulatory  from anon;
revoke all on schema audit       from anon;

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema core       to authenticated;
grant select, insert, update, delete on all tables in schema regulatory to authenticated;
grant all on all tables in schema core       to service_role;
grant all on all tables in schema regulatory to service_role;
grant all on all tables in schema audit      to service_role;

grant usage, select on all sequences in schema core       to authenticated, service_role;
grant usage, select on all sequences in schema regulatory to authenticated, service_role;
grant usage, select on all sequences in schema audit      to service_role;

-- ---------------------------------------------------------------------------
-- Narrower grants where the table is not meant to be written through the API
-- ---------------------------------------------------------------------------

-- The permission catalogue is global reference data with no write policy.
revoke insert, update, delete on core.permission from authenticated;

-- Append-only: readable, insertable, never amendable. The triggers enforce this
-- too; the privileges make the intent explicit and survive a stray policy.
revoke update, delete on regulatory.ruleset_snapshot from authenticated;
revoke update, delete on regulatory.recalculation_authorisation from authenticated;

-- The audit trail is read-only to every application role. Entries are written
-- exclusively by the SECURITY DEFINER functions in migration 0006.
grant select on audit.audit_log to authenticated;
revoke insert, update, delete on audit.audit_log from authenticated;

-- Staff cannot delete their own notifications; they mark them read.
revoke insert, delete on core.notification from authenticated;

-- ---------------------------------------------------------------------------
-- Default privileges for tables added in later stages
-- ---------------------------------------------------------------------------
-- Without these, every Stage 2–6 migration would have to remember to grant, and
-- the first one that forgot would reintroduce exactly the bug this migration
-- fixes. Note that RLS still has to be enabled and a policy written for a new
-- table to be reachable — these defaults grant the right to be filtered, not
-- the right to read.

alter default privileges in schema core
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema regulatory
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema core       grant all on tables to service_role;
alter default privileges in schema regulatory grant all on tables to service_role;
alter default privileges in schema audit      grant all on tables to service_role;

alter default privileges in schema core
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema regulatory
  grant usage, select on sequences to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Function execution
-- ---------------------------------------------------------------------------
-- EXECUTE defaults to PUBLIC, but stating it means a future REVOKE ... FROM
-- PUBLIC cannot silently break authorisation for signed-in users.

grant execute on function core.current_user_id()                      to authenticated;
grant execute on function core.user_school_ids()                      to authenticated;
grant execute on function core.is_member_of(uuid)                     to authenticated;
grant execute on function core.has_permission(uuid, text)             to authenticated;
grant execute on function core.can_view_staff_record(uuid)            to authenticated;
grant execute on function core.employment_compliance_enabled(uuid)    to authenticated;
grant execute on function core.employment_gate_message()              to authenticated;
grant execute on function regulatory.is_enforceable_for_school(uuid, text, date)
                                                                      to authenticated;
grant execute on function regulatory.requirement_as_of(text, date)    to authenticated;
grant execute on function regulatory.may_recalculate_year(uuid, uuid) to authenticated;

-- Provisioning is an administrative operation, not an API surface.
revoke all on function core.provision_school_roles(uuid) from public, anon, authenticated;
grant execute on function core.provision_school_roles(uuid) to service_role;
