-- ===========================================================================
-- 0051 — AI Professional Growth Assistant
-- ===========================================================================
-- The brief lists eleven things AI may assist with and eleven it must not do.
-- The permitted list is all EXPLANATION and DRAFTING. The forbidden list is all
-- DECISION and RECORD-CHANGING. That distinction is the whole architecture:
--
--   AI output lands in `ai.suggestion`, which is an ADVISORY RECORD. It has no
--   foreign key that any engine reads, and nothing in the platform consumes it.
--   A suggestion cannot become a competency level, an appraisal outcome, an
--   increment decision or a regulatory requirement, because there is no path
--   from this table to any of those. The prohibition is a shape, not a rule
--   somebody has to remember.
--
-- Two further protections:
--
--   * Every suggestion records the evidence it was built from, so "show the
--     input evidence used" is satisfied from stored data rather than from the
--     model's own account of itself.
--   * Regulatory content is refused. A suggestion that would state a CBSE or
--     Punjab requirement must instead cite a verified `regulatory.requirement`,
--     and a trigger checks it.
-- ===========================================================================

create schema if not exists ai;
comment on schema ai is
  'AI-assisted explanation and drafting. Advisory only: nothing here is read by any engine, and no path leads from a suggestion to a score, an outcome or a decision.';

-- What the assistant may be asked for. Mirrors the brief's permitted list; there
-- is deliberately no value for anything on the forbidden list.
create type ai.suggestion_kind as enum (
  'explain_competency_gap',
  'explain_assessment_feedback',
  'recommend_development_goal',
  'explain_cpd_match',
  'draft_development_plan',
  'summarise_reflections',
  'summarise_evidence',
  'observation_themes',
  'post_cpd_reflection_support',
  'explain_progression_requirements',
  'explain_cpd_compliance_deficit'
);

create type ai.generation_mode as enum (
  'deterministic',   -- composed from stored data by the platform itself
  'assisted'         -- a configured model contributed; requires explicit enablement
);

-- ---------------------------------------------------------------------------
-- Configuration — off by default
-- ---------------------------------------------------------------------------
-- "Do not transmit sensitive teacher information to an external AI service
-- unless appropriate security/privacy controls and configuration exist."
--
-- So external assistance is disabled until somebody with authority turns it on
-- and records what controls are in place. Until then the assistant still works,
-- deterministically, from stored data.
create table ai.configuration (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,

  external_assistance_enabled boolean not null default false,
  provider          text,
  model             text,
  data_region       text,

  -- The controls that justify enabling it. Required before it may be on.
  processing_agreement_reference text,
  privacy_review_reference       text,
  controls_note     text,

  enabled_by        uuid references core.app_user(id) on delete restrict,
  enabled_at        timestamptz,

  -- What may be sent. Defaults to the most conservative setting.
  send_teacher_names boolean not null default false,
  send_free_text     boolean not null default false,
  redaction_note     text not null default
    'Teacher names and free text are withheld from any external service by default. Identifiers are replaced with role-and-stage descriptions.',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (school_id),

  -- Enabling external assistance requires the paperwork to exist. A boolean
  -- flipped without it is exactly the transmission the brief forbids.
  constraint ai_config_enable_requires_controls check (
    not external_assistance_enabled
    or (provider is not null
        and data_region is not null
        and processing_agreement_reference is not null
        and privacy_review_reference is not null
        and enabled_by is not null
        and enabled_at is not null
        and length(btrim(coalesce(controls_note, ''))) >= 30)
  )
);

comment on table ai.configuration is
  'External AI assistance is off until someone with authority enables it AND records the data-processing agreement, privacy review, region and controls. The constraint makes the paperwork a precondition rather than a promise.';

