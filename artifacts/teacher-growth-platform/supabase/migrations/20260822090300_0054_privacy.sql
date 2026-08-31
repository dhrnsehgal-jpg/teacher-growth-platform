-- ===========================================================================
-- 0054 — Privacy: retention, correction, subject requests, access logging
-- ===========================================================================
-- The brief asks the system to be reviewed against applicable Indian data
-- protection requirements and to build the machinery those imply. It also says,
-- correctly: do not claim legal compliance merely because technical controls
-- exist. Nothing here asserts DPDP compliance. `docs/PRIVACY.md` sets out what
-- is built and what still needs legal confirmation.
--
-- One design rule runs through it: NOTHING DELETES AUTOMATICALLY. Retention
-- periods are recorded and surfaced; acting on them is a human decision with a
-- reason, because an appraisal record erased on a schedule is evidence
-- destroyed, and a teacher may need it years later.
-- ===========================================================================

create schema if not exists privacy;
comment on schema privacy is
  'Retention positions, correction and subject-access workflow, and access logging for the most sensitive records.';

-- ---------------------------------------------------------------------------
-- Retention — recorded, surfaced, never automatic
-- ---------------------------------------------------------------------------
create table privacy.retention_policy (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references core.school(id) on delete cascade,

  data_class     text not null,
  description    text not null check (length(btrim(description)) >= 20),

  -- Null means "not yet decided", which is the honest state for most of these
  -- and is displayed as such rather than defaulted to a guess.
  retain_months  integer check (retain_months is null or retain_months > 0),

  -- Why. A period with no basis cannot be defended to the person it concerns.
  basis          text,
  basis_status   regulatory.verification_status not null default 'requires_verification',

  -- What happens at the end, once somebody decides.
  disposal_action text check (disposal_action in ('delete', 'anonymise', 'retain_indefinitely', 'undecided'))
    default 'undecided',

  decided_by     uuid references core.app_user(id) on delete restrict,
  decided_at     timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (school_id, data_class),

  -- A decided period must name who decided and on what basis.
  constraint retention_decided_complete check (
    basis_status <> 'verified'
    or (retain_months is not null and decided_by is not null and decided_at is not null
        and length(btrim(coalesce(basis, ''))) >= 20)
  )
);

comment on table privacy.retention_policy is
  'What is kept and for how long. Nothing acts on these automatically: an appraisal erased on a schedule is evidence destroyed, and a teacher may need it years later.';

create trigger set_updated_at before update on privacy.retention_policy
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Subject requests — access, correction, erasure
-- ---------------------------------------------------------------------------
create type privacy.request_type as enum (
  'access',        -- give me what you hold about me
  'correction',    -- this is wrong
  'erasure',       -- delete it
  'objection'      -- I object to this processing
);

create type privacy.request_status as enum (
  'received',
  'identity_confirmed',
  'in_progress',
  'fulfilled',
  'partly_fulfilled',
  'refused',
  'withdrawn'
);

create table privacy.subject_request (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references core.school(id) on delete cascade,
  subject_user_id uuid not null references core.app_user(id) on delete restrict,

  request_type   privacy.request_type not null,
  detail         text not null check (length(btrim(detail)) >= 15),
  received_at    timestamptz not null default now(),

  status         privacy.request_status not null default 'received',

  -- Identity has to be established before anything is handed over. Handing a
  -- teacher's file to whoever asked for it is the failure mode here.
  identity_confirmed_by uuid references core.app_user(id) on delete restrict,
  identity_confirmed_at timestamptz,

  handled_by     uuid references core.app_user(id) on delete restrict,
  responded_at   timestamptz,
  response_note  text,

  -- A refusal must give reasons, and refusing an erasure often has a lawful
  -- basis — a service record the school must keep. That basis goes here.
  refusal_basis  text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint subject_request_identity_before_fulfilment check (
    status not in ('fulfilled', 'partly_fulfilled')
    or (identity_confirmed_by is not null and identity_confirmed_at is not null)
  ),
  constraint subject_request_response_complete check (
    status not in ('fulfilled', 'partly_fulfilled', 'refused')
    or (handled_by is not null and responded_at is not null
        and length(btrim(coalesce(response_note, ''))) >= 20)
  ),
  constraint subject_request_refusal_reasoned check (
    status <> 'refused' or length(btrim(coalesce(refusal_basis, ''))) >= 20
  )
);

comment on table privacy.subject_request is
  'Access, correction, erasure and objection requests. Identity must be confirmed before anything is handed over — giving a teacher''s file to whoever asked is the failure this guards.';

create trigger set_updated_at before update on privacy.subject_request
  for each row execute function core.set_updated_at();

create trigger audit_changes after insert or update or delete on privacy.subject_request
  for each row execute function audit.record_row_change();

