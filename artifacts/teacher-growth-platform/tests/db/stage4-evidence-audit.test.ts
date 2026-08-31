/**
 * Migration 0039: two defects found by auditing the stage briefs line by line.
 *
 * Both are the kind that produce a confidently wrong answer rather than an
 * error, so the tests here assert the *negative* — what must NOT be counted,
 * and what must NOT be missing from the trail.
 */

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  connect,
  currentYearId,
  databaseAvailable,
  DEMO_USERS,
  schoolId,
  teacherProfileId,
} from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

let client: Client;
let school: string;
let year: string;
let neha: string;

beforeAll(async () => {
  if (!available) return;
  client = await connect();
  school = await schoolId(client);
  year = await currentYearId(client);
  neha = await teacherProfileId(client, DEMO_USERS.neha);
});
afterAll(async () => {
  if (available && client) await client.end();
});

/** Inserts a CPD record at the given status and maps it to a standard. */
async function mapCpdAt(status: string, code: string) {
  await client.query(
    `insert into compliance.cpd_record
       (school_id, teacher_profile_id, academic_year_id, title, source_type_id, provider_name,
        category_id, source_class, activity_from, activity_to, duration_hours, claimed_hours, status)
     select $1, $2, $3, 'Mapped at ' || $4, st.id, 'Provider', cat.id, 'school_or_complex',
            date '2026-10-05', date '2026-10-05', 3, 3, $4::compliance.cpd_record_status
       from compliance.cpd_source_type st, compliance.cpd_category cat
      where st.school_id = $1 and st.key = 'school_inhouse'
        and cat.school_id = $1 and cat.key = 'knowledge_practice'`,
    [school, neha, year, status],
  );
  await client.query(
    `insert into sqaaf.evidence_map (school_id, standard_id, self_assessment_id, cpd_record_id, note)
     select sa.school_id, s.id, sa.id, r.id, 'test mapping'
       from sqaaf.self_assessment sa, sqaaf.standard s, compliance.cpd_record r
      where s.school_id = $1 and s.code = $2 and r.title = 'Mapped at ' || $3`,
    [school, code, status],
  );
}

async function readiness(domainNumber: number) {
  const { rows } = await client.query(
    `select * from sqaaf.evidence_readiness where domain_number = $1`,
    [domainNumber],
  );
  return rows[0];
}

