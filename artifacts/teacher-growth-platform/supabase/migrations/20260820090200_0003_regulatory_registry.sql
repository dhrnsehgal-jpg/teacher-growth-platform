-- ===========================================================================
-- 0003 — Regulatory registry, versioning and applicability
-- ===========================================================================
-- The central rule this schema exists to enforce:
--
--   A school policy must never be presented as a CBSE rule, and an NPST
--   recommendation must never be presented as mandatory law.
--
-- Every requirement therefore carries, structurally and not by convention:
--   * the authority layer it comes from        (authority.layer)
--   * whether it binds or merely advises        (classification)
--   * whether we have actually checked it       (verification_status)
--   * which school types and staff it reaches   (applicability rows)
--
-- Nothing is enforced by the application unless it is BOTH 'verified' AND
-- 'mandatory' AND determined applicable to this school. See
-- regulatory.is_enforceable_for_school().
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Authorities
-- ---------------------------------------------------------------------------

create table regulatory.authority (
  id                uuid primary key default gen_random_uuid(),
  layer             regulatory.authority_layer not null,
  key               text not null unique
                      check (key ~ '^[a-z][a-z0-9_]*$'),
  name              text not null,
  short_name        text,
  official_website  text,
  -- Null for global authorities; set for a school's own governing body so that
  -- one tenant's policy authority is never confused with another's.
  school_id         uuid references core.school(id) on delete cascade,
  created_at        timestamptz not null default now(),
  constraint authority_school_layer_consistent check (
    (layer = 'school' and school_id is not null) or
    (layer <> 'school' and school_id is null)
  )
);

comment on table regulatory.authority is
  'Who issued a rule. Central/CBSE/State authorities are global reference data; '
  'school-layer authorities belong to one tenant.';

-- ---------------------------------------------------------------------------
-- Sources (documents)
-- ---------------------------------------------------------------------------
-- One row per *version* of a document. Superseded versions are never deleted:
-- an appraisal decided in 2026 must remain explainable under the 2026 text.

create table regulatory.source (
  id                uuid primary key default gen_random_uuid(),
  authority_id      uuid not null references regulatory.authority(id) on delete restrict,
  school_id         uuid references core.school(id) on delete cascade,

  document_type     text not null
                      check (document_type in (
                        'act', 'rules', 'regulation', 'policy', 'bye_laws',
                        'circular', 'notification', 'guidelines', 'framework',
                        'handbook', 'school_policy', 'other'
                      )),
  title             text not null,
  -- Circular/notification/act number as printed on the document.
  reference_number  text,
  version_label     text not null default '1',

  issued_on         date,
  effective_from    date,
  effective_to      date,

  source_url        text,
  -- When we last actually retrieved and read the document at source_url.
  retrieved_at      timestamptz,
  -- Hash of the retrieved file, so a silently-reissued PDF is detectable.
  content_sha256    text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),

  verification_status regulatory.verification_status not null
                      default 'requires_verification',
  verified_by       uuid references core.app_user(id),
  verified_at       timestamptz,
  last_reviewed_on  date,
  -- Next scheduled review. Regulatory text drifts; a stale 'verified' is a lie.
  review_due_on     date,

  superseded_by_id  uuid references regulatory.source(id),
  notes             text,

  created_at        timestamptz not null default now(),
  created_by        uuid references core.app_user(id),
  updated_at        timestamptz not null default now(),

  constraint source_effective_period_ordered
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint source_verified_requires_evidence check (
    verification_status <> 'verified'
    or (source_url is not null and retrieved_at is not null and verified_at is not null)
  ),
  constraint source_superseded_has_successor check (
    verification_status <> 'superseded' or superseded_by_id is not null
  )
);

comment on constraint source_verified_requires_evidence on regulatory.source is
  'A source cannot be marked verified without a URL, a retrieval timestamp and a '
  'verifier. This is what prevents an assumed rule from being treated as checked.';

create index source_authority_idx on regulatory.source (authority_id);
create index source_school_idx on regulatory.source (school_id) where school_id is not null;
create index source_status_idx on regulatory.source (verification_status);
create index source_review_due_idx on regulatory.source (review_due_on)
  where verification_status = 'verified';

create trigger set_updated_at before update on regulatory.source
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Requirements
-- ---------------------------------------------------------------------------
-- requirement_key is the stable identity across versions
-- (e.g. 'cbse.cpd.annual_hours'). Each row is one immutable version of it.

