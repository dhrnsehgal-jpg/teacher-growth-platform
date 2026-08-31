-- ===========================================================================
-- 0005 — Organisational structure, teacher records, supervisory scope
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Departments and subjects
-- ---------------------------------------------------------------------------

create table core.department (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name      text not null,
  -- A department may be confined to one stage (e.g. a Foundational-stage team).
  school_stage_id   uuid references core.school_stage(id) on delete set null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint department_unique unique (school_id, key)
);

create trigger set_updated_at before update on core.department
  for each row execute function core.set_updated_at();

create table core.subject (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name      text not null,
  department_id     uuid references core.department(id) on delete set null,
  -- CBSE subject code where one exists, for later reconciliation with Board data.
  cbse_subject_code text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint subject_unique unique (school_id, key)
);

-- ---------------------------------------------------------------------------
-- Teacher categories and career levels
-- ---------------------------------------------------------------------------
-- Rows, not enums: the category vocabulary (PRT/TGT/PGT and the school's
-- pre-primary equivalents) is a school-configurable list, and career ladders
-- differ between schools.

create table core.teacher_category (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name      text not null,
  description       text,
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint teacher_category_unique unique (school_id, key)
);

comment on table core.teacher_category is
  'Post categories such as PRT, TGT, PGT and pre-primary equivalents. Minimum '
  'qualification requirements attach to these via regulatory requirements, once '
  'the applicable qualification rules have been verified.';

create table core.career_level (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name      text not null,
  description       text,
  -- Ordered rungs of the school's professional ladder.
  level_order       integer not null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint career_level_unique unique (school_id, key),
  constraint career_level_order_unique unique (school_id, level_order)
);

comment on table core.career_level is
  'The school''s career ladder. Deliberately separate from teacher_category: a '
  'TGT and a PGT can both be at the "Proficient" rung. Progression criteria are '
  'defined in Stage 5, not here.';

-- ---------------------------------------------------------------------------
-- Teacher profile
-- ---------------------------------------------------------------------------

create table core.teacher_profile (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  user_id           uuid not null references core.app_user(id) on delete restrict,

  employee_code     text,
  primary_department_id uuid references core.department(id) on delete set null,
  teacher_category_id   uuid references core.teacher_category(id) on delete set null,
  career_level_id       uuid references core.career_level(id) on delete set null,

  date_of_joining   date,
  employment_status core.employment_status not null default 'active',
  -- Total prior teaching experience in months, outside this school.
  prior_experience_months integer check (prior_experience_months >= 0),

  -- Qualification is recorded as a verification state rather than a boolean:
  -- "we have not checked" and "checked and not met" are different facts, and
  -- only the second should ever be actioned.
  qualification_verification regulatory.verification_status not null
                      default 'requires_verification',
  qualification_verified_by uuid references core.app_user(id),
  qualification_verified_at timestamptz,
  qualification_note        text,

  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint teacher_profile_unique_user unique (school_id, user_id),
  constraint teacher_profile_unique_code unique (school_id, employee_code)
);

comment on table core.teacher_profile is
  'One staff member''s professional record within one school. Personal data '
  'under the DPDP Act, 2023 — see docs/SECURITY_PRIVACY.md for the retention and '
  'access position.';

create index teacher_profile_school_idx on core.teacher_profile (school_id, is_active);
create index teacher_profile_department_idx on core.teacher_profile (primary_department_id);
create index teacher_profile_user_idx on core.teacher_profile (user_id);

create trigger set_updated_at before update on core.teacher_profile
  for each row execute function core.set_updated_at();

