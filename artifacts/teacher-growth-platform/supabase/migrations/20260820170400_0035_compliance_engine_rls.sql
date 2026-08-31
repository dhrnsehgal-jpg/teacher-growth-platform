-- ===========================================================================
-- 0035 — CPD ledger engine, access control and privileges
-- ===========================================================================
-- The ledger is deterministic PL/pgSQL. No model participates in it, for the
-- same reason the gap engine does not: a compliance figure that cannot be
-- recomputed identically is not a compliance figure.
--
-- Engine version `cpd-ledger-v1`, recorded alongside every computed figure.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into core.permission (key, description, is_compensation_sensitive) values
  ('cpd_record.submit', 'Log completed professional development against one''s own record.', false),
  ('sqaaf.read', 'View the school''s SQAAF self-assessment, evidence map and improvement plan.', false),
  ('sqaaf.manage', 'Rate SQAAF standards, map evidence and manage improvement actions.', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Risk policy — SCHOOL POLICY, not a CBSE rule
-- ---------------------------------------------------------------------------
-- CBSE states an annual requirement. It does not say when during the year a
-- teacher should be judged "at risk" of missing it. That pacing judgement is the
-- school's, and the platform must label it as such wherever it appears.
create table compliance.risk_policy (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references core.school(id) on delete cascade,
  academic_year_id uuid references core.academic_year(id) on delete cascade,

  -- A teacher is on track if completed hours are at least this fraction of the
  -- hours they "should" have done by now, pro-rated across the year.
  pace_tolerance numeric(4,3) not null default 0.750
    check (pace_tolerance > 0 and pace_tolerance <= 1),

  classification regulatory.requirement_classification not null default 'school_policy',
  rationale     text not null default
    'CBSE sets an annual total but does not define an in-year pacing expectation. This threshold is the school''s own judgement about when to intervene.',
  created_at    timestamptz not null default now(),
  unique (school_id, academic_year_id)
);

comment on table compliance.risk_policy is
  'When to call a teacher at risk of missing the annual CPD requirement. School policy — CBSE sets the annual total, not the pacing.';

-- ---------------------------------------------------------------------------
-- Credited hours, after caps
-- ---------------------------------------------------------------------------
create function compliance.credited_hours(
  p_teacher_profile_id uuid,
  p_academic_year_id uuid
) returns table (
  cpd_record_id uuid,
  category_id uuid,
  source_class compliance.cpd_source_class,
  claimed_hours numeric,
  effective_hours numeric,
  capped_by text
)
language sql stable security definer set search_path = ''
as $$
  -- Only verified records carry credit, and each record contributes its hours
  -- exactly once. There is deliberately no join to cpd_record_competency here:
  -- that join is what would turn one five-hour workshop into twenty hours.
  with base as (
    select r.id, r.category_id, r.source_class, r.credited_hours as hours,
           r.activity_rule_id, r.activity_from,
           ar.annual_cap_hours, ar.cap_group_id, cg.cap_hours as group_cap,
           cg.display_name as group_name
    from compliance.cpd_record r
    left join compliance.cpd_activity_rule ar on ar.id = r.activity_rule_id
    left join compliance.cpd_rule_cap_group cg on cg.id = ar.cap_group_id
    where r.teacher_profile_id = p_teacher_profile_id
      and r.academic_year_id = p_academic_year_id
      and r.status = 'verified'
      and r.credited_hours is not null
  ),
  -- Per-rule annual cap. Ordered by date then id so the result is stable.
  rule_capped as (
    select b.*,
      case
        when b.annual_cap_hours is null then b.hours
        else greatest(0, least(b.hours,
             b.annual_cap_hours - coalesce(sum(b.hours) over (
               partition by b.activity_rule_id
               order by b.activity_from, b.id
               rows between unbounded preceding and 1 preceding), 0)))
      end as after_rule_cap
    from base b
  ),
  -- Then the shared cap group (CBSE's 11 academic-task hours).
  group_capped as (
    select rc.*,
      case
        when rc.group_cap is null then rc.after_rule_cap
        else greatest(0, least(rc.after_rule_cap,
             rc.group_cap - coalesce(sum(rc.after_rule_cap) over (
               partition by rc.cap_group_id
               order by rc.activity_from, rc.id
               rows between unbounded preceding and 1 preceding), 0)))
      end as effective
    from rule_capped rc
  )
  select
    gc.id, gc.category_id, gc.source_class, gc.hours, gc.effective,
    case
      when gc.effective = gc.hours then null
      when gc.after_rule_cap < gc.hours then 'annual cap on this activity rule'
      else 'shared cap: ' || coalesce(gc.group_name, 'cap group')
    end
  from group_capped gc;
$$;

comment on function compliance.credited_hours is
  'Per-record effective CPD hours after per-rule and shared caps. Deterministic; engine cpd-ledger-v1.';

-- ---------------------------------------------------------------------------
-- Progress against the governing requirement version
-- ---------------------------------------------------------------------------
create function compliance.cpd_progress(
  p_teacher_profile_id uuid,
  p_academic_year_id uuid
) returns table (
  dimension text,
  item_key text,
  label text,
  source_class compliance.cpd_source_class,
  required_hours numeric,
  completed_hours numeric,
  remaining_hours numeric,
  state compliance.compliance_state,
  engine_version text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_school_id uuid;
  v_version compliance.cpd_requirement_version;
  v_tolerance numeric;
  v_elapsed numeric;
  v_year core.academic_year;
begin
  select tp.school_id into v_school_id
  from core.teacher_profile tp where tp.id = p_teacher_profile_id;

  if v_school_id is null then
    return;
  end if;

  select * into v_year from core.academic_year where id = p_academic_year_id;
  v_version := compliance.requirement_version_for_year(v_school_id, p_academic_year_id);

  if v_version.id is null then
    return;   -- no rule configured for this year; the caller must say so, not guess
  end if;

  select rp.pace_tolerance into v_tolerance
  from compliance.risk_policy rp
  where rp.school_id = v_school_id
    and (rp.academic_year_id = p_academic_year_id or rp.academic_year_id is null)
  order by rp.academic_year_id nulls last
  limit 1;
  v_tolerance := coalesce(v_tolerance, 0.750);

  -- How far through the year we are, clamped to [0,1].
  v_elapsed := case
    when v_year.id is null then 1
    when current_date <= v_year.starts_on then 0
    when current_date >= v_year.ends_on then 1
    else (current_date - v_year.starts_on)::numeric / nullif((v_year.ends_on - v_year.starts_on)::numeric, 0)
  end;

  return query
  with credited as (
    select * from compliance.credited_hours(p_teacher_profile_id, p_academic_year_id)
  ),
  alloc as (
    select a.category_id, a.source_class, a.required_hours, c.key as category_key, c.display_name
    from compliance.cpd_requirement_allocation a
    join compliance.cpd_category c on c.id = a.category_id
    where a.version_id = v_version.id
  ),
  rows_out as (
    -- 1. The headline
    select 'total'::text as dimension, 'total'::text as item_key,
           v_version.title as label, null::compliance.cpd_source_class as source_class,
           v_version.total_hours as required_hours,
           coalesce((select sum(effective_hours) from credited), 0) as completed_hours
    union all
    -- 2. The 25 + 25 source split
    select 'source_class', sc.source_class::text,
           case sc.source_class
             when 'board_or_government' then 'CBSE / Government'
             else 'In-house / School Complex'
           end,
           sc.source_class,
           (select coalesce(sum(a.required_hours), 0) from alloc a where a.source_class = sc.source_class),
           (select coalesce(sum(c.effective_hours), 0) from credited c where c.source_class = sc.source_class)
    from (select unnest(enum_range(null::compliance.cpd_source_class)) as source_class) sc
    union all
    -- 3. The NPST-aligned category allocation
    select 'category', a.category_key, a.display_name, null,
           sum(a.required_hours),
           coalesce((select sum(c.effective_hours) from credited c where c.category_id = a.category_id), 0)
    from alloc a
    group by a.category_id, a.category_key, a.display_name
    union all
    -- 4. The full matrix, for anyone who needs to see where a shortfall sits
    select 'category_source', a.category_key || '.' || a.source_class::text,
           a.display_name, a.source_class,
           a.required_hours,
           coalesce((select sum(c.effective_hours) from credited c
                     where c.category_id = a.category_id and c.source_class = a.source_class), 0)
    from alloc a
  )
  select
    r.dimension, r.item_key, r.label, r.source_class,
    r.required_hours,
    r.completed_hours,
    greatest(0, r.required_hours - r.completed_hours) as remaining_hours,
    case
      when r.completed_hours >= r.required_hours then 'compliant'::compliance.compliance_state
      when v_elapsed >= 1 then 'not_met'::compliance.compliance_state
      when r.completed_hours >= (r.required_hours * v_elapsed * v_tolerance)
        then 'on_track'::compliance.compliance_state
      else 'at_risk'::compliance.compliance_state
    end,
    'cpd-ledger-v1'::text
  from rows_out r
  order by
    case r.dimension when 'total' then 0 when 'source_class' then 1 when 'category' then 2 else 3 end,
    r.item_key;
end;
$$;

comment on function compliance.cpd_progress is
  'Deterministic CPD progress against the requirement version governing the year. No model participates; engine cpd-ledger-v1.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table compliance.cpd_category               enable row level security;
alter table compliance.cpd_source_type            enable row level security;
alter table compliance.cpd_requirement_version    enable row level security;
alter table compliance.cpd_requirement_allocation enable row level security;
alter table compliance.cpd_year_requirement       enable row level security;
alter table compliance.cpd_rule_cap_group         enable row level security;
alter table compliance.cpd_activity_rule          enable row level security;
alter table compliance.cpd_record                 enable row level security;
alter table compliance.cpd_record_competency      enable row level security;
alter table compliance.cpd_record_status_history  enable row level security;
alter table compliance.risk_policy                enable row level security;

alter table sqaaf.framework_version   enable row level security;
alter table sqaaf.performance_level   enable row level security;
alter table sqaaf.domain              enable row level security;
alter table sqaaf.sub_domain          enable row level security;
alter table sqaaf.standard            enable row level security;
alter table sqaaf.submission_window   enable row level security;
alter table sqaaf.self_assessment     enable row level security;
alter table sqaaf.standard_rating     enable row level security;
alter table sqaaf.evidence_map        enable row level security;
alter table sqaaf.evidence_gap        enable row level security;
alter table sqaaf.improvement_action  enable row level security;

-- Configuration is readable by every member: a teacher held to a CPD
-- requirement is entitled to read the requirement.
create policy cpd_category_select on compliance.cpd_category
  for select using (core.is_member_of(school_id));
create policy cpd_category_write on compliance.cpd_category
  using (core.has_permission(school_id, 'compliance.manage'))
  with check (core.has_permission(school_id, 'compliance.manage'));

create policy cpd_source_type_select on compliance.cpd_source_type
  for select using (core.is_member_of(school_id));
create policy cpd_source_type_write on compliance.cpd_source_type
  using (core.has_permission(school_id, 'compliance.manage'))
  with check (core.has_permission(school_id, 'compliance.manage'));

create policy cpd_version_select on compliance.cpd_requirement_version
  for select using (core.is_member_of(school_id));
create policy cpd_version_write on compliance.cpd_requirement_version
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy cpd_allocation_select on compliance.cpd_requirement_allocation
  for select using (core.is_member_of(school_id));
create policy cpd_allocation_write on compliance.cpd_requirement_allocation
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy cpd_year_requirement_select on compliance.cpd_year_requirement
  for select using (core.is_member_of(school_id));
create policy cpd_year_requirement_write on compliance.cpd_year_requirement
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy cpd_cap_group_select on compliance.cpd_rule_cap_group
  for select using (core.is_member_of(school_id));
create policy cpd_cap_group_write on compliance.cpd_rule_cap_group
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy cpd_activity_rule_select on compliance.cpd_activity_rule
  for select using (core.is_member_of(school_id));
create policy cpd_activity_rule_write on compliance.cpd_activity_rule
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy risk_policy_select on compliance.risk_policy
  for select using (core.is_member_of(school_id));
create policy risk_policy_write on compliance.risk_policy
  using (core.has_permission(school_id, 'compliance.manage'))
  with check (core.has_permission(school_id, 'compliance.manage'));

-- A teacher's CPD record follows the same visibility rule as the rest of their
-- professional record — one definition of scope, reused.
create policy cpd_record_select on compliance.cpd_record
  for select using (core.can_view_staff_record(teacher_profile_id));

create policy cpd_record_insert on compliance.cpd_record
  for insert with check (
    core.has_permission(school_id, 'cpd_record.submit')
    and teacher_profile_id in (
      select tp.id from core.teacher_profile tp where tp.user_id = core.current_user_id()
    )
  );

-- The teacher may edit only while it is still theirs to edit. Once submitted the
-- record belongs to the review process, exactly as evidence does.
create policy cpd_record_update_own on compliance.cpd_record
  for update using (
    status in ('draft', 'returned_for_clarification')
    and teacher_profile_id in (
      select tp.id from core.teacher_profile tp where tp.user_id = core.current_user_id()
    )
  ) with check (
    teacher_profile_id in (
      select tp.id from core.teacher_profile tp where tp.user_id = core.current_user_id()
    )
  );

create policy cpd_record_review on compliance.cpd_record
  for update using (
    core.has_permission(school_id, 'cpd.approve')
    and core.can_view_staff_record(teacher_profile_id)
  ) with check (
    core.has_permission(school_id, 'cpd.approve')
    and core.can_view_staff_record(teacher_profile_id)
  );

create policy cpd_record_competency_select on compliance.cpd_record_competency
  for select using (
    exists (select 1 from compliance.cpd_record r
            where r.id = cpd_record_id and core.can_view_staff_record(r.teacher_profile_id))
  );
create policy cpd_record_competency_write on compliance.cpd_record_competency
  using (
    exists (select 1 from compliance.cpd_record r
            where r.id = cpd_record_id
              and r.status in ('draft', 'returned_for_clarification')
              and r.teacher_profile_id in (
                select tp.id from core.teacher_profile tp where tp.user_id = core.current_user_id()))
  )
  with check (
    exists (select 1 from compliance.cpd_record r
            where r.id = cpd_record_id
              and r.status in ('draft', 'returned_for_clarification')
              and r.teacher_profile_id in (
                select tp.id from core.teacher_profile tp where tp.user_id = core.current_user_id()))
  );

create policy cpd_status_history_select on compliance.cpd_record_status_history
  for select using (
    exists (select 1 from compliance.cpd_record r
            where r.id = cpd_record_id and core.can_view_staff_record(r.teacher_profile_id))
  );

-- SQAAF structure is reference material: readable by every member, like the
-- competency framework. Every teacher should be able to read the standard the
-- school is held to.
create policy sqaaf_framework_select on sqaaf.framework_version
  for select using (core.is_member_of(school_id));
create policy sqaaf_framework_write on sqaaf.framework_version
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy sqaaf_level_select on sqaaf.performance_level
  for select using (core.is_member_of(school_id));
create policy sqaaf_level_write on sqaaf.performance_level
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy sqaaf_domain_select on sqaaf.domain
  for select using (core.is_member_of(school_id));
create policy sqaaf_domain_write on sqaaf.domain
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy sqaaf_sub_domain_select on sqaaf.sub_domain
  for select using (core.is_member_of(school_id));
create policy sqaaf_sub_domain_write on sqaaf.sub_domain
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy sqaaf_standard_select on sqaaf.standard
  for select using (core.is_member_of(school_id));
create policy sqaaf_standard_write on sqaaf.standard
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

create policy sqaaf_window_select on sqaaf.submission_window
  for select using (core.is_member_of(school_id));
create policy sqaaf_window_write on sqaaf.submission_window
  using (core.has_permission(school_id, 'compliance.manage'))
  with check (core.has_permission(school_id, 'compliance.manage'));

-- The self-assessment itself is institutional, not personal: readable by those
-- with sqaaf.read rather than by everyone.
create policy sqaaf_assessment_select on sqaaf.self_assessment
  for select using (core.has_permission(school_id, 'sqaaf.read'));
create policy sqaaf_assessment_write on sqaaf.self_assessment
  using (core.has_permission(school_id, 'sqaaf.manage'))
  with check (core.has_permission(school_id, 'sqaaf.manage'));

create policy sqaaf_rating_select on sqaaf.standard_rating
  for select using (core.has_permission(school_id, 'sqaaf.read'));
create policy sqaaf_rating_write on sqaaf.standard_rating
  using (core.has_permission(school_id, 'sqaaf.manage'))
  with check (core.has_permission(school_id, 'sqaaf.manage'));

create policy sqaaf_map_select on sqaaf.evidence_map
  for select using (core.has_permission(school_id, 'sqaaf.read'));
create policy sqaaf_map_write on sqaaf.evidence_map
  using (core.has_permission(school_id, 'sqaaf.manage'))
  with check (core.has_permission(school_id, 'sqaaf.manage'));

create policy sqaaf_gap_select on sqaaf.evidence_gap
  for select using (core.has_permission(school_id, 'sqaaf.read'));
create policy sqaaf_gap_write on sqaaf.evidence_gap
  using (core.has_permission(school_id, 'sqaaf.manage'))
  with check (core.has_permission(school_id, 'sqaaf.manage'));

-- An improvement action is visible to SQAAF readers and to the person who owns
-- it — someone assigned work must be able to see the work.
create policy sqaaf_action_select on sqaaf.improvement_action
  for select using (
    core.has_permission(school_id, 'sqaaf.read')
    or convenor_user_id = core.current_user_id()
  );
create policy sqaaf_action_manage on sqaaf.improvement_action
  using (core.has_permission(school_id, 'sqaaf.manage'))
  with check (core.has_permission(school_id, 'sqaaf.manage'));
create policy sqaaf_action_owner_update on sqaaf.improvement_action
  for update using (convenor_user_id = core.current_user_id())
  with check (convenor_user_id = core.current_user_id());

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Without these the policies above are dead code. Migration 0008 learned this
-- the hard way: Supabase grants default privileges on `public` only.
grant usage on schema compliance, sqaaf to authenticated, service_role;

grant select on all tables in schema compliance to authenticated;
grant select on all tables in schema sqaaf to authenticated;

grant insert, update on
  compliance.cpd_category, compliance.cpd_source_type,
  compliance.cpd_requirement_version, compliance.cpd_requirement_allocation,
  compliance.cpd_year_requirement, compliance.cpd_rule_cap_group,
  compliance.cpd_activity_rule, compliance.cpd_record,
  compliance.cpd_record_competency, compliance.risk_policy
to authenticated;

grant delete on compliance.cpd_record_competency to authenticated;

grant insert, update on
  sqaaf.framework_version, sqaaf.performance_level, sqaaf.domain,
  sqaaf.sub_domain, sqaaf.standard, sqaaf.submission_window,
  sqaaf.self_assessment, sqaaf.standard_rating, sqaaf.evidence_map,
  sqaaf.evidence_gap, sqaaf.improvement_action
to authenticated;

grant delete on sqaaf.evidence_map to authenticated;

-- Deliberately NOT granted: insert/update/delete on
-- compliance.cpd_record_status_history. The trail is written only by the
-- SECURITY DEFINER trigger, so an entry cannot be forged or removed.

grant all on all tables in schema compliance, sqaaf to service_role;
grant execute on all functions in schema compliance, sqaaf to authenticated, service_role;

alter default privileges in schema compliance
  grant select, insert, update on tables to authenticated;
alter default privileges in schema compliance grant all on tables to service_role;
alter default privileges in schema sqaaf
  grant select, insert, update on tables to authenticated;
alter default privileges in schema sqaaf grant all on tables to service_role;
