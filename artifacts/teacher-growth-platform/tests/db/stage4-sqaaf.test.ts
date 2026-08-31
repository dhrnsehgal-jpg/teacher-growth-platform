/**
 * Stage 4: SQAAF structure, evidence mapping, improvement workflow and access.
 *
 * The structural assertions double as a transcription check. The framework
 * document states 84 standards and 336 marks independently of the per-domain
 * table; if the transcription had dropped or duplicated a standard, the totals
 * would stop agreeing and these tests would say so.
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

describeDb('SQAAF framework structure', () => {
  it('holds 7 domains, 48 sub-domains and 84 standards', async () => {
    const { rows } = await client.query(
      `select (select count(*) from sqaaf.domain) as domains,
              (select count(*) from sqaaf.sub_domain) as sub_domains,
              (select count(*) from sqaaf.standard) as standards`,
    );
    expect(Number(rows[0].domains)).toBe(7);
    expect(Number(rows[0].sub_domains)).toBe(48);
    expect(Number(rows[0].standards)).toBe(84);
  });

  it('the per-domain counts and scores agree with the framework totals', async () => {
    const { rows } = await client.query(
      `select sum(standard_count) as standards, sum(max_score) as marks,
              sum(weightage_percent) as weightage from sqaaf.domain`,
    );
    expect(Number(rows[0].standards)).toBe(84);
    expect(Number(rows[0].marks)).toBe(336);
    expect(Number(rows[0].weightage)).toBe(100);
  });

  it('each domain declares as many standards as it actually has', async () => {
    const { rows } = await client.query(
      `select d.domain_number, d.name, d.standard_count, count(s.id) as actual
         from sqaaf.domain d
         join sqaaf.sub_domain sd on sd.domain_id = d.id
         join sqaaf.standard s on s.sub_domain_id = sd.id
        group by d.id, d.domain_number, d.name, d.standard_count
        order by d.domain_number`,
    );
    expect(rows.length).toBe(7);
    for (const r of rows) {
      expect(Number(r.actual), `domain ${r.domain_number} ${r.name}`).toBe(
        Number(r.standard_count),
      );
    }
  });

  it('max_score is the standard count times the top level score', async () => {
    const { rows } = await client.query(
      `select d.domain_number, d.max_score, d.standard_count, fv.max_level_score
         from sqaaf.domain d join sqaaf.framework_version fv on fv.id = d.version_id`,
    );
    for (const r of rows) {
      expect(Number(r.max_score), `domain ${r.domain_number}`).toBe(
        Number(r.standard_count) * Number(r.max_level_score),
      );
    }
  });

  it('Curriculum, Pedagogy and Assessment carries 40% and the rest 10% each', async () => {
    const { rows } = await client.query(
      `select domain_number, weightage_percent from sqaaf.domain order by domain_number`,
    );
    expect(Number(rows[0].weightage_percent)).toBe(40);
    for (const r of rows.slice(1)) expect(Number(r.weightage_percent)).toBe(10);
  });

  it('records the four verified performance levels', async () => {
    const { rows } = await client.query(
      `select level_number, roman_label, display_name, score
         from sqaaf.performance_level order by level_number`,
    );
    expect(rows.map((r) => `${r.roman_label} ${r.display_name} ${Number(r.score)}`)).toEqual([
      'I Inceptive 1',
      'II Transient 2',
      'III Stable 3',
      'IV Dynamic Evolving 4',
    ]);
  });

  it('marks the three domains this platform cannot evidence as not covered', async () => {
    const { rows } = await client.query(
      `select domain_number, name, platform_coverage from sqaaf.domain
        where platform_coverage = 'none' order by domain_number`,
    );
    expect(rows.map((r) => Number(r.domain_number))).toEqual([2, 5, 7]);
    // Not covered must be an explicit statement, not silence.
    for (const r of rows) {
      const { rows: note } = await client.query(
        `select coverage_note from sqaaf.domain where domain_number = $1`,
        [r.domain_number],
      );
      expect((note[0].coverage_note ?? '').length).toBeGreaterThan(30);
    }
  });

  it('no standard in an uncovered domain claims to be platform-relevant', async () => {
    const { rows } = await client.query(
      `select s.code from sqaaf.standard s
         join sqaaf.sub_domain sd on sd.id = s.sub_domain_id
         join sqaaf.domain d on d.id = sd.domain_id
        where d.platform_coverage = 'none' and s.platform_relevant`,
    );
    expect(rows).toEqual([]);
  });

  it('every platform-relevant standard says what evidence supports it', async () => {
    const { rows } = await client.query(
      `select code, relevance_note from sqaaf.standard where platform_relevant`,
    );
    expect(rows.length).toBe(18);
    for (const r of rows) expect((r.relevance_note ?? '').length, r.code).toBeGreaterThan(20);
  });

  it('standard text is immutable — a revision is a new framework version', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(`update sqaaf.standard set statement = 'Rewritten' where code = '3.1.4'`),
      ).rejects.toThrow(/immutable/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('marks hostel and canteen standards as conditional', async () => {
    const { rows } = await client.query(
      `select applies_when, count(*) as n from sqaaf.standard
        where applies_when <> 'always' group by applies_when order by applies_when`,
    );
    const byKind = Object.fromEntries(rows.map((r) => [r.applies_when, Number(r.n)]));
    expect(byKind.residential_only).toBe(5);
    expect(byKind.day_school_canteen_only).toBe(1);
  });
});

describeDb('SQAAF as a regulatory requirement', () => {
  it('records annual self-assessment as mandatory and verified', async () => {
    const { rows } = await client.query(
      `select classification, verification_status, requirement_text
         from regulatory.requirement where requirement_key = 'cbse.sqaaf.annual_self_assessment'`,
    );
    expect(rows[0].classification).toBe('mandatory');
    expect(rows[0].verification_status).toBe('verified');
    expect(rows[0].requirement_text).toMatch(/every year/i);
  });

  it('is not enforced, because the school affiliation is unverified', async () => {
    const { rows } = await client.query(
      `select r.requirement_key, srs.applicability, srs.is_enforced,
              regulatory.is_enforceable_for_school($1, r.requirement_key) as enforceable
         from regulatory.requirement r
         join regulatory.school_requirement_status srs on srs.requirement_id = r.id
        where r.requirement_key like 'cbse.sqaaf.%' and srs.school_id = $1`,
      [school],
    );
    // Three: the two this stage added, plus Stage 1's `cbse.sqaaf.domains`,
    // which is a different and still-accurate claim and shares the same gate.
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.applicability, r.requirement_key).toBe('potentially_applicable');
      expect(r.is_enforced, r.requirement_key).toBe(false);
      expect(r.enforceable, r.requirement_key).toBe(false);
    }
  });

  it('leaves the submission window unverified rather than inventing dates', async () => {
    const { rows } = await client.query(
      `select opens_on, closes_on, verification_status, source_note
         from sqaaf.submission_window where academic_year_id = $1`,
      [year],
    );
    expect(rows[0].verification_status).toBe('requires_verification');
    expect(rows[0].opens_on).toBeNull();
    expect(rows[0].closes_on).toBeNull();
    expect((rows[0].source_note ?? '').length).toBeGreaterThan(20);
  });

  it('a verified window must carry dates and a source', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `update sqaaf.submission_window set verification_status = 'verified'
            where academic_year_id = $1`,
          [year],
        ),
      ).rejects.toThrow(/sqaaf_window_verified_complete/);
    } finally {
      await client.query('rollback');
    }
  });
});

describeDb('evidence mapping', () => {
  it('links teacher evidence through to a SQAAF standard without copying it', async () => {
    const { rows } = await client.query(
      `select s.code, m.cpd_record_id, m.verified_competency_id
         from sqaaf.evidence_map m join sqaaf.standard s on s.id = m.standard_id
        order by s.code`,
    );
    expect(rows.length).toBe(3);
    // 3.1.4 is evidenced by the CPD record; the standard's own evidence list in
    // the framework asks for an annual training calendar per teacher.
    const cpdMapped = rows.filter((r) => r.cpd_record_id);
    expect(cpdMapped.map((r) => r.code).sort()).toEqual(['1.6.2', '3.1.4']);
  });

  it('one CPD record can evidence several standards', async () => {
    const { rows } = await client.query(
      `select count(distinct standard_id) as standards, count(distinct cpd_record_id) as records
         from sqaaf.evidence_map where cpd_record_id is not null`,
    );
    expect(Number(rows[0].standards)).toBe(2);
    expect(Number(rows[0].records)).toBe(1);
  });

  it('mapping to SQAAF does not change the CPD hours', async () => {
    const { rows } = await client.query(
      `select r.credited_hours from compliance.cpd_record r
         join sqaaf.evidence_map m on m.cpd_record_id = r.id limit 1`,
    );
    expect(Number(rows[0].credited_hours)).toBe(12);
  });

  it('refuses a map row with two targets, or none', async () => {
    await client.query('begin');
    try {
      for (const [a, b] of [
        ['evidence_id', 'cpd_record_id'],
        [null, null],
      ] as [string | null, string | null][]) {
        const cols = a && b ? `, ${a}, ${b}` : '';
        const vals = a && b ? `, gen_random_uuid(), gen_random_uuid()` : '';
        await expect(
          client.query(
            `insert into sqaaf.evidence_map (school_id, standard_id, self_assessment_id${cols})
             select $1, s.id, sa.id${vals}
               from sqaaf.standard s, sqaaf.self_assessment sa
              where s.code = '6.1.1' and sa.school_id = $1 limit 1`,
            [school],
          ),
        ).rejects.toThrow();
      }
    } finally {
      await client.query('rollback');
    }
  });

  it('the same record cannot be mapped to the same standard twice', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `insert into sqaaf.evidence_map (school_id, standard_id, self_assessment_id, cpd_record_id)
           select m.school_id, m.standard_id, m.self_assessment_id, m.cpd_record_id
             from sqaaf.evidence_map m where m.cpd_record_id is not null limit 1`,
        ),
      ).rejects.toThrow(/duplicate key/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('readiness counts what the platform could evidence but has not', async () => {
    const { rows } = await client.query(
      `select domain_number, standards_platform_relevant, standards_with_evidence,
              platform_relevant_without_evidence
         from sqaaf.evidence_readiness where platform_coverage <> 'none' order by domain_number`,
    );
    for (const r of rows) {
      expect(
        Number(r.platform_relevant_without_evidence),
        `domain ${r.domain_number}`,
      ).toBeLessThanOrEqual(Number(r.standards_platform_relevant));
    }
    const hr = rows.find((r) => Number(r.domain_number) === 3);
    expect(Number(hr.standards_with_evidence)).toBeGreaterThan(0);
  });
});

describeDb('SQAAF improvement workflow', () => {
  it('a rating needs a rationale of substance', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `insert into sqaaf.standard_rating
             (school_id, self_assessment_id, standard_id, level_id, rationale)
           select $1, sa.id, s.id, pl.id, 'fine'
             from sqaaf.self_assessment sa, sqaaf.standard s, sqaaf.performance_level pl
            where sa.school_id = $1 and s.code = '6.1.1' and pl.level_number = 3 limit 1`,
          [school],
        ),
      ).rejects.toThrow(/rationale/);
    } finally {
      await client.query('rollback');
    }
  });

  it('follows the state machine and refuses to skip review', async () => {
    await client.query('begin');
    try {
      const { rows } = await client.query(
        `select id, status from sqaaf.improvement_action limit 1`,
      );
      expect(rows[0].status).toBe('approved');
      await expect(
        client.query(`update sqaaf.improvement_action set status = 'completed' where id = $1`, [
          rows[0].id,
        ]),
      ).rejects.toThrow(/cannot move from approved to completed/);
    } finally {
      await client.query('rollback');
    }
  });

  it('runs the full loop to completion, and completion needs a reviewer', async () => {
    await client.query('begin');
    try {
      const { rows } = await client.query(`select id from sqaaf.improvement_action limit 1`);
      const id = rows[0].id;
      for (const next of ['in_progress', 'evidence_submitted', 'under_review']) {
        await client.query(`update sqaaf.improvement_action set status = $1 where id = $2`, [
          next,
          id,
        ]);
      }
      // Completing without naming a reviewer is refused by the check constraint.
      await expect(
        client.query(`update sqaaf.improvement_action set status = 'completed' where id = $1`, [
          id,
        ]),
      ).rejects.toThrow(/sqaaf_action_completion_reviewed/);
    } finally {
      await client.query('rollback');
    }
  });

  it('completes when a reviewer signs it off', async () => {
    await client.query('begin');
    try {
      const { rows } = await client.query(`select id from sqaaf.improvement_action limit 1`);
      const id = rows[0].id;
      for (const next of ['in_progress', 'evidence_submitted', 'under_review']) {
        await client.query(`update sqaaf.improvement_action set status = $1 where id = $2`, [
          next,
          id,
        ]);
      }
      await client.query(
        `update sqaaf.improvement_action
            set status = 'completed', reviewed_by = $1, reviewed_at = now(), completed_at = now()
          where id = $2`,
        [DEMO_USERS.principal, id],
      );
      const { rows: done } = await client.query(
        `select status, completed_at from sqaaf.improvement_action where id = $1`,
        [id],
      );
      expect(done[0].status).toBe('completed');
      expect(done[0].completed_at).not.toBeNull();
    } finally {
      await client.query('rollback');
    }
  });

  it('abandoning requires a written reason', async () => {
    await client.query('begin');
    try {
      const { rows } = await client.query(`select id from sqaaf.improvement_action limit 1`);
      await expect(
        client.query(`update sqaaf.improvement_action set status = 'abandoned' where id = $1`, [
          rows[0].id,
        ]),
      ).rejects.toThrow(/sqaaf_action_abandon_reasoned/);
    } finally {
      await client.query('rollback');
    }
  });

  it('a rating cannot mix framework versions', async () => {
    await client.query('begin');
    try {
      await client.query(
        `insert into sqaaf.framework_version
           (school_id, key, edition_label, total_standards, total_marks, effective_from)
         values ($1, 'cbse.sqaaf.hypothetical', 'Hypothetical edition', 84, 336, date '2030-01-01')`,
        [school],
      );
      await client.query(
        `insert into sqaaf.performance_level (school_id, version_id, level_number, roman_label, display_name, score)
         select $1, fv.id, 3, 'III', 'Stable', 3 from sqaaf.framework_version fv
          where fv.school_id = $1 and fv.key = 'cbse.sqaaf.hypothetical'`,
        [school],
      );
      await expect(
        client.query(
          `insert into sqaaf.standard_rating
             (school_id, self_assessment_id, standard_id, level_id, rationale)
           select $1, sa.id, s.id, pl.id,
                  'A rationale of entirely adequate length for the constraint.'
             from sqaaf.self_assessment sa, sqaaf.standard s, sqaaf.performance_level pl
             join sqaaf.framework_version fv on fv.id = pl.version_id
            where sa.school_id = $1 and s.code = '6.1.1' and fv.key = 'cbse.sqaaf.hypothetical'
            limit 1`,
          [school],
        ),
      ).rejects.toThrow(/different SQAAF framework version/);
    } finally {
      await client.query('rollback');
    }
  });

  it('does not mark anything as submitted to CBSE by itself', async () => {
    const { rows } = await client.query(
      `select status, externally_submitted_at from sqaaf.self_assessment`,
    );
    for (const r of rows) {
      expect(r.status).not.toBe('submitted_externally');
      expect(r.externally_submitted_at).toBeNull();
    }
  });

  it('recording an external submission requires naming who filed it', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(`update sqaaf.self_assessment set status = 'submitted_externally'`),
      ).rejects.toThrow(/sqaaf_external_submission_recorded/);
    } finally {
      await client.query('rollback');
    }
  });
});

describeDb('access control', () => {
  it('a teacher sees their own CPD records and nobody else', async () => {
    await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(
        `select r.id, tp.user_id from compliance.cpd_record r
           join core.teacher_profile tp on tp.id = r.teacher_profile_id`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r.user_id).toBe(DEMO_USERS.neha);
    });
  });

  it('a teacher in another department sees none of them', async () => {
    await asUser(client, DEMO_USERS.harpreet, async (c) => {
      const { rows } = await c.query(
        `select r.id from compliance.cpd_record r
           join core.teacher_profile tp on tp.id = r.teacher_profile_id
          where tp.user_id = $1`,
        [DEMO_USERS.neha],
      );
      expect(rows).toEqual([]);
    });
  });

  it('the supervising Head of Department can see them', async () => {
    await asUser(client, DEMO_USERS.vikram, async (c) => {
      const { rows } = await c.query(
        `select r.id from compliance.cpd_record r
           join core.teacher_profile tp on tp.id = r.teacher_profile_id
          where tp.user_id = $1`,
        [DEMO_USERS.neha],
      );
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it('a teacher cannot log CPD against somebody else', async () => {
    // Two defences, and the test proves the second explicitly. Scope isolation
    // already means Harpreet cannot even read Neha's profile row, so a
    // subquery-driven insert silently finds nothing. Passing her id in directly
    // is what actually exercises the policy's WITH CHECK.
    const { rows: target } = await client.query(
      `select tp.id from core.teacher_profile tp where tp.user_id = $1`,
      [DEMO_USERS.neha],
    );
    const nehaProfile = target[0].id as string;

    await asUser(client, DEMO_USERS.harpreet, async (c) => {
      const { rows: invisible } = await c.query(
        `select id from core.teacher_profile where user_id = $1`,
        [DEMO_USERS.neha],
      );
      expect(invisible).toEqual([]);

      await expect(
        c.query(
          `insert into compliance.cpd_record
             (school_id, teacher_profile_id, academic_year_id, title, source_type_id, provider_name,
              category_id, source_class, activity_from, activity_to, duration_hours, claimed_hours, status)
           select $1, $3, $2, 'Not mine to claim', st.id, 'Provider', cat.id, 'school_or_complex',
                  date '2026-09-01', date '2026-09-01', 3, 3, 'draft'
             from compliance.cpd_source_type st, compliance.cpd_category cat
            where st.school_id = $1 and st.key = 'school_inhouse'
              and cat.school_id = $1 and cat.key = 'knowledge_practice'`,
          [school, year, nehaProfile],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('a teacher cannot see the SQAAF self-assessment', async () => {
    await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(`select id from sqaaf.self_assessment`);
      expect(rows).toEqual([]);
    });
  });

  it('but can read the SQAAF framework the school is held to', async () => {
    await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(`select count(*) as n from sqaaf.standard`);
      expect(Number(rows[0].n)).toBe(84);
    });
  });

  it('the Principal can read the self-assessment and its improvement plan', async () => {
    await asUser(client, DEMO_USERS.principal, async (c) => {
      const { rows } = await c.query(
        `select (select count(*) from sqaaf.self_assessment) as assessments,
                (select count(*) from sqaaf.improvement_action) as actions`,
      );
      expect(Number(rows[0].assessments)).toBe(1);
      expect(Number(rows[0].actions)).toBeGreaterThan(0);
    });
  });

  it('a teacher cannot edit the CPD requirement configuration', async () => {
    await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rowCount } = await c.query(
        `update compliance.cpd_requirement_version set total_hours = 10 where school_id = $1`,
        [school],
      );
      expect(rowCount).toBe(0);
    });
  });

  it('but can read it — the rule behind the expectation is never hidden', async () => {
    await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(
        `select total_hours from compliance.cpd_requirement_version where school_id = $1`,
        [school],
      );
      expect(Number(rows[0].total_hours)).toBe(50);
    });
  });

  it('nobody can forge an entry on the CPD status trail', async () => {
    await asUser(client, DEMO_USERS.vikram, async (c) => {
      await expect(
        c.query(
          `insert into compliance.cpd_record_status_history (school_id, cpd_record_id, to_status)
           select $1, r.id, 'verified' from compliance.cpd_record r limit 1`,
          [school],
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
