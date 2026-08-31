-- ===========================================================================
-- 0034 — SQAAF self-assessment, evidence mapping and improvement planning
-- ===========================================================================
-- The loop CBSE's own Annexure F describes:
--
--   self-assessment -> gap -> improvement action -> owner -> target date
--     -> evidence -> review -> completion
--
-- Annexure F supplies: current maturity level, aspirational level, prioritized
-- area (L/M/H), area of improvement, proposed action, convenor/team. The target
-- date, evidence link, review and completion fields are THIS PLATFORM'S, not
-- CBSE's, and are labelled as such in `docs/SQAAF_IMPLEMENTATION.md`. A school
-- reading its own improvement plan should be able to tell which columns CBSE
-- asked for and which we added.
--
-- Nothing here submits anything to CBSE. The platform produces a readiness pack
-- for a person to file on the SQAA Portal; automating a submission to a
-- regulator on a school's behalf is not a thing this system does.
-- ===========================================================================

create type sqaaf.assessment_status as enum (
  'not_started',
  'in_progress',
  'internal_review',
  'ready_for_submission',
  'submitted_externally',
  'archived'
);

create type sqaaf.priority_band as enum ('low', 'medium', 'high');

create type sqaaf.action_status as enum (
  'proposed',
  'approved',
  'in_progress',
  'evidence_submitted',
  'under_review',
  'completed',
  'abandoned'
);

-- ---------------------------------------------------------------------------
-- A self-assessment cycle
-- ---------------------------------------------------------------------------
create table sqaaf.self_assessment (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references core.school(id) on delete cascade,
  academic_year_id uuid not null references core.academic_year(id) on delete restrict,
  version_id       uuid not null,

  status           sqaaf.assessment_status not null default 'not_started',
  started_at       timestamptz,
  started_by       uuid references core.app_user(id) on delete restrict,

  -- "submitted" means a human filed it on the SQAA Portal and recorded that
  -- here. The platform never files anything itself.
  externally_submitted_at   timestamptz,
  externally_submitted_by   uuid references core.app_user(id) on delete restrict,
  external_submission_note  text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (school_id, academic_year_id),
  unique (id, school_id),
  foreign key (version_id, school_id) references sqaaf.framework_version(id, school_id) on delete restrict,
  constraint sqaaf_external_submission_recorded check (
    status <> 'submitted_externally'
    or (externally_submitted_at is not null and externally_submitted_by is not null)
  )
);

comment on column sqaaf.self_assessment.externally_submitted_at is
  'When a person filed this on the SQAA Portal. The platform does not submit to CBSE; it records that someone did.';

create trigger set_updated_at before update on sqaaf.self_assessment
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- A rating against one standard
-- ---------------------------------------------------------------------------
create table sqaaf.standard_rating (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null,
  self_assessment_id uuid not null,
  standard_id        uuid not null,

  level_id           uuid not null,
  aspirational_level_id uuid,

  -- CBSE's framing is self-reflection and accountability; a score without its
  -- reasoning is an audit artefact rather than an improvement tool.
  rationale          text not null check (length(btrim(rationale)) >= 20),

  responsible_user_id uuid references core.app_user(id) on delete restrict,
  priority           sqaaf.priority_band,

  rated_by           uuid references core.app_user(id) on delete restrict,
  rated_at           timestamptz not null default now(),

  unique (self_assessment_id, standard_id),
  unique (id, school_id),
  foreign key (self_assessment_id, school_id) references sqaaf.self_assessment(id, school_id) on delete cascade,
  foreign key (standard_id, school_id) references sqaaf.standard(id, school_id) on delete restrict,
  foreign key (level_id, school_id) references sqaaf.performance_level(id, school_id) on delete restrict,
  foreign key (aspirational_level_id, school_id) references sqaaf.performance_level(id, school_id) on delete restrict
);

comment on table sqaaf.standard_rating is
  'One rating per standard per cycle, with a required rationale. Aspirational level is Annexure F''s column, not an invention.';

-- The level and the aspirational level must belong to the same framework
-- version as the standard being rated. Without this a rating can silently mix
-- scales, which is the Stage 3 defect (0028) in a new place.
create function sqaaf.assert_rating_version_consistent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_assessment_version uuid;
  v_standard_version   uuid;
  v_level_version      uuid;
  v_asp_version        uuid;
