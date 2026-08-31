-- ===========================================================================
-- 0001 — Foundation: schemas, extensions, shared enums, common triggers
-- ===========================================================================
-- Stage 1. Establishes the namespaces every later migration builds on.
--
--   core        tenant, identity, org structure, teacher records
--   regulatory  regulatory sources, requirement versions, applicability
--   audit       append-only audit trail
--
-- Design note: the domain is deliberately NOT in `public`. PostgREST exposes
-- named schemas explicitly (see supabase/config.toml), so anything not listed
-- there is unreachable over the API even if a policy were mis-written.
-- ===========================================================================

create schema if not exists core;
create schema if not exists regulatory;
create schema if not exists audit;

comment on schema core is 'Tenant, identity, organisational structure and teacher records.';
comment on schema regulatory is 'Versioned regulatory sources, requirements and applicability rules.';
comment on schema audit is 'Append-only audit trail. No UPDATE or DELETE is granted to any application role.';

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------

-- Regulatory layer. Kept as an enum because these four layers are structural
-- to the product: every requirement must be attributable to exactly one.
create type regulatory.authority_layer as enum (
  'central',   -- Parliament, MoE, NCTE, NCERT, data protection
  'cbse',      -- Central Board of Secondary Education
  'state',     -- Government of Punjab / Punjab School Education Department
  'school'     -- The school's own governing body and policies
);

-- The single most important classification in this product. A school policy
-- must never be rendered to a teacher as a CBSE rule; this column is what the
-- UI reads to choose that wording.
create type regulatory.requirement_classification as enum (
  'mandatory',      -- Legally or contractually binding on this school
  'recommended',    -- Advisory/guidance from a competent authority
  'school_policy'   -- The school's own rule, adopted voluntarily
);

-- Only these five statuses are permitted anywhere in the system.
create type regulatory.verification_status as enum (
  'verified',                 -- Confirmed against a current official source
  'requires_verification',    -- Believed relevant; NOT confirmed. Never enforced.
  'superseded',               -- Replaced by a later version
  'not_applicable',           -- Confirmed not to apply to this school
  'potentially_applicable'    -- May apply; depends on unconfirmed school facts
);

-- Which school types a requirement binds. Multiple values may apply.
create type regulatory.school_type_applicability as enum (
  'private_unaided',
  'private_aided',
  'government',
  'all_school_types'
);

create type core.school_funding_status as enum (
  'private_unaided',
  'private_aided',
  'government',
  'other',
  'unverified'   -- Default. Gates all employment/pay compliance calculation.
);

create type core.school_ownership_type as enum (
  'society',
  'trust',
  'section_8_company',
  'government_body',
  'other',
  'unverified'
);

create type core.minority_status as enum (
  'minority',
  'non_minority',
  'unverified'
);

create type core.affiliation_status as enum (
  'provisional',
  'regular',
  'extended',
  'applied',
  'withdrawn',
  'unverified'
);

-- The authority scope attached to a role assignment. This is what stops a Head
-- of Department from seeing staff outside their department.
create type core.assignment_scope_type as enum (
  'school',        -- Whole tenant (Principal, HR, Compliance Admin)
  'department',    -- One department (Head of Department)
  'school_stage',  -- One stage, e.g. Foundational (Academic Coordinator)
  'individual'     -- An explicitly enumerated set of teachers (mentor, acting cover)
);

create type core.employment_status as enum (
  'active',
  'probation',
  'on_leave',
  'notice_period',
  'separated'
);

-- ---------------------------------------------------------------------------
-- Common trigger helpers
-- ---------------------------------------------------------------------------

create or replace function core.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function core.set_updated_at() is
  'BEFORE UPDATE trigger. Maintains updated_at; never trust a client-supplied value.';

-- Blocks UPDATE/DELETE at the row level for append-only tables. Privileges are
-- also revoked, but this makes the intent explicit and survives a GRANT slip.
create or replace function core.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Table %.% is append-only; % is not permitted.',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function core.reject_mutation() is
  'Trigger guard for append-only tables (audit trail, regulatory versions).';
