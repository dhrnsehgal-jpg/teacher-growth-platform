-- ===========================================================================
-- 0006 — Append-only audit trail and notifications
-- ===========================================================================
-- Appraisal and increment decisions affect people's careers and pay. Every
-- high-impact action records who did it, what changed, why, and under which
-- policy version — and that record cannot later be edited or removed.
-- ===========================================================================

create type audit.event_source as enum (
  'ui',          -- A person acting in the application
  'api',         -- An integration acting with a service credential
  'system',      -- A scheduled or triggered internal process
  'import',      -- Bulk data load
  'migration'    -- Schema or data migration
);

create table audit.audit_log (
  id                bigint generated always as identity primary key,
  school_id         uuid references core.school(id) on delete restrict,

  -- Actor. Nullable only for 'system' and 'migration' events.
  actor_user_id     uuid references core.app_user(id) on delete restrict,
  -- The role the actor was acting under, captured as text so the entry stays
  -- readable after the role is renamed or removed.
  actor_role_key    text,

  action            text not null
                      check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  entity_schema     text,
  entity_table      text,
  entity_id         text,

  previous_value    jsonb,
  new_value         jsonb,

  -- Required for actions the application classifies as reason-bearing
  -- (overrides, increment recommendations, recalculation of a closed year).
  reason            text,

  source            audit.event_source not null default 'ui',
  -- Which policy/regulatory version the action was taken under. Free text plus
  -- an optional hard reference, because some actions sit under a school policy
  -- version and others under a specific requirement version.
  policy_version    text,
  requirement_id    uuid references regulatory.requirement(id) on delete restrict,
  academic_year_id  uuid references core.academic_year(id) on delete restrict,

  request_id        text,
  ip_address        inet,
  user_agent        text,

  occurred_at       timestamptz not null default now(),

  constraint audit_actor_present_for_human_sources check (
    source in ('system', 'migration') or actor_user_id is not null
  )
);

comment on table audit.audit_log is
  'Append-only. UPDATE and DELETE are blocked by trigger and by revoked '
  'privileges. Rows are never rewritten; a correction is a new row.';

comment on column audit.audit_log.policy_version is
  'The policy or regulatory version in force when the action was taken. Without '
  'this, a historical decision cannot be explained once rules change.';

create index audit_log_school_time_idx on audit.audit_log (school_id, occurred_at desc);
create index audit_log_entity_idx on audit.audit_log (entity_schema, entity_table, entity_id);
create index audit_log_actor_idx on audit.audit_log (actor_user_id, occurred_at desc);
create index audit_log_action_idx on audit.audit_log (action, occurred_at desc);

create trigger audit_log_append_only
  before update or delete on audit.audit_log
  for each row execute function core.reject_mutation();

-- ---------------------------------------------------------------------------
-- Writing audit entries
-- ---------------------------------------------------------------------------

