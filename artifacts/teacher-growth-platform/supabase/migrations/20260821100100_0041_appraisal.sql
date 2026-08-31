-- ===========================================================================
-- 0041 — Annual appraisal, acknowledgement and representation
-- ===========================================================================
-- The workflow the brief specifies, in order:
--
--   self-assessment → competency review → KPI review → observation →
--   evidence review → CPD compliance → CPD impact → professional goals →
--   supervisor review → appraisal discussion → final recommendation →
--   teacher acknowledgement → authorised approval
--
-- Two rules shape the schema more than anything else:
--
--   * "Maintain the original appraisal if a teacher challenges/reviews it."
--     The outcome is written once and then frozen. A representation produces a
--     REVIEW OUTCOME beside the original, never an edit to it. A teacher who
--     disputes an appraisal and wins should be able to see both what was
--     decided and what it was changed to.
--
--   * The teacher's own words are part of the record. Acknowledgement is not a
--     signature box: a teacher may acknowledge, comment, or request
--     clarification, and all three stay on the file.
-- ===========================================================================

create schema if not exists appraisal;
comment on schema appraisal is
  'Annual appraisal: the review workflow, the teacher''s response, and representations against an outcome.';

create type appraisal.stage as enum (
  'self_assessment',
  'competency_review',
  'kpi_review',
  'classroom_observation',
  'evidence_review',
  'cpd_compliance',
  'cpd_impact',
  'professional_goals',
  'supervisor_review',
  'appraisal_discussion',
  'final_recommendation',
  'teacher_acknowledgement',
  'authorised_approval',
  'closed'
);

-- The teacher's position on their own appraisal.
create type appraisal.teacher_response_status as enum (
  'awaiting',
  'reviewed',
  'acknowledged',
  'comments_submitted',
  'clarification_requested',
  'finalised'
);

create table appraisal.cycle (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references core.school(id) on delete cascade,
  academic_year_id uuid not null references core.academic_year(id) on delete restrict,
  key              text not null check (key ~ '^[a-z][a-z0-9_.]*$'),
  name             text not null,
  opens_on         date,
  closes_on        date,

  -- The growth model and service policy in force when the cycle opened. Pinned
  -- so a later change to either cannot alter a completed appraisal.
  growth_model_id  uuid,
  policy_version_note text,

  status           text not null default 'open' check (status in ('draft', 'open', 'closed')),
  created_at       timestamptz not null default now(),
  unique (school_id, key),
  unique (school_id, academic_year_id),
  unique (id, school_id),
  constraint appraisal_cycle_dates check (closes_on is null or opens_on is null or closes_on >= opens_on)
);

create table appraisal.appraisal (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null,
  cycle_id           uuid not null,
  teacher_profile_id uuid not null,

  stage              appraisal.stage not null default 'self_assessment',
  appraiser_user_id  uuid references core.app_user(id) on delete restrict,

  -- The discussion is a conversation, and the record says it happened.
  discussion_held_on date,
  discussion_note    text,

  -- The final recommendation. Written once, then frozen by trigger.
  recommendation          text,
  recommendation_rationale text,
  recommended_by     uuid references core.app_user(id) on delete restrict,
  recommended_at     timestamptz,

  -- Authorised approval. Separate person, separate act.
  approved_by        uuid references core.app_user(id) on delete restrict,
  approved_at        timestamptz,
  approval_note      text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (cycle_id, teacher_profile_id),
  unique (id, school_id),
  foreign key (cycle_id, school_id) references appraisal.cycle(id, school_id) on delete cascade,
  foreign key (teacher_profile_id, school_id) references core.teacher_profile(id, school_id) on delete cascade,

  constraint appraisal_recommendation_complete check (
    recommendation is null
    or (recommended_by is not null and recommended_at is not null
        and length(btrim(coalesce(recommendation_rationale, ''))) >= 20)
  ),
  constraint appraisal_approval_complete check (
    approved_at is null or approved_by is not null
  )
);

comment on table appraisal.appraisal is
  'One appraisal per teacher per cycle. The final recommendation is written once and frozen; a challenge produces a review outcome beside it, never an edit.';

create trigger set_updated_at before update on appraisal.appraisal
  for each row execute function core.set_updated_at();

