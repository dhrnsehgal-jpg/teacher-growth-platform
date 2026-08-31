-- ===========================================================================
-- 0018 — Fix: the staff directory was invisible to everyone
-- ===========================================================================
-- `app_user_select_colleagues` (migration 0002) tested colleague visibility with
-- an inline subquery over core.user_role_assignment:
--
--   exists (select 1 from core.user_role_assignment ura
--            where ura.user_id = app_user.id
--              and core.has_permission(ura.school_id, 'staff_directory.read'))
--
-- That subquery runs under the caller's own RLS. user_role_assignment only
-- exposes a user's OWN assignments unless they hold `rbac.read`, so the inner
-- query returned no rows for anybody else and the policy was always false.
--
-- Effect: every user could see exactly one row in core.app_user — themselves.
-- `staff_directory.read` did nothing. The symptom that exposed it was a teacher's
-- KPI reviewer rendering as "Not yet named" when a reviewer was in fact assigned.
--
-- Fix: resolve the check in a SECURITY DEFINER function, as every other
-- authorisation helper in this schema already does. The lesson generalises —
-- a policy that reads an RLS-protected table must go through a definer
-- function, or it silently evaluates against a filtered view of the world.
-- ===========================================================================

create or replace function core.shares_school_with_directory_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from core.user_role_assignment ura
    where ura.user_id = p_user_id
      and ura.valid_from <= current_date
      and (ura.valid_to is null or ura.valid_to >= current_date)
      and core.has_permission(ura.school_id, 'staff_directory.read')
  );
$$;

comment on function core.shares_school_with_directory_access(uuid) is
  'True when the current user holds staff_directory.read in a school where '
  'p_user_id currently holds an assignment. SECURITY DEFINER because it reads '
  'user_role_assignment, which is itself RLS-protected.';

grant execute on function core.shares_school_with_directory_access(uuid) to authenticated;

drop policy if exists app_user_select_colleagues on core.app_user;

create policy app_user_select_colleagues on core.app_user
  for select using (core.shares_school_with_directory_access(app_user.id));
