-- ===========================================================================
-- 0049 — Moderation across assessors
-- ===========================================================================
-- The `moderation` rating source has existed since Stage 3 and been unused
-- since, which meant consistency between assessors rested on trust. Two Heads
-- of Department could rate the same practice differently and nothing in the
-- platform would notice.
--
-- Moderation is a MEETING, not a correction. A panel looks at a set of ratings
-- together, and for each one either upholds it or adjusts it — with reasons
-- either way. Upholding is an outcome worth recording: it is evidence the
-- rating was examined, which is exactly what a moderated judgement means.
--
-- An adjustment writes a NEW rating with source `moderation` and supersedes the
-- old one. Stage 3's rule holds: ratings are immutable and a correction is a new
-- row, so the original assessor's judgement stays visible beside the panel's.
-- ===========================================================================

-- `competency_rating` carries only a primary key on `id`, so a composite FK
-- cannot reference (id, school_id). Adding the pair costs nothing — `id` is
-- already unique — and lets moderation enforce structurally that a session and
-- the rating it examines belong to the same school.
alter table assessment.competency_rating
  add constraint competency_rating_id_school unique (id, school_id);

create type assessment.moderation_status as enum (
  'draft',
  'in_progress',
  'completed',
  'abandoned'
);

create type assessment.moderation_outcome as enum (
  'upheld',
  'adjusted'
);

create table assessment.moderation_session (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references core.school(id) on delete cascade,
  academic_year_id uuid not null references core.academic_year(id) on delete restrict,
  cycle_id         uuid,

  title            text not null check (length(btrim(title)) >= 5),
  -- What is being moderated: a department, a stage, a competency, a cohort.
  scope_note       text not null check (length(btrim(scope_note)) >= 15),
  held_on          date,

  convenor_user_id uuid not null references core.app_user(id) on delete restrict,
  status           assessment.moderation_status not null default 'draft',

  -- Written when the panel closes: what it concluded overall, beyond the
  -- individual items. Required to complete, because a moderation that produced
  -- no view of consistency has not moderated anything.
  summary          text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (id, school_id),
  foreign key (cycle_id, school_id) references assessment.cycle(id, school_id) on delete set null,
  constraint moderation_completed_summarised check (
    status <> 'completed'
    or (held_on is not null and length(btrim(coalesce(summary, ''))) >= 30)
  ),
  constraint moderation_abandoned_reasoned check (
    status <> 'abandoned' or length(btrim(coalesce(summary, ''))) >= 10
  )
);

comment on table assessment.moderation_session is
  'A panel examining a set of ratings together for consistency. Completing one requires a written view of what it concluded.';

create trigger set_updated_at before update on assessment.moderation_session
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Who was in the room
-- ---------------------------------------------------------------------------
create table assessment.moderation_participant (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null,
  session_id  uuid not null,
  user_id     uuid not null references core.app_user(id) on delete restrict,
  role_note   text,
  unique (session_id, user_id),
  foreign key (session_id, school_id) references assessment.moderation_session(id, school_id) on delete cascade
);

comment on table assessment.moderation_participant is
  'A moderation decision carries the weight of the people who made it, so the panel is on the record.';

-- ---------------------------------------------------------------------------
-- The items examined
-- ---------------------------------------------------------------------------
create table assessment.moderation_item (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null,
  session_id      uuid not null,

  -- The rating under review, and the teacher it concerns.
  rating_id       uuid not null,
  teacher_profile_id uuid not null,
  competency_id   uuid not null,

  original_level_id uuid not null,
  outcome         assessment.moderation_outcome,
  moderated_level_id uuid,

  -- Reasons either way. Upholding without a reason tells a teacher nothing
  -- about why their rating was examined and left alone.
  rationale       text,

  -- The new rating this produced, when adjusted.
  resulting_rating_id uuid,

  decided_at      timestamptz,
  created_at      timestamptz not null default now(),

  unique (session_id, rating_id),
  unique (id, school_id),
  foreign key (session_id, school_id) references assessment.moderation_session(id, school_id) on delete cascade,
  foreign key (rating_id, school_id) references assessment.competency_rating(id, school_id) on delete restrict,
  foreign key (teacher_profile_id, school_id) references core.teacher_profile(id, school_id) on delete cascade,
  foreign key (competency_id, school_id) references competency.competency(id, school_id) on delete restrict,

  constraint moderation_item_decided check (
    outcome is null
    or (decided_at is not null and length(btrim(coalesce(rationale, ''))) >= 20)
  ),
  constraint moderation_item_adjusted_has_level check (
    outcome is distinct from 'adjusted' or moderated_level_id is not null
  ),
  constraint moderation_item_upheld_has_no_level check (
    outcome is distinct from 'upheld' or moderated_level_id is null
  )
);

