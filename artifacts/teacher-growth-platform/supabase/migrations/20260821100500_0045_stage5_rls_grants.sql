-- ===========================================================================
-- 0045 — Stage 5 access control and privileges
-- ===========================================================================
-- The privacy rule the brief sets out:
--
--   Teacher              own applicable data only
--   Head of Department   no salary information unless expressly authorised
--   Principal/HR/Mgmt    according to permission
--
-- So the pay schema is NOT visible on `can_view_staff_record()` — that is the
-- supervisory scope rule, and a Head of Department having supervisory scope over
-- a teacher is exactly not a reason for them to see that teacher's pay. Pay
-- reads require `increment.read`, which HoDs do not hold.
--
-- Service records and appraisals DO follow supervisory scope, because that is
-- the work a Head of Department is there to do.
-- ===========================================================================

alter table service.designation       enable row level security;
alter table service.service_record    enable row level security;
alter table service.career_event      enable row level security;
alter table service.qualification     enable row level security;
alter table service.policy            enable row level security;

alter table appraisal.cycle                   enable row level security;
alter table appraisal.appraisal               enable row level security;
alter table appraisal.stage_event             enable row level security;
alter table appraisal.teacher_response        enable row level security;
alter table appraisal.representation          enable row level security;
alter table appraisal.growth_model            enable row level security;
alter table appraisal.growth_component        enable row level security;
alter table appraisal.growth_score            enable row level security;
alter table appraisal.growth_score_component  enable row level security;

alter table pay.framework             enable row level security;
alter table pay.entitlement           enable row level security;
alter table pay.readiness_model       enable row level security;
alter table pay.readiness_requirement enable row level security;
alter table pay.recommendation        enable row level security;
alter table pay.approval_step         enable row level security;
alter table pay.approval              enable row level security;

-- ---------------------------------------------------------------------------
-- Service: readable within scope, maintained by HR
-- ---------------------------------------------------------------------------
create policy designation_select on service.designation
  for select using (core.is_member_of(school_id));
create policy designation_write on service.designation
  using (core.has_permission(school_id, 'school.manage'))
  with check (core.has_permission(school_id, 'school.manage'));

create policy service_record_select on service.service_record
  for select using (core.can_view_staff_record(teacher_profile_id));
create policy service_record_write on service.service_record
  using (core.has_permission(school_id, 'service_record.manage'))
  with check (core.has_permission(school_id, 'service_record.manage'));

create policy career_event_select on service.career_event
  for select using (
    exists (select 1 from service.service_record r
            where r.id = service_record_id and core.can_view_staff_record(r.teacher_profile_id))
  );
create policy career_event_insert on service.career_event
  for insert with check (core.has_permission(school_id, 'service_record.manage'));

create policy qualification_select on service.qualification
  for select using (
    exists (select 1 from service.service_record r
            where r.id = service_record_id and core.can_view_staff_record(r.teacher_profile_id))
  );
create policy qualification_write on service.qualification
  using (core.has_permission(school_id, 'service_record.manage'))
  with check (core.has_permission(school_id, 'service_record.manage'));

-- Service policy is reference material: a teacher is entitled to read the rules
-- said to govern their employment, including that none has been verified.
create policy service_policy_select on service.policy
  for select using (core.is_member_of(school_id));
create policy service_policy_write on service.policy
  using (core.has_permission(school_id, 'regulatory.manage'))
  with check (core.has_permission(school_id, 'regulatory.manage'));

-- ---------------------------------------------------------------------------
-- Appraisal: the teacher sees their own in full
-- ---------------------------------------------------------------------------
create policy appraisal_cycle_select on appraisal.cycle
  for select using (core.is_member_of(school_id));
create policy appraisal_cycle_write on appraisal.cycle
  using (core.has_permission(school_id, 'appraisal.finalise'))
  with check (core.has_permission(school_id, 'appraisal.finalise'));

-- Being appraised by a process you cannot inspect is the opposite of
-- developmental, so this is `can_view_staff_record`, which already returns true
-- for one's own record.
create policy appraisal_select on appraisal.appraisal
  for select using (core.can_view_staff_record(teacher_profile_id));
create policy appraisal_write on appraisal.appraisal
  using (
    core.has_permission(school_id, 'appraisal.conduct')
    and core.can_view_staff_record(teacher_profile_id)
  )
  with check (
    core.has_permission(school_id, 'appraisal.conduct')
    and core.can_view_staff_record(teacher_profile_id)
  );

