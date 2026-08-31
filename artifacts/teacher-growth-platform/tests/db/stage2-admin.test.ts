/**
 * Stage 2's admin configuration surface, closing the gap the line-by-line
 * audit found: the brief asked for nine write capabilities and only retirement
 * was built.
 *
 * These test the database side of each — that an authorised user can make the
 * change and an unauthorised one cannot. The forms are covered by Playwright.
 */

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asUser, connect, currentYearId, databaseAvailable, DEMO_USERS, schoolId } from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

let client: Client;
let school: string;
let year: string;

beforeAll(async () => {
  if (!available) return;
  client = await connect();
  school = await schoolId(client);
  year = await currentYearId(client);
});
afterAll(async () => {
  if (available && client) await client.end();
});

/** The Principal holds competency.manage and kpi.manage. */
const ADMIN = DEMO_USERS.principal;

describeDb('competency.manage lets an authorised user configure the framework', () => {
  it('creates a framework, standard and domain', async () => {
    await asUser(client, ADMIN, async (c) => {
      const { rows: fw } = await c.query(
        `insert into competency.framework (school_id, key, name, source_framework, source_alignment, status)
         values ($1, 'audit_test_fw', 'Audit test framework', 'school', 'school_defined', 'draft')
         returning id`,
        [school],
      );
      const { rows: std } = await c.query(
        `insert into competency.standard (school_id, framework_id, key, name, source_framework, source_alignment)
         values ($1, $2, 'audit_test_s1', 'Standard one', 'school', 'school_defined') returning id`,
        [school, fw[0].id],
      );
      const { rows: dom } = await c.query(
        `insert into competency.domain (school_id, standard_id, key, name, source_framework, source_alignment)
         values ($1, $2, 'audit_test_d1', 'Domain one', 'school', 'school_defined') returning id`,
        [school, std[0].id],
      );
      expect(dom[0].id).toBeTruthy();
    });
  });

  it('adds a competency and an indicator', async () => {
    await asUser(client, ADMIN, async (c) => {
      const { rows: comp } = await c.query(
        `insert into competency.competency
           (school_id, domain_id, key, name, description, source_framework, source_alignment, status)
         select $1, d.id, 'audit_test_comp', 'Audit test competency',
                'A competency created by the admin test, long enough to satisfy the description rule.',
                'school', 'school_defined', 'active'
           from competency.domain d where d.school_id = $1 limit 1
         returning id`,
        [school],
      );
      const { rows: ind } = await c.query(
        `insert into competency.indicator
           (school_id, competency_id, key, statement, source_framework, source_alignment, status)
         values ($1, $2, 'audit_test_ind',
                 'Uses formative assessment evidence to adapt subsequent instruction.',
                 'school', 'school_defined', 'active')
         returning id`,
        [school, comp[0].id],
      );
      expect(ind[0].id).toBeTruthy();
    });
  });

  it('refuses a verdict-style indicator', async () => {
    await asUser(client, ADMIN, async (c) => {
      await expect(
        c.query(
          `insert into competency.indicator
             (school_id, competency_id, key, statement, source_framework, source_alignment, status)
           select $1, cc.id, 'audit_test_bad', 'is a good teacher who tries hard',
                  'school', 'school_defined', 'active'
             from competency.competency cc where cc.school_id = $1 limit 1`,
          [school],
        ),
      ).rejects.toThrow(/indicator_statement_observable/);
    });
  });

  it('refuses an aligned item with no citation', async () => {
    await asUser(client, ADMIN, async (c) => {
      await expect(
        c.query(
          `insert into competency.competency
             (school_id, domain_id, key, name, description, source_framework, source_alignment, status)
           select $1, d.id, 'audit_test_uncited', 'Uncited',
                  'Claims NPST alignment without saying which clause it aligns to.',
                  'npst', 'aligned', 'active'
             from competency.domain d where d.school_id = $1 limit 1`,
          [school],
        ),
      ).rejects.toThrow(/competency_aligned_needs_reference/);
    });
  });

  it('defines a proficiency level', async () => {
    await asUser(client, ADMIN, async (c) => {
      const { rows } = await c.query(
        `insert into competency.proficiency_level (school_id, scale_id, key, name, ordinal, descriptor)
         select $1, ps.id, 'audit_test_level', 'Audit level', 9,
                'A descriptor long enough to explain what practice at this level looks like.'
           from competency.proficiency_scale ps where ps.school_id = $1 limit 1
         returning id`,
        [school],
      );
      expect(rows[0].id).toBeTruthy();
    });
  });

  it('sets a role and stage target', async () => {
    await asUser(client, ADMIN, async (c) => {
      const { rows } = await c.query(
        `insert into competency.competency_target
           (school_id, academic_year_id, competency_id, target_level_id, school_stage_id,
            role_key, rationale, source_framework, source_alignment, is_mandatory)
         select $1, $2, cc.id, pl.id, ss.id, 'head_of_department',
                'Set by the admin test to prove role and stage targets can be configured.',
                'school', 'school_defined', true
           from competency.competency cc
           cross join lateral (select id from competency.proficiency_level
                                where school_id = $1 and ordinal = 4 limit 1) pl
           cross join lateral (select id from core.school_stage where school_id = $1 limit 1) ss
          where cc.school_id = $1 and cc.key = 'mentoring'
          limit 1
         returning id`,
        [school, year],
      );
      expect(rows[0].id).toBeTruthy();
    });
  });

  it('configures an evidence requirement', async () => {
    await asUser(client, ADMIN, async (c) => {
      const { rows } = await c.query(
        `insert into evidence.requirement
           (school_id, academic_year_id, evidence_type_id, minimum_count, description,
            source_framework, source_alignment)
         select $1, $2, et.id, 2, 'Two lesson plans a term, showing planned differentiation.',
                'school', 'school_defined'
           from evidence.evidence_type et where et.school_id = $1 limit 1
         returning id`,
        [school, year],
      );
      expect(rows[0].id).toBeTruthy();
    });
  });
});