-- Nobody appraises themselves. The same rule Stage 3 applied to competency
-- verification, applied to the act with employment consequences.
create function appraisal.reject_self_appraisal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_self uuid;
begin
  select tp.user_id into v_self
  from core.teacher_profile tp where tp.id = new.teacher_profile_id;

  if new.recommended_by is not null and new.recommended_by = v_self then
    raise exception 'A teacher cannot make the final recommendation on their own appraisal';
  end if;
  if new.approved_by is not null and new.approved_by = v_self then
    raise exception 'A teacher cannot approve their own appraisal';
  end if;
  if new.appraiser_user_id is not null and new.appraiser_user_id = v_self then
    raise exception 'A teacher cannot be their own appraiser';
  end if;
  return new;
end;
$$;

create trigger appraisal_no_self_appraisal
  before insert or update on appraisal.appraisal
  for each row execute function appraisal.reject_self_appraisal();

-- Once written, the recommendation is the record. Editing it after the fact is
-- how a disputed appraisal quietly becomes an undisputed one.
create function appraisal.freeze_recommendation()
returns trigger language plpgsql as $$
begin
  if old.recommendation is not null then
    if new.recommendation is distinct from old.recommendation
       or new.recommendation_rationale is distinct from old.recommendation_rationale
       or new.recommended_by is distinct from old.recommended_by then
      raise exception 'The final recommendation is frozen once made'
        using hint = 'Record a representation and a review outcome instead — the original must remain readable.';
    end if;
  end if;
  if old.approved_at is not null and new.approved_at is distinct from old.approved_at then
    raise exception 'An approved appraisal cannot be re-approved or un-approved';
  end if;
  return new;
end;
$$;

create trigger appraisal_recommendation_frozen
  before update on appraisal.appraisal
  for each row execute function appraisal.freeze_recommendation();

-- ---------------------------------------------------------------------------
-- Stage trail — append-only
-- ---------------------------------------------------------------------------
create table appraisal.stage_event (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  appraisal_id  uuid not null,
  from_stage    appraisal.stage,
  to_stage      appraisal.stage not null,
  note          text,
  actor_user_id uuid references core.app_user(id) on delete restrict,
  occurred_at   timestamptz not null default now(),
  foreign key (appraisal_id, school_id) references appraisal.appraisal(id, school_id) on delete cascade
);

create function appraisal.reject_stage_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'appraisal.stage_event is append-only';
end;
$$;

create trigger stage_event_immutable
  before update or delete on appraisal.stage_event
  for each row execute function appraisal.reject_stage_event_mutation();

-- Stages advance in the order the brief sets out. Going backwards is allowed
-- only to `appraisal_discussion`, because a discussion can reopen a review.
create function appraisal.validate_stage_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_order constant appraisal.stage[] := array[
    'self_assessment', 'competency_review', 'kpi_review', 'classroom_observation',
    'evidence_review', 'cpd_compliance', 'cpd_impact', 'professional_goals',
    'supervisor_review', 'appraisal_discussion', 'final_recommendation',
    'teacher_acknowledgement', 'authorised_approval', 'closed'
  ]::appraisal.stage[];
  v_from integer;
  v_to integer;
begin
  if tg_op = 'UPDATE' and new.stage is not distinct from old.stage then
    return new;
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;

  v_from := array_position(v_order, old.stage);
  v_to := array_position(v_order, new.stage);

  if v_to = v_from + 1 then
    return new;
  end if;
  if new.stage = 'appraisal_discussion' and v_from < array_position(v_order, 'final_recommendation') then
    return new;   -- a discussion may reopen an earlier review
  end if;

  raise exception 'Appraisal cannot move from % to %', old.stage, new.stage
    using hint = 'The workflow runs in order; only a return to the appraisal discussion is permitted.';
end;
$$;

create trigger appraisal_stage_order
  before insert or update of stage on appraisal.appraisal
  for each row execute function appraisal.validate_stage_transition();

create function appraisal.record_stage_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.stage is not distinct from old.stage then
    return null;
  end if;
  insert into appraisal.stage_event (school_id, appraisal_id, from_stage, to_stage, actor_user_id)
  values (new.school_id, new.id,
          case when tg_op = 'UPDATE' then old.stage end,
          new.stage, core.current_user_id());
  return null;
end;
$$;

create trigger appraisal_stage_trail
  after insert or update of stage on appraisal.appraisal
  for each row execute function appraisal.record_stage_event();

