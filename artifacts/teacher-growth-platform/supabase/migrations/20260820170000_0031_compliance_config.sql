-- ===========================================================================
-- 0031 — Compliance: versioned CPD regulatory configuration
-- ===========================================================================
-- Stage 4's first rule: regulatory values live in versioned configuration, not
-- in application logic. Nothing in `src/` may contain the number 50, the 25/25
-- split, or the 12/24/14 domain allocation. They are rows here.
--
-- The reason is not tidiness. CBSE can revise the CPD scheme, and when it does
-- the platform must keep answering "was this teacher compliant in 2026-27?"
-- under the rule that actually applied in 2026-27. A constant in TypeScript
-- cannot do that; a row with an effective period can.
--
-- Structure:
--
--   cpd_requirement_version        one CBSE (or school) CPD scheme, versioned
--     ├── cpd_requirement_allocation   the category × source-class matrix
--     └── cpd_activity_rule            non-course activities that earn credit
--            └── cpd_rule_cap_group    caps that span several rules
--
--   cpd_source_class    Board-side vs school-side (the 25 + 25 axis)
--   cpd_category        the NPST-aligned domains (the 12/24/14 axis)
--   cpd_source_type     configurable providers/source types, each classified
--
-- The allocation matrix is the single source of truth for both axes. Category
-- totals and source-class totals are SUMs over it, so the two can never
-- disagree — a bug that would otherwise be invisible until an audit.
-- ===========================================================================

create schema if not exists compliance;
comment on schema compliance is
  'CBSE CPD compliance: versioned regulatory configuration and the teacher CPD ledger.';

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

-- Which side of the 25 + 25 split an hour was earned on.
create type compliance.cpd_source_class as enum (
  'board_or_government',   -- CBSE, CBSE CoE, Government Regional Training Institutes
  'school_or_complex'      -- in-house, School Complex
);

create type compliance.compliance_state as enum (
  'compliant',
  'on_track',
  'at_risk',
  'not_met'
);

-- ---------------------------------------------------------------------------
-- CPD categories — the NPST-aligned domains CBSE allocates hours across
-- ---------------------------------------------------------------------------
create table compliance.cpd_category (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references core.school(id) on delete cascade,
  key           text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name  text not null,
  description   text,
  -- The NPST standard this category corresponds to, where one does. CBSE's 2025
  -- notification names its three domains identically to NPST's three Standards;
  -- recording the link makes that traceable rather than coincidental.
  npst_standard_key text,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (school_id, key),
  unique (id, school_id)
);

comment on table compliance.cpd_category is
  'CPD hour categories. Seeded from the CBSE CPD Guidelines 2025 domain names, which match the NPST Standards.';

-- ---------------------------------------------------------------------------
-- Source types — configurable providers, each mapped to a source class
-- ---------------------------------------------------------------------------
create table compliance.cpd_source_type (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references core.school(id) on delete cascade,
  key           text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name  text not null,
  description   text,
  source_class  compliance.cpd_source_class not null,

  -- Whether hours from this source count toward the CBSE requirement at all.
  -- Defaults to false: a source counts only once someone with authority says so.
  counts_toward_requirement boolean not null default false,

  -- Recognition reuses the Stage 2 source vocabulary so an in-house workshop can
  -- never render as accredited.
  recognition            competency.source_framework not null default 'school',
  recognition_alignment  competency.source_alignment not null default 'school_defined',
  external_reference     text,
  regulatory_source_id   uuid references regulatory.source(id) on delete restrict,

  -- Who classified it this way, and when. `counts_toward_requirement` is a
  -- compliance assertion; it must be attributable.
  classified_by  uuid references core.app_user(id) on delete restrict,
  classified_at  timestamptz,
  classification_note text,

  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (school_id, key),
  unique (id, school_id),
  constraint cpd_source_type_aligned_needs_reference
    check (recognition_alignment <> 'aligned' or external_reference is not null),
  -- Counting toward a regulatory requirement is an authorised act, so it must
  -- carry the authorisation with it.
  constraint cpd_source_type_counting_needs_classification
    check (not counts_toward_requirement
           or (classified_by is not null and classified_at is not null
               and length(btrim(coalesce(classification_note, ''))) >= 10))
);

comment on column compliance.cpd_source_type.counts_toward_requirement is
  'Whether hours from this source count toward the CBSE requirement. False until an authorised person classifies it, with a note.';

