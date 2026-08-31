-- ===========================================================================
-- 0042 — Professional Growth Score
-- ===========================================================================
-- Configurable, explainable, and school-owned.
--
-- The percentages are NOT a CBSE or Punjab Government formula and the platform
-- says so wherever they appear. `growth_model.disclaimer` holds the exact words,
-- is NOT NULL, and a constraint requires any school-policy model to carry them,
-- so a model cannot reach a screen without its provenance attached.
--
-- Every score decomposes. `growth_score_component` records, per component, the
-- weight, the raw result, what evidence it was drawn from and the model version
-- in force — which is what "WHY THIS SCORE?" renders. A total that cannot be
-- taken apart is not a basis for an employment conversation.
-- ===========================================================================

create type appraisal.component_source as enum (
  'competency_attainment',
  'competency_growth',
  'kpi_achievement',
  'classroom_practice',
  'cpd_compliance',
  'cpd_impact',
  'professional_goals',
  'collaboration',
  'school_contribution',
  'professional_conduct',
  'leadership',
  'manual'
);

create table appraisal.growth_model (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references core.school(id) on delete cascade,
  key            text not null check (key ~ '^[a-z][a-z0-9_.]*$'),
  version        integer not null check (version >= 1),
  name           text not null,
  description    text,

  -- School policy unless something verified says otherwise. Nothing verified
  -- does: no CBSE or Punjab growth-score formula has been established.
  classification regulatory.requirement_classification not null default 'school_policy',

  -- The exact words that must appear beside any percentage from this model.
  disclaimer     text not null default
    'DEMO SCHOOL POLICY — NOT A CBSE OR PUNJAB GOVERNMENT FORMULA.',

  effective_from date not null,
  effective_to   date,
  superseded_by_id uuid references appraisal.growth_model(id) on delete restrict,

  created_at     timestamptz not null default now(),
  created_by     uuid references core.app_user(id) on delete restrict,

  unique (school_id, key, version),
  unique (id, school_id),
  constraint growth_model_period check (effective_to is null or effective_to > effective_from),
  -- A school-policy model must carry the disclaimer. The only way to drop it is
  -- to classify the model as mandatory, which needs a verified source behind it.
  constraint growth_model_policy_disclaimed check (
    classification <> 'school_policy'
    or disclaimer ilike '%NOT A CBSE OR PUNJAB GOVERNMENT FORMULA%'
  )
);

comment on column appraisal.growth_model.disclaimer is
  'Rendered beside every percentage this model produces. NOT NULL and constrained, so a school-policy score cannot appear without its provenance.';

create table appraisal.growth_component (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  model_id      uuid not null,
  key           text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name  text not null,
  source        appraisal.component_source not null,

  weight_percent numeric(5,2) not null check (weight_percent >= 0 and weight_percent <= 100),

  -- What the component measures, in the school's own words. Required: a
  -- component nobody can explain cannot be defended in an appraisal meeting.
  definition    text not null check (length(btrim(definition)) >= 20),
  evidence_note text,
  sort_order    integer not null default 0,

  created_at    timestamptz not null default now(),
  unique (model_id, key),
  unique (id, school_id),
  foreign key (model_id, school_id) references appraisal.growth_model(id, school_id) on delete cascade
);

-- Weights must total 100 for a model to be usable. Deferred, so a model can be
-- assembled component by component inside one transaction.
create function appraisal.assert_weights_total_100()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_model uuid := coalesce(new.model_id, old.model_id);
  v_total numeric(6,2);
begin
  if not exists (select 1 from appraisal.growth_model where id = v_model) then
    return null;
  end if;
  select coalesce(sum(weight_percent), 0) into v_total
  from appraisal.growth_component where model_id = v_model;

  if v_total <> 100 then
    raise exception 'Growth model weights total %, not 100', v_total
      using hint = 'Every component''s weight is part of one whole; a model that does not sum to 100 produces a score nobody can interpret.';
  end if;
  return null;
end;
$$;

create constraint trigger growth_weights_total
  after insert or update or delete on appraisal.growth_component
  deferrable initially deferred
  for each row execute function appraisal.assert_weights_total_100();

-- ---------------------------------------------------------------------------
-- The computed score
-- ---------------------------------------------------------------------------
create table appraisal.growth_score (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  appraisal_id  uuid not null,
  model_id      uuid not null,

  total_percent numeric(5,2) not null check (total_percent >= 0 and total_percent <= 100),

  -- The model's disclaimer, copied at computation. A later edit to the model
  -- must not change what a past appraisal was told.
  disclaimer    text not null,
  model_version integer not null,
  engine_version text not null default 'growth-score-v1',

  computed_at   timestamptz not null default now(),
  computed_by   uuid references core.app_user(id) on delete restrict,

  unique (appraisal_id),
  unique (id, school_id),
  foreign key (appraisal_id, school_id) references appraisal.appraisal(id, school_id) on delete cascade,
  foreign key (model_id, school_id) references appraisal.growth_model(id, school_id) on delete restrict
);

comment on table appraisal.growth_score is
  'One score per appraisal, with the model version and disclaimer frozen onto it. Recomputing replaces the breakdown but the score is always explainable as of when it was made.';

create table appraisal.growth_score_component (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null,
  growth_score_id uuid not null,
  component_id    uuid not null,

  -- Everything "WHY THIS SCORE?" has to show.
  component_name  text not null,
  weight_percent  numeric(5,2) not null,
  raw_result      numeric(6,2) not null,        -- 0-100 before weighting
  weighted_points numeric(6,2) not null,        -- raw × weight ÷ 100
  evidence_summary text not null,
  evidence_count  integer not null default 0,
  basis           text not null,                -- how the raw result was arrived at

  foreign key (growth_score_id, school_id) references appraisal.growth_score(id, school_id) on delete cascade,
  foreign key (component_id, school_id) references appraisal.growth_component(id, school_id) on delete restrict,
  unique (growth_score_id, component_id)
);

comment on table appraisal.growth_score_component is
  'The decomposition: component, weight, result, evidence and how it was arrived at. This is what "WHY THIS SCORE?" renders.';

-- The total must equal the sum of its parts, to the rounding. A headline that
-- does not reconcile with its own breakdown is worse than no headline.
create function appraisal.assert_score_reconciles()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_score uuid := coalesce(new.growth_score_id, old.growth_score_id);
  v_total numeric(6,2);
  v_declared numeric(5,2);
begin
  select total_percent into v_declared from appraisal.growth_score where id = v_score;
  if v_declared is null then
    return null;
  end if;
  select coalesce(sum(weighted_points), 0) into v_total
  from appraisal.growth_score_component where growth_score_id = v_score;

  if abs(v_total - v_declared) > 0.05 then
    raise exception 'Growth score % does not reconcile with its components, which sum to %',
      v_declared, v_total;
  end if;
  return null;
end;
$$;

create constraint trigger growth_score_reconciles
  after insert or update or delete on appraisal.growth_score_component
  deferrable initially deferred
  for each row execute function appraisal.assert_score_reconciles();
