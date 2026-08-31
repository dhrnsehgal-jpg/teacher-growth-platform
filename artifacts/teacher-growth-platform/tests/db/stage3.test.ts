/**
 * Stage 3: the gap engine, the recommendation engine and the impact gate.
 *
 * The Playwright spec proves the lifecycle works through the UI. These prove
 * the arithmetic and the refusals — the parts a happy-path walkthrough would
 * not exercise.
 */

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  asUser,
  connect,
  currentYearId,
  databaseAvailable,
  DEMO_USERS,
  teacherProfileId,
} from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

let client: Client;
beforeAll(async () => {
  if (available) client = await connect();
});
afterAll(async () => {
  if (available && client) await client.end();
});

const CBA = 'competency_based_assessment';

async function nehaGap(client: Client) {
  const { rows } = await client.query(
    `select g.* from growth.gap_detail g
      join core.teacher_profile tp on tp.id = g.teacher_profile_id
     where tp.user_id = $1 and g.competency_key = $2`,
    [DEMO_USERS.neha, CBA],
  );
  return rows[0];
}

describeDb('the demo scenario matches the specification', () => {
  it('expected 4, verified 2, gap 2, priority High', async () => {
    const gap = await nehaGap(client);
    expect(gap.expected_ordinal).toBe(4);
    expect(gap.verified_ordinal).toBe(2);
    expect(gap.gap_size).toBe(2);
    expect(gap.priority_label).toBe('High');
  });
});

describeDb('gap engine', () => {
  it('explains every point it awards', async () => {
    const gap = await nehaGap(client);
    const factors = gap.factors as { factor: string; points: number; why: string }[];

    expect(factors.length).toBeGreaterThan(0);
    for (const f of factors) {
      expect(f.factor).toBeTruthy();
      expect(f.why.length).toBeGreaterThan(10);
      expect(typeof f.points).toBe('number');
    }
    // The score is the sum of its parts, capped at 100.
    const sum = factors.reduce((s, f) => s + f.points, 0);
    expect(gap.priority_score).toBe(Math.min(sum, 100));
  });

  it('accounts for the factors the brief requires', async () => {
    const gap = await nehaGap(client);
    const names = (gap.factors as { factor: string }[]).map((f) => f.factor);
    expect(names).toContain('Gap magnitude');
    expect(names).toContain('Mandatory competency');
    expect(names).toContain('School strategic priority');
    expect(names).toContain('KPI relevance');
    expect(names).toContain('Observed below expectation');
    expect(names).toContain('Evidence strength');
  });

  it('records which engine produced the score', async () => {
    const gap = await nehaGap(client);
    expect(gap.engine_version).toBe('gap-engine-v1');
  });

  it('scores a competency at or above expectation as no gap', async () => {
    const year = await currentYearId(client);
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const { rows } = await client.query(
      `select priority_score, priority_band_key, gap_size
         from growth.gap
        where teacher_profile_id = $1 and academic_year_id = $2 and gap_size = 0`,
      [profile, year],
    );
    for (const r of rows) {
      expect(r.priority_score).toBe(0);
      expect(r.priority_band_key).toBe('no_gap');
    }
  });

  it('is deterministic — recomputing changes nothing', async () => {
    const before = await nehaGap(client);
    const year = await currentYearId(client);
    const profile = await teacherProfileId(client, DEMO_USERS.neha);

    await client.query('begin');
    await client.query(`select growth.compute_gaps($1, $2)`, [profile, year]);
    const after = await nehaGap(client);
    await client.query('rollback');

    expect(after.priority_score).toBe(before.priority_score);
    expect(after.priority_band_key).toBe(before.priority_band_key);
  });
});