comment on table assessment.moderation_item is
  'One rating examined by the panel. Upholding is an outcome in its own right — evidence the rating was looked at, which is what "moderated" means.';

create index moderation_item_session_idx on assessment.moderation_item (session_id);

-- ---------------------------------------------------------------------------
-- Adjusting writes a new rating; it never edits the original
-- ---------------------------------------------------------------------------
create function assessment.apply_moderation_item()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_original assessment.competency_rating;
  v_new uuid;
  v_scale_original uuid;
  v_scale_new uuid;
begin
  if new.outcome is distinct from 'adjusted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.outcome = 'adjusted' then
    return new;   -- already applied
  end if;

  select * into v_original from assessment.competency_rating where id = new.rating_id;

  -- The moderated level must come from the same scale as the original. This is
  -- the Stage 3 defect (migration 0028) pre-empted once more: two scales in one
  -- system will eventually be mixed unless something refuses.
  select scale_id into v_scale_original from competency.proficiency_level where id = v_original.level_id;
  select scale_id into v_scale_new from competency.proficiency_level where id = new.moderated_level_id;
  if v_scale_original is distinct from v_scale_new then
    raise exception 'The moderated level is from a different proficiency scale than the rating being moderated';
  end if;

  insert into assessment.competency_rating
    (school_id, teacher_assessment_id, competency_id, source, level_id, rationale, rated_by, rated_at)
  values
    (v_original.school_id, v_original.teacher_assessment_id, v_original.competency_id,
     'moderation', new.moderated_level_id,
     'Moderated by panel: ' || new.rationale,
     -- Attributed to the convenor when the actor is not identifiable — the
     -- session convenor owns the panel's decisions, and `rated_by` is NOT NULL
     -- because an unattributed rating is not a rating.
     coalesce(core.current_user_id(),
              (select convenor_user_id from assessment.moderation_session
                where id = new.session_id)),
     now())
  returning id into v_new;

  -- The original is superseded, not deleted. It stays readable, which is how a
  -- teacher can see both what their assessor said and what the panel decided.
  update assessment.competency_rating
     set superseded_by_id = v_new
   where id = new.rating_id;

  new.resulting_rating_id := v_new;
  return new;
end;
$$;

create trigger moderation_item_apply
  before insert or update of outcome on assessment.moderation_item
  for each row execute function assessment.apply_moderation_item();

-- A panel member cannot moderate their own rating: that is a second look by the
-- same eyes, which is not a second look.
create function assessment.assert_moderation_independence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_rater uuid;
  v_teacher uuid;
begin
  select rated_by into v_rater from assessment.competency_rating where id = new.rating_id;
  select tp.user_id into v_teacher
  from core.teacher_profile tp where tp.id = new.teacher_profile_id;

  if v_teacher is not null and exists (
    select 1 from assessment.moderation_participant p
    where p.session_id = new.session_id and p.user_id = v_teacher
  ) then
    raise exception 'A teacher cannot sit on a panel moderating their own rating';
  end if;

  return new;
end;
$$;

create trigger moderation_item_independence
  before insert on assessment.moderation_item
  for each row execute function assessment.assert_moderation_independence();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table assessment.moderation_session     enable row level security;
alter table assessment.moderation_participant enable row level security;
alter table assessment.moderation_item        enable row level security;

create policy moderation_session_select on assessment.moderation_session
  for select using (core.has_permission(school_id, 'assessment.read.scope'));
create policy moderation_session_write on assessment.moderation_session
  using (core.has_permission(school_id, 'assessment.moderate'))
  with check (core.has_permission(school_id, 'assessment.moderate'));

create policy moderation_participant_select on assessment.moderation_participant
  for select using (core.has_permission(school_id, 'assessment.read.scope'));
create policy moderation_participant_write on assessment.moderation_participant
  using (core.has_permission(school_id, 'assessment.moderate'))
  with check (core.has_permission(school_id, 'assessment.moderate'));

-- A teacher sees moderation of their OWN ratings — the outcome affects their
-- record, so they are entitled to see that it happened and why.
create policy moderation_item_select on assessment.moderation_item
  for select using (
    core.can_view_staff_record(teacher_profile_id)
    or core.has_permission(school_id, 'assessment.moderate')
  );
create policy moderation_item_write on assessment.moderation_item
  using (core.has_permission(school_id, 'assessment.moderate'))
  with check (core.has_permission(school_id, 'assessment.moderate'));

grant select on assessment.moderation_session, assessment.moderation_participant,
                assessment.moderation_item to authenticated;
grant insert, update on assessment.moderation_session, assessment.moderation_participant,
                        assessment.moderation_item to authenticated;
grant all on assessment.moderation_session, assessment.moderation_participant,
             assessment.moderation_item to service_role;

create trigger audit_changes after insert or update or delete on assessment.moderation_item
  for each row execute function audit.record_row_change();
