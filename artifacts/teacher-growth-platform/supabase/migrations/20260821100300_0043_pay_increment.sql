-- ===========================================================================
-- 0043 — Pay framework, statutory entitlement, and growth recommendation
-- ===========================================================================
-- Three concepts the brief requires be kept apart, held in three tables that
-- cannot be joined into one answer by accident:
--
--   pay.framework      what pay arrangement applies, and on whose authority
--   pay.entitlement    an increment arising under a rule or adopted policy
--   pay.recommendation a performance/development-based recommendation
--
-- The rule that shapes this migration more than any other:
--
--   "The system must not automatically reduce, remove or block a legal or
--    contractual entitlement because of a competency score unless the verified
--    applicable rule expressly permits it."
--
-- So an entitlement carries `withholding_permitted_by_rule`, defaulting FALSE,
-- and a recommendation to withhold against an entitlement where it is false is
-- refused by trigger — not by convention, and not by a UI that hides a button.
-- A growth score is an input to a recommendation. It is never, by itself, a
-- reason a teacher does not get paid something they are owed.
--
-- Nothing here computes a salary. The output is READINESS and a RECOMMENDATION
-- for a person to act on, and the final decision is a human act recorded as one.
-- ===========================================================================

create schema if not exists pay;
comment on schema pay is
  'Pay frameworks, statutory entitlements and increment recommendations — three separate things, deliberately not merged.';

-- ---------------------------------------------------------------------------
-- 1. Pay framework
-- ---------------------------------------------------------------------------
create table pay.framework (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references core.school(id) on delete cascade,
  key            text not null check (key ~ '^[a-z][a-z0-9_.]*$'),
  version        integer not null check (version >= 1),
  name           text not null,

  -- Authority and source. A framework asserted as mandatory must cite both.
  authority_id   uuid references regulatory.authority(id) on delete restrict,
  source_id      uuid references regulatory.source(id) on delete restrict,
  source_document text,
  clause_reference text,

  -- Applicability, determined rather than assumed. The brief is explicit that
  -- being located in Punjab does not import Punjab Government pay scales.
  applies_to_funding_status core.school_funding_status[],
  applies_to_employee_categories text[],
  applicability  regulatory.verification_status not null default 'requires_verification',
  applicability_note text,

  classification regulatory.requirement_classification not null default 'school_policy',
  verification_status regulatory.verification_status not null default 'requires_verification',

  -- Structure, described rather than computed. The platform holds no salary
  -- figures: it records what arrangement applies, not what anyone is paid.
  base_structure text,
  increment_rule text,
  allowances     text,
  progression_rule text,

  effective_from date,
  effective_to   date,
  superseded_by_id uuid references pay.framework(id) on delete restrict,

  created_at     timestamptz not null default now(),
  created_by     uuid references core.app_user(id) on delete restrict,

  unique (school_id, key, version),
  unique (id, school_id),
  constraint pay_framework_period check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint pay_framework_mandatory_needs_source check (
    classification <> 'mandatory' or (source_id is not null and clause_reference is not null)
  ),
  constraint pay_framework_verified_needs_source check (
    verification_status <> 'verified' or source_document is not null
  )
);

comment on table pay.framework is
  'What pay arrangement applies, on whose authority, to which school and employee types. Holds no salary figures — this platform records applicability, not remuneration.';

-- A pay framework cannot be marked applicable while the school's funding status
-- is unknown. This is the Stage 1 gate, enforced at the point it would bite.
create function pay.assert_framework_applicability()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_funding core.school_funding_status;
begin
  if new.applicability not in ('verified', 'not_applicable') then
    return new;
  end if;

  select funding_status into v_funding
  from core.school_regulatory_profile where school_id = new.school_id;

  if v_funding is null or v_funding = 'unverified' then
    raise exception '%', core.service_rule_gate_message()
      using hint = 'A pay framework cannot be determined applicable while the school''s funding status is unverified.';
  end if;

  if new.applicability = 'verified'
     and new.applies_to_funding_status is not null
     and not (v_funding = any (new.applies_to_funding_status)) then
    raise exception 'This framework applies to % but the school is recorded as %',
      new.applies_to_funding_status, v_funding;
  end if;
  return new;