begin
  select sa.version_id into v_assessment_version
  from sqaaf.self_assessment sa where sa.id = new.self_assessment_id;

  select d.version_id into v_standard_version
  from sqaaf.standard s
  join sqaaf.sub_domain sd on sd.id = s.sub_domain_id
  join sqaaf.domain d on d.id = sd.domain_id
  where s.id = new.standard_id;

  select pl.version_id into v_level_version
  from sqaaf.performance_level pl where pl.id = new.level_id;

  if new.aspirational_level_id is not null then
    select pl.version_id into v_asp_version
    from sqaaf.performance_level pl where pl.id = new.aspirational_level_id;
  end if;

  if v_standard_version is distinct from v_assessment_version then
    raise exception 'Standard belongs to a different SQAAF framework version than this self-assessment';
  end if;
  if v_level_version is distinct from v_assessment_version then
    raise exception 'Performance level belongs to a different SQAAF framework version than this self-assessment';
  end if;
  if new.aspirational_level_id is not null and v_asp_version is distinct from v_assessment_version then
    raise exception 'Aspirational level belongs to a different SQAAF framework version than this self-assessment';
  end if;

  return new;
end;
$$;

create trigger sqaaf_rating_version_consistent
  before insert or update on sqaaf.standard_rating
  for each row execute function sqaaf.assert_rating_version_consistent();

-- ---------------------------------------------------------------------------
-- Evidence mapping — reference, never copy
-- ---------------------------------------------------------------------------
-- One artefact may support several standards, and one standard draws on several
-- artefacts. The map points at records that already exist elsewhere in the
-- platform, so there is exactly one source of truth for each.
create table sqaaf.evidence_map (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null,
  standard_id        uuid not null,
  self_assessment_id uuid not null,

  -- Exactly one of these. Five kinds of platform record can evidence a standard.
  evidence_id            uuid references evidence.evidence(id) on delete cascade,
  cpd_record_id          uuid references compliance.cpd_record(id) on delete cascade,
  verified_competency_id uuid references assessment.verified_competency(id) on delete cascade,
  teacher_kpi_id         uuid references kpi.teacher_kpi(id) on delete cascade,
  plan_item_id           uuid references growth.learning_plan_item(id) on delete cascade,

  -- Aggregated evidence: a count rather than named individuals, for standards
  -- that are about the school's practice rather than any one teacher's record.
  aggregate_note     text,

  mapped_by          uuid references core.app_user(id) on delete restrict,
  mapped_at          timestamptz not null default now(),
  note               text,

  foreign key (standard_id, school_id) references sqaaf.standard(id, school_id) on delete cascade,
  foreign key (self_assessment_id, school_id) references sqaaf.self_assessment(id, school_id) on delete cascade,

  constraint sqaaf_evidence_map_exactly_one_target check (
    (evidence_id is not null)::int
  + (cpd_record_id is not null)::int
  + (verified_competency_id is not null)::int
  + (teacher_kpi_id is not null)::int
  + (plan_item_id is not null)::int
  + (aggregate_note is not null)::int = 1
  )
);

comment on table sqaaf.evidence_map is
  'Teacher evidence -> competency -> KPI -> professional development -> SQAAF standard. Collect once, use twice: the map references existing records rather than copying them.';

-- The same artefact must not be mapped to the same standard twice.
create unique index sqaaf_map_unique_evidence on sqaaf.evidence_map (self_assessment_id, standard_id, evidence_id) where evidence_id is not null;
create unique index sqaaf_map_unique_cpd on sqaaf.evidence_map (self_assessment_id, standard_id, cpd_record_id) where cpd_record_id is not null;
create unique index sqaaf_map_unique_competency on sqaaf.evidence_map (self_assessment_id, standard_id, verified_competency_id) where verified_competency_id is not null;
create unique index sqaaf_map_unique_kpi on sqaaf.evidence_map (self_assessment_id, standard_id, teacher_kpi_id) where teacher_kpi_id is not null;
create unique index sqaaf_map_unique_plan_item on sqaaf.evidence_map (self_assessment_id, standard_id, plan_item_id) where plan_item_id is not null;

