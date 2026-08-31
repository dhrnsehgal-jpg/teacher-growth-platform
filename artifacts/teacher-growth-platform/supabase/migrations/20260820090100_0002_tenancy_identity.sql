-- ===========================================================================
-- 0002 — Tenancy and identity
-- ===========================================================================
-- Multi-school from day one. Every domain table carries school_id and every
-- policy filters on it, even though the MVP serves a single school.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tenant
-- ---------------------------------------------------------------------------

create table core.school (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique
                      check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  legal_name        text not null,
  display_name      text not null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table core.school is
  'Tenant root. Every record in this database belongs to exactly one school.';

create trigger set_updated_at before update on core.school
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Academic year
-- ---------------------------------------------------------------------------

create table core.academic_year (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  label             text not null,            -- e.g. '2026-27'
  starts_on         date not null,
  ends_on           date not null,
  is_current        boolean not null default false,
  -- Once locked, appraisal outputs for this year are historical record. Any
  -- recalculation requires an explicit authorisation row (migration 0003).
  locked_at         timestamptz,
  locked_by         uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint academic_year_dates_ordered check (ends_on > starts_on),
  constraint academic_year_unique_label unique (school_id, label)
);

comment on column core.academic_year.locked_at is
  'Set when the year closes. Locked years must not be recalculated under rules '
  'introduced after the lock without an explicit authorisation record.';

-- Exactly one current year per school.
create unique index academic_year_one_current
  on core.academic_year (school_id)
  where is_current;

create index academic_year_school_idx on core.academic_year (school_id, starts_on desc);

create trigger set_updated_at before update on core.academic_year
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
-- Mirrors auth.users. Staff accounts are provisioned by the school; signup is
-- disabled in config.toml.

create table core.app_user (
  id                uuid primary key references auth.users(id) on delete restrict,
  email             extensions.citext not null unique,
  full_name         text not null,
  is_active         boolean not null default true,
  -- Set when the user last accepted the privacy notice. DPDP Act, 2023 requires
  -- the fiduciary to be able to evidence notice; see docs/SECURITY_PRIVACY.md.
  privacy_notice_version    text,
  privacy_notice_accepted_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table core.app_user is
  'Application-side user record, 1:1 with auth.users. Deletion is restricted so '
  'that audit rows never point at a missing actor.';

create trigger set_updated_at before update on core.app_user
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Roles and permissions
-- ---------------------------------------------------------------------------
-- Permissions are stable string keys, seeded in 0009 and asserted in TypeScript
-- (src/lib/rbac/permissions.ts). Roles are per-school rows so a school can hold
-- a differently-named equivalent, but the seeded set is shared.

create table core.permission (
  key               text primary key
                      check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  description       text not null,
  -- Permissions that expose pay, increment or other compensation data. These
  -- are granted separately from professional-growth permissions and are
  -- reported on their own line in the RBAC review.
  is_compensation_sensitive boolean not null default false,
  created_at        timestamptz not null default now()
);

comment on column core.permission.is_compensation_sensitive is
  'Compensation/increment visibility is a distinct grant. A manager who can '
  'appraise a teacher does not thereby gain access to their pay outcome.';

create table core.role (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null
                      check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name      text not null,
  description       text,
  -- System roles are seeded and cannot be deleted through the application.
  is_system         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint role_unique_key unique (school_id, key)
);

create trigger set_updated_at before update on core.role
  for each row execute function core.set_updated_at();

create table core.role_permission (
  role_id           uuid not null references core.role(id) on delete cascade,
  permission_key    text not null references core.permission(key) on delete restrict,
  granted_at        timestamptz not null default now(),
  granted_by        uuid references core.app_user(id),
  primary key (role_id, permission_key)
);

-- ---------------------------------------------------------------------------
-- Role assignment (the scoping mechanism)
-- ---------------------------------------------------------------------------

create table core.user_role_assignment (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  user_id           uuid not null references core.app_user(id) on delete cascade,
  role_id           uuid not null references core.role(id) on delete restrict,
  scope_type        core.assignment_scope_type not null default 'school',
  -- References core.department or core.school_stage depending on scope_type.
  -- Not a foreign key because the target table varies; validated by trigger in
  -- migration 0005, once both tables exist.
  scope_id          uuid,
  valid_from        date not null default current_date,
  valid_to          date,
  created_at        timestamptz not null default now(),
  created_by        uuid references core.app_user(id),
  updated_at        timestamptz not null default now(),
  constraint role_assignment_period_ordered
    check (valid_to is null or valid_to >= valid_from),
  -- School-wide scope must not carry a scope target; narrower scopes must.
  constraint role_assignment_scope_shape check (
    (scope_type = 'school'     and scope_id is null) or
    (scope_type = 'individual' and scope_id is null) or
    (scope_type in ('department', 'school_stage') and scope_id is not null)
  )
);

comment on table core.user_role_assignment is
  'Grants a role to a user within a school, optionally narrowed to a department '
  'or stage. Assignments are time-bounded so historical authority is auditable: '
  'we can answer "who was entitled to approve this in March 2026?".';

create index role_assignment_user_idx on core.user_role_assignment (user_id, school_id);
create index role_assignment_school_idx on core.user_role_assignment (school_id, role_id);

create trigger set_updated_at before update on core.user_role_assignment
  for each row execute function core.set_updated_at();

-- Explicit teacher lists for scope_type = 'individual' (mentors, acting cover).
create table core.role_assignment_subject_user (
  assignment_id     uuid not null references core.user_role_assignment(id) on delete cascade,
  subject_user_id   uuid not null references core.app_user(id) on delete cascade,
  primary key (assignment_id, subject_user_id)
);

comment on table core.role_assignment_subject_user is
  'The explicit set of staff covered by an individual-scope assignment.';

-- ---------------------------------------------------------------------------
-- Authorisation helpers
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so that policies can call them without recursing into the
-- RLS on the very tables they read. search_path is pinned: a SECURITY DEFINER
-- function with a mutable search_path is a privilege-escalation vector.

create or replace function core.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select auth.uid();
$$;

create or replace function core.user_school_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct ura.school_id
  from core.user_role_assignment ura
  where ura.user_id = auth.uid()
    and ura.valid_from <= current_date
    and (ura.valid_to is null or ura.valid_to >= current_date);
$$;

comment on function core.user_school_ids() is
  'Schools the current user currently holds an active assignment in. The tenant '
  'boundary: every RLS policy filters school_id through this.';

create or replace function core.is_member_of(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from core.user_school_ids() s where s = p_school_id);
$$;

create or replace function core.has_permission(p_school_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from core.user_role_assignment ura
    join core.role_permission rp on rp.role_id = ura.role_id
    where ura.user_id = auth.uid()
      and ura.school_id = p_school_id
      and rp.permission_key = p_permission
      and ura.valid_from <= current_date
      and (ura.valid_to is null or ura.valid_to >= current_date)
  );
$$;

comment on function core.has_permission(uuid, text) is
  'True when the current user holds p_permission anywhere in p_school_id, at any '
  'scope. Row visibility is then narrowed by core.can_view_staff_record().';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table core.school                     enable row level security;
alter table core.academic_year              enable row level security;
alter table core.app_user                   enable row level security;
alter table core.permission                 enable row level security;
alter table core.role                       enable row level security;
alter table core.role_permission            enable row level security;
alter table core.user_role_assignment       enable row level security;
alter table core.role_assignment_subject_user enable row level security;

-- A user sees the schools they belong to, and nothing else.
create policy school_select_own on core.school
  for select using (core.is_member_of(id));

create policy school_update_admin on core.school
  for update using (core.has_permission(id, 'school.manage'))
  with check (core.has_permission(id, 'school.manage'));

create policy academic_year_select on core.academic_year
  for select using (core.is_member_of(school_id));

create policy academic_year_write on core.academic_year
  for all using (core.has_permission(school_id, 'school.manage'))
  with check (core.has_permission(school_id, 'school.manage'));

-- Users see themselves, plus colleagues in schools where they hold the
-- directory permission. Contact details beyond this go through teacher_profile.
create policy app_user_select_self on core.app_user
  for select using (id = auth.uid());

create policy app_user_select_colleagues on core.app_user
  for select using (
    exists (
      select 1
      from core.user_role_assignment ura
      where ura.user_id = app_user.id
        and core.has_permission(ura.school_id, 'staff_directory.read')
    )
  );

create policy app_user_update_self on core.app_user
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- The permission catalogue is reference data, readable by any signed-in user so
-- the UI can explain what a role grants.
create policy permission_select_all on core.permission
  for select to authenticated using (true);

create policy role_select on core.role
  for select using (core.is_member_of(school_id));

create policy role_write on core.role
  for all using (core.has_permission(school_id, 'rbac.manage'))
  with check (core.has_permission(school_id, 'rbac.manage'));

create policy role_permission_select on core.role_permission
  for select using (
    exists (select 1 from core.role r
            where r.id = role_permission.role_id and core.is_member_of(r.school_id))
  );

create policy role_permission_write on core.role_permission
  for all using (
    exists (select 1 from core.role r
            where r.id = role_permission.role_id
              and core.has_permission(r.school_id, 'rbac.manage'))
  )
  with check (
    exists (select 1 from core.role r
            where r.id = role_permission.role_id
              and core.has_permission(r.school_id, 'rbac.manage'))
  );

-- A user may always see their own assignments — "what am I entitled to do?" is
-- a question every teacher should be able to answer about themselves.
create policy role_assignment_select_self on core.user_role_assignment
  for select using (user_id = auth.uid());

create policy role_assignment_select_admin on core.user_role_assignment
  for select using (core.has_permission(school_id, 'rbac.read'));

create policy role_assignment_write on core.user_role_assignment
  for all using (core.has_permission(school_id, 'rbac.manage'))
  with check (core.has_permission(school_id, 'rbac.manage'));

create policy role_assignment_subject_select on core.role_assignment_subject_user
  for select using (
    subject_user_id = auth.uid()
    or exists (
      select 1 from core.user_role_assignment ura
      where ura.id = role_assignment_subject_user.assignment_id
        and (ura.user_id = auth.uid() or core.has_permission(ura.school_id, 'rbac.read'))
    )
  );

create policy role_assignment_subject_write on core.role_assignment_subject_user
  for all using (
    exists (select 1 from core.user_role_assignment ura
            where ura.id = role_assignment_subject_user.assignment_id
              and core.has_permission(ura.school_id, 'rbac.manage'))
  )
  with check (
    exists (select 1 from core.user_role_assignment ura
            where ura.id = role_assignment_subject_user.assignment_id
              and core.has_permission(ura.school_id, 'rbac.manage'))
  );
