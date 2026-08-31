-- ===========================================================================
-- 0046 — Stage 5 role grants, scoped service-record reads, and provisioning
-- ===========================================================================
-- Who gets the four new permissions, and why:
--
--   service_record.read.scope   HoD, Academic Coordinator, VP, Principal, HR
--                               — the people who supervise or administer staff
--   service_record.manage       Principal and HR only — maintaining a service
--                               record is an HR act, not a supervisory one
--   representation.review       VP, Principal, HR, Management — a challenge
--                               needs someone senior to and independent of the
--                               decision, so the pool has to be wide enough
--   pay_framework.manage        HR only. Deliberately NOT the Management
--                               Approver, who holds `increment.approve`:
--                               configuring the model and approving against it
--                               are the two halves that must stay apart
--
-- Heads of Department get NO pay permission at all, which is the brief's rule
-- and the reason the pay policies key on `increment.read` rather than on
-- supervisory scope.
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
      'cpd_record.submit', 'cpd.approve', 'sqaaf.read',
      'service_record.read.scope'
    ),

    'academic_coordinator', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'evidence.submit', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'observation.conduct', 'evidence.review', 'cpd.read.scope',
      'development_plan.read.scope', 'development_plan.approve',
      'appraisal.read.scope', 'career_progression.read.scope', 'kpi.assign',
      'cpd_record.submit', 'cpd.approve', 'sqaaf.read', 'sqaaf.manage',
      'service_record.read.scope'
    ),

    'vice_principal', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'regulatory.read',
      'teacher_record.read.scope', 'assessment.read.scope', 'assessment.conduct',
      'assessment.moderate', 'observation.conduct', 'evidence.review',
      'cpd.read.scope', 'cpd.approve', 'development_plan.read.scope',
      'development_plan.approve', 'appraisal.read.scope', 'appraisal.conduct',
      'career_progression.read.scope', 'compliance.read', 'kpi.assign',
      'cpd_record.submit', 'sqaaf.read', 'sqaaf.manage',
      'service_record.read.scope', 'representation.review'
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
      'cpd_record.submit', 'sqaaf.read', 'sqaaf.manage',
      'service_record.read.scope', 'service_record.manage', 'representation.review'
    ),

    'hr_pd_admin', jsonb_build_array(
      'staff_directory.read', 'competency.read', 'regulatory.read',
      'teacher_record.read.scope', 'teacher_record.manage',
      'cpd.read.scope', 'cpd.manage', 'cpd.approve',
      'development_plan.read.scope', 'appraisal.read.scope',
      'career_progression.read.scope', 'compliance.read', 'rbac.read',
      'increment.read', 'kpi.manage', 'kpi.assign',
      'cpd_record.submit', 'sqaaf.read', 'sqaaf.manage',
      'service_record.read.scope', 'service_record.manage', 'representation.review', 'pay_framework.manage'
    ),

    'management_approver', jsonb_build_array(
      'staff_directory.read', 'regulatory.read', 'compliance.read',
      'appraisal.read.scope', 'increment.read', 'increment.approve',
      'career_progression.read.scope', 'career_progression.approve',
      'sqaaf.read',
      'representation.review'
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

-- ---------------------------------------------------------------------------
-- Service records: own record always, others only with the scope permission
-- ---------------------------------------------------------------------------
-- The first version of this policy used `can_view_staff_record()` alone, which
-- made `service_record.read.scope` decorative — any supervisor would have seen
-- the record whether or not they held it. Both conditions now apply.
drop policy service_record_select on service.service_record;

create policy service_record_select on service.service_record
  for select using (
    teacher_profile_id in (
      select tp.id from core.teacher_profile tp where tp.user_id = core.current_user_id()
    )
    or (
      core.has_permission(school_id, 'service_record.read.scope')
      and core.can_view_staff_record(teacher_profile_id)
    )
  );