describeDb('kpi.manage and kpi.assign', () => {
  it('creates a KPI template and assigns it', async () => {
    await asUser(client, ADMIN, async (c) => {
      const { rows: tpl } = await c.query(
        `insert into kpi.template
           (school_id, category_id, key, name, description, metric, data_source,
            evidence_requirement, direction, frequency, source_framework, source_alignment, status)
         select $1, cat.id, 'audit_test_kpi', 'Audit test KPI',
                'Departmental training sessions delivered across the year.', 'Sessions delivered',
                'Departmental training log', 'Session plans and attendance records.',
                'increase', 'termly', 'school', 'school_defined', 'active'
           from kpi.category cat where cat.school_id = $1 limit 1
         returning id, category_id`,
        [school],
      );

      const { rows: assigned } = await c.query(
        `insert into kpi.teacher_kpi
           (school_id, teacher_profile_id, academic_year_id, template_id, category_id, name,
            description, metric, data_source, evidence_requirement, direction, frequency, target,
            weight, reviewer_user_id, status, source_framework, source_alignment, assigned_by, assigned_at)
         select $1, tp.id, $2, $3, $4, 'Audit test KPI',
                'Departmental training sessions delivered across the year.', 'Sessions delivered',
                'Departmental training log', 'Session plans and attendance records.',
                'increase', 'termly', '3', 1, $5, 'assigned', 'school', 'school_defined', $5, now()
           from core.teacher_profile tp
           join core.app_user u on u.id = tp.user_id
          where tp.school_id = $1 and u.email like 'neha%'
         returning id`,
        [school, year, tpl[0].id, tpl[0].category_id, ADMIN],
      );
      expect(assigned[0].id).toBeTruthy();
    });
  });

  it('refuses an assigned KPI with no reviewer', async () => {
    await asUser(client, ADMIN, async (c) => {
      await expect(
        c.query(
          `insert into kpi.teacher_kpi
             (school_id, teacher_profile_id, academic_year_id, category_id, name, description,
              metric, data_source, evidence_requirement, direction, frequency, target, weight,
              status, source_framework, source_alignment)
           select $1, tp.id, $2, cat.id, 'No reviewer', 'Has every required field but a reviewer.',
                  'X', 'Y', 'Z', 'increase', 'annual', '1', 1,
                  'assigned', 'school', 'school_defined'
             from core.teacher_profile tp, kpi.category cat
            where tp.school_id = $1 and cat.school_id = $1 limit 1`,
          [school, year],
        ),
      ).rejects.toThrow(/teacher_kpi_assigned_has_reviewer/);
    });
  });
});

describeDb('a teacher cannot configure any of it', () => {
  const CASES: [string, string][] = [
    [
      'framework',
      `insert into competency.framework (school_id, key, name, source_framework, source_alignment)
       values ($1, 'teacher_made_fw', 'Nope', 'school', 'school_defined')`,
    ],
    [
      'competency',
      `insert into competency.competency (school_id, domain_id, key, name, description, source_framework, source_alignment)
       select $1, d.id, 'teacher_made_comp', 'Nope', 'A description of adequate length for the rule.',
              'school', 'school_defined' from competency.domain d where d.school_id = $1 limit 1`,
    ],
    [
      'indicator',
      `insert into competency.indicator (school_id, competency_id, key, statement, source_framework, source_alignment)
       select $1, cc.id, 'teacher_made_ind', 'Does something observable in the classroom daily.',
              'school', 'school_defined' from competency.competency cc where cc.school_id = $1 limit 1`,
    ],
    [
      'proficiency level',
      `insert into competency.proficiency_level (school_id, scale_id, key, name, ordinal, descriptor)
       select $1, ps.id, 'teacher_made_level', 'Nope', 8, 'A descriptor of entirely adequate length here.'
         from competency.proficiency_scale ps where ps.school_id = $1 limit 1`,
    ],
    [
      'KPI template',
      `insert into kpi.template (school_id, category_id, key, name, description, metric, data_source, evidence_requirement, direction, frequency, source_framework, source_alignment)
       select $1, cat.id, 'teacher_made_kpi', 'Nope', 'A description of adequate length.', 'X', 'Log', 'Some evidence here.', 'increase', 'annual', 'school', 'school_defined'
         from kpi.category cat where cat.school_id = $1 limit 1`,
    ],
  ];

  for (const [what, sql] of CASES) {
    it(`refuses a teacher creating a ${what}`, async () => {
      await asUser(client, DEMO_USERS.neha, async (c) => {
        await expect(c.query(sql, [school])).rejects.toThrow(/row-level security/i);
      });
    });
  }

  it('refuses a teacher setting their own target', async () => {
    await asUser(client, DEMO_USERS.neha, async (c) => {
      await expect(
        c.query(
          `insert into competency.competency_target
             (school_id, academic_year_id, competency_id, target_level_id, rationale,
              source_framework, source_alignment)
           select $1, $2, cc.id, pl.id, 'Setting my own expectations, which must not be allowed.',
                  'school', 'school_defined'
             from competency.competency cc
             cross join lateral (select id from competency.proficiency_level where school_id = $1 limit 1) pl
            where cc.school_id = $1 limit 1`,
          [school, year],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});
