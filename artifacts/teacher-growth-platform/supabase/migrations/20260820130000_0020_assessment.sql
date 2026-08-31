-- ===========================================================================
-- 0020 — Assessment
-- ===========================================================================
-- The governing rule: self-assessment, supervisor assessment, observation and
-- evidence strength are stored SEPARATELY and are never silently merged into a
-- single unexplained score.
--
-- A verified competency level is a human judgement that must record what it was
-- based on. `assessment.verified_competency` therefore snapshots every input
-- alongside the outcome and a written rationale — so a teacher can always be
-- shown why their level is what it is.
--
-- Nothing here is ever overwritten. Ratings and verifications are append-only;
-- a change is a new row that supersedes its predecessor. Competency movement
-- over time is simply the history of these rows.
-- ===========================================================================

create schema if not exists assessment;
comment on schema assessment is
  'Self, supervisor and observation ratings, evidence validation, and the '
  'verified competency levels derived from them. Append-only.';

create type assessment.rating_source as enum (
  'self',        -- the teacher's own judgement
  'supervisor',  -- a reviewer within scope
  'observation', -- derived from a recorded classroom observation
  'moderation'   -- a moderator adjusting for consistency across a group
);

create type assessment.evidence_strength as enum ('none', 'weak', 'adequate', 'strong');

create type assessment.cycle_status as enum ('draft', 'open', 'in_review', 'closed');

create type assessment.teacher_assessment_status as enum (
  'not_started', 'self_submitted', 'supervisor_submitted', 'verified'
);

-- ---------------------------------------------------------------------------
-- Cycles
-- ---------------------------------------------------------------------------

create table assessment.cycle (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete restrict,
  key               text not null check (key ~ '^[a-z0-9][a-z0-9_]*$'),
  name              text not null,
  description       text,
  status            assessment.cycle_status not null default 'draft',
  opens_on          date,
  closes_on         date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint cycle_unique unique (school_id, academic_year_id, key),
  constraint cycle_id_school unique (id, school_id),
  constraint cycle_dates_ordered check (closes_on is null or opens_on is null or closes_on >= opens_on)
);

create trigger set_updated_at before update on assessment.cycle
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Per-teacher assessment
-- ---------------------------------------------------------------------------

create table assessment.teacher_assessment (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  cycle_id          uuid not null,
  teacher_profile_id uuid not null references core.teacher_profile(id) on delete cascade,
  status            assessment.teacher_assessment_status not null default 'not_started',
  self_submitted_at timestamptz,
  supervisor_submitted_at timestamptz,
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint teacher_assessment_cycle_fk foreign key (cycle_id, school_id)
    references assessment.cycle(id, school_id) on delete cascade,
  constraint teacher_assessment_unique unique (cycle_id, teacher_profile_id),
  constraint teacher_assessment_id_school unique (id, school_id)
);

create index teacher_assessment_teacher_idx
  on assessment.teacher_assessment (teacher_profile_id, status);

create trigger set_updated_at before update on assessment.teacher_assessment
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Observations
-- ---------------------------------------------------------------------------