create policy stage_event_select on appraisal.stage_event
  for select using (
    exists (select 1 from appraisal.appraisal a
            where a.id = appraisal_id and core.can_view_staff_record(a.teacher_profile_id))
  );

create policy teacher_response_select on appraisal.teacher_response
  for select using (
    exists (select 1 from appraisal.appraisal a
            where a.id = appraisal_id and core.can_view_staff_record(a.teacher_profile_id))
  );
-- Only the teacher may record their own response. An acknowledgement entered by
-- somebody else is not an acknowledgement.
create policy teacher_response_insert on appraisal.teacher_response
  for insert with check (
    exists (
      select 1 from appraisal.appraisal a
      join core.teacher_profile tp on tp.id = a.teacher_profile_id
      where a.id = appraisal_id and tp.user_id = core.current_user_id()
    )
  );

create policy representation_select on appraisal.representation
  for select using (
    exists (select 1 from appraisal.appraisal a
            where a.id = appraisal_id and core.can_view_staff_record(a.teacher_profile_id))
  );
create policy representation_insert on appraisal.representation
  for insert with check (
    submitted_by = core.current_user_id()
    and exists (
      select 1 from appraisal.appraisal a
      join core.teacher_profile tp on tp.id = a.teacher_profile_id
      where a.id = appraisal_id and tp.user_id = core.current_user_id()
    )
  );
create policy representation_review on appraisal.representation
  for update using (core.has_permission(school_id, 'representation.review'))
  with check (core.has_permission(school_id, 'representation.review'));

-- The growth model and its components are readable by everyone: a teacher
-- scored against a formula is entitled to read the formula.
create policy growth_model_select on appraisal.growth_model
  for select using (core.is_member_of(school_id));
create policy growth_model_write on appraisal.growth_model
  using (core.has_permission(school_id, 'appraisal.finalise'))
  with check (core.has_permission(school_id, 'appraisal.finalise'));

create policy growth_component_select on appraisal.growth_component
  for select using (core.is_member_of(school_id));
create policy growth_component_write on appraisal.growth_component
  using (core.has_permission(school_id, 'appraisal.finalise'))
  with check (core.has_permission(school_id, 'appraisal.finalise'));

create policy growth_score_select on appraisal.growth_score
  for select using (
    exists (select 1 from appraisal.appraisal a
            where a.id = appraisal_id and core.can_view_staff_record(a.teacher_profile_id))
  );
create policy growth_score_write on appraisal.growth_score
  using (core.has_permission(school_id, 'appraisal.conduct'))
  with check (core.has_permission(school_id, 'appraisal.conduct'));

create policy growth_score_component_select on appraisal.growth_score_component
  for select using (
    exists (
      select 1 from appraisal.growth_score gs
      join appraisal.appraisal a on a.id = gs.appraisal_id
      where gs.id = growth_score_id and core.can_view_staff_record(a.teacher_profile_id)
    )
  );
create policy growth_score_component_write on appraisal.growth_score_component
  using (core.has_permission(school_id, 'appraisal.conduct'))
  with check (core.has_permission(school_id, 'appraisal.conduct'));

-- ---------------------------------------------------------------------------
-- Pay: permission, not supervisory scope
-- ---------------------------------------------------------------------------
-- A pay framework is a policy document, readable by staff — knowing which
-- arrangement applies to you is not the same as seeing anyone's pay.
create policy pay_framework_select on pay.framework
  for select using (core.is_member_of(school_id));
create policy pay_framework_write on pay.framework
  using (core.has_permission(school_id, 'pay_framework.manage'))
  with check (core.has_permission(school_id, 'pay_framework.manage'));

create policy readiness_model_select on pay.readiness_model
  for select using (core.is_member_of(school_id));
create policy readiness_model_write on pay.readiness_model
  using (core.has_permission(school_id, 'pay_framework.manage'))
  with check (core.has_permission(school_id, 'pay_framework.manage'));

create policy readiness_requirement_select on pay.readiness_requirement
  for select using (core.is_member_of(school_id));
create policy readiness_requirement_write on pay.readiness_requirement
  using (core.has_permission(school_id, 'pay_framework.manage'))
  with check (core.has_permission(school_id, 'pay_framework.manage'));