create trigger set_updated_at before update on ai.configuration
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- The suggestion itself
-- ---------------------------------------------------------------------------
create table ai.suggestion (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null,
  academic_year_id   uuid references core.academic_year(id) on delete set null,

  kind               ai.suggestion_kind not null,
  mode               ai.generation_mode not null default 'deterministic',

  -- The output.
  headline           text not null check (length(btrim(headline)) >= 10),
  body               text not null check (length(btrim(body)) >= 20),

  -- The label the brief requires, stored rather than added by each screen so
  -- every surface shows the same words.
  advisory_label     text not null default
    'AI-assisted recommendation — professional judgement required.',

  -- "Where appropriate, show the input evidence used." Not optional here: a
  -- suggestion whose inputs cannot be listed is not reviewable, and reviewing
  -- it is the entire point of the advisory label.
  inputs             jsonb not null default '[]'::jsonb,

  -- Provenance, when a model contributed.
  provider           text,
  model              text,
  generated_at       timestamptz not null default now(),
  generated_by       uuid references core.app_user(id) on delete restrict,

  -- What a human did with it. The suggestion is a draft until somebody acts.
  acted_on           boolean not null default false,
  action_note        text,
  acted_by           uuid references core.app_user(id) on delete restrict,
  acted_at           timestamptz,

  foreign key (teacher_profile_id, school_id) references core.teacher_profile(id, school_id) on delete cascade,

  constraint ai_suggestion_label_intact check (
    advisory_label ilike '%professional judgement required%'
  ),
  constraint ai_suggestion_inputs_present check (jsonb_array_length(inputs) >= 1),
  constraint ai_suggestion_assisted_has_provenance check (
    mode <> 'assisted' or (provider is not null and model is not null)
  ),
  constraint ai_suggestion_acted_recorded check (
    not acted_on or (acted_by is not null and acted_at is not null)
  )
);

comment on table ai.suggestion is
  'Advisory only. Nothing in the platform reads this table — there is no path from a suggestion to a competency level, an appraisal outcome, an increment decision or a regulatory requirement.';
comment on column ai.suggestion.inputs is
  'The stored records this was built from. Required: a suggestion whose inputs cannot be listed is not reviewable, and reviewing it is the point of the advisory label.';

create index ai_suggestion_teacher_idx on ai.suggestion (teacher_profile_id, generated_at desc);

-- ---------------------------------------------------------------------------
-- The regulatory prohibition, enforced
-- ---------------------------------------------------------------------------
-- "Do not invent CBSE requirements. Do not invent Punjab requirements. Do not
-- represent uncertain regulatory information as fact."
--
-- A suggestion that reads like a regulatory assertion is refused unless it
-- cites a requirement that actually exists and is verified. The check is
-- deliberately blunt: it would rather refuse a harmless sentence than let one
-- invented requirement through.
create function ai.assert_no_invented_regulation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_claims boolean;
  v_cited text;
  v_ok boolean;
begin
  v_claims := new.body ~* '(CBSE|Punjab|NCTE|NPST|SQAAF)\s+(requires|mandates|stipulates|prescribes)'
           or new.body ~* '(is|are)\s+(a\s+)?(mandatory|statutory|legal)\s+(CBSE|Punjab)'
           or new.headline ~* '(CBSE|Punjab)\s+(requires|mandates)';

  if not v_claims then
    return new;
  end if;

  -- A regulatory claim must cite a requirement key in its inputs, and that
  -- requirement must exist and be verified.
  select i ->> 'requirement_key' into v_cited
  from jsonb_array_elements(new.inputs) i
  where i ? 'requirement_key'
  limit 1;

  if v_cited is null then
    raise exception
      'This suggestion states a regulatory requirement but cites none. Cite a verified requirement in `inputs`, or rewrite it as guidance.'
      using errcode = 'restrict_violation';
  end if;

  select (r.verification_status = 'verified') into v_ok
  from regulatory.requirement r where r.requirement_key = v_cited;

  if v_ok is not true then
    raise exception
      'This suggestion cites requirement "%" which is not a verified requirement. Uncertain regulatory information must not be presented as fact.',
      v_cited using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger ai_suggestion_no_invented_regulation
  before insert or update on ai.suggestion
  for each row execute function ai.assert_no_invented_regulation();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table ai.configuration enable row level security;
alter table ai.suggestion    enable row level security;

create policy ai_config_select on ai.configuration
  for select using (core.is_member_of(school_id));
create policy ai_config_write on ai.configuration
  using (core.has_permission(school_id, 'system.admin'))
  with check (core.has_permission(school_id, 'system.admin'));

-- A teacher sees suggestions about themselves. Being given advice you cannot
-- read would be worse than not being given it.
create policy ai_suggestion_select on ai.suggestion
  for select using (core.can_view_staff_record(teacher_profile_id));
create policy ai_suggestion_insert on ai.suggestion
  for insert with check (core.can_view_staff_record(teacher_profile_id));
create policy ai_suggestion_update on ai.suggestion
  for update using (core.can_view_staff_record(teacher_profile_id))
  with check (core.can_view_staff_record(teacher_profile_id));

grant usage on schema ai to authenticated, service_role;
grant select on all tables in schema ai to authenticated;
grant insert, update on ai.suggestion to authenticated;
grant insert, update on ai.configuration to authenticated;
grant all on all tables in schema ai to service_role;
grant execute on all functions in schema ai to authenticated, service_role;

create trigger audit_changes after insert or update or delete on ai.configuration
  for each row execute function audit.record_row_change();
