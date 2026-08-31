-- ===========================================================================
-- 0011 — Competency applicability resolution, and RLS for the competency schema
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The teacher's targeting dimensions
-- ---------------------------------------------------------------------------

create or replace function competency.teacher_dimensions(
  p_teacher_profile_id uuid,
  p_academic_year_id uuid
)
returns table (
  school_id           uuid,
  teacher_category_id uuid,
  career_level_id     uuid,
  has_leadership      boolean,
  stage_ids           uuid[],
  subject_ids         uuid[],
  role_keys           text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    tp.school_id,
    tp.teacher_category_id,
    tp.career_level_id,
    tp.has_leadership_responsibility,
    coalesce(
      array(
        -- Stages the teacher actually teaches in this year, plus the stage of
        -- their department where one is set.
        select distinct s from unnest(
          array(
            select tta.school_stage_id
            from core.teacher_teaching_assignment tta
            where tta.teacher_profile_id = tp.id
              and tta.academic_year_id = p_academic_year_id
              and tta.school_stage_id is not null
          ) || array(
            select d.school_stage_id
            from core.department d
            where d.id = tp.primary_department_id and d.school_stage_id is not null
          )
        ) as s
      ), '{}'::uuid[]),
    coalesce(
      array(
        select distinct tta.subject_id
        from core.teacher_teaching_assignment tta
        where tta.teacher_profile_id = tp.id
          and tta.academic_year_id = p_academic_year_id
          and tta.subject_id is not null
      ), '{}'::uuid[]),
    coalesce(
      array(
        select distinct r.key
        from core.user_role_assignment ura
        join core.role r on r.id = ura.role_id
        where ura.user_id = tp.user_id
          and ura.school_id = tp.school_id
          and ura.valid_from <= current_date
          and (ura.valid_to is null or ura.valid_to >= current_date)
      ), '{}'::text[])
  from core.teacher_profile tp
  where tp.id = p_teacher_profile_id;
$$;

comment on function competency.teacher_dimensions(uuid, uuid) is
  'The facts a competency target can be matched against: category, career level, '
  'leadership, stages taught, subjects taught and RBAC roles held.';

-- ---------------------------------------------------------------------------
-- Target resolution
-- ---------------------------------------------------------------------------
-- A target row matches when every dimension it specifies matches the teacher;
-- a NULL dimension means "any". The row specifying the MOST dimensions wins,
-- because it is the most deliberate statement about this particular teacher.

create or replace function competency.resolve_targets(
  p_teacher_profile_id uuid,
  p_academic_year_id uuid
)
returns table (
  competency_id     uuid,
  competency_key    text,
  competency_name   text,
  domain_name       text,
  standard_name     text,
  source_framework  competency.source_framework,
  source_alignment  competency.source_alignment,
  external_reference text,
  target_id         uuid,
  target_level_id   uuid,
  target_level_key  text,
  target_level_name text,
  target_ordinal    integer,
  specificity       integer,
  weight            numeric,
  rationale         text
)
language sql
stable
security definer
set search_path = ''
as $$
  with dims as (
    select * from competency.teacher_dimensions(p_teacher_profile_id, p_academic_year_id)
  ),
  -- Competencies that apply to this teacher at all.
  applicable as (
    select c.*
    from competency.competency c
    join competency.domain d   on d.id = c.domain_id
    join competency.standard s on s.id = d.standard_id
    join competency.framework f on f.id = s.framework_id
    cross join dims
    where c.school_id = dims.school_id
      and c.status = 'active'
      and f.status = 'active'
      and not exists (
        -- If applicability rows exist, at least one must match.
        select 1 from competency.competency_applicability ca
        where ca.competency_id = c.id
      )
    union
    select c.*
    from competency.competency c
    join competency.domain d   on d.id = c.domain_id
    join competency.standard s on s.id = d.standard_id
    join competency.framework f on f.id = s.framework_id
    cross join dims
    join competency.competency_applicability ca on ca.competency_id = c.id
    where c.school_id = dims.school_id
      and c.status = 'active'
      and f.status = 'active'
      and (ca.teacher_category_id is null or ca.teacher_category_id = dims.teacher_category_id)
      and (ca.school_stage_id is null or ca.school_stage_id = any (dims.stage_ids))
  ),
  matched as (
    select
      a.id as competency_id,
      t.id as target_id,
      t.target_level_id,
      t.weight,
      t.rationale,
      (case when t.teacher_category_id is not null then 1 else 0 end
       + case when t.school_stage_id   is not null then 1 else 0 end
       + case when t.career_level_id   is not null then 1 else 0 end
       + case when t.subject_id        is not null then 1 else 0 end
       + case when t.role_key          is not null then 1 else 0 end
       + case when t.requires_leadership is not null then 1 else 0 end) as specificity
    from applicable a
    join competency.competency_target t
      on t.competency_id = a.id and t.academic_year_id = p_academic_year_id
    cross join dims
    where (t.teacher_category_id is null or t.teacher_category_id = dims.teacher_category_id)
      and (t.school_stage_id     is null or t.school_stage_id = any (dims.stage_ids))
      and (t.career_level_id     is null or t.career_level_id = dims.career_level_id)
      and (t.subject_id          is null or t.subject_id = any (dims.subject_ids))
      and (t.role_key            is null or t.role_key = any (dims.role_keys))
      and (t.requires_leadership is null or t.requires_leadership = dims.has_leadership)
  ),
  best as (
    select distinct on (m.competency_id)
      m.*
    from matched m
    join competency.proficiency_level pl on pl.id = m.target_level_id
    order by
      m.competency_id,
      m.specificity desc,
      -- Deterministic tie-break. Two targets of equal specificity is a
      -- configuration ambiguity; resolving upward keeps the expectation
      -- explicit rather than silently picking the softer one.
      pl.ordinal desc,
      m.target_id
  )
  select
    c.id, c.key, c.name, d.name, s.name,
    c.source_framework, c.source_alignment, c.external_reference,
    b.target_id, b.target_level_id, pl.key, pl.name, pl.ordinal,
    b.specificity, b.weight, b.rationale
  from best b
  join competency.competency c on c.id = b.competency_id
  join competency.domain d     on d.id = c.domain_id
  join competency.standard s   on s.id = d.standard_id
  join competency.proficiency_level pl on pl.id = b.target_level_id
  order by s.sort_order, d.sort_order, c.sort_order;
$$;

comment on function competency.resolve_targets(uuid, uuid) is
  'The competencies expected of one teacher in one year, each with its resolved '
  'target level. Answers the teacher''s first question: what is expected of me?';

-- ---------------------------------------------------------------------------
-- Retirement helper
-- ---------------------------------------------------------------------------

create or replace function competency.retire_competency(
  p_competency_id uuid,
  p_reason text,
  p_replaced_by_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
begin
  select school_id into v_school_id
  from competency.competency where id = p_competency_id;

  if v_school_id is null then
    raise exception 'Competency % not found.', p_competency_id;
  end if;

  if not core.has_permission(v_school_id, 'competency.manage') then
    raise exception 'Retiring a competency requires competency.manage.'
      using errcode = 'insufficient_privilege';
  end if;

  update competency.competency
  set status = 'retired',
      retired_at = now(),
      retired_by = auth.uid(),
      retirement_reason = p_reason,
      replaced_by_id = p_replaced_by_id
  where id = p_competency_id;

  -- Indicators retire with their competency, but the rows survive.
  update competency.indicator
  set status = 'retired',
      retired_at = now(),
      retired_by = auth.uid(),
      retirement_reason = 'Parent competency retired: ' || p_reason
  where competency_id = p_competency_id and status <> 'retired';

  perform audit.log_event(
    v_school_id, 'competency.retire', 'competency', 'competency',
    p_competency_id::text, null,
    jsonb_build_object('replaced_by', p_replaced_by_id),
    p_reason, 'ui'
  );
end;
$$;

comment on function competency.retire_competency(uuid, text, uuid) is
  'Retires a competency and its indicators without deleting anything. Existing '
  'targets and any past assessment remain intact and readable.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- The framework is internal reference data: every member of the school may read
-- it, because a teacher is entitled to see the standard they are held to.
-- Writing requires competency.manage.

do $$
declare t text;
begin
  foreach t in array array[
    'framework', 'standard', 'domain', 'proficiency_scale', 'proficiency_level',
    'competency', 'indicator', 'proficiency_descriptor', 'evidence_descriptor',
    'competency_applicability', 'competency_target'
  ] loop
    execute format('alter table competency.%I enable row level security', t);

    execute format($f$
      create policy %I on competency.%I
        for select using (core.is_member_of(school_id))
    $f$, t || '_select', t);

    execute format($f$
      create policy %I on competency.%I
        for all using (core.has_permission(school_id, 'competency.manage'))
        with check (core.has_permission(school_id, 'competency.manage'))
    $f$, t || '_write', t);
  end loop;
end $$;

-- indicator_stage has no school_id of its own; it is reached through its
-- indicator, so its policies join.
alter table competency.indicator_stage enable row level security;

create policy indicator_stage_select on competency.indicator_stage
  for select using (
    exists (select 1 from competency.indicator i
            where i.id = indicator_stage.indicator_id
              and core.is_member_of(i.school_id))
  );

create policy indicator_stage_write on competency.indicator_stage
  for all using (
    exists (select 1 from competency.indicator i
            where i.id = indicator_stage.indicator_id
              and core.has_permission(i.school_id, 'competency.manage'))
  )
  with check (
    exists (select 1 from competency.indicator i
            where i.id = indicator_stage.indicator_id
              and core.has_permission(i.school_id, 'competency.manage'))
  );

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create trigger audit_changes
  after insert or update or delete on competency.competency
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on competency.competency_target
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on competency.framework
  for each row execute function audit.record_row_change();
