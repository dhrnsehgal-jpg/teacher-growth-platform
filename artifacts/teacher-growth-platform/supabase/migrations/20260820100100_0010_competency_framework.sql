-- ===========================================================================
-- 0010 — Competency framework
-- ===========================================================================
--   Framework → Standard → Domain → Competency → Indicator
--                                        ├── Proficiency Descriptor
--                                        └── Evidence Descriptor
--
-- Two rules shape this schema:
--
-- 1. EVERY item records its actual source. The school's framework is the
--    school's. Where an item traces to NPST it says so and cites the clause;
--    where it is merely informed by NPST or CBSE it is marked `derived`; where
--    it is the school's own idea it is `school_defined`. Nothing is silently
--    promoted to "NPST says so".
--
-- 2. NOTHING IS DELETED. Competencies retire; they do not disappear. An
--    appraisal recorded against a competency in 2026 must remain readable in
--    2030 under the wording that applied at the time.
-- ===========================================================================

create schema if not exists competency;
comment on schema competency is
  'Competency frameworks, indicators, proficiency scales and role/stage targets.';

-- ---------------------------------------------------------------------------
-- Source labelling
-- ---------------------------------------------------------------------------

create type competency.source_framework as enum (
  'npst',            -- National Professional Standards for Teachers (NCTE)
  'cbse',            -- CBSE instrument
  'punjab',          -- Punjab State instrument
  'school',          -- The school's own framework
  'other_framework'  -- Another approved external framework
);

comment on type competency.source_framework is
  'Which body an item comes from. Rendered verbatim to teachers, so a school '
  'competency can never appear as a CBSE or NPST requirement.';

create type competency.source_alignment as enum (
  'aligned',         -- Traceable to a specific clause/sub-domain, cited in external_reference
  'derived',         -- Informed by an external framework or policy, but reworded or extended
  'school_defined'   -- The school's own. No external claim of any kind.
);

comment on type competency.source_alignment is
  'How strong the claim is. `aligned` REQUIRES an external_reference — see the '
  'check constraints below. This is what stops "inspired by NPST" drifting into '
  '"this is NPST".';

create type competency.lifecycle_status as enum ('draft', 'active', 'retired');

-- ---------------------------------------------------------------------------
-- Framework
-- ---------------------------------------------------------------------------

create table competency.framework (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  version           integer not null default 1 check (version >= 1),
  name              text not null,
  description       text,

  source_framework  competency.source_framework not null,
  source_alignment  competency.source_alignment not null,
  external_reference text,
  regulatory_source_id uuid references regulatory.source(id) on delete restrict,

  status            competency.lifecycle_status not null default 'draft',
  effective_from    date,
  effective_to      date,
  superseded_by_id  uuid references competency.framework(id),

  created_at        timestamptz not null default now(),
  created_by        uuid references core.app_user(id),
  updated_at        timestamptz not null default now(),

  constraint framework_unique_version unique (school_id, key, version),
  -- Needed so children can carry a composite FK and never cross tenants.
  constraint framework_id_school unique (id, school_id),
  constraint framework_aligned_needs_reference check (
    source_alignment <> 'aligned' or external_reference is not null
  ),
  constraint framework_period_ordered check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  )
);

comment on table competency.framework is
  'A versioned competency framework belonging to one school. Revising a '
  'framework means a new version row, not an edit — last year''s appraisals stay '
  'explainable under last year''s wording.';

create index framework_school_idx on competency.framework (school_id, status);
create trigger set_updated_at before update on competency.framework
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Standard → Domain
-- ---------------------------------------------------------------------------

create table competency.standard (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  framework_id      uuid not null,
  key               text not null check (key ~ '^[a-z0-9][a-z0-9_]*$'),
  name              text not null,
  description       text,
  sort_order        integer not null default 0,

  source_framework  competency.source_framework not null,
  source_alignment  competency.source_alignment not null,
  external_reference text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint standard_framework_fk foreign key (framework_id, school_id)
    references competency.framework(id, school_id) on delete cascade,
  constraint standard_unique unique (framework_id, key),
  constraint standard_id_school unique (id, school_id),
  constraint standard_aligned_needs_reference check (
    source_alignment <> 'aligned' or external_reference is not null
  )
);

