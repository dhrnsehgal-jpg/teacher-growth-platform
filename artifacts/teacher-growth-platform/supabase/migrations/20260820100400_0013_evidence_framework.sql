-- ===========================================================================
-- 0013 — Evidence framework and professional goals
-- ===========================================================================
-- One physical artefact, many meanings. A single classroom observation can
-- speak to assessment practice, inclusion and questioning technique at once.
-- The file is stored ONCE in evidence.evidence and linked as many times as it
-- is relevant through evidence.evidence_link.
--
-- Duplicating the file per competency would multiply storage, multiply the
-- privacy surface, and — worst — let two copies of the same artefact drift into
-- different review outcomes.
-- ===========================================================================

create schema if not exists evidence;
create schema if not exists growth;

comment on schema evidence is 'Evidence artefacts, their review lifecycle, and what they demonstrate.';
comment on schema growth  is 'Teacher-owned professional goals. Extended with plans and impact in later stages.';

create type evidence.status as enum (
  'draft',
  'submitted',
  'under_review',
  'verified',
  'returned_for_clarification',
  'rejected'
);

-- ---------------------------------------------------------------------------
-- Evidence types
-- ---------------------------------------------------------------------------
-- Rows, not an enum: the school extends this list without a migration.

create table evidence.evidence_type (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name              text not null,
  description       text,
  -- Guidance shown to the teacher when submitting this type.
  submission_guidance text,
  -- Some evidence is inherently about a third party (student work) and carries
  -- extra privacy obligations. Flagged so the UI can warn at upload time.
  contains_student_data boolean not null default false,
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint evidence_type_unique unique (school_id, key),
  constraint evidence_type_id_school unique (id, school_id)
);

comment on column evidence.evidence_type.contains_student_data is
  'Student work samples and assessment designs may carry identifiable student '
  'data. Flagged so submission can prompt for anonymisation — see '
  'docs/SECURITY_PRIVACY.md.';

-- ---------------------------------------------------------------------------
-- Evidence
-- ---------------------------------------------------------------------------

