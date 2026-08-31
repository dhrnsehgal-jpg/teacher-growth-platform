-- ===========================================================================
-- 0032 — The teacher CPD ledger
-- ===========================================================================
-- One row = one block of clock hours, attended once, in one category, from one
-- source. Everything else — which competencies it developed, which SQAAF
-- standard it evidences, which development plan item it discharged — hangs off
-- that row WITHOUT touching its hours.
--
-- That shape is the whole answer to "do not count the same clock hours twice
-- merely because one programme satisfies multiple competencies". The hours live
-- on the record; the mappings are edges to it. A five-hour workshop mapped to
-- four competencies is still five hours, because there is nowhere for the extra
-- fifteen to come from.
--
-- The alternative shape — hours on the mapping — is the one that produces a
-- teacher with 200 CPD hours and a compliance report nobody believes.
-- ===========================================================================

-- `core.teacher_profile` carries only a primary key on `id`, so a composite FK
-- from a child table cannot reference (id, school_id) and tenancy consistency
-- rests on RLS alone. Adding the pair as a unique constraint costs nothing —
-- `id` is already unique — and lets the ledger enforce structurally that a CPD
-- record and the teacher it belongs to are in the same school.
alter table core.teacher_profile
  add constraint teacher_profile_id_school unique (id, school_id);

create type compliance.cpd_record_status as enum (
  'draft',
  'submitted',
  'verified',
  'returned_for_clarification',
  'rejected'
);

-- How the hours were arrived at. A course has a duration; an academic task has
-- a rule that assigns it a credit. These are different claims and are recorded
-- as such.
create type compliance.cpd_hour_basis as enum (
  'attendance',        -- hours actually attended
  'activity_rule'      -- credit assigned by a compliance.cpd_activity_rule
);

create table compliance.cpd_record (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null,
  academic_year_id  uuid not null references core.academic_year(id) on delete restrict,

  title             text not null check (length(btrim(title)) >= 3),
  description       text,

  -- Where it came from. `provider_id` points at the Stage 3 catalogue provider
  -- when the activity is one of ours; `provider_name` covers everything else.
  source_type_id    uuid not null,
  provider_id       uuid,
  provider_name     text,
  cpd_activity_id   uuid references cpd.activity(id) on delete restrict,
  plan_item_id      uuid references growth.learning_plan_item(id) on delete set null,

  category_id       uuid not null,
  source_class      compliance.cpd_source_class not null,

  -- Documentation
  activity_from     date not null,
  activity_to       date not null,
  duration_hours    numeric(6,2) not null check (duration_hours > 0),
  delivery_method   cpd.delivery_method,
  certificate_evidence_id uuid references evidence.evidence(id) on delete restrict,
  attendance_note   text,
  external_reference text,      -- CBSE Training Portal / OASIS record id

  -- The claim
  hour_basis        compliance.cpd_hour_basis not null default 'attendance',
  activity_rule_id  uuid,
  claimed_hours     numeric(6,2) not null check (claimed_hours > 0),

  -- The decision. Null until verified; this is what the ledger counts.
  credited_hours    numeric(6,2) check (credited_hours >= 0),

  status            compliance.cpd_record_status not null default 'draft',
  submitted_at      timestamptz,
  reviewed_by       uuid references core.app_user(id) on delete restrict,
  reviewed_at       timestamptz,
  review_note       text,

  -- Which rule version this record was judged under. Recorded on the row so a
  -- later rule change cannot retroactively alter what was decided.
  requirement_version_id uuid,

  duplicate_of_id   uuid references compliance.cpd_record(id) on delete restrict,

  created_at        timestamptz not null default now(),
  created_by        uuid references core.app_user(id) on delete restrict,
  updated_at        timestamptz not null default now(),

  foreign key (teacher_profile_id, school_id) references core.teacher_profile(id, school_id) on delete cascade,
  foreign key (source_type_id, school_id) references compliance.cpd_source_type(id, school_id) on delete restrict,
  foreign key (category_id, school_id) references compliance.cpd_category(id, school_id) on delete restrict,
  foreign key (activity_rule_id, school_id) references compliance.cpd_activity_rule(id, school_id) on delete restrict,
  foreign key (requirement_version_id, school_id) references compliance.cpd_requirement_version(id, school_id) on delete restrict,
  unique (id, school_id),

  constraint cpd_record_dates_ordered check (activity_to >= activity_from),
  constraint cpd_record_provider_named check (provider_id is not null or length(btrim(coalesce(provider_name,''))) >= 2),
  constraint cpd_record_rule_basis check (
    (hour_basis = 'activity_rule') = (activity_rule_id is not null)
  ),
  -- A reviewer decision must name who, when, and how many hours were allowed.
  constraint cpd_record_verified_complete check (
    status <> 'verified' or (reviewed_by is not null and reviewed_at is not null and credited_hours is not null)
  ),
  -- Returning or rejecting requires a written reason. A developmental platform
  -- never hands back a bare refusal.
  constraint cpd_record_refusal_reasoned check (
    status not in ('returned_for_clarification', 'rejected')
    or length(btrim(coalesce(review_note, ''))) >= 10
  ),
  -- Credited hours may be reduced on review but never inflated beyond the claim.
  constraint cpd_record_credit_within_claim check (credited_hours is null or credited_hours <= claimed_hours)
);

comment on table compliance.cpd_record is
  'One block of CPD clock hours. Hours live here and only here; competency and SQAAF mappings are edges that never multiply them.';
comment on column compliance.cpd_record.credited_hours is
  'What the ledger counts. Null until verified — a claim is not an hour.';