create table assessment.observation (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  teacher_profile_id uuid not null references core.teacher_profile(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete restrict,
  observer_user_id  uuid not null references core.app_user(id) on delete restrict,
  observed_on       date not null,
  class_level_id    uuid references core.class_level(id) on delete set null,
  subject_id        uuid references core.subject(id) on delete set null,
  focus             text,
  notes             text,
  -- What the observer saw, in their words. Required: an observation without
  -- narrative is a number nobody can question.
  narrative         text not null check (length(btrim(narrative)) >= 20),
  created_at        timestamptz not null default now(),
  constraint observation_id_school unique (id, school_id)
);

create index observation_teacher_idx
  on assessment.observation (teacher_profile_id, observed_on desc);

-- ---------------------------------------------------------------------------
-- Ratings — one row per source, append-only
-- ---------------------------------------------------------------------------

create table assessment.competency_rating (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  teacher_assessment_id uuid not null,
  competency_id     uuid not null,
  source            assessment.rating_source not null,
  level_id          uuid not null,
  -- Why this level. Required for every source, including self-assessment:
  -- a rating with no reasoning cannot be discussed.
  rationale         text not null check (length(btrim(rationale)) >= 15),
  observation_id    uuid references assessment.observation(id) on delete set null,
  rated_by          uuid not null references core.app_user(id) on delete restrict,
  rated_at          timestamptz not null default now(),
  superseded_by_id  uuid references assessment.competency_rating(id),

  constraint competency_rating_assessment_fk foreign key (teacher_assessment_id, school_id)
    references assessment.teacher_assessment(id, school_id) on delete cascade,
  constraint competency_rating_competency_fk foreign key (competency_id, school_id)
    references competency.competency(id, school_id) on delete restrict,
  constraint competency_rating_level_fk foreign key (level_id, school_id)
    references competency.proficiency_level(id, school_id) on delete restrict,
  constraint competency_rating_observation_source check (
    source <> 'observation' or observation_id is not null
  )
);

comment on table assessment.competency_rating is
  'One rating from one source. Append-only: correcting a rating means inserting '
  'a new row and marking the old one superseded, so the earlier judgement and '
  'its reasoning remain on record.';

create index competency_rating_lookup
  on assessment.competency_rating (teacher_assessment_id, competency_id, source);

create trigger competency_rating_append_only
  before delete on assessment.competency_rating
  for each row execute function core.reject_mutation();

-- Only `superseded_by_id` may be updated; everything else is immutable.
create or replace function assessment.reject_rating_edit()
returns trigger
language plpgsql
as $$
begin
  if new.level_id is distinct from old.level_id
     or new.rationale is distinct from old.rationale
     or new.source is distinct from old.source
     or new.competency_id is distinct from old.competency_id
     or new.rated_by is distinct from old.rated_by then
    raise exception
      'Ratings are immutable. Insert a new rating and supersede this one instead.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger competency_rating_immutable
  before update on assessment.competency_rating
  for each row execute function assessment.reject_rating_edit();

-- The current rating per source: the most recent that has not been superseded.
create or replace view assessment.current_rating
with (security_invoker = true) as
select distinct on (r.teacher_assessment_id, r.competency_id, r.source)
  r.id, r.school_id, r.teacher_assessment_id, r.competency_id, r.source,
  r.level_id, r.rationale, r.observation_id, r.rated_by, r.rated_at,
  pl.key as level_key, pl.name as level_name, pl.ordinal as level_ordinal,
  au.full_name as rated_by_name
from assessment.competency_rating r
join competency.proficiency_level pl on pl.id = r.level_id
left join core.app_user au on au.id = r.rated_by
where r.superseded_by_id is null
order by r.teacher_assessment_id, r.competency_id, r.source, r.rated_at desc;

-- ---------------------------------------------------------------------------
-- Evidence strength
-- ---------------------------------------------------------------------------
-- Evidence already has a review lifecycle (migration 0013). Validation adds a
-- judgement of how strongly it supports the claim, which the gap engine reads.

alter table evidence.evidence
  add column if not exists strength assessment.evidence_strength;

comment on column evidence.evidence.strength is
  'How strongly this artefact supports what it claims. Set at verification. '
  'Distinct from status: evidence can be verified as genuine yet weak.';

alter table evidence.evidence
  drop constraint if exists evidence_verified_has_strength;
alter table evidence.evidence
  add constraint evidence_verified_has_strength check (
    status <> 'verified' or strength is not null
  );

-- ---------------------------------------------------------------------------
-- Verified competency level — the explainable outcome
-- ---------------------------------------------------------------------------

create table assessment.verified_competency (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  teacher_profile_id uuid not null references core.teacher_profile(id) on delete cascade,
  competency_id     uuid not null,
  academic_year_id  uuid not null references core.academic_year(id) on delete restrict,
  source_cycle_id   uuid references assessment.cycle(id) on delete set null,

  -- The outcome, and what it was measured against.
  verified_level_id uuid not null,
  expected_level_id uuid not null,

  -- Every input, kept separately and visibly.
  self_level_id        uuid,
  supervisor_level_id  uuid,
  observation_level_id uuid,
  evidence_strength    assessment.evidence_strength not null default 'none',
  evidence_count       integer not null default 0 check (evidence_count >= 0),

  -- The human explanation. This is what a teacher is shown.
  rationale         text not null check (length(btrim(rationale)) >= 20),
  -- Full snapshot of the inputs at the moment of verification, so the record
  -- survives later edits to anything it drew on.
  determined_from   jsonb not null default '{}'::jsonb,

  is_reassessment   boolean not null default false,
  supersedes_id     uuid references assessment.verified_competency(id),

  verified_by       uuid not null references core.app_user(id) on delete restrict,
  verified_at       timestamptz not null default now(),

  constraint verified_competency_competency_fk foreign key (competency_id, school_id)
    references competency.competency(id, school_id) on delete restrict,
  constraint verified_competency_level_fk foreign key (verified_level_id, school_id)
    references competency.proficiency_level(id, school_id) on delete restrict,
  constraint verified_competency_expected_fk foreign key (expected_level_id, school_id)
    references competency.proficiency_level(id, school_id) on delete restrict
);

comment on table assessment.verified_competency is
  'The verified level for one competency, for one teacher, at a point in time. '
  'Append-only — a reassessment is a NEW row superseding the old, which is how '
  'competency movement over time is recorded.';

create index verified_competency_current_idx
  on assessment.verified_competency (teacher_profile_id, competency_id, verified_at desc);

create trigger verified_competency_append_only
  before update or delete on assessment.verified_competency
  for each row execute function core.reject_mutation();

-- Nobody verifies their own competency level.
create or replace function assessment.reject_self_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_teacher_user uuid;
begin
  select tp.user_id into v_teacher_user
  from core.teacher_profile tp where tp.id = new.teacher_profile_id;

  if v_teacher_user = new.verified_by then
    raise exception
      'A teacher cannot verify their own competency level. Verification must be '
      'carried out by a reviewer within scope.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger verified_competency_no_self_verification
  before insert on assessment.verified_competency
  for each row execute function assessment.reject_self_verification();

comment on function assessment.reject_self_verification() is
  'The self-appraisal conflict rule, deferred from Stage 1. Self-ASSESSMENT is '
  'expected and valuable; self-VERIFICATION is not.';

-- Latest verified level per teacher per competency.
create or replace view assessment.current_verified_competency
with (security_invoker = true) as
select distinct on (v.teacher_profile_id, v.competency_id)
  v.*,
  vl.key as verified_level_key, vl.name as verified_level_name, vl.ordinal as verified_ordinal,
  el.key as expected_level_key, el.name as expected_level_name, el.ordinal as expected_ordinal,
  c.key as competency_key, c.name as competency_name,
  au.full_name as verified_by_name
from assessment.verified_competency v
join competency.proficiency_level vl on vl.id = v.verified_level_id
join competency.proficiency_level el on el.id = v.expected_level_id
join competency.competency c on c.id = v.competency_id
left join core.app_user au on au.id = v.verified_by
order by v.teacher_profile_id, v.competency_id, v.verified_at desc;

comment on view assessment.current_verified_competency is
  'The standing verified level. History remains in the base table — this view '
  'is a convenience, never a replacement for it.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table assessment.cycle               enable row level security;
alter table assessment.teacher_assessment  enable row level security;
alter table assessment.observation         enable row level security;
alter table assessment.competency_rating   enable row level security;
alter table assessment.verified_competency enable row level security;

create policy cycle_select on assessment.cycle
  for select using (core.is_member_of(school_id));
create policy cycle_write on assessment.cycle
  for all using (core.has_permission(school_id, 'assessment.moderate'))
  with check (core.has_permission(school_id, 'assessment.moderate'));

create policy teacher_assessment_select on assessment.teacher_assessment
  for select using (core.can_view_staff_record(teacher_profile_id));
create policy teacher_assessment_write on assessment.teacher_assessment
  for all using (
    core.can_view_staff_record(teacher_profile_id)
    and (core.has_permission(school_id, 'assessment.conduct')
         or exists (select 1 from core.teacher_profile tp
                    where tp.id = teacher_assessment.teacher_profile_id
                      and tp.user_id = auth.uid()))
  )
  with check (
    core.can_view_staff_record(teacher_profile_id)
    and (core.has_permission(school_id, 'assessment.conduct')
         or exists (select 1 from core.teacher_profile tp
                    where tp.id = teacher_assessment.teacher_profile_id
                      and tp.user_id = auth.uid()))
  );

create policy observation_select on assessment.observation
  for select using (core.can_view_staff_record(teacher_profile_id));
create policy observation_write on assessment.observation
  for all using (
    core.has_permission(school_id, 'observation.conduct')
    and core.can_view_staff_record(teacher_profile_id)
  )
  with check (
    core.has_permission(school_id, 'observation.conduct')
    and core.can_view_staff_record(teacher_profile_id)
  );

-- A teacher sees every rating about themselves, including their supervisor's.
-- Transparency is the point: they must be able to see why a level was reached.
create policy competency_rating_select on assessment.competency_rating
  for select using (
    exists (select 1 from assessment.teacher_assessment ta
            where ta.id = competency_rating.teacher_assessment_id
              and core.can_view_staff_record(ta.teacher_profile_id))
  );

create policy competency_rating_insert on assessment.competency_rating
  for insert with check (
    rated_by = auth.uid()
    and exists (
      select 1 from assessment.teacher_assessment ta
      join core.teacher_profile tp on tp.id = ta.teacher_profile_id
      where ta.id = competency_rating.teacher_assessment_id
        and (
          -- Own self-assessment,
          (competency_rating.source = 'self' and tp.user_id = auth.uid())
          -- or a reviewer within scope.
          or (competency_rating.source <> 'self'
              and core.has_permission(ta.school_id, 'assessment.conduct')
              and core.can_view_staff_record(ta.teacher_profile_id))
        )
    )
  );

create policy competency_rating_supersede on assessment.competency_rating
  for update using (
    exists (select 1 from assessment.teacher_assessment ta
            where ta.id = competency_rating.teacher_assessment_id
              and core.can_view_staff_record(ta.teacher_profile_id))
  )
  with check (true);

create policy verified_competency_select on assessment.verified_competency
  for select using (core.can_view_staff_record(teacher_profile_id));

create policy verified_competency_insert on assessment.verified_competency
  for insert with check (
    verified_by = auth.uid()
    and core.has_permission(school_id, 'assessment.conduct')
    and core.can_view_staff_record(teacher_profile_id)
  );

create trigger audit_changes
  after insert or update or delete on assessment.verified_competency
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on assessment.competency_rating
  for each row execute function audit.record_row_change();