create table evidence.evidence (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null references core.teacher_profile(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete restrict,
  evidence_type_id  uuid not null references evidence.evidence_type(id) on delete restrict,

  title             text not null check (length(btrim(title)) >= 3),
  description       text,
  -- Teacher's own statement of what this demonstrates and why.
  reflection        text,

  -- The artefact itself. Supabase Storage object, or null for evidence that is
  -- purely narrative (a reflection, a mentoring log).
  storage_bucket    text,
  storage_path      text,
  file_name         text,
  file_size_bytes   bigint check (file_size_bytes is null or file_size_bytes >= 0),
  content_type      text,

  occurred_on       date,

  status            evidence.status not null default 'draft',
  submitted_at      timestamptz,
  reviewed_by       uuid references core.app_user(id),
  reviewed_at       timestamptz,
  review_note       text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint evidence_storage_complete check (
    (storage_path is null) = (storage_bucket is null)
  ),
  constraint evidence_submitted_has_timestamp check (
    status = 'draft' or submitted_at is not null
  ),
  -- A reviewer decision must say who and when, and an adverse or returned
  -- outcome must say why.
  constraint evidence_review_recorded check (
    status not in ('verified', 'rejected', 'returned_for_clarification')
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint evidence_adverse_outcome_has_reason check (
    status not in ('rejected', 'returned_for_clarification')
    or (review_note is not null and length(btrim(review_note)) >= 10)
  )
);

comment on constraint evidence_adverse_outcome_has_reason on evidence.evidence is
  'Returning or rejecting evidence requires a written reason. A developmental '
  'platform must never hand back a bare refusal.';

create index evidence_teacher_idx
  on evidence.evidence (teacher_profile_id, academic_year_id, status);
create index evidence_review_queue_idx
  on evidence.evidence (school_id, status) where status in ('submitted', 'under_review');

create trigger set_updated_at before update on evidence.evidence
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Linking — one artefact, many meanings
-- ---------------------------------------------------------------------------

create table evidence.evidence_link (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  evidence_id       uuid not null references evidence.evidence(id) on delete cascade,

  -- Exactly one target.
  competency_id     uuid references competency.competency(id) on delete cascade,
  indicator_id      uuid references competency.indicator(id) on delete cascade,
  teacher_kpi_id    uuid references kpi.teacher_kpi(id) on delete cascade,

  -- How this artefact demonstrates that particular thing.
  note              text,
  created_at        timestamptz not null default now(),
  created_by        uuid references core.app_user(id),

  constraint evidence_link_single_target check (
    (case when competency_id  is not null then 1 else 0 end
   + case when indicator_id   is not null then 1 else 0 end
   + case when teacher_kpi_id is not null then 1 else 0 end) = 1
  )
);

comment on table evidence.evidence_link is
  'Links one stored artefact to a competency, an indicator or a KPI. The file is '
  'never copied: one upload can support many links.';

create unique index evidence_link_unique_competency
  on evidence.evidence_link (evidence_id, competency_id) where competency_id is not null;
create unique index evidence_link_unique_indicator
  on evidence.evidence_link (evidence_id, indicator_id) where indicator_id is not null;
create unique index evidence_link_unique_kpi
  on evidence.evidence_link (evidence_id, teacher_kpi_id) where teacher_kpi_id is not null;

create index evidence_link_evidence_idx on evidence.evidence_link (evidence_id);
create index evidence_link_competency_idx on evidence.evidence_link (competency_id);
create index evidence_link_kpi_idx on evidence.evidence_link (teacher_kpi_id);

-- ---------------------------------------------------------------------------
-- Status history — append-only
-- ---------------------------------------------------------------------------

create table evidence.status_history (
  id                bigint generated always as identity primary key,
  school_id         uuid not null references core.school(id) on delete cascade,
  evidence_id       uuid not null references evidence.evidence(id) on delete cascade,
  from_status       evidence.status,
  to_status         evidence.status not null,
  changed_by        uuid references core.app_user(id),
  note              text,
  changed_at        timestamptz not null default now()
);

create index evidence_status_history_idx
  on evidence.status_history (evidence_id, changed_at desc);

create trigger status_history_append_only
  before update or delete on evidence.status_history
  for each row execute function core.reject_mutation();

-- Validation runs BEFORE; history is written AFTER.
-- Splitting these matters: on INSERT the row does not exist yet, so a BEFORE
-- trigger writing history would violate status_history's foreign key.
create or replace function evidence.validate_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'submitted') then
      raise exception 'Evidence must be created as draft or submitted, not %.', new.status
        using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'draft' then new.status in ('submitted')
    when 'submitted' then new.status in ('under_review', 'returned_for_clarification', 'draft')
    when 'under_review' then new.status in ('verified', 'rejected', 'returned_for_clarification')
    when 'returned_for_clarification' then new.status in ('submitted', 'draft')
    -- Terminal. Reopening is a deliberate act that belongs to Stage 3 moderation.
    when 'verified' then false
    when 'rejected' then false
    else false
  end;

  if not v_allowed then
    raise exception 'Evidence cannot move from % to %.', old.status, new.status
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create or replace function evidence.record_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into evidence.status_history
      (school_id, evidence_id, from_status, to_status, changed_by)
    values (new.school_id, new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into evidence.status_history
      (school_id, evidence_id, from_status, to_status, changed_by, note)
    values (new.school_id, new.id, old.status, new.status, auth.uid(), new.review_note);
  end if;
  return null;
end;
$$;

create trigger validate_status_transition
  before insert or update on evidence.evidence
  for each row execute function evidence.validate_status_transition();

create trigger record_status_change
  after insert or update on evidence.evidence
  for each row execute function evidence.record_status_change();

-- ---------------------------------------------------------------------------
-- Evidence requirements
-- ---------------------------------------------------------------------------

create table evidence.requirement (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete cascade,
  evidence_type_id  uuid not null references evidence.evidence_type(id) on delete cascade,
  minimum_count     integer not null default 1 check (minimum_count >= 1),
  description       text,

  -- Applicability. NULL = all.
  teacher_category_id uuid references core.teacher_category(id) on delete cascade,
  school_stage_id     uuid references core.school_stage(id) on delete cascade,
  role_key            text check (role_key ~ '^[a-z][a-z0-9_]*$'),

  source_framework  competency.source_framework not null default 'school',
  source_alignment  competency.source_alignment not null default 'school_defined',
  external_reference text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table evidence.requirement is
  'How much evidence of each type is expected, from whom, in a given year. '
  'School policy by default — labelled as such wherever it is shown.';

create trigger set_updated_at before update on evidence.requirement
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Professional goals
-- ---------------------------------------------------------------------------

create table growth.professional_goal (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null references core.teacher_profile(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete cascade,
  competency_id     uuid references competency.competency(id) on delete set null,

  title             text not null check (length(btrim(title)) >= 5),
  description       text,
  success_measure   text,
  target_date       date,
  status            text not null default 'active'
                      check (status in ('draft', 'active', 'achieved', 'carried_forward', 'cancelled')),

  -- Teacher-owned by default; a manager may co-create one.
  created_by        uuid references core.app_user(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table growth.professional_goal is
  'A goal the teacher owns. Deliberately writable by the teacher: a developmental '
  'platform in which goals are only ever assigned downward is an appraisal tool '
  'wearing a different name.';

create index professional_goal_teacher_idx
  on growth.professional_goal (teacher_profile_id, academic_year_id);

create trigger set_updated_at before update on growth.professional_goal
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table evidence.evidence_type    enable row level security;
alter table evidence.evidence         enable row level security;
alter table evidence.evidence_link    enable row level security;
alter table evidence.status_history   enable row level security;
alter table evidence.requirement      enable row level security;
alter table growth.professional_goal  enable row level security;

create policy evidence_type_select on evidence.evidence_type
  for select using (core.is_member_of(school_id));
create policy evidence_type_write on evidence.evidence_type
  for all using (core.has_permission(school_id, 'competency.manage'))
  with check (core.has_permission(school_id, 'competency.manage'));

create policy evidence_requirement_select on evidence.requirement
  for select using (core.is_member_of(school_id));
create policy evidence_requirement_write on evidence.requirement
  for all using (core.has_permission(school_id, 'competency.manage'))
  with check (core.has_permission(school_id, 'competency.manage'));

-- A teacher sees and manages their own evidence; reviewers see it within scope.
create policy evidence_select on evidence.evidence
  for select using (core.can_view_staff_record(teacher_profile_id));

create policy evidence_insert_own on evidence.evidence
  for insert with check (
    exists (select 1 from core.teacher_profile tp
            where tp.id = evidence.teacher_profile_id and tp.user_id = auth.uid())
  );

-- The teacher may edit their own evidence only while it is still theirs to
-- edit. Once submitted, changes belong to the review process.
create policy evidence_update_own on evidence.evidence
  for update using (
    status in ('draft', 'returned_for_clarification')
    and exists (select 1 from core.teacher_profile tp
                where tp.id = evidence.teacher_profile_id and tp.user_id = auth.uid())
  )
  with check (
    exists (select 1 from core.teacher_profile tp
            where tp.id = evidence.teacher_profile_id and tp.user_id = auth.uid())
  );

create policy evidence_review on evidence.evidence
  for update using (
    core.has_permission(school_id, 'evidence.review')
    and core.can_view_staff_record(teacher_profile_id)
  )
  with check (
    core.has_permission(school_id, 'evidence.review')
    and core.can_view_staff_record(teacher_profile_id)
  );

create policy evidence_link_select on evidence.evidence_link
  for select using (
    exists (select 1 from evidence.evidence e
            where e.id = evidence_link.evidence_id
              and core.can_view_staff_record(e.teacher_profile_id))
  );

create policy evidence_link_write on evidence.evidence_link
  for all using (
    exists (select 1 from evidence.evidence e
            join core.teacher_profile tp on tp.id = e.teacher_profile_id
            where e.id = evidence_link.evidence_id
              and (tp.user_id = auth.uid()
                   or core.has_permission(e.school_id, 'evidence.review')))
  )
  with check (
    exists (select 1 from evidence.evidence e
            join core.teacher_profile tp on tp.id = e.teacher_profile_id
            where e.id = evidence_link.evidence_id
              and (tp.user_id = auth.uid()
                   or core.has_permission(e.school_id, 'evidence.review')))
  );

create policy evidence_status_history_select on evidence.status_history
  for select using (
    exists (select 1 from evidence.evidence e
            where e.id = status_history.evidence_id
              and core.can_view_staff_record(e.teacher_profile_id))
  );

create policy professional_goal_select on growth.professional_goal
  for select using (core.can_view_staff_record(teacher_profile_id));

create policy professional_goal_write_own on growth.professional_goal
  for all using (
    exists (select 1 from core.teacher_profile tp
            where tp.id = professional_goal.teacher_profile_id and tp.user_id = auth.uid())
  )
  with check (
    exists (select 1 from core.teacher_profile tp
            where tp.id = professional_goal.teacher_profile_id and tp.user_id = auth.uid())
  );

create policy professional_goal_write_manager on growth.professional_goal
  for all using (
    core.has_permission(school_id, 'development_plan.read.scope')
    and core.can_view_staff_record(teacher_profile_id)
  )
  with check (
    core.has_permission(school_id, 'development_plan.read.scope')
    and core.can_view_staff_record(teacher_profile_id)
  );

create trigger audit_changes
  after insert or update or delete on evidence.evidence
  for each row execute function audit.record_row_change();
