-- ===========================================================================
-- 0022 — Gaps, priorities and the Learning Map (IPDP)
-- ===========================================================================
-- The central product rule of this stage lives here:
--
--   COMPLETING A COURSE DOES NOT IMPROVE A COMPETENCY.
--
-- A learning plan item must pass through participation → reflection →
-- application → verified impact evidence before a reassessment is permitted at
-- all. `growth.can_reassess()` is the gate, and the plan item status enum has
-- no shortcut from `completed` to `reassessed`.
-- ===========================================================================

-- Mandatory competencies weigh more heavily in prioritisation.
alter table competency.competency_target
  add column if not exists is_mandatory boolean not null default false;

comment on column competency.competency_target.is_mandatory is
  'Whether reaching this target is required rather than aspirational. Feeds the '
  'gap priority score. School policy unless a verified regulatory requirement '
  'says otherwise.';

-- Which competencies a KPI depends on — used for "KPI relevance" in scoring.
create table kpi.template_competency (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  template_id       uuid not null,
  competency_id     uuid not null,
  created_at        timestamptz not null default now(),
  constraint kpi_template_competency_template_fk foreign key (template_id, school_id)
    references kpi.template(id, school_id) on delete cascade,
  constraint kpi_template_competency_competency_fk foreign key (competency_id, school_id)
    references competency.competency(id, school_id) on delete cascade,
  constraint kpi_template_competency_unique unique (template_id, competency_id)
);

alter table kpi.template_competency enable row level security;
create policy template_competency_select on kpi.template_competency
  for select using (core.is_member_of(school_id));
create policy template_competency_write on kpi.template_competency
  for all using (core.has_permission(school_id, 'kpi.manage'))
  with check (core.has_permission(school_id, 'kpi.manage'));

-- ---------------------------------------------------------------------------
-- Configurable priority bands
-- ---------------------------------------------------------------------------

create table growth.priority_band (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label             text not null,
  min_score         integer not null check (min_score >= 0),
  max_score         integer not null check (max_score <= 100),
  sort_order        integer not null,
  description       text,
  created_at        timestamptz not null default now(),
  constraint priority_band_unique unique (school_id, key),
  constraint priority_band_range check (max_score >= min_score)
);

comment on table growth.priority_band is
  'Configurable score→label mapping. Defaults are Critical / High / Medium / '
  'Low / No Gap; a school may retune the thresholds without a migration.';

-- ---------------------------------------------------------------------------
-- School strategic priorities
-- ---------------------------------------------------------------------------

create table growth.strategic_priority (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete cascade,
  competency_id     uuid not null references competency.competency(id) on delete cascade,
  rationale         text not null check (length(btrim(rationale)) >= 10),
  created_by        uuid references core.app_user(id),
  created_at        timestamptz not null default now(),
  constraint strategic_priority_unique unique (school_id, academic_year_id, competency_id)
);

comment on table growth.strategic_priority is
  'Competencies the school has chosen to push this year. Raises gap priority, '
  'and the rationale is shown to the teacher so the reason is never opaque.';

-- ---------------------------------------------------------------------------
-- Gaps
-- ---------------------------------------------------------------------------