end;
$$;

create trigger pay_framework_applicability_guard
  before insert or update on pay.framework
  for each row execute function pay.assert_framework_applicability();

-- ---------------------------------------------------------------------------
-- 2. Statutory or policy entitlement
-- ---------------------------------------------------------------------------
create table pay.entitlement (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null,
  academic_year_id   uuid not null references core.academic_year(id) on delete restrict,

  framework_id       uuid,
  service_policy_id  uuid,

  description        text not null check (length(btrim(description)) >= 10),
  basis              text not null,          -- the rule or policy clause it arises under
  due_on             date,

  -- THE LOAD-BEARING COLUMN.
  --
  -- False unless a VERIFIED rule expressly permits withholding on performance
  -- grounds. While it is false, no growth score and no recommendation can block
  -- this entitlement — the trigger on pay.recommendation refuses it.
  withholding_permitted_by_rule boolean not null default false,
  withholding_rule_reference    text,
  withholding_rule_source_id    uuid references regulatory.source(id) on delete restrict,

  status             text not null default 'recorded'
    check (status in ('recorded', 'confirmed', 'paid', 'withheld', 'not_applicable')),
  status_note        text,

  created_at         timestamptz not null default now(),
  created_by         uuid references core.app_user(id) on delete restrict,
  updated_at         timestamptz not null default now(),

  foreign key (teacher_profile_id, school_id) references core.teacher_profile(id, school_id) on delete cascade,
  foreign key (framework_id, school_id) references pay.framework(id, school_id) on delete restrict,
  foreign key (service_policy_id, school_id) references service.policy(id, school_id) on delete restrict,
  unique (id, school_id),

  -- Claiming that withholding is permitted requires the rule that permits it.
  constraint entitlement_withholding_needs_rule check (
    not withholding_permitted_by_rule
    or (withholding_rule_reference is not null and withholding_rule_source_id is not null)
  ),
  -- And an entitlement may only be marked withheld where that is true.
  constraint entitlement_withheld_only_if_permitted check (
    status <> 'withheld'
    or (withholding_permitted_by_rule and length(btrim(coalesce(status_note, ''))) >= 20)
  )
);

comment on column pay.entitlement.withholding_permitted_by_rule is
  'False unless a verified rule expressly permits withholding on performance grounds. While false, no growth score or recommendation can block this entitlement — enforced by trigger, not by convention.';

create trigger set_updated_at before update on pay.entitlement
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Increment readiness — configurable requirements
-- ---------------------------------------------------------------------------
create type pay.requirement_source as enum (
  'growth_score',
  'competency_attainment',
  'competency_growth',
  'kpi_achievement',
  'cpd_compliance',
  'cpd_impact',
  'classroom_practice',
  'professional_goals',
  'collaboration',
  'leadership',
  'professional_conduct',
  'service_condition',
  'manual'
);

create table pay.readiness_model (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references core.school(id) on delete cascade,
  key            text not null check (key ~ '^[a-z][a-z0-9_.]*$'),
  version        integer not null check (version >= 1),
  name           text not null,
  classification regulatory.requirement_classification not null default 'school_policy',
  disclaimer     text not null default
    'DEMO SCHOOL POLICY — NOT A CBSE OR PUNJAB GOVERNMENT FORMULA.',
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  unique (school_id, key, version),
  unique (id, school_id),
  constraint readiness_model_policy_disclaimed check (
    classification <> 'school_policy'
    or disclaimer ilike '%NOT A CBSE OR PUNJAB GOVERNMENT FORMULA%'
  )
);

