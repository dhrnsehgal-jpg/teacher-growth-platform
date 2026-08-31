-- ===========================================================================
-- Supabase stand-in for a plain PostgreSQL server
-- ===========================================================================
-- LOCAL DEVELOPMENT ONLY. Not part of the application schema and never applied
-- to a real Supabase project.
--
-- `supabase start` needs Docker. On a machine without it, this file recreates
-- the minimum a plain PostgreSQL 15 server needs for the migrations in
-- supabase/migrations/ to apply and for RLS to be exercised end to end:
--
--   * the anon / authenticated / service_role roles
--   * the auth schema, an auth.users table, and auth.uid()
--   * the extensions schema
--
-- It is NOT a substitute for `supabase db reset`. It does not provide
-- PostgREST, GoTrue, Storage, Realtime, or Supabase's own grants and policies.
-- Use it to validate migrations and RLS; use the real stack before shipping.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;

-- Only the column the migrations reference.
create table if not exists auth.users (
  id          uuid primary key default gen_random_uuid(),
  email       text,
  created_at  timestamptz not null default now()
);

-- Supabase derives this from the request JWT. Locally, drive it with:
--   select set_config('request.jwt.claim.sub', '<user-uuid>', false);
--   set role authenticated;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth       to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
-- Enough of Supabase Storage for migration 0029 to apply and for its policies
-- to be inspected. There is no object server here — this is the schema only.

create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets(id),
  name        text not null,
  owner       uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- Supabase's helper: the folder segments of an object path, excluding the file.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select case
    when array_length(string_to_array(name, '/'), 1) is null then '{}'::text[]
    else (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  end;
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant all on storage.objects to service_role;
