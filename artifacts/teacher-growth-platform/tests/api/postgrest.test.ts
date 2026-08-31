/**
 * PostgREST contract tests.
 *
 * The database tests in tests/db run SQL directly, and the local preview reads
 * SQL too — so neither exercises the queries the application actually issues
 * through supabase-js. That gap hid four broken queries until the Supabase
 * stack was first run.
 *
 * These tests close it. They assert the exact select strings used by
 * src/lib/data/*.ts against a running stack, signed in as a seeded teacher.
 *
 *   npx supabase start   (needs Docker; colima works)
 *
 * When no stack is reachable the suite skips, so `npm run check` stays green
 * without Docker.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD, RAJESH } from '../e2e/demo-personas';
import { DEMO_PERSONAS } from '@/lib/demo-access';

const API_URL = process.env.SUPABASE_API_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const RAJESH_ID = '00000000-0000-4000-8000-000000000204';
// Fixed development credential, set by supabase/seed.sql. Local stacks only.

async function stackAvailable(): Promise<boolean> {
  try {
    // The bare PostgREST root is 401 on hosted Supabase (and 200 locally).
    // Auth settings is a public health endpoint on both environments.
    const res = await fetch(`${API_URL}/auth/v1/settings`, {
      headers: { apikey: ANON_KEY },
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const available = await stackAvailable();
const describeApi = available ? describe : describe.skip;

if (!available) {
  console.warn(
    '\n  PostgREST tests skipped: no Supabase stack at ' +
      `${API_URL}.\n  Start one with: npx supabase start\n`,
  );
}

let supabase: SupabaseClient;
let profileId: string;
let yearId: string;

beforeAll(async () => {
  if (!available) return;
  supabase = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await supabase.auth.signInWithPassword({
    email: RAJESH,
    password: DEMO_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed: ${error.message}`);

  const { data: profile } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select('id')
    .eq('user_id', RAJESH_ID)
    .maybeSingle();
  profileId = profile?.id as string;

  const { data: year } = await supabase
    .schema('core')
    .from('academic_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  yearId = year?.id as string;
});

describeApi('a seeded teacher can sign in', () => {
  it('has a usable auth account', async () => {
    const { data } = await supabase.auth.getUser();
    expect(data.user?.email).toBe(RAJESH);
  });
});

describeApi('every demo chooser account can sign in', () => {
  for (const persona of DEMO_PERSONAS) {
    it(`signs in as ${persona.email} (${persona.role})`, async () => {
      const client = createClient(API_URL, ANON_KEY, {
        auth: { persistSession: false },
      });
      const { data, error } = await client.auth.signInWithPassword({
        email: persona.email,
        password: DEMO_PASSWORD,
      });

      expect(error, `${persona.email} (${persona.role}) could not sign in`).toBeNull();
      expect(data.user?.email, `${persona.email} returned no authenticated user`).toBe(
        persona.email,
      );
    });
  }
});

describeApi('framework queries', () => {
  it('lists frameworks', async () => {
    const { data, error } = await supabase
      .schema('competency')
      .from('framework')
      .select(
        'id, key, version, name, description, source_framework, source_alignment, external_reference, status',
      );
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);
  });

  it('embeds a composite foreign key by relation name, filtered on a nested resource', async () => {
    // Regression: `domain:domain_id!inner(...)` failed with "Could not find a
    // relationship". Composite FKs must be embedded by relation name.
    const { data, error } = await supabase
      .schema('competency')
      .from('competency')
      .select(
        `id, key, name,
         domain!inner(key, name, standard!inner(key, name, framework!inner(key)))`,
      )
      .eq('domain.standard.framework.key', 'school_professional_practice');
    expect(error).toBeNull();
    // The framework grows between stages; assert the shape, not a literal.
    expect(data!.length).toBeGreaterThanOrEqual(23);
    expect(data!.every((c) => c.domain)).toBe(true);
  });

  it('reads proficiency descriptors', async () => {
    const { data, error } = await supabase
      .schema('competency')
      .from('proficiency_descriptor')
      .select('descriptor, proficiency_level(key, name, ordinal)')
      .limit(5);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('reads targets through the view, including cross-schema names', async () => {
    // Regression: teacher_category/school_stage/career_level live in `core`,
    // and PostgREST cannot embed across schemas at all.
    const { data, error } = await supabase
      .schema('competency')
      .from('competency_target_detail')
      .select(
        'id, level_name, level_ordinal, teacher_category_name, school_stage_name, career_level_name, role_key',
      );
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    // At least one target is scoped to a named category, proving the join.
    expect(data!.some((r) => r.teacher_category_name !== null)).toBe(true);
  });

  it('lists KPI templates with their category', async () => {
    const { data, error } = await supabase
      .schema('kpi')
      .from('template')
      .select('id, key, name, category!inner(key, name, sort_order)')
      .eq('status', 'active');
    expect(error).toBeNull();
    // At least the twelve seeded templates. Not an exact count: the admin
    // end-to-end suite creates templates against this same stack.
    expect(data!.length).toBeGreaterThanOrEqual(12);
    expect(data!.every((t: { name: string }) => t.name.length > 0)).toBe(true);
  });
});

describeApi('teacher profile queries', () => {
  it('reads the signed-in teacher’s profile with single-column FK embeds', async () => {
    const { data, error } = await supabase
      .schema('core')
      .from('teacher_profile')
      .select(
        `id, employee_code, has_leadership_responsibility,
         user:user_id!inner(full_name, email),
         department:primary_department_id(display_name),
         teacher_category:teacher_category_id(display_name),
         career_level:career_level_id(display_name)`,
      )
      .eq('user_id', RAJESH_ID)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data!.employee_code).toBe('EMP-2004');
  });

  it('resolves competency targets through the RPC', async () => {
    const { data, error } = await supabase.schema('competency').rpc('resolve_targets', {
      p_teacher_profile_id: profileId,
      p_academic_year_id: yearId,
    });
    expect(error).toBeNull();

    // Exactly one target per competency that has one — the resolution picks a
    // single most-specific match and never returns two rows for a competency.
    //
    // Deliberately NOT asserted as "one per active competency": since the admin
    // interface can add a competency, a newly created one legitimately has no
    // target until somebody sets one, and resolution correctly returns nothing
    // for it.
    const keys = data!.map((r: { competency_key: string }) => r.competency_key);
    expect(new Set(keys).size).toBe(keys.length);

    const { count } = await supabase
      .schema('competency')
      .from('competency')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    expect(data!.length).toBeLessThanOrEqual(count as number);
    expect(data!.length).toBeGreaterThanOrEqual(20);

    const leadership = data!.find(
      (r: { competency_key: string }) => r.competency_key === 'leadership',
    );
    expect(leadership.target_level_key).toBe('foundation');
  });

  it('reads KPIs through the view, including the reviewer’s name', async () => {
    // Regression: reviewer_user_id → core.app_user is cross-schema, and the
    // name was invisible anyway until migration 0018 repaired the directory.
    const { data, error } = await supabase
      .schema('kpi')
      .from('teacher_kpi_detail')
      .select('id, name, weight, is_student_outcome_measure, category_name, reviewer_name')
      .eq('teacher_profile_id', profileId)
      .eq('academic_year_id', yearId);
    expect(error).toBeNull();
    expect(data!.length).toBe(5);
    expect(data!.every((k) => k.reviewer_name !== null)).toBe(true);
  });

  it('reads teaching assignments and goals', async () => {
    const { error: e1, data: assignments } = await supabase
      .schema('core')
      .from('teacher_teaching_assignment')
      .select(
        'subject:subject_id(display_name), class_level:class_level_id(display_name), school_stage:school_stage_id(display_name)',
      )
      .eq('teacher_profile_id', profileId);
    expect(e1).toBeNull();
    expect(assignments!.length).toBeGreaterThan(0);

    const { error: e2, data: goals } = await supabase
      .schema('growth')
      .from('professional_goal')
      .select('id, title, success_measure, status')
      .eq('teacher_profile_id', profileId);
    expect(e2).toBeNull();
    expect(goals!.length).toBeGreaterThan(0);
  });
});

describeApi('RLS still governs the API', () => {
  it('a teacher sees only their own evidence and KPIs', async () => {
    const { data: evidence } = await supabase.schema('evidence').from('evidence').select('id');
    expect(evidence!.length).toBe(1);

    const { data: kpis } = await supabase.schema('kpi').from('teacher_kpi').select('id');
    expect(kpis!.length).toBe(5);
  });

  it('the views do not bypass RLS', async () => {
    // security_invoker = true, so the caller's policies still apply.
    const { data } = await supabase
      .schema('kpi')
      .from('teacher_kpi_detail')
      .select('id, teacher_profile_id');
    expect(data!.every((r) => r.teacher_profile_id === profileId)).toBe(true);
  });

  it('a teacher cannot write to the competency framework', async () => {
    const { error } = await supabase
      .schema('competency')
      .from('competency')
      .update({ name: 'tampered' })
      .eq('key', 'leadership')
      .select();
    // RLS yields either an explicit error or zero affected rows; never a change.
    const { data: after } = await supabase
      .schema('competency')
      .from('competency')
      .select('name')
      .eq('key', 'leadership')
      .maybeSingle();
    expect(after!.name).not.toBe('tampered');
    if (error) expect(error.code).toBeDefined();
  });
});