describeDb('CPD recommendation engine', () => {
  it('ranks the most relevant activity first, and explains why', async () => {
    const gap = await nehaGap(client);
    const { rows } = await client.query(
      `select * from cpd.recommendation_detail where gap_id = $1 order by rank`,
      [gap.id],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].title).toBe('Designing Competency-Based Assessments');

    const reasons = rows[0].reasons as { factor: string; points: number; why: string }[];
    expect(reasons.map((r) => r.factor)).toContain('Directly addresses this competency');
    expect(reasons.map((r) => r.factor)).toContain('Matches the stage you teach');
    expect(rows[0].score).toBe(reasons.reduce((s, r) => s + r.points, 0));
  });

  it('ranks strictly by score', async () => {
    const gap = await nehaGap(client);
    const { rows } = await client.query(
      `select rank, score from cpd.recommendation where gap_id = $1 order by rank`,
      [gap.id],
    );
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score);
    }
  });

  it('excludes activities scoped to other stages rather than scoring them down', async () => {
    const gap = await nehaGap(client);
    const { rows } = await client.query(
      `select a.key from cpd.recommendation r
         join cpd.activity a on a.id = r.activity_id
        where r.gap_id = $1`,
      [gap.id],
    );
    // A Foundational-stage course must not appear for a Middle-stage teacher.
    expect(rows.map((r) => r.key)).not.toContain('differentiation_foundational');
  });

  it('records which engine produced the ranking', async () => {
    const gap = await nehaGap(client);
    const { rows } = await client.query(
      `select distinct engine_version from cpd.recommendation where gap_id = $1`,
      [gap.id],
    );
    expect(rows[0].engine_version).toBe('cpd-recommender-v1');
  });
});

