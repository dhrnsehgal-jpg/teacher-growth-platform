-- ===========================================================================
-- 0040 — Teacher service record, and the two separate progression ladders
-- ===========================================================================
-- Stage 5 adds the employment layer. Two things govern everything in it:
--
-- 1. THE SCHOOL'S FUNDING STATUS IS UNVERIFIED, so no Punjab employment or pay
--    rule may be treated as applicable. The Stage 1 gate already refuses those
--    calculations; this stage adds a second, narrower message for the
--    service-rule question specifically.
--
-- 2. PROFESSIONAL CAPABILITY AND EMPLOYMENT RANK ARE DIFFERENT THINGS. A
--    teacher assessed as a Lead Practitioner is not thereby a Vice Principal,
--    and a Vice Principal is not thereby an expert teacher. Stage 1 already
--    holds the capability ladder as `core.career_level`; this migration adds the
--    employment ladder beside it and deliberately provides NO mapping between
--    them. See `docs/PUNJAB_SERVICE_RULES.md`.
-- ===========================================================================

create schema if not exists service;
comment on schema service is
  'Employment and service records: designations, appointment, probation, career history.';

-- ---------------------------------------------------------------------------
-- The gate message for service-rule applicability
-- ---------------------------------------------------------------------------
-- Distinct from the Stage 1 funding-status message. That one answers "may we
-- calculate?"; this one answers "does this rule reach this school?" — and a
-- school might confirm its funding status and still not have had its service
-- rules determined.
create or replace function core.service_rule_gate_message()
returns text
language sql immutable set search_path = ''
as $$
  select 'Employment/service-rule applicability requires authorised verification.'::text;
$$;

comment on function core.service_rule_gate_message is
  'Shown wherever a Punjab service or pay rule would otherwise be presented as applicable. Held in the database so every surface quotes the same words.';

-- ---------------------------------------------------------------------------
-- Employment designations — the ORGANISATIONAL ladder
-- ---------------------------------------------------------------------------
create table service.designation (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references core.school(id) on delete cascade,
  key           text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name  text not null,
  description   text,
  rank_order    integer not null,

  -- Whether the post carries formal leadership responsibility. Used by the
  -- competency target resolver, which already understands leadership posts.
  carries_leadership boolean not null default false,

  -- Classification is school policy unless something verified says otherwise.
  -- No Punjab designation structure has been verified for this school.
  classification regulatory.requirement_classification not null default 'school_policy',
  source_note   text,

  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (school_id, key),
  unique (school_id, rank_order),
  unique (id, school_id)
);

comment on table service.designation is
  'The employment/job ladder. Deliberately unrelated to core.career_level, which is the professional capability ladder — the platform provides no automatic mapping between them.';

-- ---------------------------------------------------------------------------
-- The service record
-- ---------------------------------------------------------------------------
create type service.probation_state as enum (
  'not_applicable',
  'on_probation',
  'extended',
  'confirmed',
  'not_confirmed'
);

create table service.service_record (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null,

  employee_id        text not null,
  appointment_date   date not null,
  appointment_letter_reference text,
  appointment_letter_evidence_id uuid references evidence.evidence(id) on delete set null,

  designation_id     uuid,
  employment_category text,

  probation_state    service.probation_state not null default 'not_applicable',
  probation_from     date,
  probation_to       date,
  confirmed_on       date,
  confirmation_reference text,

  prior_experience_months integer check (prior_experience_months is null or prior_experience_months >= 0),

  -- Which service policy governs this record, and which version of it. Null
  -- while applicability is undetermined, which is the current state: no Punjab
  -- service rule has been verified as reaching this school.
  service_policy_id       uuid,
  service_policy_version  integer,

  separated_on       date,
  separation_reason  text,

  created_at         timestamptz not null default now(),
  created_by         uuid references core.app_user(id) on delete restrict,
  updated_at         timestamptz not null default now(),

  unique (school_id, teacher_profile_id),
  unique (school_id, employee_id),
  unique (id, school_id),
  foreign key (teacher_profile_id, school_id) references core.teacher_profile(id, school_id) on delete cascade,
  foreign key (designation_id, school_id) references service.designation(id, school_id) on delete restrict,

  constraint service_record_probation_dates check (probation_to is null or probation_from is null or probation_to >= probation_from),
  constraint service_record_confirmed_state check (
    (probation_state = 'confirmed') = (confirmed_on is not null)
  ),
  constraint service_record_separation_reasoned check (
    separated_on is null or length(btrim(coalesce(separation_reason, ''))) >= 10
  )
);

comment on table service.service_record is
  'One service record per teacher. Holds only what the school needs for the authorised purpose — no salary figures, no bank details, no personal identifiers beyond the employee id.';
comment on column service.service_record.service_policy_id is
  'The service policy governing this record. Null while applicability is undetermined — which it is, because no Punjab service rule has been verified as reaching this school.';

create trigger set_updated_at before update on service.service_record
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Career events — append-only
-- ---------------------------------------------------------------------------
create type service.career_event_type as enum (
  'appointment',
  'probation_started',
  'probation_extended',
  'confirmation',
  'designation_change',
  'department_change',
  'category_change',
  'career_level_change',
  'leave_of_absence',
  'return_from_leave',
  'separation'
);

