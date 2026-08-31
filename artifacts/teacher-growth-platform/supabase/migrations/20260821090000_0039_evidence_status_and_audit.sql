-- ===========================================================================
-- 0039 — SQAAF evidence status, and Stage 4 actions on the audit trail
-- ===========================================================================
-- Two defects found by auditing Stages 1-4 line by line against their briefs.
--
-- 1. SQAAF EVIDENCE HAD NO STATUS, AND READINESS COUNTED IT ANYWAY.
--
--    `sqaaf.evidence_map` records that a platform record supports a standard,
--    but not whether that record is worth anything yet. `evidence_readiness`
--    counted every mapping, so a DRAFT CPD record — hours claimed, nothing
--    verified — made a standard read as evidenced.
--
--    Demonstrated before the fix: mapping one draft CPD record to standard
--    6.1.1 moved the Leadership domain to `standards_with_evidence = 1`.
--
--    That is the readiness pack overstating what the school can actually
--    evidence, which is the exact failure this module exists to avoid. The
--    seeded data hid it because everything mapped there happened to be verified.
--
--    Status is DERIVED, never stored. Copying a status onto the map would give
--    two answers to "is this evidence verified?" and they would diverge the
--    first time a reviewer returned something.
--
-- 2. STAGE 4 ACTIONS WERE ABSENT FROM THE AUDIT LOG.
--
--    Fifteen tables carried `audit.record_row_change`; none of them in
--    `compliance` or `sqaaf`. Verifying CPD hours that feed a compliance
--    return, rating a SQAAF standard, and binding an academic year to a
--    requirement version are all high-impact acts, and none reached the log the
--    Compliance Administrator reads. The dedicated append-only trails
--    (`cpd_record_status_history`) are not a substitute: they are per-flow, and
--    `audit.read` does not look at them.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Evidence status, derived from the record the mapping points at
-- ---------------------------------------------------------------------------
create function sqaaf.evidence_map_status(p_map_id uuid)
returns table (status text, is_verified boolean, kind text)
language sql stable security definer set search_path = ''
as $$
  select
    case
      when m.evidence_id is not null            then e.status::text
      when m.cpd_record_id is not null          then r.status::text
      when m.verified_competency_id is not null then 'verified'
      when m.teacher_kpi_id is not null         then k.status::text
      when m.plan_item_id is not null           then pi.status::text
      else 'asserted'
    end,
    case
      when m.evidence_id is not null            then e.status = 'verified'
      when m.cpd_record_id is not null          then r.status = 'verified'
      -- A verified competency level is verified by construction: the row only
      -- exists because somebody with authority recorded it, with a rationale.
      when m.verified_competency_id is not null then true
      when m.teacher_kpi_id is not null         then k.status in ('active', 'closed')
      -- A plan item evidences practice only once impact has been verified by a
      -- reviewer — the Stage 3 rule that completing a course proves nothing.
      when m.plan_item_id is not null           then pi.status in ('impact_verified', 'reassessed')
      -- An aggregate note is a person's assertion, not a record. It is honest
      -- evidence of a kind, but it is not verified and must not read as such.
      else false
    end,
    case
      when m.evidence_id is not null            then 'evidence'
      when m.cpd_record_id is not null          then 'cpd_record'
      when m.verified_competency_id is not null then 'verified_competency'
      when m.teacher_kpi_id is not null         then 'teacher_kpi'
      when m.plan_item_id is not null           then 'plan_item'
      else 'aggregate_note'
    end
  from sqaaf.evidence_map m
  left join evidence.evidence e on e.id = m.evidence_id
  left join compliance.cpd_record r on r.id = m.cpd_record_id
  left join kpi.teacher_kpi k on k.id = m.teacher_kpi_id
  left join growth.learning_plan_item pi on pi.id = m.plan_item_id
  where m.id = p_map_id;
$$;

comment on function sqaaf.evidence_map_status is
  'The status of whatever a mapping points at. Derived rather than stored, so it cannot disagree with the record itself.';

create view sqaaf.evidence_map_detail
with (security_invoker = true) as
select
  m.id,
  m.school_id,
  m.self_assessment_id,
  m.standard_id,
  s.code            as standard_code,
  m.note,
  m.aggregate_note,
  m.mapped_at,
  st.kind,
  st.status         as evidence_status,
  st.is_verified