create trigger set_updated_at before update on competency.standard
  for each row execute function core.set_updated_at();

create table competency.domain (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  standard_id       uuid not null,
  key               text not null check (key ~ '^[a-z0-9][a-z0-9_]*$'),
  name              text not null,
  description       text,
  sort_order        integer not null default 0,

  source_framework  competency.source_framework not null,
  source_alignment  competency.source_alignment not null,
  external_reference text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint domain_standard_fk foreign key (standard_id, school_id)
    references competency.standard(id, school_id) on delete cascade,
  constraint domain_unique unique (standard_id, key),
  constraint domain_id_school unique (id, school_id),
  constraint domain_aligned_needs_reference check (
    source_alignment <> 'aligned' or external_reference is not null
  )
);

create trigger set_updated_at before update on competency.domain
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Proficiency scale
-- ---------------------------------------------------------------------------
-- Configurable per framework. The MVP scale is a product descriptor
-- (Foundation → Expert/Lead); a framework that publishes its own terminology
-- records that instead, with source_framework set accordingly.

create table competency.proficiency_scale (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  framework_id      uuid not null,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name              text not null,
  description       text,
  source_framework  competency.source_framework not null,
  source_alignment  competency.source_alignment not null,
  external_reference text,
  created_at        timestamptz not null default now(),

  constraint proficiency_scale_framework_fk foreign key (framework_id, school_id)
    references competency.framework(id, school_id) on delete cascade,
  constraint proficiency_scale_unique unique (framework_id, key),
  constraint proficiency_scale_id_school unique (id, school_id)
);

create table competency.proficiency_level (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  scale_id          uuid not null,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name              text not null,
  ordinal           integer not null check (ordinal >= 1),
  descriptor        text not null,
  created_at        timestamptz not null default now(),

  constraint proficiency_level_scale_fk foreign key (scale_id, school_id)
    references competency.proficiency_scale(id, school_id) on delete cascade,
  constraint proficiency_level_unique unique (scale_id, key),
  constraint proficiency_level_ordinal_unique unique (scale_id, ordinal),
  constraint proficiency_level_id_school unique (id, school_id)
);

comment on table competency.proficiency_level is
  'Ordered rungs of a proficiency scale. `ordinal` is the comparable value: a '
  'gap exists when the assessed ordinal is below the target ordinal.';

-- ---------------------------------------------------------------------------
-- Competency
-- ---------------------------------------------------------------------------

create table competency.competency (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  domain_id         uuid not null,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name              text not null,
  description       text not null,
  sort_order        integer not null default 0,

  source_framework  competency.source_framework not null,
  source_alignment  competency.source_alignment not null,
  -- e.g. 'NPST 2023, Standard 2, Domain 8, SD 8.2'
  external_reference text,
  regulatory_source_id uuid references regulatory.source(id) on delete restrict,
  -- Why this competency exists in the school's framework, in plain language.
  rationale         text,

  status            competency.lifecycle_status not null default 'active',
  retired_at        timestamptz,
  retired_by        uuid references core.app_user(id),
  retirement_reason text,
  replaced_by_id    uuid references competency.competency(id),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint competency_domain_fk foreign key (domain_id, school_id)
    references competency.domain(id, school_id) on delete cascade,
  constraint competency_unique unique (domain_id, key),
  constraint competency_id_school unique (id, school_id),
  constraint competency_aligned_needs_reference check (
    source_alignment <> 'aligned' or external_reference is not null
  ),
  -- Retiring is a recorded act, not a flag flip.
  constraint competency_retirement_complete check (
    status <> 'retired'
    or (retired_at is not null and retired_by is not null
        and retirement_reason is not null and length(btrim(retirement_reason)) >= 10)
  )
);

comment on constraint competency_retirement_complete on competency.competency is
  'A competency can only be retired with a named person, a timestamp and a '
  'reason. Retired rows are never deleted, so historical assessments against '
  'them remain readable.';