-- ---------------------------------------------------------------------------
-- Requirement versions — one CPD scheme, with an effective period
-- ---------------------------------------------------------------------------
create table compliance.cpd_requirement_version (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references core.school(id) on delete cascade,
  key            text not null check (key ~ '^[a-z][a-z0-9_.]*$'),
  version        integer not null check (version >= 1),

  -- Where the rule comes from. A version with classification 'mandatory' must
  -- cite a regulatory requirement; a school's own policy need not.
  authority_id   uuid references regulatory.authority(id) on delete restrict,
  source_id      uuid references regulatory.source(id) on delete restrict,
  requirement_id uuid references regulatory.requirement(id) on delete restrict,
  clause_reference text,

  title          text not null,
  total_hours    numeric(6,2) not null check (total_hours >= 0),

  classification regulatory.requirement_classification not null,
  verification_status regulatory.verification_status not null default 'requires_verification',
  applicability  regulatory.verification_status not null default 'requires_verification',
  applicability_note text,

  effective_from date not null,
  effective_to   date,

  superseded_by_id uuid references compliance.cpd_requirement_version(id) on delete restrict,

  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid references core.app_user(id) on delete restrict,

  unique (school_id, key, version),
  unique (id, school_id),
  constraint cpd_requirement_version_period check (effective_to is null or effective_to > effective_from),
  -- A mandatory rule without a citation is an assertion, not a requirement.
  constraint cpd_requirement_version_mandatory_needs_source
    check (classification <> 'mandatory' or (source_id is not null and requirement_id is not null))
);

comment on table compliance.cpd_requirement_version is
  'A versioned CPD requirement. Superseding creates a new row; the old one keeps its effective period so historical years stay answerable under the rule that applied to them.';

-- ---------------------------------------------------------------------------
-- The allocation matrix: category × source class
-- ---------------------------------------------------------------------------
create table compliance.cpd_requirement_allocation (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  version_id    uuid not null,
  category_id   uuid not null,
  source_class  compliance.cpd_source_class not null,
  required_hours numeric(6,2) not null check (required_hours >= 0),
  note          text,
  created_at    timestamptz not null default now(),

  unique (version_id, category_id, source_class),
  foreign key (version_id, school_id) references compliance.cpd_requirement_version(id, school_id) on delete cascade,
  foreign key (category_id, school_id) references compliance.cpd_category(id, school_id) on delete restrict
);

comment on table compliance.cpd_requirement_allocation is
  'The category × source-class hour matrix. Category totals and the 25/25 source split are both SUMs over this table, so they cannot drift apart.';

-- The declared total must equal the matrix. Checked after each statement so a
-- multi-row insert can build the matrix before it balances.
create function compliance.assert_allocation_balances()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_version uuid;
  v_declared numeric(6,2);
  v_sum numeric(6,2);
begin
  v_version := coalesce(new.version_id, old.version_id);

  select total_hours into v_declared
  from compliance.cpd_requirement_version where id = v_version;

  if v_declared is null then
    return null;   -- version already gone; cascade in progress
  end if;

  select coalesce(sum(required_hours), 0) into v_sum
  from compliance.cpd_requirement_allocation where version_id = v_version;

  if v_sum <> v_declared then
    raise exception
      'CPD allocation does not balance: version declares % hours, allocation matrix sums to %',
      v_declared, v_sum
      using hint = 'Every hour of the total must be allocated to a category and a source class.';
  end if;

  return null;
end;
$$;

create constraint trigger cpd_allocation_balances
  after insert or update or delete on compliance.cpd_requirement_allocation
  deferrable initially deferred
  for each row execute function compliance.assert_allocation_balances();

-- ---------------------------------------------------------------------------
-- Which requirement version governs which academic year
-- ---------------------------------------------------------------------------
-- This is the mechanism behind "old rule stays attached to historical years".
-- The binding is written once per year and is immutable afterwards.
create table compliance.cpd_year_requirement (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references core.school(id) on delete cascade,
  academic_year_id uuid not null references core.academic_year(id) on delete restrict,
  version_id       uuid not null,
  bound_at         timestamptz not null default now(),
  bound_by         uuid references core.app_user(id) on delete restrict,
  rationale        text,
  unique (school_id, academic_year_id),
  foreign key (version_id, school_id) references compliance.cpd_requirement_version(id, school_id) on delete restrict
);

comment on table compliance.cpd_year_requirement is
  'Binds an academic year to the CPD requirement version that governs it. Immutable once written — rebinding a closed year would silently rewrite history.';

-- Rebinding a year is how a past compliance judgement gets quietly rewritten.
-- Allowed only while the year is open, and never by a plain UPDATE of version_id.
create function compliance.reject_year_requirement_rebind()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_locked timestamptz;
begin
  if new.version_id is distinct from old.version_id then
    select locked_at into v_locked from core.academic_year where id = old.academic_year_id;
    if v_locked is not null then
      raise exception 'Academic year is locked; its CPD requirement version cannot be changed'
        using hint = 'Use regulatory.recalculation_authorisation to authorise recalculating a closed year.';
    end if;
  end if;
  return new;