create table pay.readiness_requirement (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null,
  model_id      uuid not null,
  key           text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name  text not null,
  source        pay.requirement_source not null,

  -- Weight toward the readiness percentage, and the bar for "complete".
  weight_percent numeric(5,2) not null check (weight_percent >= 0 and weight_percent <= 100),
  threshold      numeric(6,2),
  threshold_note text not null check (length(btrim(threshold_note)) >= 15),

  is_mandatory  boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (model_id, key),
  unique (id, school_id),
  foreign key (model_id, school_id) references pay.readiness_model(id, school_id) on delete cascade
);

comment on column pay.readiness_requirement.threshold_note is
  'What the threshold means in words. Required: a bar nobody can explain is not a bar anyone can be held to.';

create function pay.assert_readiness_weights()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_model uuid := coalesce(new.model_id, old.model_id);
  v_total numeric(6,2);
begin
  if not exists (select 1 from pay.readiness_model where id = v_model) then
    return null;
  end if;
  select coalesce(sum(weight_percent), 0) into v_total
  from pay.readiness_requirement where model_id = v_model;
  if v_total <> 100 then
    raise exception 'Readiness model weights total %, not 100', v_total;
  end if;
  return null;
end;
$$;

create constraint trigger readiness_weights_total
  after insert or update or delete on pay.readiness_requirement
  deferrable initially deferred
  for each row execute function pay.assert_readiness_weights();

-- ---------------------------------------------------------------------------
-- 4. The recommendation, and its human approval chain
-- ---------------------------------------------------------------------------
create type pay.recommendation_outcome as enum (
  'recommended',
  'recommended_with_conditions',
  'defer_pending_requirements',
  'not_recommended'
);

create type pay.approval_stage as enum (
  'system_analysis',
  'supervisor_recommendation',
  'principal_review',
  'hr_management_review',
  'authorised_approval',
  'final_decision'
);

create table pay.recommendation (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null,
  academic_year_id   uuid not null references core.academic_year(id) on delete restrict,
  appraisal_id       uuid,
  readiness_model_id uuid not null,

  -- The computed picture. Readiness, not a decision.
  readiness_percent  numeric(5,2) not null check (readiness_percent >= 0 and readiness_percent <= 100),
  requirements_total integer not null check (requirements_total >= 0),
  requirements_met   integer not null check (requirements_met >= 0),
  outstanding        jsonb not null default '[]'::jsonb,
  disclaimer         text not null,
  engine_version     text not null default 'increment-readiness-v1',

  -- The human part.
  outcome            pay.recommendation_outcome,
  outcome_rationale  text,
  recommended_by     uuid references core.app_user(id) on delete restrict,
  recommended_at     timestamptz,

  -- Where it has reached in the approval chain.
  stage              pay.approval_stage not null default 'system_analysis',

  -- If this recommendation proposes withholding an entitlement, it must name
  -- which one — and the trigger below checks that withholding is permitted.
  affects_entitlement_id uuid,
  proposes_withholding  boolean not null default false,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (school_id, teacher_profile_id, academic_year_id),
  unique (id, school_id),
  foreign key (teacher_profile_id, school_id) references core.teacher_profile(id, school_id) on delete cascade,
  foreign key (appraisal_id, school_id) references appraisal.appraisal(id, school_id) on delete set null,
  foreign key (readiness_model_id, school_id) references pay.readiness_model(id, school_id) on delete restrict,
  foreign key (affects_entitlement_id, school_id) references pay.entitlement(id, school_id) on delete restrict,

  constraint recommendation_counts_sane check (requirements_met <= requirements_total),
  constraint recommendation_outcome_reasoned check (
    outcome is null
    or (recommended_by is not null and recommended_at is not null
        and length(btrim(coalesce(outcome_rationale, ''))) >= 20)
  ),
  constraint recommendation_withholding_names_entitlement check (
    not proposes_withholding or affects_entitlement_id is not null
  )
);

comment on table pay.recommendation is
  'Increment READINESS and a recommendation — never an automatic salary decision. The final decision is a human act, recorded in pay.approval.';

create trigger set_updated_at before update on pay.recommendation
  for each row execute function core.set_updated_at();

-- The rule the whole migration exists for.
create function pay.assert_withholding_permitted()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_permitted boolean;
  v_reference text;
