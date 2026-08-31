-- ===========================================================================
-- 0033 — SQAAF framework structure
-- ===========================================================================
-- Stage 1 deferred these tables deliberately: "building indicator tables before
-- the indicator text is verified would mean guessing at the shape." The manual
-- has now been retrieved and read, so the shape is known rather than guessed.
--
--   CBSE School Quality Assessment and Assurance Framework, April 2023
--   https://cbseacademic.nic.in/sqaa/doc/handbook.pdf
--
-- Verified from that document:
--   * 7 domains, 48 sub-domains, 84 standards, 336 maximum marks
--   * Curriculum, Pedagogy and Assessment carries 40% weightage; the other six
--     carry 10% each
--   * Four performance levels: I Inceptive, II Transient, III Stable,
--     IV Dynamic Evolving, scoring 1-4
--   * "Schools affiliated to CBSE must undergo the process of SQAA and
--     self-assess themselves on the SQAA Framework every year on SQAA Portal"
--
-- Still REQUIRES VERIFICATION and therefore absent here: the maturity-level
-- bands (what overall percentage corresponds to which maturity level — section
-- 1.11.2 of the manual is an image and could not be read), and the annual
-- submission window, which the manual does not state.
-- ===========================================================================

create schema if not exists sqaaf;
comment on schema sqaaf is
  'CBSE School Quality Assessment and Assurance Framework: structure, self-assessment, evidence mapping and improvement planning.';

-- ---------------------------------------------------------------------------
-- Framework version
-- ---------------------------------------------------------------------------
create table sqaaf.framework_version (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references core.school(id) on delete cascade,
  key            text not null check (key ~ '^[a-z][a-z0-9_.]*$'),
  edition_label  text not null,
  source_id      uuid references regulatory.source(id) on delete restrict,
  requirement_id uuid references regulatory.requirement(id) on delete restrict,

  total_standards integer not null check (total_standards > 0),
  total_marks     integer not null check (total_marks > 0),
  max_level_score integer not null default 4 check (max_level_score > 0),

  verification_status regulatory.verification_status not null default 'requires_verification',
  effective_from date not null,
  effective_to   date,
  superseded_by_id uuid references sqaaf.framework_version(id) on delete restrict,
  notes          text,
  created_at     timestamptz not null default now(),

  unique (school_id, key),
  unique (id, school_id),
  constraint sqaaf_framework_period check (effective_to is null or effective_to > effective_from)
);

comment on table sqaaf.framework_version is
  'A SQAAF edition. A revised edition is a new row — last cycle''s self-assessment keeps pointing at the edition it was made under.';

-- ---------------------------------------------------------------------------
-- Performance levels — the 4-point scale
-- ---------------------------------------------------------------------------
create table sqaaf.performance_level (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  version_id    uuid not null,
  level_number  integer not null check (level_number between 1 and 10),
  roman_label   text not null,       -- 'I', 'II', 'III', 'IV'
  display_name  text not null,       -- 'Inceptive', 'Transient', 'Stable', 'Dynamic Evolving'
  score         numeric(5,2) not null check (score >= 0),
  description   text,
  unique (version_id, level_number),
  unique (id, school_id),
  foreign key (version_id, school_id) references sqaaf.framework_version(id, school_id) on delete cascade
);

comment on table sqaaf.performance_level is
  'The SQAAF benchmarking scale. Verified from the manual: Level I Inceptive (1) through Level IV Dynamic Evolving (4).';

-- ---------------------------------------------------------------------------
-- Domains, sub-domains, standards
-- ---------------------------------------------------------------------------
create table sqaaf.domain (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null,
  version_id      uuid not null,
  domain_number   integer not null check (domain_number > 0),
  name            text not null,
  overview        text,
  weightage_percent numeric(5,2) not null check (weightage_percent >= 0 and weightage_percent <= 100),
  standard_count  integer not null check (standard_count >= 0),
  max_score       integer not null check (max_score >= 0),

  -- Whether this platform can supply evidence for the domain, and how much.
  -- Recorded per domain so the interface can be honest rather than implying
  -- that a teacher-growth system covers building safety or fee administration.
  platform_coverage text not null default 'none'
    check (platform_coverage in ('primary', 'partial', 'none')),
  coverage_note   text,

  unique (version_id, domain_number),
  unique (id, school_id),
  foreign key (version_id, school_id) references sqaaf.framework_version(id, school_id) on delete cascade
);

