-- ===========================================================================
-- 0014 — Stage 2 permissions, role grants, and privileges for the new schemas
-- ===========================================================================
-- Migration 0008 established the rule that a policy is unreachable without a
-- privilege. Four new schemas therefore need the same treatment, or every
-- competency, KPI and evidence policy written in 0010-0013 would be dead code.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- New permissions
-- ---------------------------------------------------------------------------

insert into core.permission (key, description, is_compensation_sensitive) values
  ('kpi.manage', 'Maintain KPI categories, templates and the school KPI policy.', false),
  ('kpi.assign', 'Assign KPIs to staff within the assignment scope.', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Role grants
-- ---------------------------------------------------------------------------
-- Redefines core.provision_school_roles() with the Stage 2 additions. This
-- function is the single definition of role→permission mapping; the TypeScript
-- mirror in src/lib/rbac/roles.ts is checked against it by the test suite.

create or replace function core.provision_school_roles(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role record;
  v_grants jsonb := jsonb_build_object(

    'teacher', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read'
    ),

    -- Heads of Department assign and review KPIs for their own department.
    'head_of_department', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'observation.conduct', 'evidence.review', 'cpd.read.scope',
      'development_plan.read.scope', 'appraisal.read.scope', 'appraisal.conduct',
      'career_progression.read.scope', 'kpi.assign'
    ),

    'academic_coordinator', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'observation.conduct', 'evidence.review', 'cpd.read.scope',
      'development_plan.read.scope', 'appraisal.read.scope',
      'career_progression.read.scope', 'kpi.assign'
    ),

    'vice_principal', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'assessment.moderate', 'observation.conduct', 'evidence.review',
      'cpd.read.scope', 'cpd.approve', 'development_plan.read.scope',
      'development_plan.approve', 'appraisal.read.scope', 'appraisal.conduct',
      'career_progression.read.scope', 'compliance.read', 'kpi.assign'
    ),

    'principal', jsonb_build_array(
      'school.manage', 'staff_directory.read', 'competency.read', 'competency.manage',
      'regulatory.read', 'teacher_record.read.scope', 'assessment.read.scope',
      'assessment.conduct', 'assessment.moderate', 'observation.conduct',
      'evidence.review', 'cpd.read.scope', 'cpd.approve',
      'development_plan.read.scope', 'development_plan.approve',
      'appraisal.read.scope', 'appraisal.conduct', 'appraisal.finalise',
      'increment.read', 'increment.recommend',
      'career_progression.read.scope', 'career_progression.recommend',
      'compliance.read', 'rbac.read', 'kpi.manage', 'kpi.assign'
    ),

    'hr_pd_admin', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'regulatory.read',
      'teacher_record.read.scope', 'teacher_record.manage',
      'cpd.read.scope', 'cpd.manage', 'cpd.approve',
      'development_plan.read.scope', 'appraisal.read.scope',
      'career_progression.read.scope', 'compliance.read', 'rbac.read',
      'increment.read', 'kpi.manage', 'kpi.assign'
    ),

    'management_approver', jsonb_build_array(
      'staff_directory.read', 'regulatory.read', 'compliance.read',
      'appraisal.read.scope', 'increment.read', 'increment.approve',
      'career_progression.read.scope', 'career_progression.approve'
    ),

    'compliance_admin', jsonb_build_array(
      'staff_directory.read', 'regulatory.read', 'regulatory.manage',
      'regulatory.authorise_recalculation', 'compliance.read', 'compliance.manage',
      'audit.read', 'rbac.read'
    ),

    'system_admin', jsonb_build_array(
      'system.admin', 'school.manage', 'rbac.read', 'rbac.manage', 'audit.read'
    )
  );
  v_display jsonb := jsonb_build_object(
    'teacher',              'Teacher',
    'head_of_department',   'Head of Department',
    'academic_coordinator', 'Academic Coordinator',
    'vice_principal',       'Vice Principal',
    'principal',            'Principal',
    'hr_pd_admin',          'HR / Professional Development Administrator',
    'management_approver',  'School Management / Authorised Approver',
    'compliance_admin',     'Compliance Administrator',
    'system_admin',         'System Administrator'
  );
  v_key text;
begin
  for v_key in select jsonb_object_keys(v_grants) loop
    insert into core.role (school_id, key, display_name, is_system)
    values (p_school_id, v_key, v_display ->> v_key, true)
    on conflict (school_id, key) do update
      set display_name = excluded.display_name;
  end loop;

  for v_role in
    select r.id, r.key from core.role r
    where r.school_id = p_school_id and r.is_system
  loop
    insert into core.role_permission (role_id, permission_key)
    select v_role.id, p.value #>> '{}'
    from jsonb_array_elements(v_grants -> v_role.key) p
    on conflict (role_id, permission_key) do nothing;
  end loop;
end;
$$;

-- Existing schools pick up the new grants.
do $$
declare s record;
begin
  for s in select id from core.school loop
    perform core.provision_school_roles(s.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges for the Stage 2 schemas
-- ---------------------------------------------------------------------------

grant usage on schema competency to authenticated, service_role;
grant usage on schema kpi        to authenticated, service_role;
grant usage on schema evidence   to authenticated, service_role;
grant usage on schema growth     to authenticated, service_role;

revoke all on schema competency from anon;
revoke all on schema kpi        from anon;
revoke all on schema evidence   from anon;
revoke all on schema growth     from anon;

grant select, insert, update, delete on all tables in schema competency to authenticated;
grant select, insert, update, delete on all tables in schema kpi        to authenticated;
grant select, insert, update, delete on all tables in schema evidence   to authenticated;
grant select, insert, update, delete on all tables in schema growth     to authenticated;

grant all on all tables in schema competency to service_role;
grant all on all tables in schema kpi        to service_role;
grant all on all tables in schema evidence   to service_role;
grant all on all tables in schema growth     to service_role;

grant usage, select on all sequences in schema competency to authenticated, service_role;
grant usage, select on all sequences in schema kpi        to authenticated, service_role;
grant usage, select on all sequences in schema evidence   to authenticated, service_role;
grant usage, select on all sequences in schema growth     to authenticated, service_role;

-- Append-only: the status trail is written by trigger, never by a client.
revoke insert, update, delete on evidence.status_history from authenticated;

-- Default privileges, so Stage 3-6 tables in these schemas inherit correctly.
do $$
declare s text;
begin
  foreach s in array array['competency', 'kpi', 'evidence', 'growth'] loop
    execute format(
      'alter default privileges in schema %I grant select, insert, update, delete on tables to authenticated', s);
    execute format(
      'alter default privileges in schema %I grant all on tables to service_role', s);
    execute format(
      'alter default privileges in schema %I grant usage, select on sequences to authenticated, service_role', s);
  end loop;
end $$;

grant execute on function competency.teacher_dimensions(uuid, uuid)      to authenticated;
grant execute on function competency.resolve_targets(uuid, uuid)         to authenticated;
grant execute on function competency.retire_competency(uuid, text, uuid) to authenticated;
grant execute on function kpi.validate_teacher_kpi_set(uuid, uuid)       to authenticated;