create or replace function audit.log_event(
  p_school_id       uuid,
  p_action          text,
  p_entity_schema   text default null,
  p_entity_table    text default null,
  p_entity_id       text default null,
  p_previous_value  jsonb default null,
  p_new_value       jsonb default null,
  p_reason          text default null,
  p_source          audit.event_source default 'ui',
  p_policy_version  text default null,
  p_requirement_id  uuid default null,
  p_academic_year_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_role_key text;
begin
  -- Record the most specific role the actor currently holds in this school.
  select r.key into v_role_key
  from core.user_role_assignment ura
  join core.role r on r.id = ura.role_id
  where ura.user_id = auth.uid()
    and ura.school_id = p_school_id
    and ura.valid_from <= current_date
    and (ura.valid_to is null or ura.valid_to >= current_date)
  order by case ura.scope_type
             when 'individual' then 1
             when 'department' then 2
             when 'school_stage' then 3
             when 'school' then 4
           end
  limit 1;

  insert into audit.audit_log (
    school_id, actor_user_id, actor_role_key, action,
    entity_schema, entity_table, entity_id,
    previous_value, new_value, reason, source,
    policy_version, requirement_id, academic_year_id
  )
  values (
    p_school_id, auth.uid(), v_role_key, p_action,
    p_entity_schema, p_entity_table, p_entity_id,
    p_previous_value, p_new_value, p_reason, p_source,
    p_policy_version, p_requirement_id, p_academic_year_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Generic row-change trigger. Attach to any table carrying school_id:
--   create trigger audit_changes after insert or update or delete on <table>
--     for each row execute function audit.record_row_change();
create or replace function audit.record_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  v_school_id := coalesce(
    (v_new ->> 'school_id')::uuid,
    (v_old ->> 'school_id')::uuid
  );

  insert into audit.audit_log (
    school_id, actor_user_id, action,
    entity_schema, entity_table, entity_id,
    previous_value, new_value, source
  )
  values (
    v_school_id,
    auth.uid(),
    lower(tg_table_name) || '.' || lower(tg_op),
    tg_table_schema,
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    v_old,
    v_new,
    case when auth.uid() is null then 'system' else 'ui' end::audit.event_source
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function audit.record_row_change() is
  'Generic auditing trigger. Attached in this migration to the tables whose '
  'change history is itself regulated: the regulatory profile, requirement '
  'determinations and role assignments.';

-- ---------------------------------------------------------------------------
-- Audited tables (Stage 1 set)
-- ---------------------------------------------------------------------------

create trigger audit_changes
  after insert or update or delete on core.school_regulatory_profile
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on core.user_role_assignment
  for each row execute function audit.record_row_change();

-- core.role_permission carries neither `id` nor `school_id`, so the generic
-- trigger cannot attribute it to a tenant. Without attribution the entry would
-- be written but unreadable, since the audit policies filter on school_id.
create or replace function audit.record_role_permission_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row      record := coalesce(new, old);
  v_school_id uuid;
begin
  select r.school_id into v_school_id
  from core.role r
  where r.id = v_row.role_id;

  insert into audit.audit_log (
    school_id, actor_user_id, action,
    entity_schema, entity_table, entity_id,
    previous_value, new_value, source
  )
  values (
    v_school_id,
    auth.uid(),
    'role_permission.' || lower(tg_op),
    'core', 'role_permission',
    v_row.role_id::text || ':' || v_row.permission_key,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    case when auth.uid() is null then 'system' else 'ui' end::audit.event_source
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger audit_changes
  after insert or update or delete on core.role_permission
  for each row execute function audit.record_role_permission_change();

create trigger audit_changes
  after insert or update or delete on regulatory.school_requirement_status
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on regulatory.requirement
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on regulatory.source
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on core.teacher_profile
  for each row execute function audit.record_row_change();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create table core.notification (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  recipient_user_id uuid not null references core.app_user(id) on delete cascade,
  category          text not null
                      check (category in (
                        'regulatory_review_due', 'verification_required',
                        'assessment', 'cpd', 'development_plan',
                        'approval_request', 'system'
                      )),
  title             text not null,
  body              text,
  -- Deep link within the application.
  link_path         text,
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index notification_recipient_idx
  on core.notification (recipient_user_id, created_at desc)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

alter table audit.audit_log      enable row level security;
alter table core.notification    enable row level security;

-- Nobody writes the audit log directly; only the SECURITY DEFINER functions do.
revoke insert, update, delete on audit.audit_log from anon, authenticated;
revoke all on audit.audit_log from anon;

-- Compliance/system administrators read the school's trail. A teacher reads
-- entries about their own record, so "what was changed on my file, by whom" is
-- answerable by the person it concerns.
create policy audit_log_select_admin on audit.audit_log
  for select using (
    school_id is not null and core.has_permission(school_id, 'audit.read')
  );

create policy audit_log_select_own on audit.audit_log
  for select using (
    actor_user_id = auth.uid()
    or (
      entity_schema = 'core'
      and entity_table = 'teacher_profile'
      and exists (
        select 1 from core.teacher_profile tp
        where tp.id::text = audit_log.entity_id
          and tp.user_id = auth.uid()
      )
    )
  );

-- Changes to *global* regulatory reference data carry no school_id, so the
-- tenant-scoped policy above would hide them from everyone. Anyone entitled to
-- read the regulatory register in any school may read its change history.
create policy audit_log_select_global_regulatory on audit.audit_log
  for select using (
    school_id is null
    and entity_schema = 'regulatory'
    and exists (
      select 1 from core.user_school_ids() s
      where core.has_permission(s, 'regulatory.read')
    )
  );

-- Recipient match alone would already be tighter than tenancy, but the tenant
-- filter is stated explicitly so that every table carrying school_id is visibly
-- bounded by it — and so that access ends when someone leaves the school.
create policy notification_select_own on core.notification
  for select using (
    recipient_user_id = auth.uid() and core.is_member_of(school_id)
  );

-- Marking as read. The WITH CHECK keeps the row on the same recipient.
create policy notification_update_own on core.notification
  for update using (
    recipient_user_id = auth.uid() and core.is_member_of(school_id)
  )
  with check (
    recipient_user_id = auth.uid() and core.is_member_of(school_id)
  );

-- No INSERT or DELETE policy by design: notifications are raised by internal
-- processes through the service-role client, never by a signed-in user, and
-- they are not deletable by their recipient.
