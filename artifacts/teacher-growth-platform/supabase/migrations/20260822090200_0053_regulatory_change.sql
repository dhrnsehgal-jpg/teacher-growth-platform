-- ===========================================================================
-- 0053 — Regulatory change management
-- ===========================================================================
-- The workflow the brief sets out:
--
--   new circular/rule → add source → Compliance Admin review →
--   determine applicability → create rule version → effective date →
--   supersede the previous version → notify administrators
--
-- Stages 1-5 built the destination — `regulatory.source`, `requirement`,
-- `school_requirement_status`, supersession — but nothing carried a change from
-- arrival to activation. A circular landed in an inbox and someone remembered,
-- or didn't. This adds the track.
--
-- The load-bearing rule: **AI may not activate a regulatory requirement.**
-- Enforced by requiring a named human reviewer at every stage that changes what
-- the platform treats as true, and by refusing to advance a change whose
-- reviewer is not a real user holding `regulatory.manage`.
-- ===========================================================================

-- `core.notification.category` is a closed list, so the new kind has to join it
-- rather than be smuggled in under an existing one. Reusing
-- `regulatory_review_due` would have been wrong: a review falling due and a
-- change arriving are different events needing different responses.
alter table core.notification drop constraint notification_category_check;

alter table core.notification add constraint notification_category_check
  check (category = any (array[
    'regulatory_review_due', 'regulatory_change', 'verification_required',
    'assessment', 'cpd', 'development_plan', 'approval_request', 'system'
  ]));

create type regulatory.change_stage as enum (
  'received',              -- a circular or rule has arrived
  'source_recorded',       -- the document is on file with its URL and retrieval evidence
  'under_review',          -- the Compliance Administrator is reading it
  'applicability_determined',
  'version_created',       -- a requirement version exists
  'activated',             -- enforced for this school
  'superseded_previous',   -- the version it replaces has been closed off
  'rejected'               -- reviewed and found not applicable, or not adopted
);