begin
  if not new.proposes_withholding then
    return new;
  end if;

  select withholding_permitted_by_rule, withholding_rule_reference
    into v_permitted, v_reference
  from pay.entitlement where id = new.affects_entitlement_id;

  if v_permitted is not true then
    raise exception
      'This recommendation would withhold an entitlement, but no verified rule permits withholding it on performance grounds'
      using hint = 'A growth score is an input to a recommendation. It is not, by itself, a reason to withhold something a teacher is owed. Record the verified rule on the entitlement first, or make a recommendation that does not withhold.',
            errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger recommendation_withholding_guard
  before insert or update on pay.recommendation
  for each row execute function pay.assert_withholding_permitted();

-- Nobody recommends on their own increment.
create function pay.reject_self_recommendation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_self uuid;
begin
  select tp.user_id into v_self from core.teacher_profile tp where tp.id = new.teacher_profile_id;
  if new.recommended_by is not null and new.recommended_by = v_self then
    raise exception 'A teacher cannot recommend their own increment';
  end if;
  return new;
end;
$$;

create trigger recommendation_no_self
  before insert or update on pay.recommendation
  for each row execute function pay.reject_self_recommendation();

-- ---------------------------------------------------------------------------
-- The approval chain — configurable per school
-- ---------------------------------------------------------------------------
create table pay.approval_step (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references core.school(id) on delete cascade,
  stage         pay.approval_stage not null,
  step_order    integer not null,
  display_name  text not null,

  -- The permission a person must hold to complete this step. Named as a
  -- permission key so the requirement is enforceable rather than advisory.
  required_permission text references core.permission(key) on delete restrict,
  is_required   boolean not null default true,
  note          text,
  unique (school_id, stage),
  unique (school_id, step_order)
);

comment on table pay.approval_step is
  'The approval chain, configurable because school governance differs. Where another authority is required, a step is added rather than the code changed.';

create table pay.approval (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  recommendation_id uuid not null,
  stage             pay.approval_stage not null,

  decision          text not null check (decision in ('endorsed', 'returned', 'declined', 'approved')),
  decided_by        uuid not null references core.app_user(id) on delete restrict,
  decided_at        timestamptz not null default now(),
  note              text,

  foreign key (recommendation_id, school_id) references pay.recommendation(id, school_id) on delete cascade,
  unique (recommendation_id, stage),
  -- Returning or declining needs a reason on the record.
  constraint approval_refusal_reasoned check (
    decision in ('endorsed', 'approved') or length(btrim(coalesce(note, ''))) >= 10
  )
);

comment on table pay.approval is
  'Who decided what, at which stage. Append-only: an approval that can be edited is not an approval.';

create function pay.reject_approval_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'pay.approval is append-only';
end;
$$;

create trigger approval_immutable
  before update or delete on pay.approval
  for each row execute function pay.reject_approval_mutation();

-- No step may be completed by the teacher it concerns, and no one person may
-- complete two stages of the same recommendation. Concentrating the chain in
-- one pair of hands is the failure the chain exists to prevent.
create function pay.assert_approval_independence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_self uuid;
  v_clash text;
begin
  select tp.user_id into v_self
  from pay.recommendation r
  join core.teacher_profile tp on tp.id = r.teacher_profile_id
  where r.id = new.recommendation_id;

  if new.decided_by = v_self then
    raise exception 'A teacher cannot approve a decision about their own increment';
  end if;

  select a.stage::text into v_clash
  from pay.approval a
  where a.recommendation_id = new.recommendation_id
    and a.decided_by = new.decided_by
    and a.stage <> new.stage
  limit 1;

  if v_clash is not null then
    raise exception 'This person already decided the % stage of this recommendation', v_clash
      using hint = 'Each stage of the approval chain is an independent check; one person cannot be two of them.';
  end if;

  return new;
end;
$$;

create trigger approval_independence
  before insert on pay.approval
  for each row execute function pay.assert_approval_independence();