create index competency_school_idx on competency.competency (school_id, status);
create index competency_domain_idx on competency.competency (domain_id, sort_order);

create trigger set_updated_at before update on competency.competency
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indicator
-- ---------------------------------------------------------------------------

create table competency.indicator (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  competency_id     uuid not null,
  key               text not null check (key ~ '^[a-z0-9][a-z0-9_]*$'),
  -- The observable behaviour. Must read as something a person could witness.
  statement         text not null,
  description       text,
  sort_order        integer not null default 0,

  source_framework  competency.source_framework not null,
  source_alignment  competency.source_alignment not null,
  external_reference text,

  -- Optional weighting, used only where school policy weights indicators.
  weight            numeric(5,2) check (weight is null or weight >= 0),

  status            competency.lifecycle_status not null default 'active',
  retired_at        timestamptz,
  retired_by        uuid references core.app_user(id),
  retirement_reason text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint indicator_competency_fk foreign key (competency_id, school_id)
    references competency.competency(id, school_id) on delete cascade,
  constraint indicator_unique unique (competency_id, key),
  constraint indicator_id_school unique (id, school_id),
  constraint indicator_aligned_needs_reference check (
    source_alignment <> 'aligned' or external_reference is not null
  ),
  -- Guards against vague indicators. Not a substitute for review, but it stops
  -- the most obvious failures reaching the database.
  constraint indicator_statement_observable check (
    length(btrim(statement)) >= 20
    and statement !~* '^(is|was) (a )?(good|great|excellent|bad|poor)\y'
  )
);

comment on constraint indicator_statement_observable on competency.indicator is
  'Rejects "Is a good teacher" style statements. An indicator must describe an '
  'observable behaviour, not a verdict.';

create index indicator_competency_idx on competency.indicator (competency_id, sort_order);

create trigger set_updated_at before update on competency.indicator
  for each row execute function core.set_updated_at();

-- Which school stages an indicator applies to. No rows = applies to all stages.
create table competency.indicator_stage (
  indicator_id      uuid not null references competency.indicator(id) on delete cascade,
  school_stage_id   uuid not null references core.school_stage(id) on delete cascade,
  primary key (indicator_id, school_stage_id)
);

comment on table competency.indicator_stage is
  'Stage applicability. An indicator about phonics instruction belongs to the '
  'Foundational stage; one about board-exam preparation does not.';

-- ---------------------------------------------------------------------------
-- Proficiency and evidence descriptors
-- ---------------------------------------------------------------------------
-- Attach to a competency OR an indicator, never both.

create table competency.proficiency_descriptor (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  competency_id     uuid,
  indicator_id      uuid,
  proficiency_level_id uuid not null,
  descriptor        text not null,
  created_at        timestamptz not null default now(),

  constraint proficiency_descriptor_target check (
    (competency_id is not null) <> (indicator_id is not null)
  ),
  constraint proficiency_descriptor_competency_fk foreign key (competency_id, school_id)
    references competency.competency(id, school_id) on delete cascade,
  constraint proficiency_descriptor_indicator_fk foreign key (indicator_id, school_id)
    references competency.indicator(id, school_id) on delete cascade,
  constraint proficiency_descriptor_level_fk foreign key (proficiency_level_id, school_id)
    references competency.proficiency_level(id, school_id) on delete cascade
);

create unique index proficiency_descriptor_competency_level
  on competency.proficiency_descriptor (competency_id, proficiency_level_id)
  where competency_id is not null;
create unique index proficiency_descriptor_indicator_level
  on competency.proficiency_descriptor (indicator_id, proficiency_level_id)
  where indicator_id is not null;

comment on table competency.proficiency_descriptor is
  'What this competency or indicator looks like AT a given level. This is what '
  'makes an assessment defensible: the assessor points at a descriptor.';

