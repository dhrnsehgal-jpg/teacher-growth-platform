-- ===========================================================================
-- 0026 — Heads of Department and Academic Coordinators may approve development
-- ===========================================================================
-- Stage 2 gave `development_plan.approve` to the Vice Principal and Principal
-- only. Stage 3 showed that to be wrong in practice: the Head of Department is
-- the person who assesses the teacher, observes them, reviews their evidence
-- and verifies application. Withholding approval from that same person means
-- the development loop cannot be run by the manager who owns it, and every plan
-- item queues behind whole-school leadership.
--
-- This is a deliberate POLICY CHANGE, not a bug fix. It is recorded here rather
-- than edited into the Stage 2 migration so the earlier position remains on the
-- record — the same principle applied to regulatory requirements.
--
-- Scope is unchanged: the RLS policies still require can_view_staff_record(),
-- so a Head of Department approves only within their own department.
-- Compensation permissions are untouched.
-- ===========================================================================

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

    'head_of_department', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'observation.conduct', 'evidence.review', 'cpd.read.scope',
      'development_plan.read.scope', 'development_plan.approve',
      'appraisal.read.scope', 'appraisal.conduct',
      'career_progression.read.scope', 'kpi.assign'
    ),

    'academic_coordinator', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'observation.conduct', 'evidence.review', 'cpd.read.scope',
      'development_plan.read.scope', 'development_plan.approve',
      'appraisal.read.scope', 'career_progression.read.scope', 'kpi.assign'
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

do $$
declare s record;
begin
  for s in select id from core.school loop
    perform core.provision_school_roles(s.id);
  end loop;
end $$;
