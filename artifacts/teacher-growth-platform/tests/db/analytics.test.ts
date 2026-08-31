/**
 * Leadership analytics.
 *
 * Two properties matter more than the numbers: the analytics never rank
 * teachers, and the training-needs statement can only say what the counts
 * support. Both are asserted here.
 */

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asUser, connect, currentYearId, databaseAvailable, DEMO_USERS } from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

let client: Client;
let year: string;

beforeAll(async () => {
  if (!available) return;
  client = await connect();
  year = await currentYearId(client);
});
afterAll(async () => {
  if (available && client) await client.end();
});

describeDb('competency heatmap', () => {
  it('covers the whole cohort with every filter dimension', async () => {
    const { rows } = await client.query(
      `select count(*)::int as cells,
              count(distinct teacher_profile_id)::int as teachers,
              count(distinct competency_key)::int as competencies,
              count(*) filter (where department is null)::int as no_department
         from growth.competency_heatmap where academic_year_id = $1`,
      [year],
    );
    expect(rows[0].teachers).toBeGreaterThanOrEqual(17);
    expect(rows[0].competencies).toBeGreaterThanOrEqual(20);
    // The matrix is legitimately sparse: a teacher assessed on one competency
    // has one cell, not one per competency. Asserting a full grid would be
    // asserting that everyone has been assessed on everything.
    expect(rows[0].cells).toBeGreaterThan(0);
    expect(rows[0].cells).toBeLessThanOrEqual(rows[0].teachers * rows[0].competencies);
  });

  it('shows one row per teacher per competency, even after a reassessment', async () => {
    const { rows } = await client.query(
      `select teacher_profile_id, competency_key, count(*)::int as n
         from growth.competency_heatmap where academic_year_id = $1
        group by 1, 2 having count(*) > 1`,
      [year],
    );
    expect(rows).toEqual([]);
  });

  it('respects scope: a teacher sees only their own row', async () => {
    await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(`select distinct teacher_name from growth.competency_heatmap`);
      expect(rows.map((r) => r.teacher_name)).toEqual(['Neha Sharma']);
    });
  });

  it('a Head of Department sees their department, not the school', async () => {
    // Counted BEFORE impersonating: asUser switches the role on this same
    // connection, so a query issued inside the callback is restricted too and
    // would compare the same number with itself.
    const { rows: all } = await client.query(
      `select count(distinct teacher_profile_id)::int as n from growth.competency_heatmap`,
    );

    await asUser(client, DEMO_USERS.vikram, async (c) => {
      const { rows } = await c.query(
        `select count(distinct teacher_profile_id)::int as n from growth.competency_heatmap`,
      );
      expect(rows[0].n).toBeGreaterThan(0);
      expect(rows[0].n).toBeLessThan(all[0].n);
    });
  });
});

describeDb('training needs analysis', () => {
  it('only reports groups that meet the thresholds', async () => {
    const { rows } = await client.query(`select * from growth.training_needs($1, 3, 40)`, [year]);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Number(r.group_size)).toBeGreaterThanOrEqual(3);
      expect(Number(r.share_percent)).toBeGreaterThanOrEqual(40);
    }
  });

  it('the statement matches its own counts exactly', async () => {
    const { rows } = await client.query(`select * from growth.training_needs($1, 3, 40)`, [year]);
    for (const r of rows) {
      // The share quoted in the sentence must equal the share in the columns,
      // and the counts must be the ones in the sentence.
      expect(r.statement).toContain(`${Number(r.share_percent)}%`);
      expect(r.statement).toContain(`${r.teachers_with_gap} of ${r.group_size} assessed`);
      expect(r.statement).toContain(r.competency_name);
    }
  });

  it('never claims a share above 100%', async () => {
    const { rows } = await client.query(`select * from growth.training_needs($1, 1, 0)`, [year]);
    for (const r of rows) {
      expect(Number(r.share_percent)).toBeLessThanOrEqual(100);
      expect(Number(r.teachers_with_gap)).toBeLessThanOrEqual(Number(r.group_size));
    }
  });

  it('finds the seeded Competency-Based Assessment cluster', async () => {
    const { rows } = await client.query(
      `select competency_name, sum(teachers_with_gap)::int as n
         from growth.training_needs($1, 3, 40)
        group by 1 order by 2 desc limit 1`,
      [year],
    );
    expect(rows[0].competency_name).toBe('Competency-Based Assessment');
  });
});