create table competency.evidence_descriptor (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  competency_id     uuid,
  indicator_id      uuid,
  -- References evidence.evidence_type(key), created in migration 0012. Kept as
  -- text so the competency schema does not depend on the evidence schema.
  evidence_type_key text not null,
  guidance          text,
  is_required       boolean not null default false,
  created_at        timestamptz not null default now(),

  constraint evidence_descriptor_target check (
    (competency_id is not null) <> (indicator_id is not null)
  ),
  constraint evidence_descriptor_competency_fk foreign key (competency_id, school_id)
    references competency.competency(id, school_id) on delete cascade,
  constraint evidence_descriptor_indicator_fk foreign key (indicator_id, school_id)
    references competency.indicator(id, school_id) on delete cascade
);

comment on table competency.evidence_descriptor is
  'What evidence would demonstrate this. Suggestions by default; is_required '
  'marks the ones school policy insists on.';

-- ---------------------------------------------------------------------------
-- Applicability and targets
-- ---------------------------------------------------------------------------

create table competency.competency_applicability (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  competency_id     uuid not null,
  teacher_category_id uuid references core.teacher_category(id) on delete cascade,
  school_stage_id   uuid references core.school_stage(id) on delete cascade,
  created_at        timestamptz not null default now(),

  constraint competency_applicability_fk foreign key (competency_id, school_id)
    references competency.competency(id, school_id) on delete cascade,
  constraint competency_applicability_has_dimension check (
    teacher_category_id is not null or school_stage_id is not null
  )
);

comment on table competency.competency_applicability is
  'Restricts a competency to particular categories or stages. No rows means it '
  'applies to everyone — the common case.';

-- The heart of "targets must differ".
create table competency.competency_target (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  academic_year_id  uuid not null references core.academic_year(id) on delete cascade,
  competency_id     uuid not null,
  target_level_id   uuid not null,

  -- Dimensions. Every NULL means "any". The more non-null dimensions a row has,
  -- the more specific it is, and the more it outranks a broader row.
  teacher_category_id uuid references core.teacher_category(id) on delete cascade,
  school_stage_id     uuid references core.school_stage(id) on delete cascade,
  career_level_id     uuid references core.career_level(id) on delete cascade,
  subject_id          uuid references core.subject(id) on delete cascade,
  -- RBAC role key, e.g. 'head_of_department'. Text rather than an FK because
  -- role rows are per school and this must survive a role being renamed.
  role_key            text check (role_key ~ '^[a-z][a-z0-9_]*$'),
  -- NULL = irrelevant; true = only staff carrying leadership responsibility.
  requires_leadership boolean,

  weight            numeric(5,2) check (weight is null or weight >= 0),
  rationale         text,
  source_framework  competency.source_framework not null default 'school',
  source_alignment  competency.source_alignment not null default 'school_defined',

  created_at        timestamptz not null default now(),
  created_by        uuid references core.app_user(id),
  updated_at        timestamptz not null default now(),

  constraint competency_target_competency_fk foreign key (competency_id, school_id)
    references competency.competency(id, school_id) on delete cascade,
  constraint competency_target_level_fk foreign key (target_level_id, school_id)
    references competency.proficiency_level(id, school_id) on delete cascade
);

comment on table competency.competency_target is
  'The expected proficiency for a competency, for a slice of staff, in one '
  'academic year. A newly appointed PRT and a Head of Department are expected to '
  'reach different levels on the same leadership competency — that is expressed '
  'as two rows here, not two competencies.';

-- One target per exact dimension combination per year.
create unique index competency_target_unique_slice
  on competency.competency_target (
    academic_year_id, competency_id,
    coalesce(teacher_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(school_stage_id,     '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(career_level_id,     '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_id,          '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(role_key, ''),
    coalesce(requires_leadership, false)
  );

create index competency_target_year_idx
  on competency.competency_target (school_id, academic_year_id, competency_id);

create trigger set_updated_at before update on competency.competency_target
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Leadership responsibility on the teacher record
-- ---------------------------------------------------------------------------

alter table core.teacher_profile
  add column if not exists has_leadership_responsibility boolean not null default false;

comment on column core.teacher_profile.has_leadership_responsibility is
  'Whether the post carries formal leadership duties. A dimension of competency '
  'targeting: a PRT who leads a stage team is held to leadership expectations a '
  'newly appointed PRT is not.';