create index cpd_record_teacher_year_idx on compliance.cpd_record (teacher_profile_id, academic_year_id, status);
create index cpd_record_school_year_idx on compliance.cpd_record (school_id, academic_year_id, status);

create trigger set_updated_at before update on compliance.cpd_record
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Mappings: many meanings, one set of hours
-- ---------------------------------------------------------------------------
create table compliance.cpd_record_competency (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  cpd_record_id uuid not null,
  competency_id uuid not null,
  note          text,
  created_at    timestamptz not null default now(),
  unique (cpd_record_id, competency_id),
  foreign key (cpd_record_id, school_id) references compliance.cpd_record(id, school_id) on delete cascade,
  foreign key (competency_id, school_id) references competency.competency(id, school_id) on delete cascade
);

comment on table compliance.cpd_record_competency is
  'Which competencies a CPD record developed. Carries no hours by design: mapping one record to four competencies must not create four records worth of credit.';

-- ---------------------------------------------------------------------------
-- Duplicate prevention
-- ---------------------------------------------------------------------------
-- Two defences, because they catch different mistakes:
--
--   1. The same catalogue activity claimed twice in one year — an honest
--      double-entry. Blocked outright by a unique index.
--   2. Overlapping date ranges from different providers — a teacher cannot be
--      in two full-day trainings at once. Flagged for review rather than
--      blocked, because a half-day and an evening webinar on one date are
--      legitimate and the schema does not record clock times.
create unique index cpd_record_no_repeat_activity
  on compliance.cpd_record (teacher_profile_id, academic_year_id, cpd_activity_id, activity_from)
  where cpd_activity_id is not null and status <> 'rejected';

create function compliance.flag_overlapping_cpd()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_overlap_hours numeric(6,2);
  v_span_days integer;
begin
  if new.status = 'rejected' then
    return new;
  end if;

  v_span_days := (new.activity_to - new.activity_from) + 1;

  select coalesce(sum(r.claimed_hours), 0) into v_overlap_hours
  from compliance.cpd_record r
  where r.teacher_profile_id = new.teacher_profile_id
    and r.academic_year_id = new.academic_year_id
    and r.id <> new.id
    and r.status <> 'rejected'
    and daterange(r.activity_from, r.activity_to, '[]')
        && daterange(new.activity_from, new.activity_to, '[]');

  -- More than 8 CPD hours per day across overlapping records is not credible.
  -- This refuses the claim rather than flagging it, because a ledger that
  -- accepts impossible attendance is not a compliance record.
  if (v_overlap_hours + new.claimed_hours) > (8 * v_span_days) then
    raise exception
      'CPD claim exceeds credible attendance: % hours already claimed over % overlapping day(s), plus % more',
      v_overlap_hours, v_span_days, new.claimed_hours
      using hint = 'Check for a duplicate entry, or split the record to match the days actually attended.';
  end if;

  return new;
end;
$$;

create trigger cpd_record_overlap_check
  before insert or update of claimed_hours, activity_from, activity_to, status
  on compliance.cpd_record
  for each row execute function compliance.flag_overlapping_cpd();

-- ---------------------------------------------------------------------------
-- Status transitions
-- ---------------------------------------------------------------------------
create table compliance.cpd_record_status_history (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  cpd_record_id uuid not null,
  from_status   compliance.cpd_record_status,
  to_status     compliance.cpd_record_status not null,
  changed_by    uuid references core.app_user(id) on delete restrict,
  changed_at    timestamptz not null default now(),
  note          text,
  foreign key (cpd_record_id, school_id) references compliance.cpd_record(id, school_id) on delete cascade
);

comment on table compliance.cpd_record_status_history is
  'Append-only trail of CPD record decisions. INSERT is revoked from clients, so entries cannot be forged; the trigger below is SECURITY DEFINER for exactly that reason.';

create function compliance.reject_cpd_status_history_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'compliance.cpd_record_status_history is append-only';
end;
$$;

create trigger cpd_status_history_immutable
  before update or delete on compliance.cpd_record_status_history
  for each row execute function compliance.reject_cpd_status_history_mutation();

create function compliance.validate_cpd_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_allowed boolean;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  v_allowed := case
    when tg_op = 'INSERT' then new.status in ('draft', 'submitted')
    when old.status = 'draft' then new.status = 'submitted'
    when old.status = 'submitted' then new.status in ('verified', 'returned_for_clarification', 'rejected', 'draft')
    when old.status = 'returned_for_clarification' then new.status in ('submitted', 'draft')
    else false        -- verified and rejected are terminal
  end;

  if not v_allowed then
    raise exception 'CPD record cannot move from % to %', coalesce(old.status::text, '(new)'), new.status;
  end if;

  -- Only a verified record carries credit, and losing verification loses it.
  if new.status <> 'verified' then
    new.credited_hours := null;
  end if;

  return new;
end;
$$;

create trigger cpd_record_validate_transition
  before insert or update of status on compliance.cpd_record
  for each row execute function compliance.validate_cpd_transition();

-- SECURITY DEFINER because INSERT on the history table is revoked from clients.
-- Stage 3 shipped this class of trigger without it and every transition failed
-- for real users while passing every test that ran as superuser.
create function compliance.record_cpd_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  insert into compliance.cpd_record_status_history
    (school_id, cpd_record_id, from_status, to_status, changed_by, note)
  values
    (new.school_id, new.id,
     case when tg_op = 'UPDATE' then old.status end,
     new.status,
     core.current_user_id(),
     new.review_note);

  return null;
end;
$$;

create trigger cpd_record_status_trail
  after insert or update of status on compliance.cpd_record
  for each row execute function compliance.record_cpd_status_change();