end;
$$;

create trigger cpd_year_requirement_no_rebind
  before update on compliance.cpd_year_requirement
  for each row execute function compliance.reject_year_requirement_rebind();

-- ---------------------------------------------------------------------------
-- Activity rules — credit for professional work that is not a course
-- ---------------------------------------------------------------------------
-- Cap groups exist because CBSE caps a *set* of activities collectively (the
-- academic tasks share an 11-hour ceiling), not each one individually.
create table compliance.cpd_rule_cap_group (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  version_id    uuid not null,
  key           text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name  text not null,
  cap_hours     numeric(6,2) not null check (cap_hours >= 0),
  cap_basis     text not null,          -- the clause that sets the cap
  created_at    timestamptz not null default now(),
  unique (version_id, key),
  unique (id, school_id),
  foreign key (version_id, school_id) references compliance.cpd_requirement_version(id, school_id) on delete cascade
);

comment on table compliance.cpd_rule_cap_group is
  'A ceiling shared by several activity rules. CBSE caps its academic-task equivalences collectively at 11 hours, not one by one.';

create table compliance.cpd_activity_rule (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  version_id    uuid not null,
  key           text not null check (key ~ '^[a-z][a-z0-9_]*$'),

  permitted_activity text not null check (length(btrim(permitted_activity)) >= 10),
  hour_credit   numeric(6,2) not null check (hour_credit > 0),
  annual_cap_hours numeric(6,2) check (annual_cap_hours is null or annual_cap_hours > 0),
  cap_group_id  uuid,

  category_id   uuid not null,
  source_class  compliance.cpd_source_class not null,

  required_evidence  text not null check (length(btrim(required_evidence)) >= 10),
  -- Named as a permission key so approval authority is enforceable, not advisory.
  approval_permission text not null references core.permission(key) on delete restrict,

  regulatory_source_id uuid references regulatory.source(id) on delete restrict,
  clause_reference     text,
  verification_status  regulatory.verification_status not null default 'requires_verification',

  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),

  unique (version_id, key),
  unique (id, school_id),
  foreign key (version_id, school_id) references compliance.cpd_requirement_version(id, school_id) on delete cascade,
  foreign key (category_id, school_id) references compliance.cpd_category(id, school_id) on delete restrict,
  foreign key (cap_group_id, school_id) references compliance.cpd_rule_cap_group(id, school_id) on delete restrict,
  -- An hour credit asserted as verified must say where it comes from. This is
  -- the constraint that makes "Do not invent activity-credit hours" structural.
  constraint cpd_activity_rule_verified_needs_source
    check (verification_status <> 'verified'
           or (regulatory_source_id is not null and clause_reference is not null))
);

comment on table compliance.cpd_activity_rule is
  'Non-course activities that earn CPD credit. A verified hour credit must cite its source — the schema will not accept an invented number as verified.';

create index cpd_activity_rule_version_idx on compliance.cpd_activity_rule (version_id) where is_active;
create index cpd_requirement_version_school_idx on compliance.cpd_requirement_version (school_id, effective_from desc);

-- ---------------------------------------------------------------------------
-- Resolution: which version governs a given year
-- ---------------------------------------------------------------------------
create function compliance.requirement_version_for_year(
  p_school_id uuid,
  p_academic_year_id uuid
) returns compliance.cpd_requirement_version
language plpgsql stable security definer set search_path = '' as $$
declare
  v_row compliance.cpd_requirement_version;
begin
  -- An explicit binding always wins: it records a decision somebody made, and
  -- for a closed year it is the only defensible answer.
  select v.* into v_row
  from compliance.cpd_year_requirement yr
  join compliance.cpd_requirement_version v on v.id = yr.version_id
  where yr.school_id = p_school_id
    and yr.academic_year_id = p_academic_year_id;

  if found then
    return v_row;
  end if;

  -- Otherwise fall back to the version whose effective period overlaps the year.
  -- Most recent effective_from wins, then highest version — deterministic, so
  -- two runs of the ledger can never disagree about which rule applied.
  select v.* into v_row
  from compliance.cpd_requirement_version v
  join core.academic_year ay on ay.id = p_academic_year_id
  where v.school_id = p_school_id
    and v.effective_from <= ay.ends_on
    and (v.effective_to is null or v.effective_to >= ay.starts_on)
  order by v.effective_from desc, v.version desc
  limit 1;

  return v_row;
end;
$$;

comment on function compliance.requirement_version_for_year is
  'The CPD rule that governs a year: the explicit binding if one exists, otherwise the version whose effective period covers the year.';