describeDb('CPD completion does not improve a competency', () => {
  it('refuses reassessment at every stage before verified impact', async () => {
    const year = await currentYearId(client);
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const gap = await nehaGap(client);
    const { rows: act } = await client.query(
      `select id, school_id from cpd.activity where key = 'designing_competency_based_assessment'`,
    );

    await client.query('begin');
    try {
      const { rows: plan } = await client.query(
        `insert into growth.learning_plan (school_id, teacher_profile_id, academic_year_id, status)
         values ($1,$2,$3,'active') returning id`,
        [act[0].school_id, profile, year],
      );
      const { rows: item } = await client.query(
        `insert into growth.learning_plan_item
           (school_id, learning_plan_id, gap_id, competency_id, cpd_activity_id, status)
         values ($1,$2,$3,(select competency_id from growth.gap where id=$3),$4,'proposed')
         returning id`,
        [act[0].school_id, plan[0].id, gap.id, act[0].id],
      );
      const id = item[0].id;

      const gate = async () => {
        const { rows } = await client.query(`select * from growth.can_reassess($1)`, [id]);
        return rows[0];
      };

      expect((await gate()).allowed).toBe(false);
      expect((await gate()).reason).toMatch(/not been completed/);

      await client.query(`update growth.learning_plan_item set status='approved' where id=$1`, [
        id,
      ]);
      await client.query(`update growth.learning_plan_item set status='in_progress' where id=$1`, [
        id,
      ]);
      await client.query(
        `update growth.learning_plan_item set status='completed', completed_at=now() where id=$1`,
        [id],
      );
      // Completion alone is not enough — this is the product rule.
      expect((await gate()).allowed).toBe(false);
      expect((await gate()).reason).toMatch(/reflection/i);

      await client.query(
        `update growth.learning_plan_item
            set status='reflected', reflected_at=now(),
                reflection='A reflection long enough to satisfy the constraint on this column.'
          where id=$1`,
        [id],
      );
      expect((await gate()).allowed).toBe(false);
      expect((await gate()).reason).toMatch(/applied the learning/i);

      await client.query(
        `update growth.learning_plan_item
            set status='applied', applied_at=now(),
                application_summary='An application summary long enough to satisfy the constraint.'
          where id=$1`,
        [id],
      );
      expect((await gate()).allowed).toBe(false);
      expect((await gate()).reason).toMatch(/verified evidence/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('forbids jumping from completed straight to reassessed', async () => {
    const year = await currentYearId(client);
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const { rows: act } = await client.query(
      `select id, school_id from cpd.activity where key = 'rubric_design_intensive'`,
    );
    const { rows: comp } = await client.query(
      `select id from competency.competency where key = $1`,
      [CBA],
    );

    await client.query('begin');
    try {
      const { rows: plan } = await client.query(
        `insert into growth.learning_plan (school_id, teacher_profile_id, academic_year_id, status)
         values ($1,$2,$3,'active') returning id`,
        [act[0].school_id, profile, year],
      );
      const { rows: item } = await client.query(
        `insert into growth.learning_plan_item
           (school_id, learning_plan_id, competency_id, cpd_activity_id, status)
         values ($1,$2,$3,$4,'proposed') returning id`,
        [act[0].school_id, plan[0].id, comp[0].id, act[0].id],
      );
      const id = item[0].id;
      await client.query(`update growth.learning_plan_item set status='approved' where id=$1`, [
        id,
      ]);
      await client.query(`update growth.learning_plan_item set status='in_progress' where id=$1`, [
        id,
      ]);
      await client.query(`update growth.learning_plan_item set status='completed' where id=$1`, [
        id,
      ]);

      await expect(
        client.query(`update growth.learning_plan_item set status='reassessed' where id=$1`, [id]),
      ).rejects.toThrow(/cannot move from completed to reassessed/);
    } finally {
      await client.query('rollback');
    }
  });
});

describeDb('assessment records are explainable and permanent', () => {
  it('keeps each rating source separate', async () => {
    const { rows } = await client.query(
      `select cr.source, cr.level_ordinal, cr.rationale
         from assessment.rating_detail cr
         join core.teacher_profile tp on tp.id = cr.teacher_profile_id
        where tp.user_id = $1 and cr.competency_key = $2`,
      [DEMO_USERS.neha, CBA],
    );
    const sources = rows.map((r) => r.source).sort();
    expect(sources).toEqual(['observation', 'self', 'supervisor']);
    for (const r of rows) expect(r.rationale.length).toBeGreaterThan(15);
  });

  it('refuses a rating without reasoning', async () => {
    const { rows: ta } = await client.query(
      `select ta.id, ta.school_id from assessment.teacher_assessment ta
         join core.teacher_profile tp on tp.id = ta.teacher_profile_id
        where tp.user_id = $1 limit 1`,
      [DEMO_USERS.neha],
    );
    const { rows: comp } = await client.query(
      `select id from competency.competency where key = $1`,
      [CBA],
    );
    const { rows: lvl } = await client.query(
      `select pl.id from competency.proficiency_level pl
         join competency.proficiency_scale ps on ps.id = pl.scale_id
        where ps.key = 'school_five_point' and pl.ordinal = 3`,
    );

    await client.query('begin');
    await expect(
      client.query(
        `insert into assessment.competency_rating
           (school_id, teacher_assessment_id, competency_id, source, level_id, rationale, rated_by)
         values ($1,$2,$3,'supervisor',$4,'too short',$5)`,
        [ta[0].school_id, ta[0].id, comp[0].id, lvl[0].id, DEMO_USERS.principal],
      ),
    ).rejects.toThrow(/rationale/);
    await client.query('rollback');
  });

  it('never overwrites a verified level', async () => {
    const { rows } = await client.query(`select id from assessment.verified_competency limit 1`);
    await client.query('begin');
    await expect(
      client.query(
        `update assessment.verified_competency set rationale = 'tampered' where id = $1`,
        [rows[0].id],
      ),
    ).rejects.toThrow(/append-only/);
    await client.query('rollback');
  });

  it('refuses a teacher verifying their own competency', async () => {
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const { rows: existing } = await client.query(
      `select * from assessment.verified_competency where teacher_profile_id = $1 limit 1`,
      [profile],
    );
    const v = existing[0];

    await client.query('begin');
    await expect(
      client.query(
        `insert into assessment.verified_competency
           (school_id, teacher_profile_id, competency_id, academic_year_id,
            verified_level_id, expected_level_id, rationale, verified_by)
         values ($1,$2,$3,$4,$5,$6,'A rationale long enough to pass the constraint.',$7)`,
        [
          v.school_id,
          profile,
          v.competency_id,
          v.academic_year_id,
          v.verified_level_id,
          v.expected_level_id,
          DEMO_USERS.neha,
        ],
      ),
    ).rejects.toThrow(/cannot verify their own/);
    await client.query('rollback');
  });

  it('refuses a verified level from a different proficiency scale', async () => {
    // Regression: the reassessment action once matched NPST ordinal 3
    // ("Expert Teacher") instead of the school's ordinal 3 ("Proficient").
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const { rows: existing } = await client.query(
      `select * from assessment.verified_competency where teacher_profile_id = $1 limit 1`,
      [profile],
    );
    const v = existing[0];
    const { rows: npst } = await client.query(
      `select pl.id from competency.proficiency_level pl
         join competency.proficiency_scale ps on ps.id = pl.scale_id
        where ps.key = 'npst_levels' and pl.ordinal = 3`,
    );

    await client.query('begin');
    await expect(
      client.query(
        `insert into assessment.verified_competency
           (school_id, teacher_profile_id, competency_id, academic_year_id,
            verified_level_id, expected_level_id, rationale, verified_by)
         values ($1,$2,$3,$4,$5,$6,'A rationale long enough to pass the constraint.',$7)`,
        [
          v.school_id,
          profile,
          v.competency_id,
          v.academic_year_id,
          npst[0].id,
          v.expected_level_id,
          DEMO_USERS.principal,
        ],
      ),
    ).rejects.toThrow(/different proficiency scales/);
    await client.query('rollback');
  });
});

describeDb('scope still holds for Stage 3 data', () => {
  it('a teacher outside the department sees no gaps for it', async () => {
    const visible = await asUser(client, DEMO_USERS.harpreet, async (c) => {
      const { rows } = await c.query(
        `select g.id from growth.gap g
           join core.teacher_profile tp on tp.id = g.teacher_profile_id
          where tp.user_id = $1`,
        [DEMO_USERS.neha],
      );
      return rows.length;
    });
    expect(visible).toBe(0);
  });

  it('the Mathematics HOD can see their own department’s gaps', async () => {
    const visible = await asUser(client, DEMO_USERS.vikram, async (c) => {
      const { rows } = await c.query(
        `select g.id from growth.gap g
           join core.teacher_profile tp on tp.id = g.teacher_profile_id
          where tp.user_id = $1`,
        [DEMO_USERS.neha],
      );
      return rows.length;
    });
    expect(visible).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describeDb('evidence storage policies', () => {
  it('creates a private bucket with a size limit', async () => {
    const { rows } = await client.query(
      `select id, public, file_size_limit from storage.buckets where id = 'evidence'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].public).toBe(false);
    expect(Number(rows[0].file_size_limit)).toBe(52428800);
  });

  it('lets a teacher upload into their own folder', async () => {
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const path = `${profile}/11111111-1111-1111-1111-111111111111/plan.pdf`;
    await client.query('begin');
    try {
      // Migration 0048 added a malware gate: a file is readable only once an
      // evidence row records a clean scan for it. Uploading is unaffected —
      // you may put a file in your own folder — but reading it back needs the
      // backing record, which is created here as superuser first.
      await client.query(
        `insert into evidence.evidence
           (school_id, teacher_profile_id, academic_year_id, evidence_type_id, title,
            description, occurred_on, status, storage_bucket, storage_path,
            scan_status, scanned_at, scanner_name)
         select tp.school_id, tp.id, ay.id, et.id, 'Upload policy fixture',
                'Backs the storage object so the scan gate can pass it.',
                current_date, 'draft', 'evidence', $2, 'clean', now(), 'test-harness'
           from core.teacher_profile tp
           join core.academic_year ay on ay.school_id = tp.school_id and ay.is_current
           join evidence.evidence_type et on et.school_id = tp.school_id
          where tp.id = $1 limit 1`,
        [profile, path],
      );

      await client.query('select set_config($1,$2,true)', [
        'request.jwt.claim.sub',
        DEMO_USERS.neha,
      ]);
      await client.query('set local role authenticated');
      await client.query(`insert into storage.objects (bucket_id, name) values ('evidence', $1)`, [
        path,
      ]);
      const { rows } = await client.query(
        `select count(*)::int as n from storage.objects where bucket_id = 'evidence'`,
      );
      expect(rows[0].n).toBe(1);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses an upload into another teacher’s folder', async () => {
    const other = await teacherProfileId(client, DEMO_USERS.rajesh);
    await client.query('begin');
    await client.query('select set_config($1,$2,true)', ['request.jwt.claim.sub', DEMO_USERS.neha]);
    await client.query('set local role authenticated');
    await expect(
      client.query(`insert into storage.objects (bucket_id, name) values ('evidence', $1)`, [
        `${other}/22222222-2222-2222-2222-222222222222/stolen.pdf`,
      ]),
    ).rejects.toThrow(/row-level security/i);
    await client.query('rollback');
  });

  it('lets a reviewer in scope read the file, and an outsider not', async () => {
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const path = `${profile}/33333333-3333-3333-3333-333333333333/rubric.pdf`;

    await client.query('begin');
    try {
      // Seeded as superuser so the read test is about SELECT, not INSERT.
      // The backing evidence row carries a clean scan: since migration 0048 a
      // file with no clean scan is not readable by anyone, in scope or not.
      await client.query(
        `insert into evidence.evidence
           (school_id, teacher_profile_id, academic_year_id, evidence_type_id, title,
            description, occurred_on, status, storage_bucket, storage_path,
            scan_status, scanned_at, scanner_name)
         select tp.school_id, tp.id, ay.id, et.id, 'Read policy fixture',
                'Backs the storage object so the scan gate can pass it.',
                current_date, 'draft', 'evidence', $2, 'clean', now(), 'test-harness'
           from core.teacher_profile tp
           join core.academic_year ay on ay.school_id = tp.school_id and ay.is_current
           join evidence.evidence_type et on et.school_id = tp.school_id
          where tp.id = $1 limit 1`,
        [profile, path],
      );
      await client.query(`insert into storage.objects (bucket_id, name) values ('evidence', $1)`, [
        path,
      ]);

      const asVikram = await asUser(client, DEMO_USERS.vikram, async (c) => {
        const { rows } = await c.query(
          `select count(*)::int as n from storage.objects where name = $1`,
          [path],
        );
        return rows[0].n;
      });
      expect(asVikram).toBe(1); // Mathematics HoD, Neha is in scope

      const asOutsider = await asUser(client, DEMO_USERS.harpreet, async (c) => {
        const { rows } = await c.query(
          `select count(*)::int as n from storage.objects where name = $1`,
          [path],
        );
        return rows[0].n;
      });
      expect(asOutsider).toBe(0); // Languages PRT, outside scope
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses deletion once the evidence has been submitted', async () => {
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const { rows: ev } = await client.query(
      `select e.id, e.school_id from evidence.evidence e
        where e.teacher_profile_id = $1 limit 1`,
      [profile],
    );
    const path = `${profile}/${ev[0].id}/submitted.pdf`;

    await client.query('begin');
    try {
      await client.query(`insert into storage.objects (bucket_id, name) values ('evidence', $1)`, [
        path,
      ]);
      await client.query(
        `update evidence.evidence set storage_bucket = 'evidence', storage_path = $2 where id = $1`,
        [ev[0].id, path],
      );

      // The seeded evidence is `verified`, so the file is no longer the
      // teacher's to remove — a review decision points at it.
      const deleted = await asUser(client, DEMO_USERS.neha, async (c) => {
        const res = await c.query(`delete from storage.objects where name = $1`, [path]);
        return res.rowCount;
      });
      expect(deleted).toBe(0);
    } finally {
      await client.query('rollback');
    }
  });

  it('mirrors the evidence table’s visibility rule rather than reimplementing it', async () => {
    // Both the storage policy and the evidence policy route through
    // core.can_view_staff_record, so they cannot drift apart.
    const { rows } = await client.query(
      `select pg_get_expr(polqual, polrelid) as expr
         from pg_policy
        where polname = 'evidence_objects_select'`,
    );
    expect(rows[0].expr).toMatch(/can_view_staff_record/);
  });
});