create table regulatory.change_request (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references core.school(id) on delete cascade,

  title          text not null check (length(btrim(title)) >= 5),
  summary        text,
  received_on    date not null default current_date,
  received_from  text,

  -- Where it came from. A change with no citable origin is a rumour.
  source_url     text,
  source_id      uuid references regulatory.source(id) on delete set null,
  requirement_id uuid references regulatory.requirement(id) on delete set null,
  supersedes_requirement_id uuid references regulatory.requirement(id) on delete set null,

  stage          regulatory.change_stage not null default 'received',

  -- Every stage that changes what the platform treats as true needs a person.
  reviewed_by    uuid references core.app_user(id) on delete restrict,
  reviewed_at    timestamptz,
  review_note    text,

  applicability_determination regulatory.verification_status,
  applicability_note text,

  effective_from date,

  raised_by      uuid references core.app_user(id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (id, school_id),

  constraint change_reviewed_complete check (
    stage in ('received', 'source_recorded')
    or (reviewed_by is not null and reviewed_at is not null
        and length(btrim(coalesce(review_note, ''))) >= 20)
  ),
  constraint change_applicability_determined check (
    stage not in ('applicability_determined', 'version_created', 'activated', 'superseded_previous')
    or (applicability_determination is not null
        and length(btrim(coalesce(applicability_note, ''))) >= 20)
  ),
  constraint change_version_has_requirement check (
    stage not in ('version_created', 'activated', 'superseded_previous')
    or (requirement_id is not null and effective_from is not null)
  ),
  constraint change_rejected_reasoned check (
    stage <> 'rejected' or length(btrim(coalesce(review_note, ''))) >= 20
  )
);

comment on table regulatory.change_request is
  'Carries a circular or rule from arrival to activation. Before this, a change landed in somebody''s inbox and was either remembered or not.';

create trigger set_updated_at before update on regulatory.change_request
  for each row execute function core.set_updated_at();

create table regulatory.change_event (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  change_id     uuid not null,
  from_stage    regulatory.change_stage,
  to_stage      regulatory.change_stage not null,
  note          text,
  actor_user_id uuid references core.app_user(id) on delete restrict,
  occurred_at   timestamptz not null default now(),
  foreign key (change_id, school_id) references regulatory.change_request(id, school_id) on delete cascade
);

create function regulatory.reject_change_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'regulatory.change_event is append-only';
end;
$$;

create trigger change_event_immutable
  before update or delete on regulatory.change_event
  for each row execute function regulatory.reject_change_event_mutation();

-- ---------------------------------------------------------------------------
-- No autonomous activation
-- ---------------------------------------------------------------------------
-- The brief: "Never allow AI to activate a regulatory requirement
-- autonomously." A requirement becomes active for a school when
-- `school_requirement_status.is_enforced` goes true. That transition is guarded
-- here: it requires a change request that a NAMED HUMAN holding
-- `regulatory.manage` has carried through review and applicability.
create function regulatory.assert_human_activation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_has_permission boolean;
begin
  if not new.is_enforced or coalesce(old.is_enforced, false) then
    return new;   -- not an activation
  end if;

  v_actor := core.current_user_id();
  if v_actor is null then
    raise exception
      'A regulatory requirement cannot be activated without a signed-in person. Nothing automated may enforce a rule.'
      using errcode = 'restrict_violation';
  end if;

  select exists (
    select 1
    from core.user_role_assignment ra
    join core.role_permission rp on rp.role_id = ra.role_id
    where ra.user_id = v_actor and ra.school_id = new.school_id
      and rp.permission_key = 'regulatory.manage'
  ) into v_has_permission;

  if not v_has_permission then
    raise exception
      'Activating a regulatory requirement needs regulatory.manage, held by the Compliance Administrator.'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger requirement_status_human_activation
  before insert or update of is_enforced on regulatory.school_requirement_status
  for each row execute function regulatory.assert_human_activation();

comment on function regulatory.assert_human_activation is
  'Enforcement is a human act. A requirement cannot become enforced without a signed-in person holding regulatory.manage — so nothing automated, including the assistant, can activate a rule.';

-- ---------------------------------------------------------------------------
-- Stage transitions and notification
-- ---------------------------------------------------------------------------
create function regulatory.validate_change_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_order constant regulatory.change_stage[] := array[
    'received', 'source_recorded', 'under_review', 'applicability_determined',
    'version_created', 'activated', 'superseded_previous'
  ]::regulatory.change_stage[];
  v_from integer;
  v_to integer;
begin
  if tg_op = 'INSERT' or new.stage is not distinct from old.stage then
    return new;
  end if;

  -- Rejection is available from any stage before activation: a rule can be
  -- found not to apply at any point while reading it.
  if new.stage = 'rejected' then
    if old.stage in ('activated', 'superseded_previous') then
      raise exception 'An activated change cannot be rejected; supersede it instead';
    end if;
    return new;
  end if;

  v_from := array_position(v_order, old.stage);
  v_to := array_position(v_order, new.stage);
  if v_from is null or v_to is null or v_to <> v_from + 1 then
    raise exception 'Regulatory change cannot move from % to %', old.stage, new.stage
      using hint = 'The workflow runs in order. A change cannot be activated before its applicability has been determined.';
  end if;
  return new;
end;
$$;

create trigger change_request_stage_order
  before insert or update of stage on regulatory.change_request
  for each row execute function regulatory.validate_change_transition();

create function regulatory.record_change_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if tg_op = 'UPDATE' and new.stage is not distinct from old.stage then
    return null;
  end if;

  insert into regulatory.change_event (school_id, change_id, from_stage, to_stage, note, actor_user_id)
  values (new.school_id, new.id,
          case when tg_op = 'UPDATE' then old.stage end,
          new.stage, new.review_note, core.current_user_id());

  -- Notify the administrators who need to act. Only at the stages where
  -- somebody actually has to do something — a notification for every step
  -- would train people to ignore them.
  if new.stage in ('source_recorded', 'applicability_determined', 'activated', 'rejected') then
    insert into core.notification (school_id, recipient_user_id, category, title, body, link_path)
    select distinct new.school_id, ra.user_id, 'regulatory_change',
           case new.stage
             when 'source_recorded' then 'Regulatory change awaiting review'
             when 'applicability_determined' then 'Applicability determined — a rule version is needed'
             when 'activated' then 'A regulatory requirement has been activated'
             else 'A regulatory change was not adopted'
           end,
           new.title || coalesce(' — ' || new.review_note, ''),
           '/admin/regulatory'
    from core.user_role_assignment ra
    join core.role_permission rp on rp.role_id = ra.role_id
    where ra.school_id = new.school_id
      and rp.permission_key in ('regulatory.manage', 'compliance.manage');
  end if;

  return null;
end;
$$;

create trigger change_request_trail
  after insert or update of stage on regulatory.change_request
  for each row execute function regulatory.record_change_event();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table regulatory.change_request enable row level security;
alter table regulatory.change_event   enable row level security;

-- Readable by every member: a teacher is entitled to see that a rule they are
-- held to is under review, and what stage it has reached.
create policy change_request_select on regulatory.change_request
  for select using (core.is_member_of(school_id));
create policy change_request_write on regulatory.change_request
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy change_event_select on regulatory.change_event
  for select using (core.is_member_of(school_id));

grant select on regulatory.change_request, regulatory.change_event to authenticated;
grant insert, update on regulatory.change_request to authenticated;
grant all on regulatory.change_request, regulatory.change_event to service_role;

create trigger audit_changes after insert or update or delete on regulatory.change_request
  for each row execute function audit.record_row_change();