create table growth.gap (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null references core.teacher_profile(id) on delete cascade,
  competency_id     uuid not null references competency.competency(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete cascade,

  expected_ordinal  integer not null,
  verified_ordinal  integer,
  -- expected − verified, floored at zero. Null verified means never assessed.
  gap_size          integer not null,

  priority_score    integer not null check (priority_score between 0 and 100),
  priority_band_key text not null,

  -- Every contributing factor, with its points and a plain-language reason.
  -- This is what "why is this a priority?" renders from.
  factors           jsonb not null default '[]'::jsonb,
  explanation       text not null,

  -- Which engine produced this, so a change in method is visible.
  engine_version    text not null default 'gap-engine-v1',
  computed_at       timestamptz not null default now(),

  constraint gap_unique unique (teacher_profile_id, competency_id, academic_year_id),
  constraint gap_size_non_negative check (gap_size >= 0)
);

comment on table growth.gap is
  'Current gaps, recomputed deterministically from stored inputs. Gaps are '
  'DERIVED, so recomputing is not overwriting a judgement — the judgements '
  'themselves (ratings, verifications) are append-only elsewhere.';

create index gap_teacher_idx
  on growth.gap (teacher_profile_id, academic_year_id, priority_score desc);

-- ---------------------------------------------------------------------------
-- Learning plan (IPDP)
-- ---------------------------------------------------------------------------

create type growth.plan_status as enum (
  'draft', 'submitted', 'approved', 'active', 'completed', 'cancelled'
);

create type growth.plan_item_status as enum (
  'proposed',        -- teacher has chosen the activity
  'approved',        -- manager has approved it
  'declined',        -- manager declined, with a reason
  'in_progress',     -- learning under way
  'completed',       -- PARTICIPATION only. Changes nothing about competency.
  'reflected',       -- teacher has recorded what they took from it
  'applied',         -- teacher has applied it and submitted evidence
  'impact_verified', -- a reviewer has verified the application in practice
  'reassessed',      -- competency reassessed; the loop is closed
  'abandoned'
);

comment on type growth.plan_item_status is
  'The stages between completing a course and moving a competency. There is no '
  'transition from `completed` straight to `reassessed`: participation is not '
  'improvement.';

create table growth.learning_plan (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null references core.teacher_profile(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete cascade,
  title             text not null default 'Individual Professional Development Plan',
  summary           text,
  status            growth.plan_status not null default 'draft',
  submitted_at      timestamptz,
  approved_by       uuid references core.app_user(id),
  approved_at       timestamptz,
  approval_note     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint learning_plan_unique unique (teacher_profile_id, academic_year_id)
);

create trigger set_updated_at before update on growth.learning_plan
  for each row execute function core.set_updated_at();

create table growth.learning_plan_item (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  learning_plan_id  uuid not null references growth.learning_plan(id) on delete cascade,
  gap_id            uuid references growth.gap(id) on delete set null,
  competency_id     uuid not null references competency.competency(id) on delete restrict,
  professional_goal_id uuid references growth.professional_goal(id) on delete set null,
  cpd_activity_id   uuid references cpd.activity(id) on delete restrict,

  status            growth.plan_item_status not null default 'proposed',
  -- Why this activity was chosen, captured at selection time from the
  -- recommendation that produced it.
  selection_rationale text,
  target_level_id   uuid references competency.proficiency_level(id) on delete set null,
  due_on            date,
  owner_user_id     uuid references core.app_user(id) on delete set null,

  -- Stage timestamps. Each is set once, by its own action.
  proposed_at       timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid references core.app_user(id),
  approval_note     text,
  started_at        timestamptz,
  completed_at      timestamptz,
  completion_note   text,

  reflected_at      timestamptz,
  reflection        text,

  applied_at        timestamptz,
  application_summary text,

  impact_verified_at timestamptz,
  impact_verified_by uuid references core.app_user(id),
  impact_verification_note text,

  reassessed_at     timestamptz,
  verified_competency_id uuid references assessment.verified_competency(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Each stage must carry its substance, not just a timestamp.
  constraint plan_item_reflection_present check (
    reflected_at is null or (reflection is not null and length(btrim(reflection)) >= 30)
  ),
  constraint plan_item_application_present check (
    applied_at is null or (application_summary is not null and length(btrim(application_summary)) >= 30)
  ),
  constraint plan_item_impact_verified_by_someone check (
    impact_verified_at is null or impact_verified_by is not null
  ),
  constraint plan_item_declined_has_note check (
    status <> 'declined' or (approval_note is not null and length(btrim(approval_note)) >= 10)
  )
);

comment on table growth.learning_plan_item is
  'One line of the Learning Map: a gap, the goal it serves, the CPD chosen for '
  'it, and its journey through to verified impact and reassessment.';

create index plan_item_plan_idx on growth.learning_plan_item (learning_plan_id, status);
create index plan_item_competency_idx on growth.learning_plan_item (competency_id, status);

create trigger set_updated_at before update on growth.learning_plan_item
  for each row execute function core.set_updated_at();

-- Evidence supporting the application stage. Reuses the Stage 2 evidence
-- framework rather than inventing a parallel one.
create table growth.plan_item_evidence (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  learning_plan_item_id uuid not null references growth.learning_plan_item(id) on delete cascade,
  evidence_id       uuid not null references evidence.evidence(id) on delete cascade,
  note              text,
  created_at        timestamptz not null default now(),
  constraint plan_item_evidence_unique unique (learning_plan_item_id, evidence_id)
);

-- Append-only trail of stage transitions, distinct from the general audit log
-- because the Learning Map renders it directly as the teacher's own history.
create table growth.plan_item_event (
  id                bigint generated always as identity primary key,
  school_id         uuid not null references core.school(id) on delete cascade,
  learning_plan_item_id uuid not null references growth.learning_plan_item(id) on delete cascade,
  from_status       growth.plan_item_status,
  to_status         growth.plan_item_status not null,
  actor_user_id     uuid references core.app_user(id),
  note              text,
  occurred_at       timestamptz not null default now()
);

create index plan_item_event_idx
  on growth.plan_item_event (learning_plan_item_id, occurred_at);

create trigger plan_item_event_append_only
  before update or delete on growth.plan_item_event
  for each row execute function core.reject_mutation();

-- ---------------------------------------------------------------------------
-- Stage transitions
-- ---------------------------------------------------------------------------

create or replace function growth.validate_plan_item_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_allowed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'proposed' then
      raise exception 'A plan item starts as proposed, not %.', new.status
        using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  if new.status = old.status then return new; end if;

  v_allowed := case old.status
    when 'proposed'        then new.status in ('approved', 'declined', 'abandoned')
    when 'approved'        then new.status in ('in_progress', 'abandoned')
    when 'in_progress'     then new.status in ('completed', 'abandoned')
    -- Participation is not improvement: `completed` leads only to reflection.
    when 'completed'       then new.status in ('reflected', 'abandoned')
    when 'reflected'       then new.status in ('applied', 'abandoned')
    when 'applied'         then new.status in ('impact_verified', 'reflected', 'abandoned')
    when 'impact_verified' then new.status in ('reassessed')
    when 'declined'        then new.status in ('proposed')
    else false
  end;

  if not v_allowed then
    raise exception
      'A learning plan item cannot move from % to %. Development must pass '
      'through completion, reflection, application and verified impact before '
      'reassessment.', old.status, new.status
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create or replace function growth.record_plan_item_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into growth.plan_item_event
      (school_id, learning_plan_item_id, from_status, to_status, actor_user_id, note)
    values (new.school_id, new.id, null, new.status, auth.uid(), new.selection_rationale);
  elsif new.status is distinct from old.status then
    insert into growth.plan_item_event
      (school_id, learning_plan_item_id, from_status, to_status, actor_user_id, note)
    values (new.school_id, new.id, old.status, new.status, auth.uid(),
            coalesce(new.approval_note, new.completion_note, new.impact_verification_note));
  end if;
  return null;
end;
$$;

create trigger validate_transition
  before insert or update on growth.learning_plan_item
  for each row execute function growth.validate_plan_item_transition();

create trigger record_event
  after insert or update on growth.learning_plan_item
  for each row execute function growth.record_plan_item_event();

-- ---------------------------------------------------------------------------
-- The reassessment gate
-- ---------------------------------------------------------------------------

create or replace function growth.can_reassess(p_plan_item_id uuid)
returns table (allowed boolean, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  it growth.learning_plan_item%rowtype;
  v_evidence_verified integer;
begin
  select * into it from growth.learning_plan_item where id = p_plan_item_id;
  if it.id is null then
    return query select false, 'Plan item not found.'::text; return;
  end if;

  if it.status = 'reassessed' then
    return query select false, 'This item has already been reassessed.'::text; return;
  end if;

  if it.completed_at is null then
    return query select false, 'The CPD activity has not been completed.'::text; return;
  end if;
  if it.reflected_at is null then
    return query select false, 'The teacher has not yet recorded a reflection.'::text; return;
  end if;
  if it.applied_at is null then
    return query select false,
      'The teacher has not yet applied the learning and described how.'::text; return;
  end if;

  select count(*) into v_evidence_verified
  from growth.plan_item_evidence pie
  join evidence.evidence e on e.id = pie.evidence_id
  where pie.learning_plan_item_id = p_plan_item_id and e.status = 'verified';

  if v_evidence_verified = 0 then
    return query select false,
      'No verified evidence of application in practice has been attached.'::text; return;
  end if;

  if it.impact_verified_at is null then
    return query select false,
      'A reviewer has not yet verified the application in practice.'::text; return;
  end if;

  return query select true,
    'Completion, reflection, application, verified evidence and reviewer '
    'verification are all in place.'::text;
end;
$$;

comment on function growth.can_reassess(uuid) is
  'The gate between CPD and a competency level. Returns the specific reason it '
  'is closed, so the interface can tell a teacher exactly what is outstanding.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table growth.priority_band       enable row level security;
alter table growth.strategic_priority  enable row level security;
alter table growth.gap                 enable row level security;
alter table growth.learning_plan       enable row level security;
alter table growth.learning_plan_item  enable row level security;
alter table growth.plan_item_evidence  enable row level security;
alter table growth.plan_item_event     enable row level security;

create policy priority_band_select on growth.priority_band
  for select using (core.is_member_of(school_id));
create policy priority_band_write on growth.priority_band
  for all using (core.has_permission(school_id, 'competency.manage'))
  with check (core.has_permission(school_id, 'competency.manage'));

create policy strategic_priority_select on growth.strategic_priority
  for select using (core.is_member_of(school_id));
create policy strategic_priority_write on growth.strategic_priority
  for all using (core.has_permission(school_id, 'competency.manage'))
  with check (core.has_permission(school_id, 'competency.manage'));

create policy gap_select on growth.gap
  for select using (core.can_view_staff_record(teacher_profile_id));
create policy gap_write on growth.gap
  for all using (
    core.can_view_staff_record(teacher_profile_id)
    and (core.has_permission(school_id, 'assessment.read.scope')
         or exists (select 1 from core.teacher_profile tp
                    where tp.id = gap.teacher_profile_id and tp.user_id = auth.uid()))
  )
  with check (
    core.can_view_staff_record(teacher_profile_id)
    and (core.has_permission(school_id, 'assessment.read.scope')
         or exists (select 1 from core.teacher_profile tp
                    where tp.id = gap.teacher_profile_id and tp.user_id = auth.uid()))
  );

create policy learning_plan_select on growth.learning_plan
  for select using (core.can_view_staff_record(teacher_profile_id));
create policy learning_plan_write_own on growth.learning_plan
  for all using (
    exists (select 1 from core.teacher_profile tp
            where tp.id = learning_plan.teacher_profile_id and tp.user_id = auth.uid())
  )
  with check (
    exists (select 1 from core.teacher_profile tp
            where tp.id = learning_plan.teacher_profile_id and tp.user_id = auth.uid())
  );
create policy learning_plan_write_manager on growth.learning_plan
  for all using (
    core.has_permission(school_id, 'development_plan.approve')
    and core.can_view_staff_record(teacher_profile_id)
  )
  with check (
    core.has_permission(school_id, 'development_plan.approve')
    and core.can_view_staff_record(teacher_profile_id)
  );

create policy plan_item_select on growth.learning_plan_item
  for select using (
    exists (select 1 from growth.learning_plan lp
            where lp.id = learning_plan_item.learning_plan_id
              and core.can_view_staff_record(lp.teacher_profile_id))
  );
create policy plan_item_write on growth.learning_plan_item
  for all using (
    exists (select 1 from growth.learning_plan lp
            join core.teacher_profile tp on tp.id = lp.teacher_profile_id
            where lp.id = learning_plan_item.learning_plan_id
              and (tp.user_id = auth.uid()
                   or (core.has_permission(lp.school_id, 'development_plan.approve')
                       and core.can_view_staff_record(lp.teacher_profile_id))))
  )
  with check (
    exists (select 1 from growth.learning_plan lp
            join core.teacher_profile tp on tp.id = lp.teacher_profile_id
            where lp.id = learning_plan_item.learning_plan_id
              and (tp.user_id = auth.uid()
                   or (core.has_permission(lp.school_id, 'development_plan.approve')
                       and core.can_view_staff_record(lp.teacher_profile_id))))
  );

create policy plan_item_evidence_select on growth.plan_item_evidence
  for select using (
    exists (select 1 from growth.learning_plan_item i
            join growth.learning_plan lp on lp.id = i.learning_plan_id
            where i.id = plan_item_evidence.learning_plan_item_id
              and core.can_view_staff_record(lp.teacher_profile_id))
  );
create policy plan_item_evidence_write on growth.plan_item_evidence
  for all using (
    exists (select 1 from growth.learning_plan_item i
            join growth.learning_plan lp on lp.id = i.learning_plan_id
            join core.teacher_profile tp on tp.id = lp.teacher_profile_id
            where i.id = plan_item_evidence.learning_plan_item_id
              and (tp.user_id = auth.uid()
                   or core.has_permission(lp.school_id, 'evidence.review')))
  )
  with check (
    exists (select 1 from growth.learning_plan_item i
            join growth.learning_plan lp on lp.id = i.learning_plan_id
            join core.teacher_profile tp on tp.id = lp.teacher_profile_id
            where i.id = plan_item_evidence.learning_plan_item_id
              and (tp.user_id = auth.uid()
                   or core.has_permission(lp.school_id, 'evidence.review')))
  );

create policy plan_item_event_select on growth.plan_item_event
  for select using (
    exists (select 1 from growth.learning_plan_item i
            join growth.learning_plan lp on lp.id = i.learning_plan_id
            where i.id = plan_item_event.learning_plan_item_id
              and core.can_view_staff_record(lp.teacher_profile_id))
  );

create trigger audit_changes
  after insert or update or delete on growth.learning_plan_item
  for each row execute function audit.record_row_change();
