-- ===========================================================================
-- 0029 — Evidence file storage
-- ===========================================================================
-- Outstanding since Stage 2: evidence rows carried a storage path but no bucket
-- existed and no policies governed it, so upload could not safely be enabled.
--
-- The bucket is private and its policies MIRROR the evidence table's RLS rather
-- than reimplementing them: both route through `core.can_view_staff_record()`,
-- so a file can never be reachable by someone who cannot read the evidence row
-- it belongs to.
--
-- Path convention, relied on by every policy here:
--
--     <teacher_profile_id>/<evidence_id>/<filename>
--
-- The first segment is the owning teacher. It is part of the security model,
-- not a convenience — the application must never write outside it.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence', 'evidence', false, 52428800,  -- 50 MiB, matching config.toml
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- NOTE: no COMMENT ON here. storage.buckets is owned by supabase_storage_admin,
-- and commenting requires ownership. The bucket is private: files are served
-- only through short-lived signed URLs created for a caller who has already
-- passed the RLS check below.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Casting an arbitrary path segment to uuid would raise on malformed input and
-- fail the whole policy evaluation; this returns null instead.
create or replace function evidence.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- The teacher a storage object belongs to, from the first path segment.
create or replace function evidence.object_teacher_profile(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select evidence.try_uuid((storage.foldername(p_name))[1]);
$$;

-- Is the caller the teacher who owns this path?
create or replace function evidence.owns_object_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from core.teacher_profile tp
    where tp.id = evidence.object_teacher_profile(p_name)
      and tp.user_id = auth.uid()
  );
$$;

-- A file may only be removed while the evidence it supports is still the
-- teacher's to edit. Once submitted, the artefact belongs to the review record.
create or replace function evidence.object_is_editable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from evidence.evidence e
    where e.storage_bucket = 'evidence'
      and e.storage_path = p_name
      and e.status not in ('draft', 'returned_for_clarification')
  );
$$;

comment on function evidence.object_is_editable(text) is
  'False once the evidence has been submitted. Deleting a file behind verified '
  'evidence would leave a review decision pointing at nothing.';

grant execute on function evidence.try_uuid(text) to authenticated;
grant execute on function evidence.object_teacher_profile(text) to authenticated;
grant execute on function evidence.owns_object_path(text) to authenticated;
grant execute on function evidence.object_is_editable(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects
-- ---------------------------------------------------------------------------

drop policy if exists evidence_objects_select on storage.objects;
drop policy if exists evidence_objects_insert on storage.objects;
drop policy if exists evidence_objects_update on storage.objects;
drop policy if exists evidence_objects_delete on storage.objects;

-- Read: anyone who can read the teacher's record can read their evidence files.
-- The same function the evidence table's own policy uses.
create policy evidence_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and core.can_view_staff_record(evidence.object_teacher_profile(name))
  );

-- Write: a teacher uploads only into their own folder. A reviewer cannot upload
-- on a teacher's behalf — evidence is the teacher's claim to make.
create policy evidence_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and evidence.owns_object_path(name)
  );

create policy evidence_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'evidence'
    and evidence.owns_object_path(name)
    and evidence.object_is_editable(name)
  )
  with check (
    bucket_id = 'evidence'
    and evidence.owns_object_path(name)
  );

create policy evidence_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidence'
    and evidence.owns_object_path(name)
    and evidence.object_is_editable(name)
  );

-- `anon` gets nothing: there is no unauthenticated view of any teacher's
-- evidence, and the bucket is not public.