from sqaaf.evidence_map m
join sqaaf.standard s on s.id = m.standard_id
cross join lateral sqaaf.evidence_map_status(m.id) st;

comment on view sqaaf.evidence_map_detail is
  'Evidence mappings with the status of the underlying record resolved. `is_verified` is what readiness counts.';

-- ---------------------------------------------------------------------------
-- Readiness, recomputed on verified evidence
-- ---------------------------------------------------------------------------
-- `standards_with_evidence` keeps its old meaning — anything mapped — because a
-- school still wants to see work in progress. What changed is that the
-- ACTIONABLE number now counts only verified evidence, and unverified mappings
-- are surfaced in their own column instead of quietly passing as done.
-- Dropped rather than replaced: `create or replace view` cannot insert columns
-- into the middle of an existing column list.
drop view if exists sqaaf.evidence_readiness;

create view sqaaf.evidence_readiness
with (security_invoker = true) as
select
  sa.id              as self_assessment_id,
  sa.school_id,
  sa.academic_year_id,
  d.id               as domain_id,
  d.domain_number,
  d.name             as domain_name,
  d.platform_coverage,
  count(st.id)                                              as standards_total,
  count(*) filter (where st.platform_relevant)              as standards_platform_relevant,
  count(*) filter (where r.id is not null)                  as standards_rated,
  count(*) filter (where coalesce(m.mapped, 0) > 0)         as standards_with_evidence,
  count(*) filter (where coalesce(m.verified, 0) > 0)       as standards_with_verified_evidence,
  count(*) filter (where coalesce(m.mapped, 0) > 0 and coalesce(m.verified, 0) = 0)
                                                            as standards_with_unverified_evidence_only,
  count(*) filter (where g.id is not null)                  as standards_with_gap,
  count(*) filter (where st.platform_relevant and coalesce(m.verified, 0) = 0)
                                                            as platform_relevant_without_evidence
from sqaaf.self_assessment sa
join sqaaf.domain d on d.version_id = sa.version_id
join sqaaf.sub_domain sd on sd.domain_id = d.id
join sqaaf.standard st on st.sub_domain_id = sd.id
left join sqaaf.standard_rating r on r.self_assessment_id = sa.id and r.standard_id = st.id
left join sqaaf.evidence_gap g on g.self_assessment_id = sa.id and g.standard_id = st.id
left join lateral (
  select
    count(*)                                as mapped,
    count(*) filter (where emd.is_verified) as verified
  from sqaaf.evidence_map_detail emd
  where emd.self_assessment_id = sa.id and emd.standard_id = st.id
) m on true
group by sa.id, sa.school_id, sa.academic_year_id, d.id, d.domain_number, d.name, d.platform_coverage;

comment on view sqaaf.evidence_readiness is
  'Per-domain readiness. `platform_relevant_without_evidence` counts standards with no VERIFIED evidence — a draft CPD record no longer makes a standard read as evidenced.';

grant select on sqaaf.evidence_map_detail, sqaaf.evidence_readiness to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Stage 4 high-impact actions on the audit trail
-- ---------------------------------------------------------------------------
-- Every table below carries school_id, which is all the generic trigger needs.
--
-- Chosen for what they decide, not for how often they change:
--   * cpd_record            — credits hours that feed a compliance return
--   * cpd_requirement_version / _allocation / cpd_year_requirement
--                           — change which rule a year is judged under
--   * cpd_activity_rule     — sets hour credits
--   * cpd_source_type       — decides whether a source counts at all
--   * sqaaf.standard_rating — the school's assessment of itself
--   * sqaaf.improvement_action / evidence_gap / self_assessment
--                           — what the school committed to, and when it filed
--
-- Deliberately NOT audited: sqaaf.evidence_map. Mapping is a clerical act with
-- no judgement in it, it happens in bulk, and the mapped record carries its own
-- history. Auditing it would bury the decisions above in noise.
create trigger audit_changes
  after insert or update or delete on compliance.cpd_record
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on compliance.cpd_requirement_version
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on compliance.cpd_requirement_allocation
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on compliance.cpd_year_requirement
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on compliance.cpd_activity_rule
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on compliance.cpd_source_type
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on sqaaf.self_assessment
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on sqaaf.standard_rating
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on sqaaf.evidence_gap
  for each row execute function audit.record_row_change();

create trigger audit_changes
  after insert or update or delete on sqaaf.improvement_action
  for each row execute function audit.record_row_change();