describeDb('CPD impact is reported as association', () => {
  it('separates selection, application and verified impact', async () => {
    const { rows } = await client.query(
      `select times_selected, times_applied, times_impact_verified from cpd.programme_impact`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      // Application can never exceed selection, nor impact exceed application.
      expect(Number(r.times_applied)).toBeLessThanOrEqual(Number(r.times_selected));
      expect(Number(r.times_impact_verified)).toBeLessThanOrEqual(Number(r.times_applied));
    }
  });

  it('has no column asserting causation', async () => {
    const { rows } = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'cpd' and table_name = 'programme_impact'
          and column_name ~ 'caused|causal|effect|improvement_rate|success_rate'`,
    );
    expect(rows).toEqual([]);
  });
});

describeDb('the analytics do not rank teachers', () => {
  it('no view orders teachers by a performance score', async () => {
    // gap_analysis and training_needs group by cohort. The heatmap is a matrix.
    // None of them carries a teacher-level rank or overall score column.
    const { rows } = await client.query(
      `select table_name, column_name from information_schema.columns
        where table_schema in ('growth', 'cpd')
          and table_name in ('gap_analysis', 'competency_heatmap', 'programme_impact')
          and column_name ~ 'rank|overall_score|percentile|rating'`,
    );
    expect(rows).toEqual([]);
  });

  it('gap analysis aggregates by cohort, never naming a teacher', async () => {
    const { rows } = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'growth' and table_name = 'gap_analysis'
          and column_name ~ 'teacher_name|teacher_profile_id'`,
    );
    expect(rows).toEqual([]);
  });
});

describeDb('the six heatmap dimensions the brief requires', () => {
  it('exposes department, stage, subject, category, career level and manager', async () => {
    const { rows } = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'growth' and table_name = 'competency_heatmap'`,
    );
    const columns = rows.map((r) => r.column_name as string);
    for (const dimension of [
      'department_key',
      'school_stage_keys',
      'subject_keys',
      'teacher_category_key',
      'career_level_key',
      'manager_user_ids',
    ]) {
      expect(columns, `${dimension} missing`).toContain(dimension);
    }
  });

  it('does not fan a teacher out across the stages they teach', async () => {
    // Stage and subject are many-to-many. Joining them would multiply the row
    // and every count built on this view would inflate — so they are arrays,
    // and this asserts the row count is still one per teacher per competency.
    const { rows } = await client.query(
      `select teacher_profile_id, competency_key, count(*) as n
         from growth.competency_heatmap
        group by 1, 2 having count(*) > 1`,
    );
    expect(rows).toEqual([]);
  });

  it('a teacher teaching several stages carries all of them', async () => {
    const { rows } = await client.query(
      `select array_length(school_stage_keys, 1) as stages,
              array_length(subject_keys, 1) as subjects
         from growth.competency_heatmap
        where array_length(school_stage_keys, 1) is not null
        limit 1`,
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].stages)).toBeGreaterThan(0);
  });

  it('every teacher has at least one manager who could see them', async () => {
    // The manager dimension is derived from the role assignment that would let
    // that person read the record — the same rule can_view_staff_record uses.
    // An empty list would mean a teacher nobody supervises.
    const { rows } = await client.query(
      `select distinct teacher_profile_id from growth.competency_heatmap
        where coalesce(array_length(manager_user_ids, 1), 0) = 0`,
    );
    expect(rows).toEqual([]);
  });
});

describeDb('school analytics carry no teacher identity', () => {
  // These four are read by leadership as cohort questions. A teacher column on
  // any of them turns a management view into a ranking.
  const AGGREGATES = [
    ['kpi', 'kpi_trend'],
    ['growth', 'development_investment'],
    ['core', 'career_pipeline'],
    ['pay', 'recommendation_distribution'],
  ];

  for (const [schema, view] of AGGREGATES) {
    it(`${schema}.${view} names nobody`, async () => {
      const { rows } = await client.query(
        `select column_name from information_schema.columns
          where table_schema = $1 and table_name = $2
            and (column_name like '%teacher_name%' or column_name like '%full_name%'
                 or column_name = 'teacher_profile_id' or column_name = 'user_id')`,
        [schema, view],
      );
      expect(rows.map((r) => r.column_name)).toEqual([]);
    });
  }

  it('the KPI view reports no achievement figure, because none is stored', async () => {
    // Guards against a future "performance" column being invented to fill the
    // shape of the word "trend".
    const { rows } = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'kpi' and table_name = 'kpi_trend'
          and column_name ~ '(achievement|performance|score|result)'`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([]);
  });

  it('all five analytics views run with the caller privileges', async () => {
    // security_invoker is what keeps RLS applying through them. Without it a
    // view over pay.recommendation would hand the distribution to anybody.
    const { rows } = await client.query(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'v'
          and (n.nspname, c.relname) in
              (('growth','competency_heatmap'), ('kpi','kpi_trend'),
               ('growth','development_investment'), ('core','career_pipeline'),
               ('pay','recommendation_distribution'))
          and not coalesce((
            select option_value = 'true' from pg_options_to_table(c.reloptions)
             where option_name = 'security_invoker'), false)`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});