-- Entitlements and recommendations: your own, or `increment.read`.
-- Deliberately NOT can_view_staff_record — a Head of Department supervises a
-- teacher's development, which is not a reason to see their pay.
create policy entitlement_select on pay.entitlement
  for select using (
    core.has_permission(school_id, 'increment.read')
    or teacher_profile_id in (
      select tp.id from core.teacher_profile tp where tp.user_id = core.current_user_id()
    )
  );
create policy entitlement_write on pay.entitlement
  using (core.has_permission(school_id, 'pay_framework.manage'))
  with check (core.has_permission(school_id, 'pay_framework.manage'));

create policy recommendation_select on pay.recommendation
  for select using (
    core.has_permission(school_id, 'increment.read')
    or teacher_profile_id in (
      select tp.id from core.teacher_profile tp where tp.user_id = core.current_user_id()
    )
  );
create policy recommendation_write on pay.recommendation
  using (core.has_permission(school_id, 'increment.recommend'))
  with check (core.has_permission(school_id, 'increment.recommend'));

create policy approval_step_select on pay.approval_step
  for select using (core.is_member_of(school_id));
create policy approval_step_write on pay.approval_step
  using (core.has_permission(school_id, 'school.manage'))
  with check (core.has_permission(school_id, 'school.manage'));

create policy approval_select on pay.approval
  for select using (
    core.has_permission(school_id, 'increment.read')
    or exists (
      select 1 from pay.recommendation r
      join core.teacher_profile tp on tp.id = r.teacher_profile_id
      where r.id = recommendation_id and tp.user_id = core.current_user_id()
    )
  );
create policy approval_insert on pay.approval
  for insert with check (
    core.has_permission(school_id, 'increment.recommend')
    or core.has_permission(school_id, 'increment.approve')
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
grant usage on schema service, appraisal, pay to authenticated, service_role;
grant select on all tables in schema service to authenticated;
grant select on all tables in schema appraisal to authenticated;
grant select on all tables in schema pay to authenticated;

grant insert, update on
  service.designation, service.service_record, service.qualification, service.policy
to authenticated;
grant insert on service.career_event to authenticated;

grant insert, update on
  appraisal.cycle, appraisal.appraisal, appraisal.representation,
  appraisal.growth_model, appraisal.growth_component,
  appraisal.growth_score, appraisal.growth_score_component
to authenticated;
grant insert on appraisal.teacher_response to authenticated;
grant delete on appraisal.growth_score, appraisal.growth_score_component to authenticated;

grant insert, update on
  pay.framework, pay.entitlement, pay.readiness_model, pay.readiness_requirement,
  pay.recommendation, pay.approval_step
to authenticated;
grant insert on pay.approval to authenticated;

-- Deliberately NOT granted: insert/update/delete on appraisal.stage_event. The
-- trail is written only by its SECURITY DEFINER trigger.

grant all on all tables in schema service, appraisal, pay to service_role;
grant execute on all functions in schema service, appraisal, pay to authenticated, service_role;

alter default privileges in schema service grant select, insert, update on tables to authenticated;
alter default privileges in schema appraisal grant select, insert, update on tables to authenticated;
alter default privileges in schema pay grant select, insert, update on tables to authenticated;
alter default privileges in schema service grant all on tables to service_role;
alter default privileges in schema appraisal grant all on tables to service_role;
alter default privileges in schema pay grant all on tables to service_role;

-- ---------------------------------------------------------------------------
-- Audit the employment decisions
-- ---------------------------------------------------------------------------
-- "Audit all access or modification of highly sensitive employment decisions
-- where technically practical." Modification is practical and is done here.
create trigger audit_changes after insert or update or delete on service.service_record
  for each row execute function audit.record_row_change();
create trigger audit_changes after insert or update or delete on service.policy
  for each row execute function audit.record_row_change();
create trigger audit_changes after insert or update or delete on appraisal.appraisal
  for each row execute function audit.record_row_change();
create trigger audit_changes after insert or update or delete on appraisal.representation
  for each row execute function audit.record_row_change();
create trigger audit_changes after insert or update or delete on appraisal.growth_score
  for each row execute function audit.record_row_change();
create trigger audit_changes after insert or update or delete on pay.framework
  for each row execute function audit.record_row_change();
create trigger audit_changes after insert or update or delete on pay.entitlement
  for each row execute function audit.record_row_change();
create trigger audit_changes after insert or update or delete on pay.recommendation
  for each row execute function audit.record_row_change();
create trigger audit_changes after insert or update or delete on pay.approval
  for each row execute function audit.record_row_change();