-- ---------------------------------------------------------------------------
-- Access logging for the most sensitive records
-- ---------------------------------------------------------------------------
-- "Audit all access or modification of highly sensitive employment decisions
-- where technically practical."
--
-- Modification is already audited via audit.record_row_change. READ is harder:
-- Postgres has no select trigger, and logging every row read would be both
-- enormous and useless. What IS practical, and what actually matters, is
-- logging when someone opens another person's pay or appraisal record. The
-- application calls this on those two surfaces.
create table privacy.access_log (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references core.school(id) on delete cascade,
  actor_user_id uuid not null references core.app_user(id) on delete restrict,
  subject_teacher_profile_id uuid not null,
  record_type   text not null,
  purpose       text,
  occurred_at   timestamptz not null default now(),
  foreign key (subject_teacher_profile_id, school_id)
    references core.teacher_profile(id, school_id) on delete cascade
);

comment on table privacy.access_log is
  'Who opened whose pay or appraisal record. Read access to everything would be enormous and useless; this records the accesses that would actually matter in an investigation.';

create index access_log_subject_idx on privacy.access_log (subject_teacher_profile_id, occurred_at desc);

create function privacy.reject_access_log_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'privacy.access_log is append-only';
end;
$$;

create trigger access_log_immutable
  before update or delete on privacy.access_log
  for each row execute function privacy.reject_access_log_mutation();

-- Records an access. Never logs a person reading their own record: that is not
-- an access worth investigating, and logging it would bury the ones that are.
create function privacy.log_access(
  p_subject_teacher_profile_id uuid,
  p_record_type text,
  p_purpose text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := core.current_user_id();
  v_school uuid;
  v_subject_user uuid;
begin
  if v_actor is null then
    return;
  end if;

  select school_id, user_id into v_school, v_subject_user
  from core.teacher_profile where id = p_subject_teacher_profile_id;

  if v_school is null or v_subject_user = v_actor then
    return;
  end if;

  insert into privacy.access_log
    (school_id, actor_user_id, subject_teacher_profile_id, record_type, purpose)
  values (v_school, v_actor, p_subject_teacher_profile_id, p_record_type, p_purpose);
end;
$$;

grant execute on function privacy.log_access(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table privacy.retention_policy enable row level security;
alter table privacy.subject_request  enable row level security;
alter table privacy.access_log       enable row level security;

-- Retention positions are readable by everyone: a teacher is entitled to know
-- how long their record is kept, including that it has not been decided.
create policy retention_select on privacy.retention_policy
  for select using (core.is_member_of(school_id));
create policy retention_write on privacy.retention_policy
  using (core.has_permission(school_id, 'compliance.manage'))
  with check (core.has_permission(school_id, 'compliance.manage'));

-- A person sees their own requests; compliance sees all of them.
create policy subject_request_select on privacy.subject_request
  for select using (
    subject_user_id = core.current_user_id()
    or core.has_permission(school_id, 'compliance.manage')
  );
create policy subject_request_insert on privacy.subject_request
  for insert with check (subject_user_id = core.current_user_id());
create policy subject_request_handle on privacy.subject_request
  for update using (core.has_permission(school_id, 'compliance.manage'))
  with check (core.has_permission(school_id, 'compliance.manage'));

-- A teacher can see who opened their record. That is the point of the log.
create policy access_log_select on privacy.access_log
  for select using (
    subject_teacher_profile_id in (
      select tp.id from core.teacher_profile tp where tp.user_id = core.current_user_id()
    )
    or core.has_permission(school_id, 'audit.read')
  );

grant usage on schema privacy to authenticated, service_role;
grant select on all tables in schema privacy to authenticated;
grant insert, update on privacy.retention_policy, privacy.subject_request to authenticated;
grant all on all tables in schema privacy to service_role;
grant execute on all functions in schema privacy to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The retention positions, all undecided
-- ---------------------------------------------------------------------------
create function privacy.provision_retention(p_school_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
begin
  insert into privacy.retention_policy (school_id, data_class, description, basis_status)
  values
    (p_school_id, 'assessment_and_observation',
     'Competency assessments, classroom observations and the evidence behind them.', 'requires_verification'),
    (p_school_id, 'appraisal',
     'Annual appraisals, growth scores, teacher responses and representations.', 'requires_verification'),
    (p_school_id, 'service_record',
     'Appointment, probation, confirmation, career events and qualifications.', 'requires_verification'),
    (p_school_id, 'cpd_records',
     'CPD records, certificates and the compliance ledger.', 'requires_verification'),
    (p_school_id, 'increment_decisions',
     'Increment readiness, recommendations and approval decisions.', 'requires_verification'),
    (p_school_id, 'evidence_files',
     'Uploaded evidence files, which may contain identifiable student work.', 'requires_verification'),
    (p_school_id, 'audit_log',
     'The append-only audit trail, which evidences everything else.', 'requires_verification'),
    (p_school_id, 'access_log',
     'Records of who opened whose pay or appraisal record.', 'requires_verification')
  on conflict (school_id, data_class) do nothing;

  return (select count(*)::integer from privacy.retention_policy where school_id = p_school_id);
end;
$$;

comment on function privacy.provision_retention is
  'Seeds the retention QUESTIONS, all undecided. Retention interacts with service-record obligations that are themselves unverified, so a default period here would be a guess presented as a policy.';

do $$
declare s record;
begin
  for s in select id from core.school loop
    perform privacy.provision_retention(s.id);
  end loop;
end $$;
