-- ===========================================================================
-- 0038 — Heads of Department and Academic Coordinators may verify CPD records
-- ===========================================================================
-- Stage 2 gave `cpd.approve` to the Vice Principal, Principal and HR/PD
-- Administrator. Stage 4 introduces a new act that permission now governs:
-- verifying a completed CPD record and crediting its hours.
--
-- Leaving it where it was makes routine verification a whole-school bottleneck.
-- The person who knows whether a teacher attended a workshop is the Head of
-- Department who supervises them — the same person who already assesses them,
-- observes them, reviews their evidence and approves their development plan
-- (migration 0026, which resolved the identical problem for plan approval).
--
-- This is a POLICY CHANGE, recorded here rather than edited into 0036 so the
-- earlier position stays on the record.
--
-- Scope is unchanged. `cpd_record_review` still requires
-- `core.can_view_staff_record()`, so a Head of Department verifies only within
-- their own department, and every decision is on the append-only status trail
-- with the reviewer named. Compensation permissions are untouched.
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
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'cpd_record.submit'
    ),

    'head_of_department', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'observation.conduct', 'evidence.review', 'cpd.read.scope',
      'development_plan.read.scope', 'development_plan.approve',
      'appraisal.read.scope', 'appraisal.conduct',
      'career_progression.read.scope', 'kpi.assign',
      'cpd_record.submit', 'cpd.approve', 'sqaaf.read'
    ),

    'academic_coordinator', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'observation.conduct', 'evidence.review', 'cpd.read.scope',
      'development_plan.read.scope', 'development_plan.approve',
      'appraisal.read.scope', 'career_progression.read.scope', 'kpi.assign',
      'cpd_record.submit', 'cpd.approve', 'sqaaf.read', 'sqaaf.manage'
    ),

    'vice_principal', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'assessment.moderate', 'observation.conduct', 'evidence.review',
      'cpd.read.scope', 'cpd.approve', 'development_plan.read.scope',
      'development_plan.approve', 'appraisal.read.scope', 'appraisal.conduct',
      'career_progression.read.scope', 'compliance.read', 'kpi.assign',
      'cpd_record.submit', 'sqaaf.read', 'sqaaf.manage'
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
      'compliance.read', 'rbac.read', 'kpi.manage', 'kpi.assign',
      'cpd_record.submit', 'sqaaf.read', 'sqaaf.manage'
    ),

    'hr_pd_admin', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'regulatory.read',
      'teacher_record.read.scope', 'teacher_record.manage',
      'cpd.read.scope', 'cpd.manage', 'cpd.approve',
      'development_plan.read.scope', 'appraisal.read.scope',
      'career_progression.read.scope', 'compliance.read', 'rbac.read',
      'increment.read', 'kpi.manage', 'kpi.assign',
      'cpd_record.submit', 'sqaaf.read', 'sqaaf.manage'
    ),

    'management_approver', jsonb_build_array(
      'staff_directory.read', 'regulatory.read', 'compliance.read',
      'appraisal.read.scope', 'increment.read', 'increment.approve',
      'career_progression.read.scope', 'career_progression.approve',
      'sqaaf.read'
    ),

    'compliance_admin', jsonb_build_array(
      'staff_directory.read', 'regulatory.read', 'regulatory.manage',
      'regulatory.authorise_recalculation', 'compliance.read', 'compliance.manage',
      'audit.read', 'rbac.read',
      'sqaaf.read', 'sqaaf.manage'
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
