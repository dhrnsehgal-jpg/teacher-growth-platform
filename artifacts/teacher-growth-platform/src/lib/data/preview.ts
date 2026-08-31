/**
 * Local preview data path — DEVELOPMENT ONLY.
 *
 * The application talks to Supabase, which needs Docker. Where Docker is
 * unavailable, this reads the same schema directly from PostgreSQL so the
 * interface can be inspected with real seeded data.
 *
 * It is a FAITHFUL preview, not a bypass: every query runs inside a transaction
 * that sets `request.jwt.claim.sub` and switches to the `authenticated` role, so
 * Row Level Security applies exactly as it would in production. Viewing as a
 * teacher really does hide their colleagues' records.
 *
 * Enabled only when PREVIEW_DATABASE_URL is set and NODE_ENV is not production.
 * `pg` is imported dynamically so it never enters a production bundle.
 */

import type { Pool } from 'pg';
import { cookies } from 'next/headers';

export const PREVIEW_COOKIE = 'preview_user';

/** The seeded demo staff, offered in the preview switcher. */
export const PREVIEW_USERS = [
  {
    key: 'simran',
    id: '00000000-0000-4000-8000-000000000201',
    name: 'Simran Kaur',
    role: 'Foundational Teacher',
  },
  {
    key: 'harpreet',
    id: '00000000-0000-4000-8000-000000000202',
    name: 'Harpreet Singh',
    role: 'PRT',
  },
  { key: 'neha', id: '00000000-0000-4000-8000-000000000203', name: 'Neha Sharma', role: 'TGT' },
  {
    key: 'rajesh',
    id: '00000000-0000-4000-8000-000000000204',
    name: 'Rajesh Verma',
    role: 'PGT, Physics',
  },
  {
    key: 'anjali',
    id: '00000000-0000-4000-8000-000000000205',
    name: 'Anjali Mehta',
    role: 'HOD Science',
  },
  {
    key: 'principal',
    id: '00000000-0000-4000-8000-000000000210',
    name: 'Gurpreet Dhillon',
    role: 'Principal',
  },
] as const;

export function isPreviewMode(): boolean {
  return process.env.NODE_ENV !== 'production' && Boolean(process.env.PREVIEW_DATABASE_URL);
}

let poolPromise: Promise<Pool> | null = null;

async function getPool(): Promise<Pool> {
  if (!poolPromise) {
    poolPromise = import('pg').then(
      ({ Pool: PgPool }) =>
        new PgPool({ connectionString: process.env.PREVIEW_DATABASE_URL, max: 4 }),
    );
  }
  return poolPromise;
}

async function currentPreviewUserId(): Promise<string> {
  const store = await cookies();
  const key = store.get(PREVIEW_COOKIE)?.value;
  const match = PREVIEW_USERS.find((u) => u.key === key);
  return (match ?? PREVIEW_USERS.find((u) => u.key === 'rajesh')!).id;
}

export async function currentPreviewUser() {
  const store = await cookies();
  const key = store.get(PREVIEW_COOKIE)?.value;
  return PREVIEW_USERS.find((u) => u.key === key) ?? PREVIEW_USERS.find((u) => u.key === 'rajesh')!;
}

/** Runs a query as the previewed user, under RLS, and always rolls back. */
export async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claim.sub',
      await currentPreviewUserId(),
    ]);
    await client.query('set local role authenticated');
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    await client.query('rollback').catch(() => {});
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Framework
// ---------------------------------------------------------------------------

export const sqlListFrameworks = `
  select id, key, version, name, description, source_framework, source_alignment,
         external_reference, status
    from competency.framework
   order by source_framework, key`;

export const sqlListCompetencies = `
  select c.id, c.key, c.name, c.description, c.sort_order, c.status,
         c.source_framework, c.source_alignment, c.external_reference,
         c.rationale, c.retirement_reason,
         json_build_object(
           'key', d.key, 'name', d.name,
           'standard', json_build_object('key', s.key, 'name', s.name, 'sort_order', s.sort_order)
         ) as domain
    from competency.competency c
    join competency.domain d on d.id = c.domain_id
    join competency.standard s on s.id = d.standard_id
    join competency.framework f on f.id = s.framework_id
   where f.key = $1
   order by c.sort_order`;