comment on column sqaaf.domain.platform_coverage is
  'How far this platform can evidence the domain. `none` is a deliberate, visible statement that the school must look elsewhere — not an omission.';

create table sqaaf.sub_domain (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  domain_id     uuid not null,
  code          text not null,       -- '3.1'
  name          text not null,
  sort_order    integer not null default 0,
  unique (domain_id, code),
  unique (id, school_id),
  foreign key (domain_id, school_id) references sqaaf.domain(id, school_id) on delete cascade
);

create table sqaaf.standard (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  sub_domain_id uuid not null,
  code          text not null,       -- '3.1.4'
  statement     text not null check (length(btrim(statement)) >= 10),
  sort_order    integer not null default 0,

  -- The manual notes that non-residential schools and schools without a canteen
  -- assess against fewer standards. Recording it keeps a school from being
  -- marked down for a hostel it does not have.
  applies_when  text not null default 'always'
    check (applies_when in ('always', 'residential_only', 'day_school_canteen_only')),

  -- Whether the teacher-growth platform holds evidence relevant to this standard.
  platform_relevant boolean not null default false,
  relevance_note text,

  unique (sub_domain_id, code),
  unique (id, school_id),
  foreign key (sub_domain_id, school_id) references sqaaf.sub_domain(id, school_id) on delete cascade
);

comment on column sqaaf.standard.applies_when is
  'From the manual: the number of standards is lower for non-residential schools and schools with no canteen.';

create index sqaaf_standard_relevant_idx on sqaaf.standard (school_id) where platform_relevant;

-- Standard text is regulatory content: once written it is quoted, not edited.
-- A revised edition is a new framework_version with its own standards.
create function sqaaf.reject_standard_text_edit()
returns trigger language plpgsql as $$
begin
  if new.statement is distinct from old.statement or new.code is distinct from old.code then
    raise exception 'SQAAF standard text is immutable; record a new framework version instead'
      using hint = 'Editing a published standard would silently change what a past self-assessment was measured against.';
  end if;
  return new;
end;
$$;

create trigger sqaaf_standard_text_immutable
  before update on sqaaf.standard
  for each row execute function sqaaf.reject_standard_text_edit();

-- ---------------------------------------------------------------------------
-- Submission windows — configurable per academic year, never hard-coded
-- ---------------------------------------------------------------------------
create table sqaaf.submission_window (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references core.school(id) on delete cascade,
  academic_year_id uuid not null references core.academic_year(id) on delete restrict,
  version_id       uuid,
  opens_on         date,
  closes_on        date,

  -- A window is a regulatory fact and gets the same treatment as any other.
  -- Unknown is a legitimate, recordable state; a guessed date is not.
  verification_status regulatory.verification_status not null default 'requires_verification',
  source_id        uuid references regulatory.source(id) on delete restrict,
  source_note      text,

  created_at       timestamptz not null default now(),
  created_by       uuid references core.app_user(id) on delete restrict,

  unique (school_id, academic_year_id),
  foreign key (version_id, school_id) references sqaaf.framework_version(id, school_id) on delete restrict,
  constraint sqaaf_window_ordered check (closes_on is null or opens_on is null or closes_on >= opens_on),
  -- A verified window must have dates and a source, or it is not verified.
  constraint sqaaf_window_verified_complete check (
    verification_status <> 'verified'
    or (opens_on is not null and closes_on is not null and source_id is not null)
  )
);

comment on table sqaaf.submission_window is
  'The annual SQAAF submission window, per academic year. Deliberately a table: hard-coding a 2025 window into 2027 is how compliance tooling starts lying.';
