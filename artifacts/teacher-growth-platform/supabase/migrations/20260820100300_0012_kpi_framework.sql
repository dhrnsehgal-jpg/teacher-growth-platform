-- ===========================================================================
-- 0012 — KPI framework
-- ===========================================================================
-- Competency and KPI answer different questions and are deliberately kept apart:
--
--   Competency: how does this teacher demonstrate professional capability?
--   KPI:        what agreed, measurable responsibilities apply this period?
--
-- A teacher can be highly competent and still miss an agreed responsibility,
-- and vice versa. Merging them would make both unreadable.
--
-- Two guards are built in rather than left to policy documents:
--   * `is_student_outcome_measure` is flagged, and the share of a teacher's KPI
--     weight drawn from student outcomes is capped and validated. Student
--     examination marks must never be the sole determinant of teacher
--     effectiveness.
--   * Templates are per school and applicability-scoped. There is no single
--     hard-coded KPI model that every teacher receives.
-- ===========================================================================

create schema if not exists kpi;
comment on schema kpi is 'KPI categories, templates and per-teacher assignments.';

create type kpi.measurement_direction as enum (
  'increase',    -- higher is better
  'decrease',    -- lower is better
  'maintain',    -- hold at or above a threshold
  'qualitative'  -- judged against a described standard, not a number
);

create type kpi.frequency as enum (
  'continuous', 'monthly', 'termly', 'semester', 'annual'
);

create type kpi.assignment_status as enum (
  'draft', 'assigned', 'active', 'closed', 'cancelled'
);

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create table kpi.category (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name              text not null,
  description       text,
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint kpi_category_unique unique (school_id, key),
  constraint kpi_category_id_school unique (id, school_id)
);

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------

create table kpi.template (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  category_id       uuid not null,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name              text not null,
  description       text not null,

  -- How it is measured
  metric            text not null,
  unit              text,
  direction         kpi.measurement_direction not null,
  default_target    text,
  default_weight    numeric(5,2) check (default_weight is null or default_weight >= 0),

  data_source       text not null,
  frequency         kpi.frequency not null,
  evidence_requirement text,

  -- Flagged so the student-outcome share can be capped. See
  -- kpi.validate_teacher_kpi_set().
  is_student_outcome_measure boolean not null default false,

  source_framework  competency.source_framework not null default 'school',
  source_alignment  competency.source_alignment not null default 'school_defined',
  external_reference text,

  status            competency.lifecycle_status not null default 'active',
  retired_at        timestamptz,
  retired_by        uuid references core.app_user(id),
  retirement_reason text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint kpi_template_category_fk foreign key (category_id, school_id)
    references kpi.category(id, school_id) on delete cascade,
  constraint kpi_template_unique unique (school_id, key),
  constraint kpi_template_id_school unique (id, school_id),
  constraint kpi_template_aligned_needs_reference check (
    source_alignment <> 'aligned' or external_reference is not null
  ),
  constraint kpi_template_data_source_stated check (length(btrim(data_source)) >= 3)
);

comment on column kpi.template.data_source is
  'Where the number comes from. Required: a KPI whose data source is not stated '
  'cannot be scored fairly, because nobody can check it.';

comment on column kpi.template.is_student_outcome_measure is
  'True for KPIs derived from student results. The combined weight of these is '
  'capped per teacher so that examination marks are never the sole determinant '
  'of teacher effectiveness.';

create trigger set_updated_at before update on kpi.template
  for each row execute function core.set_updated_at();

-- Which staff a template is offered to. No rows = available to all.
create table kpi.template_applicability (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  template_id       uuid not null,
  teacher_category_id uuid references core.teacher_category(id) on delete cascade,
  school_stage_id   uuid references core.school_stage(id) on delete cascade,
  role_key          text check (role_key ~ '^[a-z][a-z0-9_]*$'),
  created_at        timestamptz not null default now(),

  constraint kpi_template_applicability_fk foreign key (template_id, school_id)
    references kpi.template(id, school_id) on delete cascade,
  constraint kpi_template_applicability_has_dimension check (
    teacher_category_id is not null or school_stage_id is not null or role_key is not null
  )
);