create table regulatory.requirement (
  id                uuid primary key default gen_random_uuid(),
  requirement_key   text not null
                      check (requirement_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  version           integer not null default 1 check (version >= 1),

  source_id         uuid not null references regulatory.source(id) on delete restrict,
  school_id         uuid references core.school(id) on delete cascade,

  -- Clause, rule, section or chapter reference within the source document.
  clause_reference  text,
  title             text not null,
  -- The requirement in plain language, as close to the source wording as
  -- possible without reproducing the document.
  requirement_text  text not null,

  classification    regulatory.requirement_classification not null,
  verification_status regulatory.verification_status not null
                      default 'requires_verification',

  effective_from    date,
  effective_to      date,

  -- What a school must be able to produce to demonstrate compliance.
  evidence_required text,

  -- Free-text applicability note for nuance the structured rows cannot hold
  -- (e.g. "applies only to posts sanctioned under the aided grant").
  applicability_note text,

  supersedes_id     uuid references regulatory.requirement(id),
  superseded_by_id  uuid references regulatory.requirement(id),

  last_reviewed_on  date,
  review_due_on     date,
  notes             text,

  created_at        timestamptz not null default now(),
  created_by        uuid references core.app_user(id),
  updated_at        timestamptz not null default now(),

  constraint requirement_unique_version unique (requirement_key, version),
  constraint requirement_period_ordered
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint requirement_superseded_has_successor check (
    verification_status <> 'superseded' or superseded_by_id is not null
  )
);

comment on table regulatory.requirement is
  'One immutable version of one regulatory requirement. Amending a rule means '
  'inserting a new version and marking the old one superseded — never an UPDATE '
  'of the text, so historical decisions stay explainable.';

comment on column regulatory.requirement.classification is
  'mandatory | recommended | school_policy. The UI must surface this verbatim '
  'wherever the requirement is shown to a teacher.';

create index requirement_key_idx on regulatory.requirement (requirement_key, version desc);
create index requirement_source_idx on regulatory.requirement (source_id);
create index requirement_school_idx on regulatory.requirement (school_id) where school_id is not null;
create index requirement_status_idx on regulatory.requirement (verification_status);

create trigger set_updated_at before update on regulatory.requirement
  for each row execute function core.set_updated_at();

-- Guard: the requirement text of a version must not be rewritten in place.
create or replace function regulatory.reject_requirement_text_edit()
returns trigger
language plpgsql
as $$
begin
  if new.requirement_text is distinct from old.requirement_text
     or new.classification is distinct from old.classification
     or new.clause_reference is distinct from old.clause_reference
     or new.effective_from is distinct from old.effective_from then
    raise exception
      'Requirement %/v% is immutable. Insert a new version and supersede this one instead.',
      old.requirement_key, old.version
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger requirement_immutable_text
  before update on regulatory.requirement
  for each row execute function regulatory.reject_requirement_text_edit();

-- ---------------------------------------------------------------------------
-- Applicability
-- ---------------------------------------------------------------------------

create table regulatory.requirement_school_type (
  requirement_id    uuid not null references regulatory.requirement(id) on delete cascade,
  school_type       regulatory.school_type_applicability not null,
  primary key (requirement_id, school_type)
);

comment on table regulatory.requirement_school_type is
  'Which funding/management categories a requirement reaches. A Punjab service '
  'rule that binds aided posts only will carry private_aided and nothing else.';

create table regulatory.requirement_employee_category (
  requirement_id    uuid not null references regulatory.requirement(id) on delete cascade,
  -- Free text against the school''s own category vocabulary (PRT/TGT/PGT/
  -- Principal/Librarian/...), or 'all_teaching_staff'.
  employee_category text not null,
  primary key (requirement_id, employee_category)
);

-- ---------------------------------------------------------------------------
-- Per-school determination
-- ---------------------------------------------------------------------------
-- The global requirement says who it *can* apply to. This table records what
-- this particular school has determined and who signed off.

create table regulatory.school_requirement_status (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  requirement_id    uuid not null references regulatory.requirement(id) on delete restrict,

  applicability     regulatory.verification_status not null
                      default 'requires_verification',
  -- Set true only by a Compliance Administrator, and only when applicability is
  -- 'verified'. Enforced by the constraint below.
  is_enforced       boolean not null default false,

  determined_by     uuid references core.app_user(id),
  determined_at     timestamptz,
  determination_note text,
  last_reviewed_on  date,
  review_due_on     date,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint school_requirement_unique unique (school_id, requirement_id),
  constraint school_requirement_enforce_requires_verified check (
    is_enforced = false
    or (applicability = 'verified' and determined_by is not null and determined_at is not null)
  )
);

comment on constraint school_requirement_enforce_requires_verified
  on regulatory.school_requirement_status is
  'A requirement cannot be enforced against staff until a named person has '
  'verified that it applies to this school.';

create index school_requirement_school_idx
  on regulatory.school_requirement_status (school_id, applicability);

create trigger set_updated_at before update on regulatory.school_requirement_status
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Enforceability
-- ---------------------------------------------------------------------------

create or replace function regulatory.is_enforceable_for_school(
  p_school_id uuid,
  p_requirement_key text,
  p_as_of date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from regulatory.requirement r
    join regulatory.source s on s.id = r.source_id
    join regulatory.school_requirement_status srs
      on srs.requirement_id = r.id and srs.school_id = p_school_id
    where r.requirement_key = p_requirement_key
      and r.classification = 'mandatory'
      and r.verification_status = 'verified'
      and s.verification_status = 'verified'
      and srs.applicability = 'verified'
      and srs.is_enforced
      and (r.effective_from is null or r.effective_from <= p_as_of)
      and (r.effective_to is null or r.effective_to >= p_as_of)
  );
$$;

comment on function regulatory.is_enforceable_for_school(uuid, text, date) is
  'The single gate every compliance calculation must pass through. Returns false '
  'for anything recommended, unverified, superseded or not yet determined.';

-- Resolves the requirement version in force on a given date — used when
-- reopening a historical appraisal year.
create or replace function regulatory.requirement_as_of(
  p_requirement_key text,
  p_as_of date
)
returns regulatory.requirement
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from regulatory.requirement r
  where r.requirement_key = p_requirement_key
    and (r.effective_from is null or r.effective_from <= p_as_of)
    and (r.effective_to is null or r.effective_to >= p_as_of)
  order by r.version desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Historical rule-set locking
-- ---------------------------------------------------------------------------

create table regulatory.ruleset_snapshot (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete restrict,
  -- The full set of requirement ids and versions in force when the year closed.
  snapshot          jsonb not null,
  locked_at         timestamptz not null default now(),
  locked_by         uuid not null references core.app_user(id),
  constraint ruleset_snapshot_unique unique (school_id, academic_year_id)
);

comment on table regulatory.ruleset_snapshot is
  'Frozen record of which rule versions governed a closed academic year. Answers '
  '"under what policy was this decided?" years later.';

create trigger ruleset_snapshot_append_only
  before update or delete on regulatory.ruleset_snapshot
  for each row execute function core.reject_mutation();

create table regulatory.recalculation_authorisation (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references core.school(id) on delete cascade,
  academic_year_id  uuid not null references core.academic_year(id) on delete restrict,
  reason            text not null check (length(btrim(reason)) >= 20),
  authorised_by     uuid not null references core.app_user(id),
  authorised_at     timestamptz not null default now(),
  -- Bounded window during which recalculation of the closed year is permitted.
  valid_until       timestamptz not null,
  constraint recalculation_window_forward check (valid_until > authorised_at)
);

comment on table regulatory.recalculation_authorisation is
  'A closed year is recalculated under newer rules ONLY while an unexpired row '
  'here exists. Absent that, historical outcomes stand as decided.';

create or replace function regulatory.may_recalculate_year(
  p_school_id uuid,
  p_academic_year_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- An open year is always recalculable.
    not exists (
      select 1 from core.academic_year ay
      where ay.id = p_academic_year_id and ay.locked_at is not null
    )
    or exists (
      select 1 from regulatory.recalculation_authorisation ra
      where ra.school_id = p_school_id
        and ra.academic_year_id = p_academic_year_id
        and ra.valid_until > now()
    );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table regulatory.authority                    enable row level security;
alter table regulatory.source                       enable row level security;
alter table regulatory.requirement                  enable row level security;
alter table regulatory.requirement_school_type      enable row level security;
alter table regulatory.requirement_employee_category enable row level security;
alter table regulatory.school_requirement_status    enable row level security;
alter table regulatory.ruleset_snapshot             enable row level security;
alter table regulatory.recalculation_authorisation  enable row level security;

-- Global regulatory reference data is readable by every signed-in user: a
-- teacher is entitled to read the rule they are being measured against.
create policy authority_select on regulatory.authority
  for select to authenticated
  using (school_id is null or core.is_member_of(school_id));

create policy authority_write on regulatory.authority
  for all using (
    school_id is not null and core.has_permission(school_id, 'regulatory.manage')
  )
  with check (
    school_id is not null and core.has_permission(school_id, 'regulatory.manage')
  );

create policy source_select on regulatory.source
  for select to authenticated
  using (school_id is null or core.is_member_of(school_id));

create policy source_write on regulatory.source
  for all using (
    school_id is not null and core.has_permission(school_id, 'regulatory.manage')
  )
  with check (
    school_id is not null and core.has_permission(school_id, 'regulatory.manage')
  );

create policy requirement_select on regulatory.requirement
  for select to authenticated
  using (school_id is null or core.is_member_of(school_id));

create policy requirement_write on regulatory.requirement
  for all using (
    school_id is not null and core.has_permission(school_id, 'regulatory.manage')
  )
  with check (
    school_id is not null and core.has_permission(school_id, 'regulatory.manage')
  );

create policy requirement_school_type_select on regulatory.requirement_school_type
  for select to authenticated using (true);

create policy requirement_employee_category_select on regulatory.requirement_employee_category
  for select to authenticated using (true);

create policy school_requirement_status_select on regulatory.school_requirement_status
  for select using (core.is_member_of(school_id));

create policy school_requirement_status_write on regulatory.school_requirement_status
  for all using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy ruleset_snapshot_select on regulatory.ruleset_snapshot
  for select using (core.has_permission(school_id, 'regulatory.read'));

create policy ruleset_snapshot_insert on regulatory.ruleset_snapshot
  for insert with check (core.has_permission(school_id, 'regulatory.manage'));

create policy recalculation_select on regulatory.recalculation_authorisation
  for select using (core.has_permission(school_id, 'regulatory.read'));

create policy recalculation_insert on regulatory.recalculation_authorisation
  for insert with check (core.has_permission(school_id, 'regulatory.authorise_recalculation'));