-- ---------------------------------------------------------------------------
-- Evidence gaps
-- ---------------------------------------------------------------------------
create table sqaaf.evidence_gap (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null,
  self_assessment_id uuid not null,
  standard_id        uuid not null,

  description        text not null check (length(btrim(description)) >= 15),
  responsible_user_id uuid references core.app_user(id) on delete restrict,
  identified_by      uuid references core.app_user(id) on delete restrict,
  identified_at      timestamptz not null default now(),
  resolved_at        timestamptz,
  resolution_note    text,

  unique (self_assessment_id, standard_id),
  unique (id, school_id),
  foreign key (self_assessment_id, school_id) references sqaaf.self_assessment(id, school_id) on delete cascade,
  foreign key (standard_id, school_id) references sqaaf.standard(id, school_id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Improvement actions
-- ---------------------------------------------------------------------------
create table sqaaf.improvement_action (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null,
  self_assessment_id uuid not null,
  standard_id        uuid not null,
  evidence_gap_id    uuid,

  -- Annexure F columns
  current_level_id      uuid,
  aspirational_level_id uuid,
  priority              sqaaf.priority_band not null,
  area_of_improvement   text not null check (length(btrim(area_of_improvement)) >= 10),
  proposed_action       text not null check (length(btrim(proposed_action)) >= 15),
  convenor_user_id      uuid references core.app_user(id) on delete restrict,
  team_note             text,

  -- Platform additions, so an action can actually be tracked to completion
  target_date        date,
  status             sqaaf.action_status not null default 'proposed',
  evidence_id        uuid references evidence.evidence(id) on delete set null,
  reviewed_by        uuid references core.app_user(id) on delete restrict,
  reviewed_at        timestamptz,
  review_note        text,
  completed_at       timestamptz,

  created_at         timestamptz not null default now(),
  created_by         uuid references core.app_user(id) on delete restrict,
  updated_at         timestamptz not null default now(),

  unique (id, school_id),
  foreign key (self_assessment_id, school_id) references sqaaf.self_assessment(id, school_id) on delete cascade,
  foreign key (standard_id, school_id) references sqaaf.standard(id, school_id) on delete restrict,
  foreign key (evidence_gap_id, school_id) references sqaaf.evidence_gap(id, school_id) on delete set null,
  foreign key (current_level_id, school_id) references sqaaf.performance_level(id, school_id) on delete restrict,
  foreign key (aspirational_level_id, school_id) references sqaaf.performance_level(id, school_id) on delete restrict,

  -- Completing an action requires a reviewer, not just the owner saying so.
  constraint sqaaf_action_completion_reviewed check (
    status <> 'completed'
    or (reviewed_by is not null and reviewed_at is not null and completed_at is not null)
  ),
  constraint sqaaf_action_abandon_reasoned check (
    status <> 'abandoned' or length(btrim(coalesce(review_note, ''))) >= 10
  )
);

comment on table sqaaf.improvement_action is
  'CBSE Annexure F''s Self Improvement Plan columns, plus target date, evidence, review and completion so an action can be tracked rather than only listed.';

create index sqaaf_action_open_idx on sqaaf.improvement_action (school_id, self_assessment_id, status);

create trigger set_updated_at before update on sqaaf.improvement_action
  for each row execute function core.set_updated_at();

create function sqaaf.validate_action_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_allowed boolean;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  v_allowed := case
    when tg_op = 'INSERT' then new.status in ('proposed', 'approved')
    when old.status = 'proposed' then new.status in ('approved', 'abandoned')
    when old.status = 'approved' then new.status in ('in_progress', 'abandoned')
    when old.status = 'in_progress' then new.status in ('evidence_submitted', 'abandoned')
    when old.status = 'evidence_submitted' then new.status in ('under_review', 'in_progress')
    when old.status = 'under_review' then new.status in ('completed', 'in_progress')
    else false      -- completed and abandoned are terminal
  end;

  if not v_allowed then
    raise exception 'Improvement action cannot move from % to %',
      coalesce(old.status::text, '(new)'), new.status;
  end if;

  return new;
end;
$$;

create trigger sqaaf_action_validate_transition
  before insert or update of status on sqaaf.improvement_action
  for each row execute function sqaaf.validate_action_transition();