-- ---------------------------------------------------------------------------
-- Per-teacher assignment
-- ---------------------------------------------------------------------------
-- Values are copied from the template at assignment time rather than referenced.
-- A template edited in March must not silently rewrite a KPI agreed in April.

create table kpi.teacher_kpi (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null references core.teacher_profile(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete cascade,
  -- Provenance only. Null for a bespoke KPI agreed with an individual.
  template_id       uuid references kpi.template(id) on delete set null,
  category_id       uuid not null references kpi.category(id) on delete restrict,

  name              text not null,
  description       text not null,
  metric            text not null,
  unit              text,
  direction         kpi.measurement_direction not null,
  target            text not null,
  weight            numeric(5,2) not null check (weight >= 0),
  data_source       text not null,
  frequency         kpi.frequency not null,
  evidence_requirement text,
  is_student_outcome_measure boolean not null default false,

  reviewer_user_id  uuid references core.app_user(id) on delete restrict,
  status            kpi.assignment_status not null default 'draft',

  source_framework  competency.source_framework not null default 'school',
  source_alignment  competency.source_alignment not null default 'school_defined',
  external_reference text,

  assigned_by       uuid references core.app_user(id),
  assigned_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint teacher_kpi_unique unique (teacher_profile_id, academic_year_id, name),
  constraint teacher_kpi_assigned_has_reviewer check (
    status in ('draft', 'cancelled') or reviewer_user_id is not null
  )
);

comment on table kpi.teacher_kpi is
  'One agreed KPI for one teacher for one year. Values are snapshotted from the '
  'template so that later template edits cannot rewrite an agreed target.';

comment on constraint teacher_kpi_assigned_has_reviewer on kpi.teacher_kpi is
  'A KPI cannot leave draft without a named reviewer. An unowned KPI is one '
  'nobody is accountable for reviewing fairly.';

create index teacher_kpi_teacher_idx
  on kpi.teacher_kpi (teacher_profile_id, academic_year_id);
create index teacher_kpi_reviewer_idx on kpi.teacher_kpi (reviewer_user_id);

create trigger set_updated_at before update on kpi.teacher_kpi
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- School KPI policy and validation
-- ---------------------------------------------------------------------------

create table kpi.school_policy (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete cascade,
  -- Cap on the share of total KPI weight that may come from student outcomes.
  max_student_outcome_weight_pct numeric(5,2) not null default 30
    check (max_student_outcome_weight_pct >= 0 and max_student_outcome_weight_pct <= 100),
  require_weights_total_100 boolean not null default true,
  min_kpi_count     integer not null default 3 check (min_kpi_count >= 0),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint kpi_school_policy_unique unique (school_id, academic_year_id)
);

comment on table kpi.school_policy is
  'The school''s own KPI rules. Classified as school policy, never as a CBSE or '
  'State requirement. The default 30%% cap on student-outcome weight is a '
  'starting point for the school to set deliberately.';

create trigger set_updated_at before update on kpi.school_policy
  for each row execute function core.set_updated_at();

-- Returns one row per problem found. Empty result = the KPI set is valid.
create or replace function kpi.validate_teacher_kpi_set(
  p_teacher_profile_id uuid,
  p_academic_year_id uuid
)
returns table (issue_code text, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_policy    kpi.school_policy%rowtype;
  v_total     numeric;
  v_outcome   numeric;
  v_count     integer;
begin
  select tp.school_id into v_school_id
  from core.teacher_profile tp where tp.id = p_teacher_profile_id;

  select * into v_policy from kpi.school_policy p
  where p.school_id = v_school_id and p.academic_year_id = p_academic_year_id;

  select coalesce(sum(k.weight), 0),
         coalesce(sum(k.weight) filter (where k.is_student_outcome_measure), 0),
         count(*)
    into v_total, v_outcome, v_count
  from kpi.teacher_kpi k
  where k.teacher_profile_id = p_teacher_profile_id
    and k.academic_year_id = p_academic_year_id
    and k.status not in ('cancelled', 'draft');

  if v_policy.id is null then
    return query select 'no_policy'::text,
      'No KPI policy is configured for this academic year; validation used defaults.'::text;
    v_policy.max_student_outcome_weight_pct := 30;
    v_policy.require_weights_total_100 := true;
    v_policy.min_kpi_count := 3;
  end if;

  if v_count = 0 then
    return query select 'no_kpis'::text, 'No active KPIs are assigned.'::text;
    return;
  end if;

  if v_count < v_policy.min_kpi_count then
    return query select 'too_few_kpis'::text,
      format('%s KPIs assigned; school policy expects at least %s.',
             v_count, v_policy.min_kpi_count);
  end if;

  if v_policy.require_weights_total_100 and v_total <> 100 then
    return query select 'weights_not_100'::text,
      format('KPI weights total %s, not 100.', v_total);
  end if;

  -- The guard that matters most.
  if v_total > 0 and (v_outcome / v_total * 100) > v_policy.max_student_outcome_weight_pct then
    return query select 'student_outcome_share_exceeded'::text,
      format('Student-outcome measures carry %s%% of total KPI weight; the cap is %s%%. '
             || 'Student examination results must not be the sole or dominant determinant '
             || 'of teacher effectiveness.',
             round(v_outcome / v_total * 100, 1), v_policy.max_student_outcome_weight_pct);
  end if;

  return;
end;
$$;

comment on function kpi.validate_teacher_kpi_set(uuid, uuid) is
  'Checks one teacher''s KPI set against school policy. The student-outcome cap '
  'is enforced here rather than in a policy document nobody reads.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table kpi.category               enable row level security;
alter table kpi.template               enable row level security;
alter table kpi.template_applicability enable row level security;
alter table kpi.teacher_kpi            enable row level security;
alter table kpi.school_policy          enable row level security;

-- Catalogue: readable by every member, writable with kpi.manage.
create policy kpi_category_select on kpi.category
  for select using (core.is_member_of(school_id));
create policy kpi_category_write on kpi.category
  for all using (core.has_permission(school_id, 'kpi.manage'))
  with check (core.has_permission(school_id, 'kpi.manage'));

create policy kpi_template_select on kpi.template
  for select using (core.is_member_of(school_id));
create policy kpi_template_write on kpi.template
  for all using (core.has_permission(school_id, 'kpi.manage'))
  with check (core.has_permission(school_id, 'kpi.manage'));

create policy kpi_template_applicability_select on kpi.template_applicability
  for select using (core.is_member_of(school_id));
create policy kpi_template_applicability_write on kpi.template_applicability
  for all using (core.has_permission(school_id, 'kpi.manage'))
  with check (core.has_permission(school_id, 'kpi.manage'));

create policy kpi_school_policy_select on kpi.school_policy
  for select using (core.is_member_of(school_id));
create policy kpi_school_policy_write on kpi.school_policy
  for all using (core.has_permission(school_id, 'kpi.manage'))
  with check (core.has_permission(school_id, 'kpi.manage'));

-- Assignments follow the same visibility rule as the teacher record itself:
-- your own, or within your authorised scope. A reviewer also sees the KPIs
-- they are named on.
create policy teacher_kpi_select on kpi.teacher_kpi
  for select using (
    core.can_view_staff_record(teacher_profile_id)
    or reviewer_user_id = auth.uid()
  );

-- Assigning requires BOTH the permission and the teacher being in scope.
-- Permission alone would let a Head of Department set KPIs school-wide.
create policy teacher_kpi_write on kpi.teacher_kpi
  for all using (
    core.has_permission(school_id, 'kpi.assign')
    and core.can_view_staff_record(teacher_profile_id)
  )
  with check (
    core.has_permission(school_id, 'kpi.assign')
    and core.can_view_staff_record(teacher_profile_id)
  );

create trigger audit_changes
  after insert or update or delete on kpi.teacher_kpi
  for each row execute function audit.record_row_change();
