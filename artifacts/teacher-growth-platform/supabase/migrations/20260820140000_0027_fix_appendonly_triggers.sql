-- ===========================================================================
-- 0027 — Fix: append-only trail triggers ran without privilege
-- ===========================================================================
-- `growth.plan_item_event` and `evidence.status_history` are append-only trails
-- written by trigger, and INSERT was revoked from `authenticated` so no client
-- could forge an entry. But the trigger functions were not SECURITY DEFINER, so
-- they executed as the calling user — who had just had that privilege revoked.
--
-- Result: every plan-item transition and every evidence status change failed
-- with "permission denied for table plan_item_event" for real users. The seed
-- and the SQL tests never hit it because they run as superuser; only driving
-- the UI as a signed-in teacher exposed it.
--
-- Fix: run both as SECURITY DEFINER with a pinned search_path — the same
-- pattern `audit.record_row_change()` already used. The revoked client
-- privileges stay revoked, which was the point.
-- ===========================================================================

create or replace function growth.record_plan_item_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into growth.plan_item_event
      (school_id, learning_plan_item_id, from_status, to_status, actor_user_id, note)
    values (new.school_id, new.id, null, new.status, auth.uid(), new.selection_rationale);
  elsif new.status is distinct from old.status then
    insert into growth.plan_item_event
      (school_id, learning_plan_item_id, from_status, to_status, actor_user_id, note)
    values (new.school_id, new.id, old.status, new.status, auth.uid(),
            coalesce(new.approval_note, new.completion_note, new.impact_verification_note));
  end if;
  return null;
end;
$$;

create or replace function evidence.record_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into evidence.status_history
      (school_id, evidence_id, from_status, to_status, changed_by)
    values (new.school_id, new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into evidence.status_history
      (school_id, evidence_id, from_status, to_status, changed_by, note)
    values (new.school_id, new.id, old.status, new.status, auth.uid(), new.review_note);
  end if;
  return null;
end;
$$;

comment on function growth.record_plan_item_event() is
  'SECURITY DEFINER because the append-only trail it writes has INSERT revoked '
  'from clients. The general rule: a trigger that writes to a table the caller '
  'cannot write to must be a definer function.';
