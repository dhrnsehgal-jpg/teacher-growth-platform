/**
 * Stage 4: CPD compliance and SQAAF.
 *
 * The load-bearing assertions here are the ones about *not* counting: hours
 * that must not multiply, sources that must not count until classified, caps
 * that must bite, and a rule change that must not reach back into a year it did
 * not govern. Those are the failures that would make a compliance report
 * confidently wrong rather than visibly broken.
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

async function progress(dimension: string, key?: string) {
  const { rows } = await client.query(
    `select * from compliance.cpd_progress($1, $2) where dimension = $3
       and ($4::text is null or item_key = $4)`,
    [neha, year, dimension, key ?? null],
  );
  return rows;
}

describeDb('CPD ledger: the headline figures', () => {
  it('totals 38 of 50 hours for the demo teacher', async () => {
    const [total] = await progress('total');
    expect(Number(total.required_hours)).toBe(50);
    expect(Number(total.completed_hours)).toBe(38);
    expect(Number(total.remaining_hours)).toBe(12);
  });

  it('splits by source: 18 of 25 board-side, 20 of 25 school-side', async () => {
    const rows = await progress('source_class');
    const board = rows.find((r) => r.item_key === 'board_or_government');
    const schoolSide = rows.find((r) => r.item_key === 'school_or_complex');
    expect([Number(board.completed_hours), Number(board.required_hours)]).toEqual([18, 25]);
    expect([Number(schoolSide.completed_hours), Number(schoolSide.required_hours)]).toEqual([
      20, 25,
    ]);
  });

  it('splits by NPST-aligned category: 10/12, 18/24, 10/14', async () => {
    const rows = await progress('category');
    const byKey = Object.fromEntries(
      rows.map((r) => [r.item_key, [Number(r.completed_hours), Number(r.required_hours)]]),
    );
    expect(byKey.core_values_ethics).toEqual([10, 12]);
    expect(byKey.knowledge_practice).toEqual([18, 24]);
    expect(byKey.professional_growth).toEqual([10, 14]);
  });

  it('the source split and the category split describe the same hours', async () => {
    // Both are SUMs over one allocation matrix, so they cannot disagree unless
    // the matrix itself is broken. Asserting it catches a bad seed immediately.
    const src = await progress('source_class');
    const cat = await progress('category');
    const sum = (rows: Record<string, unknown>[], field: string) =>
      rows.reduce((t, r) => t + Number(r[field]), 0);
    expect(sum(src, 'completed_hours')).toBe(sum(cat, 'completed_hours'));
    expect(sum(src, 'required_hours')).toBe(sum(cat, 'required_hours'));
  });

  it('records the engine version on every row', async () => {
    const { rows } = await client.query(`select * from compliance.cpd_progress($1, $2)`, [
      neha,
      year,
    ]);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.engine_version).toBe('cpd-ledger-v1');
  });
});

describeDb('duplicate-hour prevention', () => {
  it('one record mapped to four competencies still counts once', async () => {
    const { rows } = await client.query(
      `select r.credited_hours,
              (select count(*) from compliance.cpd_record_competency rc where rc.cpd_record_id = r.id) as links
         from compliance.cpd_record r
        where r.teacher_profile_id = $1 and r.title like 'Competency Based Assessment%'`,
      [neha],
    );
    expect(Number(rows[0].links)).toBe(4);
    expect(Number(rows[0].credited_hours)).toBe(12);

    // The naive join — the mistake this schema exists to prevent — would give 48
    // for this record alone and 74 across the year.
    const { rows: naive } = await client.query(
      `select coalesce(sum(r.credited_hours), 0) as inflated
         from compliance.cpd_record r
         join compliance.cpd_record_competency rc on rc.cpd_record_id = r.id
        where r.teacher_profile_id = $1 and r.status = 'verified'`,
      [neha],
    );
    expect(Number(naive[0].inflated)).toBeGreaterThan(38);

    const [total] = await progress('total');
    expect(Number(total.completed_hours)).toBe(38);
  });

  it('adding another competency link does not change the ledger', async () => {
    await client.query('begin');
    try {
      await client.query(
        `insert into compliance.cpd_record_competency (school_id, cpd_record_id, competency_id)
         select $1, r.id, c.id
           from compliance.cpd_record r
           cross join competency.competency c
          where r.teacher_profile_id = $2 and r.title like 'Competency Based Assessment%'
            and c.school_id = $1 and c.key = 'inclusive_education'
          limit 1`,
        [school, neha],
      );
      const [total] = await progress('total');
      expect(Number(total.completed_hours)).toBe(38);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses the same catalogue activity claimed twice on the same date', async () => {
    await client.query('begin');
    try {
      const insert = `
        insert into compliance.cpd_record
          (school_id, teacher_profile_id, academic_year_id, title, source_type_id, provider_name,
           category_id, source_class, cpd_activity_id, activity_from, activity_to,
           duration_hours, claimed_hours, status)
        select $1, $2, $3, 'Duplicate claim', st.id, 'Provider', cat.id, 'school_or_complex',
               a.id, date '2026-09-01', date '2026-09-01', 3, 3, 'draft'
          from compliance.cpd_source_type st, compliance.cpd_category cat, cpd.activity a
         where st.school_id = $1 and st.key = 'school_inhouse'
           and cat.school_id = $1 and cat.key = 'knowledge_practice'
           and a.school_id = $1
         limit 1`;
      await client.query(insert, [school, neha, year]);
      await expect(client.query(insert, [school, neha, year])).rejects.toThrow(
        /cpd_record_no_repeat_activity|duplicate key/i,
      );
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses a claim that exceeds credible attendance on overlapping days', async () => {
    // Neha already has 12 hours across 2026-07-06..07. Sixteen is the ceiling
    // for two days, so another 6 hours on those dates is not possible.
    await client.query('begin');
    try {
      await expect(
        client.query(
          `insert into compliance.cpd_record
             (school_id, teacher_profile_id, academic_year_id, title, source_type_id, provider_name,
              category_id, source_class, activity_from, activity_to, duration_hours, claimed_hours, status)
           select $1, $2, $3, 'Impossible overlap', st.id, 'Provider', cat.id, 'school_or_complex',
                  date '2026-07-06', date '2026-07-07', 6, 6, 'draft'
             from compliance.cpd_source_type st, compliance.cpd_category cat
            where st.school_id = $1 and st.key = 'school_inhouse'
              and cat.school_id = $1 and cat.key = 'knowledge_practice'`,
          [school, neha, year],
        ),
      ).rejects.toThrow(/credible attendance/i);
    } finally {
      await client.query('rollback');
    }
  });
});

describeDb('activity rules and caps', () => {
  it('every verified hour credit cites a clause', async () => {
    const { rows } = await client.query(
      `select key, regulatory_source_id, clause_reference
         from compliance.cpd_activity_rule
        where verification_status = 'verified'`,
    );
    expect(rows.length).toBe(7);
    for (const r of rows) {
      expect(r.regulatory_source_id, r.key).not.toBeNull();
      expect(r.clause_reference, r.key).toContain('TRG-02/2025');
    }
  });

  it('refuses a verified rule with no source — an invented hour credit', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `insert into compliance.cpd_activity_rule
             (school_id, version_id, key, permitted_activity, hour_credit, category_id,
              source_class, required_evidence, approval_permission, verification_status)
           select $1, v.id, 'invented_rule', 'Something we made up', 40, c.id,
                  'school_or_complex', 'A certificate of some kind', 'cpd.approve', 'verified'
             from compliance.cpd_requirement_version v, compliance.cpd_category c
            where v.school_id = $1 and v.key = 'cbse.cpd'
              and c.school_id = $1 and c.key = 'professional_growth'`,
          [school],
        ),
      ).rejects.toThrow(/cpd_activity_rule_verified_needs_source/);
    } finally {
      await client.query('rollback');
    }
  });

  it('applies the shared 11-hour cap across academic tasks', async () => {
    await client.query('begin');
    try {
      // Neha has 8 of the 11 capped hours. Adding two more 6-hour rule claims
      // would be 20 without the cap; the cap should hold the total at 11.
      await client.query(
        `insert into compliance.cpd_record
           (school_id, teacher_profile_id, academic_year_id, title, source_type_id, provider_name,
            category_id, source_class, activity_from, activity_to, duration_hours,
            hour_basis, activity_rule_id, claimed_hours, status)
         select $1, $2, $3, 'Extra examiner duty ' || g, st.id, 'CBSE', cat.id, 'school_or_complex',
                (date '2026-10-01' + (g * 20)), (date '2026-10-01' + (g * 20)), 6,
                'activity_rule', ar.id, 6, 'draft'
           from generate_series(1, 2) g,
                compliance.cpd_source_type st, compliance.cpd_category cat,
                compliance.cpd_activity_rule ar, compliance.cpd_requirement_version v
          where st.school_id = $1 and st.key = 'school_inhouse'
            and cat.school_id = $1 and cat.key = 'professional_growth'
            and v.school_id = $1 and v.key = 'cbse.cpd'
            and ar.version_id = v.id and ar.key = 'board_exam_evaluation'`,
        [school, neha, year],
      );
      await client.query(
        `update compliance.cpd_record set status = 'submitted' where title like 'Extra examiner duty%'`,
      );
      await client.query(
        `update compliance.cpd_record
            set status = 'verified', credited_hours = claimed_hours,
                reviewed_by = $1, reviewed_at = now()
          where title like 'Extra examiner duty%'`,
        [DEMO_USERS.vikram],
      );

      const { rows } = await client.query(
        `select coalesce(sum(effective_hours), 0) as capped,
                coalesce(sum(ch.claimed_hours), 0) as uncapped
           from compliance.credited_hours($1, $2) ch
           join compliance.cpd_record r on r.id = ch.cpd_record_id
          where r.hour_basis = 'activity_rule'`,
        [neha, year],
      );
      expect(Number(rows[0].uncapped)).toBe(20); // 6 + 2 + 6 + 6
      expect(Number(rows[0].capped)).toBe(11); // CBSE's ceiling
    } finally {
      await client.query('rollback');
    }
  });
});

describeDb('source classification', () => {
  it('DIKSHA and SWAYAM do not count until someone classifies them', async () => {
    const { rows } = await client.query(
      `select key, counts_toward_requirement, classified_by
         from compliance.cpd_source_type
        where school_id = $1 and key in ('diksha', 'swayam', 'recognised_institution', 'other_approved')`,
      [school],
    );
    expect(rows.length).toBe(4);
    for (const r of rows) {
      expect(r.counts_toward_requirement, r.key).toBe(false);
      expect(r.classified_by, r.key).toBeNull();
    }
  });

  it('a source cannot be marked as counting without recorded authorisation', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `update compliance.cpd_source_type set counts_toward_requirement = true
            where school_id = $1 and key = 'diksha'`,
          [school],
        ),
      ).rejects.toThrow(/cpd_source_type_counting_needs_classification/);
    } finally {
      await client.query('rollback');
    }
  });

  it('the sources CBSE names are classified, with a note', async () => {
    const { rows } = await client.query(
      `select key, classification_note from compliance.cpd_source_type
        where school_id = $1 and counts_toward_requirement`,
      [school],
    );
    expect(rows.map((r) => r.key).sort()).toEqual(
      ['cbse', 'cbse_coe', 'government_training', 'school_complex', 'school_inhouse'].sort(),
    );
    for (const r of rows) expect((r.classification_note ?? '').length).toBeGreaterThan(10);
  });
});

describeDb('regulatory version control', () => {
  it('the allocation matrix must sum to the declared total', async () => {
    await client.query('begin');
    try {
      await expect(
        (async () => {
          await client.query(
            `update compliance.cpd_requirement_allocation set required_hours = required_hours + 5
              where version_id = (select id from compliance.cpd_requirement_version
                                   where school_id = $1 and key = 'cbse.cpd')
              and source_class = 'board_or_government'`,
            [school],
          );
          await client.query('commit');
        })(),
      ).rejects.toThrow(/does not balance/);
    } finally {
      await client.query('rollback').catch(() => undefined);
    }
  });

  it('a superseding version governs only its own effective period', async () => {
    await client.query('begin');
    try {
      // A hypothetical 2028 revision raising the requirement to 60 hours.
      await client.query(
        `insert into compliance.cpd_requirement_version
           (school_id, key, version, source_id, requirement_id, title, total_hours,
            classification, verification_status, effective_from)
         select $1, 'cbse.cpd', 2, v.source_id, v.requirement_id,
                'CBSE CPD requirement, hypothetical 2028 scheme', 60,
                'mandatory', 'verified', date '2028-04-01'
           from compliance.cpd_requirement_version v
          where v.school_id = $1 and v.key = 'cbse.cpd' and v.version = 1`,
        [school],
      );
      await client.query(
        `insert into compliance.cpd_requirement_allocation
           (school_id, version_id, category_id, source_class, required_hours)
         select $1, v2.id, a.category_id, a.source_class,
                a.required_hours + case when a.source_class = 'board_or_government' then 2 else 0 end
           from compliance.cpd_requirement_allocation a
           join compliance.cpd_requirement_version v1 on v1.id = a.version_id and v1.version = 1
           join compliance.cpd_requirement_version v2 on v2.school_id = v1.school_id
                and v2.key = v1.key and v2.version = 2
          where v1.school_id = $1`,
        [school],
      );
      await client.query(
        `update compliance.cpd_requirement_version set effective_to = date '2028-03-31'
          where school_id = $1 and key = 'cbse.cpd' and version = 1`,
        [school],
      );

      // The current year is still bound to version 1 and must not move.
      const [total] = await progress('total');
      expect(Number(total.required_hours)).toBe(50);

      // A later year resolves to version 2.
      const { rows: future } = await client.query(
        `insert into core.academic_year (school_id, label, starts_on, ends_on)
         values ($1, '2028-29', date '2028-04-01', date '2029-03-31') returning id`,
        [school],
      );
      const { rows: resolved } = await client.query(
        `select total_hours, version from compliance.requirement_version_for_year($1, $2)`,
        [school, future[0].id],
      );
      expect(Number(resolved[0].total_hours)).toBe(60);
      expect(Number(resolved[0].version)).toBe(2);
    } finally {
      await client.query('rollback');
    }
  });

  it('a locked year cannot be rebound to a different rule version', async () => {
    await client.query('begin');
    try {
      await client.query(`update core.academic_year set locked_at = now() where id = $1`, [year]);
      await client.query(
        `insert into compliance.cpd_requirement_version
           (school_id, key, version, source_id, requirement_id, title, total_hours,
            classification, verification_status, effective_from)
         select $1, 'cbse.cpd', 3, v.source_id, v.requirement_id, 'Another scheme', 50,
                'mandatory', 'verified', date '2020-04-01'
           from compliance.cpd_requirement_version v
          where v.school_id = $1 and v.key = 'cbse.cpd' and v.version = 1`,
        [school],
      );
      await expect(
        client.query(
          `update compliance.cpd_year_requirement
              set version_id = (select id from compliance.cpd_requirement_version
                                 where school_id = $1 and key = 'cbse.cpd' and version = 3)
            where school_id = $1 and academic_year_id = $2`,
          [school, year],
        ),
      ).rejects.toThrow(/locked/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('records which rule version each CPD record was judged under', async () => {
    const { rows } = await client.query(
      `select count(*) filter (where requirement_version_id is null) as unbound, count(*) as total
         from compliance.cpd_record where teacher_profile_id = $1`,
      [neha],
    );
    expect(Number(rows[0].total)).toBeGreaterThan(0);
    expect(Number(rows[0].unbound)).toBe(0);
  });
});

describeDb('CPD record lifecycle', () => {
  it('a record cannot be created already verified', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `insert into compliance.cpd_record
             (school_id, teacher_profile_id, academic_year_id, title, source_type_id, provider_name,
              category_id, source_class, activity_from, activity_to, duration_hours,
              claimed_hours, credited_hours, status, reviewed_by, reviewed_at)
           select $1, $2, $3, 'Straight to verified', st.id, 'Provider', cat.id, 'school_or_complex',
                  date '2026-09-20', date '2026-09-20', 4, 4, 4, 'verified', $4, now()
             from compliance.cpd_source_type st, compliance.cpd_category cat
            where st.school_id = $1 and st.key = 'school_inhouse'
              and cat.school_id = $1 and cat.key = 'knowledge_practice'`,
          [school, neha, year, DEMO_USERS.vikram],
        ),
      ).rejects.toThrow(/cannot move from \(new\) to verified/);
    } finally {
      await client.query('rollback');
    }
  });

  it('credited hours cannot exceed the hours claimed', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `update compliance.cpd_record set credited_hours = claimed_hours + 5
            where teacher_profile_id = $1 and status = 'verified'`,
          [neha],
        ),
      ).rejects.toThrow(/cpd_record_credit_within_claim/);
    } finally {
      await client.query('rollback');
    }
  });

  it('losing verification loses the credit', async () => {
    await client.query('begin');
    try {
      const { rows } = await client.query(
        `select id from compliance.cpd_record where teacher_profile_id = $1 and status = 'verified' limit 1`,
        [neha],
      );
      // verified is terminal, so this proves the guard rather than a workflow.
      await expect(
        client.query(`update compliance.cpd_record set status = 'draft' where id = $1`, [
          rows[0].id,
        ]),
      ).rejects.toThrow(/cannot move from verified to draft/);
    } finally {
      await client.query('rollback');
    }
  });

  it('every status change is on the append-only trail', async () => {
    const { rows } = await client.query(
      `select to_status, count(*) as n from compliance.cpd_record_status_history
        group by to_status order by to_status`,
    );
    const byStatus = Object.fromEntries(rows.map((r) => [r.to_status, Number(r.n)]));
    expect(byStatus.submitted).toBeGreaterThanOrEqual(7);
    expect(byStatus.verified).toBeGreaterThanOrEqual(7);
  });

  it('the trail cannot be rewritten', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(`update compliance.cpd_record_status_history set to_status = 'draft'`),
      ).rejects.toThrow(/append-only/);
    } finally {
      await client.query('rollback');
    }
  });
});