-- ---------------------------------------------------------------------------
-- The teacher's response
-- ---------------------------------------------------------------------------
create table appraisal.teacher_response (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  appraisal_id  uuid not null,
  status        appraisal.teacher_response_status not null,
  comment       text,
  responded_at  timestamptz not null default now(),
  foreign key (appraisal_id, school_id) references appraisal.appraisal(id, school_id) on delete cascade,
  -- Comments and clarification requests must actually say something.
  constraint teacher_response_comment_present check (
    status not in ('comments_submitted', 'clarification_requested')
    or length(btrim(coalesce(comment, ''))) >= 10
  )
);

comment on table appraisal.teacher_response is
  'Append-only: every position the teacher has taken on this appraisal stays on the file. Acknowledgement is not a signature box.';

create index teacher_response_appraisal_idx on appraisal.teacher_response (appraisal_id, responded_at desc);

create function appraisal.reject_response_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'appraisal.teacher_response is append-only; add a further response instead';
end;
$$;

create trigger teacher_response_immutable
  before update or delete on appraisal.teacher_response
  for each row execute function appraisal.reject_response_mutation();

-- ---------------------------------------------------------------------------
-- Representation — the grievance route
-- ---------------------------------------------------------------------------
create type appraisal.representation_status as enum (
  'submitted',
  'under_review',
  'upheld',
  'partly_upheld',
  'not_upheld',
  'withdrawn'
);

create table appraisal.representation (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  appraisal_id  uuid not null,

  -- The original, copied here at the moment of challenge. Belt and braces: the
  -- appraisal row is frozen anyway, but a representation that cannot show what
  -- was originally decided is not much of a record.
  original_recommendation text not null,
  original_rationale      text,
  original_recommended_by uuid references core.app_user(id) on delete restrict,
  original_recommended_at timestamptz,

  submitted_by  uuid not null references core.app_user(id) on delete restrict,
  submitted_at  timestamptz not null default now(),
  grounds       text not null check (length(btrim(grounds)) >= 20),

  status        appraisal.representation_status not null default 'submitted',
  reviewer_user_id uuid references core.app_user(id) on delete restrict,
  reviewed_at   timestamptz,
  outcome       text,
  outcome_reason text,
  revised_recommendation text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  foreign key (appraisal_id, school_id) references appraisal.appraisal(id, school_id) on delete cascade,
  unique (id, school_id),

  -- A decision on a representation must name who decided and why. An outcome
  -- without a reason is the thing a grievance procedure exists to prevent.
  constraint representation_decided_complete check (
    status in ('submitted', 'under_review', 'withdrawn')
    or (reviewer_user_id is not null and reviewed_at is not null
        and length(btrim(coalesce(outcome_reason, ''))) >= 20)
  ),
  -- If it is upheld in any degree, say what the position is now.
  constraint representation_upheld_has_revision check (
    status not in ('upheld', 'partly_upheld')
    or length(btrim(coalesce(revised_recommendation, ''))) >= 10
  )
);

comment on table appraisal.representation is
  'A challenge to an appraisal outcome. The original is copied in and never deleted; the review produces a revised position beside it.';

create trigger set_updated_at before update on appraisal.representation
  for each row execute function core.set_updated_at();

-- The reviewer of a representation may not be the person who made the decision
-- being challenged, nor the teacher challenging it.
create function appraisal.assert_independent_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reviewer_user_id is null then
    return new;
  end if;
  if new.reviewer_user_id = new.original_recommended_by then
    raise exception 'A representation cannot be reviewed by the person whose decision is challenged'
      using hint = 'Route it to another authorised reviewer.';
  end if;
  if new.reviewer_user_id = new.submitted_by then
    raise exception 'A representation cannot be reviewed by the person who submitted it';
  end if;
  return new;
end;
$$;

create trigger representation_independent_review
  before insert or update on appraisal.representation
  for each row execute function appraisal.assert_independent_review();

create function appraisal.freeze_representation_original()
returns trigger language plpgsql as $$
begin
  if new.original_recommendation is distinct from old.original_recommendation
     or new.original_rationale is distinct from old.original_rationale
     or new.grounds is distinct from old.grounds then
    raise exception 'The original decision and the grounds of representation are immutable';
  end if;
  return new;
end;
$$;

create trigger representation_original_frozen
  before update on appraisal.representation
  for each row execute function appraisal.freeze_representation_original();