export const sqlCompetencyByKey = `
  select c.id, c.key, c.name, c.description, c.sort_order, c.status,
         c.source_framework, c.source_alignment, c.external_reference,
         c.rationale, c.retirement_reason,
         json_build_object(
           'key', d.key, 'name', d.name,
           'standard', json_build_object('key', s.key, 'name', s.name, 'sort_order', s.sort_order)
         ) as domain
    from competency.competency c
    join competency.domain d on d.id = c.domain_id
    join competency.standard s on s.id = d.standard_id
   where c.key = $1
   limit 1`;

export const sqlIndicators = `
  select id, key, statement, sort_order, status,
         source_framework, source_alignment, external_reference
    from competency.indicator
   where competency_id = $1
   order by sort_order`;

export const sqlDescriptors = `
  select pd.descriptor,
         json_build_object('key', pl.key, 'name', pl.name, 'ordinal', pl.ordinal) as proficiency_level
    from competency.proficiency_descriptor pd
    join competency.proficiency_level pl on pl.id = pd.proficiency_level_id
   where pd.competency_id = $1
   order by pl.ordinal`;

// Reads the same view the Supabase path uses, so the two cannot drift.
export const sqlTargets = `
  select id, rationale, role_key, requires_leadership,
         level_key, level_name, level_ordinal,
         teacher_category_name, school_stage_name, career_level_name, subject_name
    from competency.competency_target_detail
   where competency_id = $1
   order by level_ordinal`;

export const sqlEvidenceDescriptors = `
  select evidence_type_key, guidance, is_required
    from competency.evidence_descriptor
   where competency_id = $1`;

export const sqlKpiTemplates = `
  select t.id, t.key, t.name, t.description, t.metric, t.unit, t.direction,
         t.default_target, t.default_weight, t.data_source, t.frequency,
         t.is_student_outcome_measure,
         json_build_object('key', c.key, 'name', c.name, 'sort_order', c.sort_order) as category
    from kpi.template t
    join kpi.category c on c.id = t.category_id
   where t.status = 'active'
   order by c.sort_order, t.key`;

// ---------------------------------------------------------------------------
// Teacher
// ---------------------------------------------------------------------------

export const sqlOwnProfile = `
  select tp.id, tp.employee_code, tp.date_of_joining, tp.employment_status,
         tp.has_leadership_responsibility,
         json_build_object('full_name', au.full_name, 'email', au.email::text) as "user",
         case when d.id is null then null else json_build_object('display_name', d.display_name) end as department,
         case when tc.id is null then null else json_build_object('display_name', tc.display_name) end as teacher_category,
         case when cl.id is null then null else json_build_object('display_name', cl.display_name) end as career_level
    from core.teacher_profile tp
    join core.app_user au on au.id = tp.user_id
    left join core.department d on d.id = tp.primary_department_id
    left join core.teacher_category tc on tc.id = tp.teacher_category_id
    left join core.career_level cl on cl.id = tp.career_level_id
   where tp.user_id = auth.uid()
   limit 1`;

export const sqlCurrentYear = `
  select id, label from core.academic_year where is_current limit 1`;

export const sqlResolvedTargets = `
  select * from competency.resolve_targets($1, $2)`;

export const sqlTeacherKpis = `
  select id, name, description, metric, target, weight, frequency, data_source,
         evidence_requirement, is_student_outcome_measure, status,
         category_name, reviewer_name
    from kpi.teacher_kpi_detail
   where teacher_profile_id = $1 and academic_year_id = $2
   order by weight desc`;

export const sqlTeachingAssignments = `
  select case when s.id is null then null else json_build_object('display_name', s.display_name) end as subject,
         case when cl.id is null then null else json_build_object('display_name', cl.display_name) end as class_level,
         case when ss.id is null then null else json_build_object('display_name', ss.display_name) end as school_stage
    from core.teacher_teaching_assignment t
    left join core.subject s on s.id = t.subject_id
    left join core.class_level cl on cl.id = t.class_level_id
    left join core.school_stage ss on ss.id = t.school_stage_id
   where t.teacher_profile_id = $1 and t.academic_year_id = $2`;

export const sqlGoals = `
  select id, title, description, success_measure, target_date::text, status
    from growth.professional_goal
   where teacher_profile_id = $1 and academic_year_id = $2
   order by created_at`;

export const sqlEvidenceRequirements = `
  select r.minimum_count, r.description,
         json_build_object('key', et.key, 'name', et.name,
                           'submission_guidance', et.submission_guidance) as evidence_type
    from evidence.requirement r
    join evidence.evidence_type et on et.id = r.evidence_type_id
   where r.academic_year_id = $1`;