describeDb('SQAAF readiness counts only verified evidence', () => {
  it('a draft CPD record does not make a standard read as evidenced', async () => {
    await client.query('begin');
    try {
      const before = await readiness(6);
      expect(Number(before.standards_with_verified_evidence)).toBe(0);

      await mapCpdAt('draft', '6.1.1');

      const after = await readiness(6);
      // Visible as mapped...
      expect(Number(after.standards_with_evidence)).toBe(1);
      // ...but not as evidence.
      expect(Number(after.standards_with_verified_evidence)).toBe(0);
      expect(Number(after.standards_with_unverified_evidence_only)).toBe(1);
      // And the actionable number is unmoved: the work is still outstanding.
      expect(Number(after.platform_relevant_without_evidence)).toBe(
        Number(before.platform_relevant_without_evidence),
      );
    } finally {
      await client.query('rollback');
    }
  });

  it('a submitted-but-unreviewed record is equally not evidence', async () => {
    await client.query('begin');
    try {
      await mapCpdAt('submitted', '6.1.1');
      const after = await readiness(6);
      expect(Number(after.standards_with_verified_evidence)).toBe(0);
      expect(Number(after.standards_with_unverified_evidence_only)).toBe(1);
    } finally {
      await client.query('rollback');
    }
  });

  it('verifying the record is what makes it count', async () => {
    await client.query('begin');
    try {
      await mapCpdAt('submitted', '6.1.1');
      expect(Number((await readiness(6)).standards_with_verified_evidence)).toBe(0);

      await client.query(
        `update compliance.cpd_record
            set status = 'verified', credited_hours = claimed_hours,
                reviewed_by = $1, reviewed_at = now()
          where title = 'Mapped at submitted'`,
        [DEMO_USERS.vikram],
      );

      const after = await readiness(6);
      expect(Number(after.standards_with_verified_evidence)).toBe(1);
      expect(Number(after.standards_with_unverified_evidence_only)).toBe(0);
      expect(Number(after.platform_relevant_without_evidence)).toBe(1);
    } finally {
      await client.query('rollback');
    }
  });

  it('resolves status per record kind, and never stores it on the mapping', async () => {
    const { rows: cols } = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'sqaaf' and table_name = 'evidence_map' and column_name ~ 'status'`,
    );
    expect(cols, 'status must be derived, not stored').toEqual([]);

    const { rows } = await client.query(
      `select kind, evidence_status, is_verified from sqaaf.evidence_map_detail order by standard_code`,
    );
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(['cpd_record', 'verified_competency']).toContain(r.kind);
      expect(r.is_verified, `${r.kind} ${r.evidence_status}`).toBe(true);
    }
  });

  it('an aggregate note is honest evidence but is never verified', async () => {
    await client.query('begin');
    try {
      await client.query(
        `insert into sqaaf.evidence_map (school_id, standard_id, self_assessment_id, aggregate_note)
         select sa.school_id, s.id, sa.id,
                'Across the school, every department ran a moderation session this term.'
           from sqaaf.self_assessment sa, sqaaf.standard s
          where s.school_id = $1 and s.code = '6.2.1'`,
        [school],
      );
      const { rows } = await client.query(
        `select kind, evidence_status, is_verified from sqaaf.evidence_map_detail
          where standard_code = '6.2.1'`,
      );
      expect(rows[0].kind).toBe('aggregate_note');
      expect(rows[0].evidence_status).toBe('asserted');
      expect(rows[0].is_verified).toBe(false);
    } finally {
      await client.query('rollback');
    }
  });
});

describeDb('Stage 4 high-impact actions reach the audit log', () => {
  const AUDITED = [
    'compliance.cpd_record',
    'compliance.cpd_requirement_version',
    'compliance.cpd_requirement_allocation',
    'compliance.cpd_year_requirement',
    'compliance.cpd_activity_rule',
    'compliance.cpd_source_type',
    'sqaaf.self_assessment',
    'sqaaf.standard_rating',
    'sqaaf.evidence_gap',
    'sqaaf.improvement_action',
  ];

  it('every decision-bearing table carries the audit trigger', async () => {
    const { rows } = await client.query(
      `select c.relnamespace::regnamespace::text || '.' || c.relname as tbl
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_proc p on p.oid = t.tgfoid
        where not t.tgisinternal and p.pronamespace = 'audit'::regnamespace
          and c.relnamespace::regnamespace::text in ('compliance', 'sqaaf')`,
    );
    expect(rows.map((r) => r.tbl).sort()).toEqual([...AUDITED].sort());
  });

  it('the seeded CPD and SQAAF work is already on the trail', async () => {
    const { rows } = await client.query(
      `select entity_schema || '.' || entity_table as tbl, count(*)::int as n
         from audit.audit_log where entity_schema in ('compliance', 'sqaaf')
        group by 1`,
    );
    const seen = Object.fromEntries(rows.map((r) => [r.tbl, r.n]));
    for (const table of AUDITED) {
      expect(seen[table], `${table} has no audit entries`).toBeGreaterThan(0);
    }
  });

  it('verifying CPD hours records the before and after values', async () => {
    const { rows } = await client.query(
      `select previous_value ->> 'status' as was,
              new_value ->> 'status' as now,
              new_value ->> 'credited_hours' as credited,
              action
         from audit.audit_log
        where entity_table = 'cpd_record' and new_value ->> 'status' = 'verified'
        limit 1`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].was).toBe('submitted');
    expect(rows[0].now).toBe('verified');
    expect(Number(rows[0].credited)).toBeGreaterThan(0);
    expect(rows[0].action).toBe('cpd_record.update');
  });

  it('binding a year to a requirement version is audited', async () => {
    const { rows } = await client.query(
      `select new_value ->> 'academic_year_id' as year_id
         from audit.audit_log where entity_table = 'cpd_year_requirement'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].year_id).toBe(year);
  });

  it('the audit log stays append-only', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(`update audit.audit_log set action = 'tampered'`),
      ).rejects.toThrow();
    } finally {
      await client.query('rollback');
    }
  });
});
