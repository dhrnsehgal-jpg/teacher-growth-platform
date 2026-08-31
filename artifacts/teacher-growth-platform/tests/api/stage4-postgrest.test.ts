/**
 * PostgREST contract tests for Stage 4.
 *
 * These exist because a query that is valid SQL can still be a broken
 * PostgREST request, and the failure is silent: the data layer returns
 * `data ?? []`, so a rejected embed renders as "nothing recorded" rather than
 * as an error.
 *
 * That is not hypothetical. `getRatings()` shipped with `level:level_id(...)`
 * and the readiness pack showed "0 of 84 standards rated" while the database
 * held four. Both FKs to `performance_level` are composite, and composite FKs
 * reject column-name embeds — the Stage 2 lesson (migration 0019) recurring.
 *
 * Signed in as the Principal, who holds sqaaf.read.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD, PRINCIPAL } from '../e2e/demo-personas';

const API_URL = process.env.SUPABASE_API_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const NEHA_ID = '00000000-0000-4000-8000-000000000203';

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
let schoolId: string;
let yearId: string;
let nehaProfileId: string;
let selfAssessmentId: string;

beforeAll(async () => {
  if (!available) return;
  supabase = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await supabase.auth.signInWithPassword({
    email: PRINCIPAL,
    password: DEMO_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed: ${error.message}`);

  const { data: year } = await supabase
    .schema('core')
    .from('academic_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  yearId = (year as { id: string }).id;

  const { data: profile } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select('id, school_id')
    .eq('user_id', NEHA_ID)
    .maybeSingle();
  nehaProfileId = (profile as { id: string }).id;
  schoolId = (profile as unknown as { school_id: string }).school_id;

  const { data: sa } = await supabase
    .schema('sqaaf')
    .from('self_assessment')
    .select('id')
    .eq('academic_year_id', yearId)
    .maybeSingle();
  selfAssessmentId = (sa as { id: string }).id;
});

describeApi('the compliance schema is reachable through PostgREST', () => {
  it('exposes compliance and sqaaf', async () => {
    const a = await supabase.schema('compliance').from('cpd_category').select('key');
    const b = await supabase.schema('sqaaf').from('domain').select('domain_number');
    expect(a.error, a.error?.message).toBeNull();
    expect(b.error, b.error?.message).toBeNull();
  });
});

describeApi('CPD queries the application actually issues', () => {
  it('resolves the requirement version for a year', async () => {
    const { data, error } = await supabase
      .schema('compliance')
      .rpc('requirement_version_for_year', {
        p_school_id: schoolId,
        p_academic_year_id: yearId,
      });
    expect(error, error?.message).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(Number((row as { total_hours: number }).total_hours)).toBe(50);
  });

  it('runs the ledger and returns every dimension', async () => {
    const { data, error } = await supabase.schema('compliance').rpc('cpd_progress', {
      p_teacher_profile_id: nehaProfileId,
      p_academic_year_id: yearId,
    });
    expect(error, error?.message).toBeNull();
    const rows = data as { dimension: string; completed_hours: number }[];
    expect(new Set(rows.map((r) => r.dimension))).toEqual(
      new Set(['total', 'source_class', 'category', 'category_source']),
    );

    // Asserted as an invariant rather than against 38, because the Playwright
    // suite credits further hours against this same stack and is not
    // idempotent. The exact seeded figures are pinned in tests/db/stage4, which
    // runs against the separate local server Playwright never touches.
    const sum = (dimension: string) =>
      rows
        .filter((r) => r.dimension === dimension)
        .reduce((t, r) => t + Number(r.completed_hours), 0);
    const total = rows.find((r) => r.dimension === 'total');
    expect(Number(total?.completed_hours)).toBeGreaterThanOrEqual(38);
    expect(sum('category')).toBe(Number(total?.completed_hours));
    expect(sum('source_class')).toBe(Number(total?.completed_hours));
    expect(sum('category_source')).toBe(Number(total?.completed_hours));
  });

  it('reads cpd_record_detail with its joined names', async () => {
    const { data, error } = await supabase
      .schema('compliance')
      .from('cpd_record_detail')
      .select('*')
      .eq('teacher_profile_id', nehaProfileId)
      .eq('academic_year_id', yearId);
    expect(error, error?.message).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(7);
    const rows = data as { teacher_name: string; category_name: string }[];
    expect(rows[0]?.teacher_name).toBe('Neha Sharma');
    expect((rows[0]?.category_name ?? '').length).toBeGreaterThan(0);
  });

  it('reads the activity rules and cap groups the form offers', async () => {
    const { data: version } = await supabase
      .schema('compliance')
      .from('cpd_requirement_version')
      .select('id')
      .eq('key', 'cbse.cpd')
      .maybeSingle();
    const versionId = (version as { id: string }).id;

    const rules = await supabase
      .schema('compliance')
      .from('cpd_activity_rule')
      .select(
        'id, key, permitted_activity, hour_credit, required_evidence, clause_reference, verification_status, cap_group_id',
      )
      .eq('version_id', versionId);
    expect(rules.error, rules.error?.message).toBeNull();
    expect(rules.data?.length).toBe(7);

    const caps = await supabase
      .schema('compliance')
      .from('cpd_rule_cap_group')
      .select('id, display_name, cap_hours, cap_basis')
      .eq('version_id', versionId);
    expect(caps.error, caps.error?.message).toBeNull();
    const capRows = caps.data as { cap_hours: number }[];
    expect(Number(capRows[0]?.cap_hours)).toBe(11);
  });
});

describeApi('SQAAF queries the application actually issues', () => {
  it('reads standard_detail across three schemas', async () => {
    const { data, error } = await supabase
      .schema('sqaaf')
      .from('standard_detail')
      .select('*')
      .eq('platform_relevant', true);
    expect(error, error?.message).toBeNull();
    expect(data?.length).toBe(18);
  });

  it('embeds BOTH performance-level FKs on a rating', async () => {
    // The regression. Naming the FK column instead of the relation returns
    // PGRST200, which the data layer swallows into an empty list.
    const { data, error } = await supabase
      .schema('sqaaf')
      .from('standard_rating')
      .select(
        `id, standard_id, rationale, priority,
         level:performance_level!standard_rating_level_id_school_id_fkey(display_name, level_number, score),
         aspirational:performance_level!standard_rating_aspirational_level_id_school_id_fkey(display_name, level_number)`,
      )
      .eq('self_assessment_id', selfAssessmentId);

    expect(error, error?.message).toBeNull();
    expect(data?.length).toBe(4);
    const rows = data as unknown as {
      level: { display_name: string } | null;
      aspirational: { display_name: string } | null;
    }[];
    for (const r of rows) {
      expect(r.level?.display_name).toBeTruthy();
      expect(r.aspirational?.display_name).toBeTruthy();
    }
  });

  it('naming the FK column instead of the relation still fails', async () => {
    // Kept deliberately: if a future PostgREST accepts this, the comment in
    // src/lib/data/sqaaf.ts explaining why it does not should be revisited.
    const { error } = await supabase
      .schema('sqaaf')
      .from('standard_rating')
      .select('id, level:level_id(display_name)')
      .limit(1);
    expect(error?.code).toBe('PGRST200');
  });

  it('reads the improvement plan and the readiness view', async () => {
    const actions = await supabase
      .schema('sqaaf')
      .from('improvement_action_detail')
      .select('*')
      .eq('self_assessment_id', selfAssessmentId);
    expect(actions.error, actions.error?.message).toBeNull();
    expect(actions.data?.length).toBeGreaterThan(0);

    const readiness = await supabase
      .schema('sqaaf')
      .from('evidence_readiness')
      .select('*')
      .eq('self_assessment_id', selfAssessmentId);
    expect(readiness.error, readiness.error?.message).toBeNull();
    expect(readiness.data?.length).toBe(7);
  });

  it('reads the evidence map with its five possible targets', async () => {
    const { data, error } = await supabase
      .schema('sqaaf')
      .from('evidence_map')
      .select(
        'id, standard_id, note, cpd_record_id, evidence_id, verified_competency_id, teacher_kpi_id, plan_item_id, aggregate_note',
      )
      .eq('self_assessment_id', selfAssessmentId);
    expect(error, error?.message).toBeNull();
    expect(data?.length).toBe(3);
  });

  it('reads the submission window without inventing dates', async () => {
    const { data, error } = await supabase
      .schema('sqaaf')
      .from('submission_window')
      .select('opens_on, closes_on, verification_status, source_note')
      .eq('academic_year_id', yearId)
      .maybeSingle();
    expect(error, error?.message).toBeNull();
    const row = data as { opens_on: string | null; verification_status: string };
    expect(row.verification_status).toBe('requires_verification');
    expect(row.opens_on).toBeNull();
  });
});

describeApi('anon reaches nothing', () => {
  it('is denied both new schemas', async () => {
    const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
    const a = await anon.schema('compliance').from('cpd_record').select('id');
    const b = await anon.schema('sqaaf').from('self_assessment').select('id');
    expect(a.error).not.toBeNull();
    expect(b.error).not.toBeNull();
  });
});