-- Teaching allocation. Needed early because it is how a teacher's evidence gets
-- attributed to a subject and stage.
create table core.teacher_teaching_assignment (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null references core.teacher_profile(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete cascade,
  subject_id        uuid references core.subject(id) on delete set null,
  class_level_id    uuid references core.class_level(id) on delete set null,
  school_stage_id   uuid references core.school_stage(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index teaching_assignment_teacher_idx
  on core.teacher_teaching_assignment (teacher_profile_id, academic_year_id);

-- Secondary departments, for staff who teach across teams.
create table core.teacher_department_membership (
  teacher_profile_id uuid not null references core.teacher_profile(id) on delete cascade,
  department_id      uuid not null references core.department(id) on delete cascade,
  primary key (teacher_profile_id, department_id)
);

-- ---------------------------------------------------------------------------
-- Scope validation for role assignments
-- ---------------------------------------------------------------------------
-- core.user_role_assignment.scope_id is a polymorphic reference (department or
-- stage). Both target tables now exist, so it can be validated.

create or replace function core.validate_role_assignment_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.scope_type = 'department' then
    if not exists (
      select 1 from core.department d
      where d.id = new.scope_id and d.school_id = new.school_id
    ) then
      raise exception 'Scope target % is not a department of school %.',
        new.scope_id, new.school_id
        using errcode = 'foreign_key_violation';
    end if;

  elsif new.scope_type = 'school_stage' then
    if not exists (
      select 1 from core.school_stage s
      where s.id = new.scope_id and s.school_id = new.school_id
    ) then
      raise exception 'Scope target % is not a stage of school %.',
        new.scope_id, new.school_id
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_scope
  before insert or update on core.user_role_assignment
  for each row execute function core.validate_role_assignment_scope();

-- ---------------------------------------------------------------------------
-- Supervisory visibility
-- ---------------------------------------------------------------------------
-- The rule the whole product depends on: a teacher sees their own record; a
-- manager sees only the staff inside their authorised scope.

create or replace function core.can_view_staff_record(p_teacher_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select tp.id, tp.school_id, tp.user_id, tp.primary_department_id
    from core.teacher_profile tp
    where tp.id = p_teacher_profile_id
  )
  select exists (
    -- 1. Your own record.
    select 1 from target t where t.user_id = auth.uid()
  )
  or exists (
    -- 2. An active assignment whose scope reaches this teacher, held by someone
    --    with permission to read staff professional records.
    select 1
    from target t
    join core.user_role_assignment ura
      on ura.user_id = auth.uid()
     and ura.school_id = t.school_id
     and ura.valid_from <= current_date
     and (ura.valid_to is null or ura.valid_to >= current_date)
    join core.role_permission rp
      on rp.role_id = ura.role_id
     and rp.permission_key = 'teacher_record.read.scope'
    where
      case ura.scope_type
        when 'school' then true
        when 'department' then
          ura.scope_id = t.primary_department_id
          or exists (
            select 1 from core.teacher_department_membership tdm
            where tdm.teacher_profile_id = t.id
              and tdm.department_id = ura.scope_id
          )
        when 'school_stage' then
          exists (
            select 1
            from core.teacher_teaching_assignment tta
            where tta.teacher_profile_id = t.id
              and tta.school_stage_id = ura.scope_id
          )
          or exists (
            select 1 from core.department d
            where d.id = t.primary_department_id
              and d.school_stage_id = ura.scope_id
          )
        when 'individual' then
          exists (
            select 1 from core.role_assignment_subject_user rasu
            where rasu.assignment_id = ura.id
              and rasu.subject_user_id = t.user_id
          )
        else false
      end
  );
$$;

comment on function core.can_view_staff_record(uuid) is
  'Single source of truth for supervisory visibility. Every table holding a '
  'teacher''s professional data filters through this, so scope rules are changed '
  'in one place rather than replicated across policies.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table core.department                    enable row level security;
alter table core.subject                       enable row level security;
alter table core.teacher_category              enable row level security;
alter table core.career_level                  enable row level security;
alter table core.teacher_profile               enable row level security;
alter table core.teacher_teaching_assignment   enable row level security;
alter table core.teacher_department_membership enable row level security;

-- Structural reference data is visible to all members of the school.
create policy department_select on core.department
  for select using (core.is_member_of(school_id));
create policy department_write on core.department
  for all using (core.has_permission(school_id, 'school.manage'))
  with check (core.has_permission(school_id, 'school.manage'));

create policy subject_select on core.subject
  for select using (core.is_member_of(school_id));
create policy subject_write on core.subject
  for all using (core.has_permission(school_id, 'school.manage'))
  with check (core.has_permission(school_id, 'school.manage'));

create policy teacher_category_select on core.teacher_category
  for select using (core.is_member_of(school_id));
create policy teacher_category_write on core.teacher_category
  for all using (core.has_permission(school_id, 'school.manage'))
  with check (core.has_permission(school_id, 'school.manage'));

create policy career_level_select on core.career_level
  for select using (core.is_member_of(school_id));
create policy career_level_write on core.career_level
  for all using (core.has_permission(school_id, 'school.manage'))
  with check (core.has_permission(school_id, 'school.manage'));

-- Teacher records: self, or within authorised scope.
create policy teacher_profile_select on core.teacher_profile
  for select using (core.can_view_staff_record(id));

-- A teacher may maintain their own factual details; qualification verification
-- is an HR act and is blocked from self-service by the check below.
create policy teacher_profile_update_self on core.teacher_profile
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and qualification_verification = 'requires_verification'
  );

create policy teacher_profile_manage on core.teacher_profile
  for all using (core.has_permission(school_id, 'teacher_record.manage'))
  with check (core.has_permission(school_id, 'teacher_record.manage'));

create policy teaching_assignment_select on core.teacher_teaching_assignment
  for select using (core.can_view_staff_record(teacher_profile_id));
create policy teaching_assignment_write on core.teacher_teaching_assignment
  for all using (core.has_permission(school_id, 'teacher_record.manage'))
  with check (core.has_permission(school_id, 'teacher_record.manage'));

create policy department_membership_select on core.teacher_department_membership
  for select using (core.can_view_staff_record(teacher_profile_id));
create policy department_membership_write on core.teacher_department_membership
  for all using (
    exists (select 1 from core.teacher_profile tp
            where tp.id = teacher_department_membership.teacher_profile_id
              and core.has_permission(tp.school_id, 'teacher_record.manage'))
  )
  with check (
    exists (select 1 from core.teacher_profile tp
            where tp.id = teacher_department_membership.teacher_profile_id
              and core.has_permission(tp.school_id, 'teacher_record.manage'))
  );