create table service.career_event (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null,
  service_record_id  uuid not null,

  event_type         service.career_event_type not null,
  effective_on       date not null,

  -- What changed, in words a person can read, plus the structured before/after
  -- where there is one.
  summary            text not null check (length(btrim(summary)) >= 10),
  previous_value     jsonb,
  new_value          jsonb,

  -- The document behind it. A designation change with no reference is a claim.
  reference          text,
  evidence_id        uuid references evidence.evidence(id) on delete set null,

  recorded_by        uuid references core.app_user(id) on delete restrict,
  recorded_at        timestamptz not null default now(),

  foreign key (service_record_id, school_id) references service.service_record(id, school_id) on delete cascade
);

comment on table service.career_event is
  'Append-only career history. A correction is a new event, because a service record whose past can be edited is not a service record.';

create index career_event_record_idx on service.career_event (service_record_id, effective_on desc);

create function service.reject_career_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'service.career_event is append-only; record a correcting event instead'
    using hint = 'A service record whose history can be rewritten cannot evidence anything.';
end;
$$;

create trigger career_event_immutable
  before update or delete on service.career_event
  for each row execute function service.reject_career_event_mutation();

-- ---------------------------------------------------------------------------
-- Qualifications
-- ---------------------------------------------------------------------------
create table service.qualification (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null,
  service_record_id  uuid not null,

  qualification      text not null check (length(btrim(qualification)) >= 2),
  awarding_body      text,
  subject_or_field   text,
  level              text,                       -- e.g. Bachelors, Masters, B.Ed., Doctorate
  awarded_year       integer check (awarded_year is null or awarded_year between 1900 and 2100),

  -- Verification is an HR act, recorded as one. Stage 1 put the same idea on
  -- the teacher profile; this is the per-qualification detail behind it.
  verification_status regulatory.verification_status not null default 'requires_verification',
  verified_by        uuid references core.app_user(id) on delete restrict,
  verified_at        timestamptz,
  verification_note  text,
  evidence_id        uuid references evidence.evidence(id) on delete set null,

  created_at         timestamptz not null default now(),
  foreign key (service_record_id, school_id) references service.service_record(id, school_id) on delete cascade,
  constraint qualification_verified_complete check (
    verification_status <> 'verified' or (verified_by is not null and verified_at is not null)
  )
);

comment on table service.qualification is
  'Qualifications claimed and, separately, whether anyone has checked them. NCTE qualification regulations remain unverified for this school, so nothing here asserts eligibility against them.';

-- ---------------------------------------------------------------------------
-- Service policies — versioned, and none of them assumed applicable
-- ---------------------------------------------------------------------------
create table service.policy (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references core.school(id) on delete cascade,
  key            text not null check (key ~ '^[a-z][a-z0-9_.]*$'),
  version        integer not null check (version >= 1),
  title          text not null,
  summary        text,

  -- Where it comes from. A rule classified `mandatory` must cite a source.
  classification regulatory.requirement_classification not null,
  source_id      uuid references regulatory.source(id) on delete restrict,
  requirement_id uuid references regulatory.requirement(id) on delete restrict,
  clause_reference text,
  verification_status regulatory.verification_status not null default 'requires_verification',

  -- Applicability, determined rather than inferred. The brief is explicit:
  -- never infer applicability from the title of a statute.
  applies_to_funding_status core.school_funding_status[],
  applies_to_employee_categories text[],
  applicability regulatory.verification_status not null default 'requires_verification',
  applicability_note text,
  applicability_determined_by uuid references core.app_user(id) on delete restrict,
  applicability_determined_at timestamptz,

  amendment_status text,
  effective_from date,
  effective_to   date,
  superseded_by_id uuid references service.policy(id) on delete restrict,

  created_at     timestamptz not null default now(),
  unique (school_id, key, version),
  unique (id, school_id),
  constraint service_policy_period check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint service_policy_mandatory_needs_source check (
    classification <> 'mandatory' or (source_id is not null and clause_reference is not null)
  ),
  -- Applicability may only be settled by a named person on a date. Anything
  -- else is an assumption wearing a determination's clothes.
  constraint service_policy_applicability_determined check (
    applicability in ('requires_verification', 'potentially_applicable')
    or (applicability_determined_by is not null and applicability_determined_at is not null
        and length(btrim(coalesce(applicability_note, ''))) >= 20)
  )
);

comment on table service.policy is
  'Service rules and school employment policy, versioned. Applicability is a recorded determination, never inferred from a statute''s title.';

comment on column service.policy.applies_to_funding_status is
  'The funding statuses a rule reaches. Central to Stage 5: a rule that binds aided schools says so here, and does not reach an unaided one.';

-- A policy cannot be marked as reaching this school while the school's own
-- funding status is unknown — that is precisely the inference the brief forbids.
create function service.assert_applicability_supportable()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_funding core.school_funding_status;
begin
  if new.applicability not in ('verified', 'not_applicable') then
    return new;
  end if;

  select funding_status into v_funding
  from core.school_regulatory_profile where school_id = new.school_id;

  if v_funding is null or v_funding = 'unverified' then
    raise exception
      'Cannot determine applicability of a service rule while the school''s funding status is unverified: %',
      core.service_rule_gate_message()
      using hint = 'Confirm the aided/unaided/government status on the School Regulatory Profile first.';
  end if;

  if new.applies_to_funding_status is not null
     and new.applicability = 'verified'
     and not (v_funding = any (new.applies_to_funding_status)) then
    raise exception
      'This rule applies to % but the school is recorded as %; record it as not_applicable rather than verified',
      new.applies_to_funding_status, v_funding;
  end if;

  return new;
end;
$$;

create trigger service_policy_applicability_guard
  before insert or update on service.policy
  for each row execute function service.assert_applicability_supportable();
