-- ===========================================================================
-- 0004 — School Regulatory Profile, stage taxonomy, applicability gating
-- ===========================================================================
-- The school knows it is in Punjab from day one. Which Punjab rules actually
-- reach it depends on facts that must be confirmed from documents, not assumed:
-- funding status above all.
--
-- Hard rule implemented here: while funding status is unverified, employment
-- and pay compliance calculations are OFF, and the UI shows a fixed message.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Stage and class taxonomy (NEP 2020 5+3+3+4)
-- ---------------------------------------------------------------------------

create table core.school_stage (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name      text not null,
  -- NEP stage this maps to, where the school chooses to align.
  nep_stage         text check (nep_stage in
                      ('foundational', 'preparatory', 'middle', 'secondary')),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint school_stage_unique unique (school_id, key)
);

comment on table core.school_stage is
  'Teaching stages as the school organises them, optionally aligned to the NEP '
  '2020 5+3+3+4 structure. Used to scope Academic Coordinator authority.';

create trigger set_updated_at before update on core.school_stage
  for each row execute function core.set_updated_at();

create table core.class_level (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null check (key ~ '^[a-z0-9][a-z0-9_]*$'),
  display_name      text not null,          -- 'Balvatika 3', 'Class VIII'
  school_stage_id   uuid references core.school_stage(id) on delete set null,
  sort_order        integer not null,
  is_offered        boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint class_level_unique unique (school_id, key)
);

comment on table core.class_level is
  'Classes the school offers, Balvatika/Kindergarten through Class XII. Kept as '
  'rows rather than an enum because pre-primary nomenclature varies by school.';

create index class_level_school_idx on core.class_level (school_id, sort_order);

-- ---------------------------------------------------------------------------
-- School Regulatory Profile
-- ---------------------------------------------------------------------------

create table core.school_regulatory_profile (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null unique references core.school(id) on delete cascade,

  -- Location ---------------------------------------------------------------
  country           text not null default 'India',
  state             text not null default 'Punjab',
  district          text,
  block_or_tehsil   text,
  postal_code       text,

  -- CBSE affiliation -------------------------------------------------------
  cbse_affiliation_number   text,
  cbse_school_code          text,
  cbse_affiliation_status   core.affiliation_status not null default 'unverified',
  cbse_affiliation_valid_from date,
  cbse_affiliation_valid_to   date,
  -- Whether the school is affiliated up to Senior Secondary (Class XII).
  is_senior_secondary       boolean,

  -- State recognition ------------------------------------------------------
  state_recognition_number    text,
  state_recognition_authority text,
  state_recognition_valid_from date,
  state_recognition_valid_to   date,

  -- Ownership and funding --------------------------------------------------
  ownership_type            core.school_ownership_type not null default 'unverified',
  managing_body_name        text,
  managing_body_registration_number text,
  funding_status            core.school_funding_status not null default 'unverified',
  minority_status           core.minority_status not null default 'unverified',

  -- Applicable frameworks --------------------------------------------------
  -- Free text until confirmed. These are deliberately NOT enums: naming the
  -- applicable service or pay framework is a legal determination, and inventing
  -- a closed list would invite guessing.
  applicable_service_framework text,
  applicable_pay_framework     text,
  applicable_recognition_authority text,

  -- Verification of the gating facts --------------------------------------
  funding_status_verified_at   timestamptz,
  funding_status_verified_by   uuid references core.app_user(id),
  funding_status_evidence_note text,

  affiliation_verified_at      timestamptz,
  affiliation_verified_by      uuid references core.app_user(id),

  service_framework_verified_at timestamptz,
  service_framework_verified_by uuid references core.app_user(id),

  last_reviewed_on          date,
  review_due_on             date,
  notes                     text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- A funding status may only leave 'unverified' with a named verifier and a
  -- note recording what document was seen.
  constraint profile_funding_verification_complete check (
    funding_status = 'unverified'
    or (funding_status_verified_at is not null
        and funding_status_verified_by is not null
        and funding_status_evidence_note is not null
        and length(btrim(funding_status_evidence_note)) >= 10)
  ),
  constraint profile_affiliation_period_ordered check (
    cbse_affiliation_valid_to is null
    or cbse_affiliation_valid_from is null
    or cbse_affiliation_valid_to >= cbse_affiliation_valid_from
  )
);

comment on table core.school_regulatory_profile is
  'The regulatory identity of one school. Everything that decides which Punjab, '
  'CBSE or central rules reach this school lives here, each with its own '
  'verification state. Defaults are deliberately "unverified", not a guess.';

comment on column core.school_regulatory_profile.funding_status is
  'Private aided / unaided / government. Controls whether Punjab employment and '
  'pay rules are activated. Defaults to unverified and must stay there until a '
  'document has been seen.';

create trigger set_updated_at before update on core.school_regulatory_profile
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------

-- The exact message the UI must display. Held in the database so the API, the
-- UI and any report all quote the same words.
create or replace function core.employment_gate_message()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'School funding/service status requires verification before employment-related compliance calculations can be activated.'::text;
$$;

create or replace function core.employment_compliance_enabled(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from core.school_regulatory_profile p
    where p.school_id = p_school_id
      and p.funding_status <> 'unverified'
      and p.funding_status_verified_at is not null
      and p.funding_status_verified_by is not null
  );
$$;

comment on function core.employment_compliance_enabled(uuid) is
  'False until funding/service status is confirmed. Every employment, service '
  'rule, pay and increment calculation must check this first and, when false, '
  'return core.employment_gate_message() instead of a result.';

-- Raises rather than returns, for use inside calculation functions that must
-- not silently produce a value.
create or replace function core.assert_employment_compliance_enabled(p_school_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not core.employment_compliance_enabled(p_school_id) then
    raise exception '%', core.employment_gate_message()
      using errcode = 'restrict_violation';
  end if;
end;
$$;

-- Convenience view for the UI banner.
create or replace view core.school_compliance_readiness
with (security_invoker = true) as
select
  p.school_id,
  p.funding_status,
  p.cbse_affiliation_status,
  core.employment_compliance_enabled(p.school_id) as employment_compliance_enabled,
  case
    when core.employment_compliance_enabled(p.school_id) then null
    else core.employment_gate_message()
  end as employment_gate_message,
  -- Professional growth, competency and CPD tracking are NOT gated: they do not
  -- depend on funding status. Only employment/pay consequences are.
  true as professional_growth_enabled,
  p.last_reviewed_on,
  p.review_due_on
from core.school_regulatory_profile p;

comment on view core.school_compliance_readiness is
  'What the school may currently compute. Note that only employment-related '
  'calculation is gated; competency, CPD and development planning run regardless.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table core.school_stage               enable row level security;
alter table core.class_level                enable row level security;
alter table core.school_regulatory_profile  enable row level security;

create policy school_stage_select on core.school_stage
  for select using (core.is_member_of(school_id));

create policy school_stage_write on core.school_stage
  for all using (core.has_permission(school_id, 'school.manage'))
  with check (core.has_permission(school_id, 'school.manage'));

create policy class_level_select on core.class_level
  for select using (core.is_member_of(school_id));

create policy class_level_write on core.class_level
  for all using (core.has_permission(school_id, 'school.manage'))
  with check (core.has_permission(school_id, 'school.manage'));

-- Every member may read the regulatory profile. A teacher asking "which rules
-- apply to me?" needs to see the school's declared status and its verification
-- state; hiding it would undermine the transparency the product promises.
create policy school_regulatory_profile_select on core.school_regulatory_profile
  for select using (core.is_member_of(school_id));

create policy school_regulatory_profile_write on core.school_regulatory_profile
  for all using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));
