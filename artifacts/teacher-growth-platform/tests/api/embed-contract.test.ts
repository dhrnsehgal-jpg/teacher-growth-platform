/**
 * Every PostgREST embed the data layer relies on, exercised for real.
 *
 * This codebase has shipped the same silent bug five times: an embed that
 * PostgREST rejects, swallowed by `data ?? []` into "no results". It produced an
 * empty domain dropdown, a blank evidence-requirements list, "no service
 * record", "0 of 84 standards rated" and "no catalogue activity mapped".
 *
 * A static rule cannot catch it. Naming the FK column fails for a COMPOSITE key
 * (PGRST200); naming the bare relation fails when the relationship is AMBIGUOUS
 * (PGRST201) — `teacher_profile → department` has both a direct FK and a
 * many-to-many path. Which form is correct depends on the schema, so the only
 * reliable check is to run the query.
 *
 * These assert `error` is null, which is what the data layer discards.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD, PRINCIPAL } from '../e2e/demo-personas';

const API_URL = process.env.SUPABASE_API_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

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

let supabase: SupabaseClient;

beforeAll(async () => {
  if (!available) return;
  supabase = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await supabase.auth.signInWithPassword({
    email: PRINCIPAL,
    password: DEMO_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
});

/** Every embed-bearing select in the data layer, verbatim. */
const EMBEDS: { name: string; schema: string; table: string; select: string }[] = [
  {
    name: 'teacher profile with department, category and career level',
    schema: 'core',
    table: 'teacher_profile',
    select: `id, employee_code, has_leadership_responsibility,
             user:user_id!inner(full_name, email),
             department:primary_department_id(display_name),
             teacher_category:teacher_category_id(display_name),
             career_level:career_level_id(display_name)`,
  },
  {
    name: 'domains with their standard and framework',
    schema: 'competency',
    table: 'domain',
    select: 'id, name, standard!inner(name, framework!inner(name, key))',
  },
  {
    name: 'proficiency scales with framework and levels',
    schema: 'competency',
    table: 'proficiency_scale',
    select:
      'id, key, name, framework!inner(name), levels:proficiency_level(id, ordinal, name, descriptor)',
  },
  {
    name: 'KPI templates with their category',
    schema: 'kpi',
    table: 'template',
    select: 'id, key, name, category!inner(name)',
  },
  {
    name: 'evidence requirements with their type',
    schema: 'evidence',
    table: 'requirement',
    select:
      'id, minimum_count, teacher_category_id, school_stage_id, evidence_type:evidence_type_id(name)',
  },
  {
    name: 'evidence with its type',
    schema: 'evidence',
    table: 'evidence',
    select: 'id, title, status, evidence_type:evidence_type_id(name)',
  },
  {
    name: 'service record with its designation',
    schema: 'service',
    table: 'service_record',
    select: 'id, employee_id, appointment_date, designation(display_name, rank_order)',
  },
  {
    name: 'SQAAF ratings with both performance-level FKs',
    schema: 'sqaaf',
    table: 'standard_rating',
    select: `id, standard_id, rationale,
             level:performance_level!standard_rating_level_id_school_id_fkey(display_name, level_number, score),
             aspirational:performance_level!standard_rating_aspirational_level_id_school_id_fkey(display_name, level_number)`,
  },
  {
    name: 'SQAAF evidence gaps with their standard',
    schema: 'sqaaf',
    table: 'evidence_gap',
    select: 'id, description, standard(code)',
  },
  {
    name: 'appraisal with its cycle',
    schema: 'appraisal',
    table: 'appraisal',
    select: 'id, stage, cycle!inner(name, closes_on)',
  },
  {
    name: 'CPD activity-competency with the activity and provider',
    schema: 'cpd',
    table: 'activity_competency',
    select: 'activity(id, title, cpd_hours, delivery_method, capacity, provider(name))',
  },
  {
    name: 'CPD source types',
    schema: 'compliance',
    table: 'cpd_source_type',
    select: 'id, key, display_name, source_class, counts_toward_requirement',
  },
  {
    name: 'teaching assignments with their stage',
    schema: 'core',
    table: 'teacher_teaching_assignment',
    select: 'teacher_profile_id, school_stage:school_stage_id(display_name, sort_order)',
  },
];

describeApi('every data-layer embed is accepted by PostgREST', () => {
  for (const e of EMBEDS) {
    it(`${e.name}`, async () => {
      const { error } = await supabase.schema(e.schema).from(e.table).select(e.select).limit(1);
      expect(
        error,
        `${e.schema}.${e.table} — ${error?.code}: ${error?.message}. ` +
          'PGRST200 means the FK column was named where the relation is required (composite key). ' +
          'PGRST201 means the relation is ambiguous and needs the column or constraint form.',
      ).toBeNull();
    });
  }
});

describeApi('the embeds return data, not just an absence of error', () => {
  it('resolves a teacher profile with all three lookups populated', async () => {
    const { data } = await supabase
      .schema('core')
      .from('teacher_profile')
      .select(
        `employee_code,
         department:primary_department_id(display_name),
         teacher_category:teacher_category_id(display_name)`,
      )
      .eq('employee_code', 'EMP-2003')
      .maybeSingle();
    const row = data as unknown as {
      department: { display_name: string } | null;
      teacher_category: { display_name: string } | null;
    } | null;
    expect(row?.department?.display_name).toBe('Mathematics');
    expect(row?.teacher_category?.display_name).toContain('Trained Graduate');
  });

  it('resolves CPD activities for a competency — the fifth recurrence of this bug', async () => {
    const { data, error } = await supabase
      .schema('cpd')
      .from('activity_competency')
      .select('activity(title, provider(name))');
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});
