-- ===========================================================================
-- 0048 — Malware scanning gate on evidence files
-- ===========================================================================
-- Open since Stage 2 and named in every completion report since as the main
-- reason to be careful about enabling upload for real users. Closed here.
--
-- The platform cannot scan a file itself — that is a deployment concern, and
-- which engine a school runs is their choice. What it can do, and now does, is
-- refuse to hand anyone a file that has not been scanned clean.
--
-- The default is `pending`, never `clean`. A file whose scan never runs stays
-- unservable rather than quietly becoming available, because the failure mode
-- of the opposite default is serving malware to a colleague.
--
-- `evidence.file_url_for()` is the only sanctioned route to a download, and it
-- returns null with a reason for anything not clean. The application asks it
-- rather than deciding for itself.
-- ===========================================================================

create type evidence.scan_status as enum (
  'pending',          -- uploaded, not yet scanned. NOT servable.
  'scanning',
  'clean',            -- the only state in which a file may be served
  'infected',
  'failed',           -- the scan errored; treated as not clean
  'skipped'           -- deliberately not scanned, by an authorised decision
);

alter table evidence.evidence
  add column scan_status evidence.scan_status not null default 'pending',
  add column scanned_at timestamptz,
  add column scanner_name text,
  add column scanner_version text,
  add column scan_result_note text,
  add column scan_skipped_by uuid references core.app_user(id) on delete restrict,
  add column scan_skip_reason text;

comment on column evidence.evidence.scan_status is
  'Defaults to pending, never clean. A file whose scan never runs stays unservable — the opposite default serves malware to a colleague.';

-- Every terminal state has to say who or what put it there.
alter table evidence.evidence
  add constraint evidence_scan_recorded check (
    scan_status in ('pending', 'scanning')
    or (scanned_at is not null and scanner_name is not null)
    or scan_status = 'skipped'
  ),
  -- Skipping a scan is an authorised decision, not a default. It needs a person
  -- and a reason, both on the record.
  add constraint evidence_scan_skip_authorised check (
    scan_status <> 'skipped'
    or (scan_skipped_by is not null and length(btrim(coalesce(scan_skip_reason, ''))) >= 20)
  ),
  add constraint evidence_scan_infected_noted check (
    scan_status <> 'infected' or length(btrim(coalesce(scan_result_note, ''))) >= 5
  );

create index evidence_scan_pending_idx on evidence.evidence (school_id, scan_status)
  where scan_status in ('pending', 'scanning');

-- Rows that carry no file need no scan, and should not sit in a queue for one.
update evidence.evidence
   set scan_status = 'skipped',
       scan_skip_reason = 'No file attached to this evidence record, so there is nothing to scan.',
       scan_skipped_by = null
 where storage_path is null;

-- ...which the skip constraint would refuse, so fileless rows are exempted
-- explicitly rather than fudged.
alter table evidence.evidence
  drop constraint evidence_scan_skip_authorised;

alter table evidence.evidence
  add constraint evidence_scan_skip_authorised check (
    scan_status <> 'skipped'
    or storage_path is null
    or (scan_skipped_by is not null and length(btrim(coalesce(scan_skip_reason, ''))) >= 20)
  );

-- ---------------------------------------------------------------------------
-- The only sanctioned route to a file
-- ---------------------------------------------------------------------------
create function evidence.file_servable(p_evidence_id uuid)
returns table (servable boolean, reason text, storage_path text)
language sql stable security definer set search_path = ''
as $$
  select
    case
      when e.storage_path is null then false
      when e.scan_status = 'clean' then true
      else false
    end,
    case
      when e.storage_path is null then 'No file is attached to this evidence.'
      when e.scan_status = 'clean' then null
      when e.scan_status in ('pending', 'scanning') then
        'This file is awaiting a virus scan and cannot be opened yet.'
      when e.scan_status = 'infected' then
        'This file was found to be unsafe and will not be served. Contact the person who uploaded it.'
      when e.scan_status = 'failed' then
        'The virus scan on this file did not complete, so it will not be served.'
      when e.scan_status = 'skipped' then
        'This file was not scanned and will not be served automatically.'
      else 'This file cannot be served.'
    end,
    -- The path is returned ONLY when the file is clean, so a caller that
    -- ignores `servable` still cannot mint a URL for an unscanned file.
    case when e.scan_status = 'clean' then e.storage_path end
  from evidence.evidence e
  where e.id = p_evidence_id
    and core.can_view_staff_record(e.teacher_profile_id);
$$;

comment on function evidence.file_servable is
  'The sanctioned route to a download. Returns the storage path only when the scan is clean, so a caller that ignores the flag still cannot reach an unscanned file.';

grant execute on function evidence.file_servable(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Recording a scan result
-- ---------------------------------------------------------------------------
-- Called by whatever scanner the school runs, through the service role. Not
-- exposed to ordinary users: a teacher marking their own upload clean would
-- defeat the point.
create function evidence.record_scan_result(
  p_evidence_id uuid,
  p_status evidence.scan_status,
  p_scanner_name text,
  p_scanner_version text default null,
  p_note text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_status in ('pending', 'scanning', 'skipped') then
    raise exception 'record_scan_result records an outcome: clean, infected or failed';
  end if;
  if coalesce(btrim(p_scanner_name), '') = '' then
    raise exception 'A scan result must name the scanner that produced it';
  end if;

  update evidence.evidence
     set scan_status = p_status,
         scanned_at = now(),
         scanner_name = p_scanner_name,
         scanner_version = p_scanner_version,
         scan_result_note = p_note
   where id = p_evidence_id;

  if not found then
    raise exception 'Evidence % not found', p_evidence_id;
  end if;
end;
$$;

revoke execute on function evidence.record_scan_result(uuid, evidence.scan_status, text, text, text) from public;
grant execute on function evidence.record_scan_result(uuid, evidence.scan_status, text, text, text) to service_role;

comment on function evidence.record_scan_result is
  'Service role only. A teacher marking their own upload clean would defeat the gate.';

-- ---------------------------------------------------------------------------
-- Storage policy: unscanned files are unreadable even with a direct path
-- ---------------------------------------------------------------------------
-- The signed-URL path already goes through file_servable(). This closes the
-- other door: reading the object directly from storage.
create function evidence.object_is_clean(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from evidence.evidence e
    where e.storage_path = p_name and e.scan_status = 'clean'
  );
$$;

grant execute on function evidence.object_is_clean(text) to authenticated, service_role;

-- The Stage 3 policy is REPLACED, not supplemented. Permissive policies OR
-- together, so adding a stricter one beside the original would have left the
-- original's permission intact — the gate would have looked closed and been
-- open. This drops it and recreates it with the scan condition included.
drop policy if exists evidence_objects_select on storage.objects;

create policy evidence_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and core.can_view_staff_record(evidence.object_teacher_profile(name))
    -- The addition: scope is necessary but not sufficient. The file must also
    -- have been scanned clean.
    and evidence.object_is_clean(name)
  );
