-- ===========================================================================
-- 0021 — CPD catalogue
-- ===========================================================================
-- What development exists, what it addresses, and how strong its recognition
-- is. `recognition` reuses the Stage 2 source vocabulary, so a school-run
-- workshop can never be displayed as if it carried CBSE recognition.
--
-- Note what this schema does NOT do: completing an activity changes nothing
-- about a competency. The route from CPD to a competency level runs through
-- application and verified impact evidence — see migration 0022.
-- ===========================================================================

create schema if not exists cpd;
comment on schema cpd is 'CPD providers, activities, and what competencies they address.';

create type cpd.delivery_method as enum (
  'face_to_face', 'online_live', 'online_self_paced', 'blended',
  'in_school', 'mentoring', 'reading', 'other'
);

create type cpd.availability as enum ('available', 'waitlist', 'scheduled', 'unavailable', 'retired');

-- ---------------------------------------------------------------------------
-- Providers
-- ---------------------------------------------------------------------------

create table cpd.provider (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name              text not null,
  description       text,
  website           text,
  -- Where the provider's standing comes from. `aligned` requires a citation,
  -- exactly as in the competency framework.
  recognition       competency.source_framework not null default 'school',
  recognition_alignment competency.source_alignment not null default 'school_defined',
  external_reference text,
  regulatory_source_id uuid references regulatory.source(id) on delete restrict,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint cpd_provider_unique unique (school_id, key),
  constraint cpd_provider_id_school unique (id, school_id),
  constraint cpd_provider_aligned_needs_reference check (
    recognition_alignment <> 'aligned' or external_reference is not null
  )
);

comment on column cpd.provider.recognition is
  'Whether the provider is recognised by NCTE, CBSE, the State, or nobody but '
  'the school. Shown to teachers, so an in-house session is never mistaken for '
  'accredited training.';

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------

create table cpd.activity (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  provider_id       uuid not null,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),

  title             text not null,
  description       text not null,
  -- What a participant will be able to do afterwards. One per line.
  learning_outcomes text not null,

  delivery_method   cpd.delivery_method not null,
  duration_hours    numeric(6,2) not null check (duration_hours > 0),
  -- Hours creditable to the CPD ledger. May differ from duration: an activity
  -- can run three hours and carry six creditable hours, or vice versa. The
  -- accrual policy is Stage 4 work; this records the activity's own claim.
  cpd_hours         numeric(6,2) not null check (cpd_hours >= 0),

  cost_amount       numeric(10,2) check (cost_amount is null or cost_amount >= 0),
  cost_currency     text not null default 'INR',
  prerequisite      text,
  url               text,
  availability      cpd.availability not null default 'available',
  next_offering_on  date,
  capacity          integer check (capacity is null or capacity > 0),

  -- What a participant must produce to evidence application in practice. This
  -- is what makes the impact chain possible rather than aspirational.
  evidence_requirement text not null check (length(btrim(evidence_requirement)) >= 15),

  recognition       competency.source_framework not null default 'school',
  recognition_alignment competency.source_alignment not null default 'school_defined',
  external_reference text,

  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint cpd_activity_provider_fk foreign key (provider_id, school_id)
    references cpd.provider(id, school_id) on delete cascade,
  constraint cpd_activity_unique unique (school_id, key),
  constraint cpd_activity_id_school unique (id, school_id),
  constraint cpd_activity_aligned_needs_reference check (
    recognition_alignment <> 'aligned' or external_reference is not null
  )
);

create index cpd_activity_school_idx on cpd.activity (school_id, availability)
  where is_active;

create trigger set_updated_at before update on cpd.activity
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- What an activity addresses
-- ---------------------------------------------------------------------------

create table cpd.activity_competency (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  activity_id       uuid not null,
  competency_id     uuid not null,
  -- The level this activity is pitched at: it develops practice TOWARDS this.
  targets_level_id  uuid not null,
  -- Primary focus vs incidental coverage. Drives recommendation ranking.
  is_primary        boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),

  constraint activity_competency_activity_fk foreign key (activity_id, school_id)
    references cpd.activity(id, school_id) on delete cascade,
  constraint activity_competency_competency_fk foreign key (competency_id, school_id)
    references competency.competency(id, school_id) on delete cascade,
  constraint activity_competency_level_fk foreign key (targets_level_id, school_id)
    references competency.proficiency_level(id, school_id) on delete restrict,
  constraint activity_competency_unique unique (activity_id, competency_id)
);

comment on table cpd.activity_competency is
  'The mapping that makes a recommendation explainable. Without it, "why this '
  'course?" has no answer.';

create index activity_competency_lookup
  on cpd.activity_competency (competency_id, is_primary);

-- Applicability: which stages, categories and subjects an activity suits.
create table cpd.activity_applicability (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  activity_id       uuid not null,
  school_stage_id   uuid references core.school_stage(id) on delete cascade,
  teacher_category_id uuid references core.teacher_category(id) on delete cascade,
  subject_id        uuid references core.subject(id) on delete cascade,
  created_at        timestamptz not null default now(),
  constraint activity_applicability_fk foreign key (activity_id, school_id)
    references cpd.activity(id, school_id) on delete cascade,
  constraint activity_applicability_has_dimension check (
    school_stage_id is not null or teacher_category_id is not null or subject_id is not null
  )
);

comment on table cpd.activity_applicability is
  'No rows means the activity suits everyone. Rows narrow it — a Foundational '
  'phonics course should not be recommended to a Class XI Physics teacher.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table cpd.provider               enable row level security;
alter table cpd.activity               enable row level security;
alter table cpd.activity_competency    enable row level security;
alter table cpd.activity_applicability enable row level security;

do $$
declare t text;
begin
  foreach t in array array['provider', 'activity', 'activity_competency', 'activity_applicability']
  loop
    execute format($f$
      create policy %I on cpd.%I for select using (core.is_member_of(school_id))
    $f$, t || '_select', t);
    execute format($f$
      create policy %I on cpd.%I
        for all using (core.has_permission(school_id, 'cpd.manage'))
        with check (core.has_permission(school_id, 'cpd.manage'))
    $f$, t || '_write', t);
  end loop;
end $$;
