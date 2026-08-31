/**
 * Stage 2 database behaviour.
 *
 * Every assertion here runs against a real PostgreSQL server with the
 * migrations and seed applied. Constraints, triggers, RLS and the
 * target-resolution SQL are the subject under test.
 */

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  asUser,
  connect,
  currentYearId,
  databaseAvailable,
  DEMO_USERS,
  schoolId,
  targetFor,
  teacherProfileId,
} from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

if (!available) {
  console.warn(
    '\n  Stage 2 database tests skipped: no database at TEST_DATABASE_URL.\n' +
      '  Start one with ./scripts/local-postgres/run.sh start\n',
  );
}

let client: Client;
beforeAll(async () => {
  if (available) client = await connect();
});
afterAll(async () => {
  if (available && client) await client.end();
});

// ---------------------------------------------------------------------------

describeDb('competency targets differ by role', () => {
  it('a classroom teacher is not held to a Head of Department’s leadership target', async () => {
    const prt = await targetFor(client, DEMO_USERS.harpreet, 'leadership');
    const hod = await targetFor(client, DEMO_USERS.anjali, 'leadership');

    expect(prt?.level).toBe('foundation');
    expect(hod?.level).toBe('advanced');
    expect(hod!.ordinal).toBeGreaterThan(prt!.ordinal);
  });

  it('the Principal carries the highest leadership expectation', async () => {
    const principal = await targetFor(client, DEMO_USERS.principal, 'leadership');
    const hod = await targetFor(client, DEMO_USERS.anjali, 'leadership');

    expect(principal?.level).toBe('expert_lead');
    expect(principal!.ordinal).toBeGreaterThan(hod!.ordinal);
  });

  it('mentoring rises with seniority rather than applying flatly', async () => {
    const prt = await targetFor(client, DEMO_USERS.harpreet, 'mentoring');
    const pgt = await targetFor(client, DEMO_USERS.rajesh, 'mentoring');
    const hod = await targetFor(client, DEMO_USERS.anjali, 'mentoring');

    expect(prt!.ordinal).toBeLessThan(pgt!.ordinal);
    expect(pgt!.ordinal).toBeLessThan(hod!.ordinal);
  });

  it('a more specific target outranks the school-wide baseline', async () => {
    const hod = await targetFor(client, DEMO_USERS.anjali, 'leadership');
    const prt = await targetFor(client, DEMO_USERS.harpreet, 'leadership');

    expect(hod!.specificity).toBeGreaterThan(0);
    expect(prt!.specificity).toBe(0); // baseline
  });
});

describeDb('competency targets differ by teacher category', () => {
  it('a PGT is held to a higher subject-knowledge target than a PRT', async () => {
    const prt = await targetFor(client, DEMO_USERS.harpreet, 'subject_knowledge');
    const pgt = await targetFor(client, DEMO_USERS.rajesh, 'subject_knowledge');

    expect(pgt!.ordinal).toBeGreaterThan(prt!.ordinal);
    expect(pgt?.level).toBe('advanced');
  });

  it('a PGT is held to a higher assessment target than a TGT', async () => {
    const tgt = await targetFor(client, DEMO_USERS.neha, 'assessment_feedback');
    const pgt = await targetFor(client, DEMO_USERS.rajesh, 'assessment_feedback');

    expect(pgt!.ordinal).toBeGreaterThan(tgt!.ordinal);
  });
});

describeDb('competency targets differ by stage', () => {
  it('computational thinking is lower at the Foundational stage than at Secondary', async () => {
    const foundational = await targetFor(client, DEMO_USERS.simran, 'computational_thinking_ai');
    const secondary = await targetFor(client, DEMO_USERS.rajesh, 'computational_thinking_ai');

    expect(foundational?.level).toBe('foundation');
    expect(secondary?.level).toBe('proficient');
    expect(secondary!.ordinal).toBeGreaterThan(foundational!.ordinal);
  });

  it('differentiation is expected MORE strongly at the Foundational stage', async () => {
    // The attainment spread is widest at school entry, so the stage-specific
    // target is deliberately above the school baseline.
    const foundational = await targetFor(client, DEMO_USERS.simran, 'differentiated_instruction');
    const middle = await targetFor(client, DEMO_USERS.neha, 'differentiated_instruction');

    expect(foundational?.level).toBe('advanced');
    expect(foundational!.ordinal).toBeGreaterThan(middle!.ordinal);
  });
});

describeDb('competency targets differ by career level', () => {
  it('an entrant is held to a lower assessment target than an established teacher', async () => {
    const entrant = await targetFor(client, DEMO_USERS.simran, 'assessment_feedback');
    const established = await targetFor(client, DEMO_USERS.neha, 'assessment_feedback');

    expect(entrant!.ordinal).toBeLessThan(established!.ordinal);
  });
});

describeDb('every teacher receives a complete, resolved set of expectations', () => {
  it.each(Object.entries(DEMO_USERS))(
    '%s has a target for every active competency',
    async (_name, userId) => {
      const profile = await teacherProfileId(client, userId);
      const year = await currentYearId(client);

      const { rows } = await client.query(
        `select count(*)::int as n from competency.resolve_targets($1, $2)`,
        [profile, year],
      );
      const { rows: active } = await client.query(
        `select count(*)::int as n from competency.competency where status = 'active'`,
      );

      expect(rows[0].n).toBe(active[0].n);
    },
  );
});

// ---------------------------------------------------------------------------

describeDb('KPI assignment', () => {
  it('assigns KPIs whose weights total 100', async () => {
    const profile = await teacherProfileId(client, DEMO_USERS.rajesh);
    const { rows } = await client.query(
      `select sum(weight)::numeric as total from kpi.teacher_kpi
        where teacher_profile_id = $1`,
      [profile],
    );
    expect(Number(rows[0].total)).toBe(100);
  });

  it('passes school KPI policy validation', async () => {
    const profile = await teacherProfileId(client, DEMO_USERS.rajesh);
    const year = await currentYearId(client);
    const { rows } = await client.query(`select * from kpi.validate_teacher_kpi_set($1, $2)`, [
      profile,
      year,
    ]);
    expect(rows).toEqual([]);
  });

  it('caps the share of weight drawn from student outcomes', async () => {
    // Student examination results must never be the sole determinant.
    const profile = await teacherProfileId(client, DEMO_USERS.rajesh);
    const { rows } = await client.query(
      `select round(
                sum(weight) filter (where is_student_outcome_measure) / sum(weight) * 100, 1
              )::numeric as pct
         from kpi.teacher_kpi where teacher_profile_id = $1`,
      [profile],
    );
    expect(Number(rows[0].pct)).toBeLessThanOrEqual(30);
  });

  it('detects a KPI set that leans too heavily on student outcomes', async () => {
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const year = await currentYearId(client);
    const school = await schoolId(client);
    const { rows: cat } = await client.query(
      `select id from kpi.category where school_id = $1 and key = 'student_progress'`,
      [school],
    );

    await client.query('begin');
    try {
      await client.query(
        `insert into kpi.teacher_kpi
           (school_id, teacher_profile_id, academic_year_id, category_id, name,
            description, metric, direction, target, weight, data_source, frequency,
            is_student_outcome_measure, reviewer_user_id, status)
         values ($1,$2,$3,$4,'Board results','Board outcome','pass rate','increase',
                 '95%', 100, 'Board results', 'annual', true, $5, 'assigned')`,
        [school, profile, year, cat[0].id, DEMO_USERS.principal],
      );

      const { rows } = await client.query(
        `select issue_code from kpi.validate_teacher_kpi_set($1, $2)`,
        [profile, year],
      );
      expect(rows.map((r) => r.issue_code)).toContain('student_outcome_share_exceeded');
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses to assign a KPI without a named reviewer', async () => {
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const year = await currentYearId(client);
    const school = await schoolId(client);
    const { rows: cat } = await client.query(
      `select id from kpi.category where school_id = $1 and key = 'teaching_learning'`,
      [school],
    );

    await client.query('begin');
    await expect(
      client.query(
        `insert into kpi.teacher_kpi
           (school_id, teacher_profile_id, academic_year_id, category_id, name,
            description, metric, direction, target, weight, data_source, frequency, status)
         values ($1,$2,$3,$4,'Unowned KPI','x','y','increase','z',10,'src','annual','assigned')`,
        [school, profile, year, cat[0].id],
      ),
    ).rejects.toThrow(/teacher_kpi_assigned_has_reviewer/);
    await client.query('rollback');
  });
});

// ---------------------------------------------------------------------------

describeDb('evidence linking', () => {
  it('links one stored artefact to several competencies and a KPI', async () => {
    const { rows } = await client.query(
      `select count(*) filter (where competency_id is not null)::int as competencies,
              count(*) filter (where teacher_kpi_id is not null)::int as kpis,
              count(distinct evidence_id)::int as files
         from evidence.evidence_link`,
    );
    expect(rows[0].files).toBe(1);
    expect(rows[0].competencies).toBeGreaterThanOrEqual(3);
    expect(rows[0].kpis).toBeGreaterThanOrEqual(1);
  });

  it('stores the file once, however many links point at it', async () => {
    const { rows } = await client.query(
      `select e.id, count(l.id)::int as links
         from evidence.evidence e join evidence.evidence_link l on l.evidence_id = e.id
        group by e.id order by links desc`,
    );
    expect(rows[0].links).toBeGreaterThan(1);

    // The invariant is that links outnumber the artefacts they point at —
    // stated as a ratio so it survives new seeded evidence in later stages.
    const { rows: totals } = await client.query(
      `select count(*)::int as links, count(distinct evidence_id)::int as files
         from evidence.evidence_link`,
    );
    expect(totals[0].links).toBeGreaterThan(totals[0].files);
  });

  it('rejects a link with more than one target', async () => {
    const { rows: ev } = await client.query(`select id, school_id from evidence.evidence limit 1`);
    const { rows: c } = await client.query(`select id from competency.competency limit 1`);
    const { rows: k } = await client.query(`select id from kpi.teacher_kpi limit 1`);

    await client.query('begin');
    await expect(
      client.query(
        `insert into evidence.evidence_link (school_id, evidence_id, competency_id, teacher_kpi_id)
         values ($1,$2,$3,$4)`,
        [ev[0].school_id, ev[0].id, c[0].id, k[0].id],
      ),
    ).rejects.toThrow(/evidence_link_single_target/);
    await client.query('rollback');
  });

  it('records a status history entry when evidence is created', async () => {
    const { rows } = await client.query(
      `select to_status from evidence.status_history order by id`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].to_status).toBe('submitted');
  });

  it('refuses an invalid status transition', async () => {
    const { rows: ev } = await client.query(`select id from evidence.evidence limit 1`);
    await client.query('begin');
    await expect(
      client.query(`update evidence.evidence set status = 'verified' where id = $1`, [ev[0].id]),
    ).rejects.toThrow(/cannot move from submitted to verified/);
    await client.query('rollback');
  });

  it('requires a written reason before evidence can be returned', async () => {
    const { rows: ev } = await client.query(`select id from evidence.evidence limit 1`);
    await client.query('begin');
    await expect(
      client.query(
        `update evidence.evidence
            set status = 'returned_for_clarification', reviewed_by = $2, reviewed_at = now()
          where id = $1`,
        [ev[0].id, DEMO_USERS.anjali],
      ),
    ).rejects.toThrow(/evidence_adverse_outcome_has_reason/);
    await client.query('rollback');
  });
});

// ---------------------------------------------------------------------------

describeDb('RBAC and scope', () => {
  it('a teacher sees only their own evidence', async () => {
    // Asserted as ownership rather than a count: a count of zero would pass
    // trivially for a teacher who simply has no evidence yet.
    const rows = await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(
        `select e.id, tp.user_id
           from evidence.evidence e
           join core.teacher_profile tp on tp.id = e.teacher_profile_id`,
      );
      return rows as { id: string; user_id: string }[];
    });
    expect(rows.every((r) => r.user_id === DEMO_USERS.neha)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('a teacher sees their own evidence', async () => {
    const seen = await asUser(client, DEMO_USERS.rajesh, async (c) => {
      const { rows } = await c.query(`select count(*)::int as n from evidence.evidence`);
      return rows[0].n;
    });
    expect(seen).toBe(1);
  });

  it('the Science HOD sees Science staff evidence but a teacher outside cannot', async () => {
    const hodSees = await asUser(client, DEMO_USERS.anjali, async (c) => {
      const { rows } = await c.query(`select count(*)::int as n from evidence.evidence`);
      return rows[0].n;
    });
    expect(hodSees).toBe(1); // Rajesh is in Science

    const outsiderSees = await asUser(client, DEMO_USERS.harpreet, async (c) => {
      const { rows } = await c.query(`select count(*)::int as n from evidence.evidence`);
      return rows[0].n;
    });
    expect(outsiderSees).toBe(0);
  });

  it('a teacher cannot see another teacher’s KPIs', async () => {
    const rows = await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(
        `select k.id, tp.user_id
           from kpi.teacher_kpi k
           join core.teacher_profile tp on tp.id = k.teacher_profile_id`,
      );
      return rows as { id: string; user_id: string }[];
    });
    expect(rows.every((r) => r.user_id === DEMO_USERS.neha)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('a teacher can read the competency framework they are measured against', async () => {
    // Compared against the real total rather than a literal, so adding a
    // competency in a later stage does not look like a regression.
    const { rows: all } = await client.query(
      `select count(*)::int as n from competency.competency where status = 'active'`,
    );
    const seen = await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from competency.competency where status = 'active'`,
      );
      return rows[0].n;
    });
    expect(seen).toBe(all[0].n);
    expect(seen).toBeGreaterThanOrEqual(23);
  });

  it('a teacher cannot alter the competency framework', async () => {
    await expect(
      asUser(client, DEMO_USERS.neha, async (c) => {
        await c.query(
          `update competency.competency set name = 'tampered' where key = 'leadership'`,
        );
        const { rows } = await c.query(
          `select name from competency.competency where key = 'leadership'`,
        );
        return rows[0].name;
      }),
    ).resolves.not.toBe('tampered');
  });

  it('a teacher cannot assign themselves a KPI', async () => {
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const year = await currentYearId(client);
    const school = await schoolId(client);
    const { rows: cat } = await client.query(
      `select id from kpi.category where school_id = $1 limit 1`,
      [school],
    );

    await expect(
      asUser(client, DEMO_USERS.neha, async (c) => {
        await c.query(
          `insert into kpi.teacher_kpi
             (school_id, teacher_profile_id, academic_year_id, category_id, name,
              description, metric, direction, target, weight, data_source, frequency,
              reviewer_user_id, status)
           values ($1,$2,$3,$4,'Self assigned','x','y','increase','z',10,'src','annual',$5,'assigned')`,
          [school, profile, year, cat[0].id, DEMO_USERS.neha],
        );
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });
});

// ---------------------------------------------------------------------------

describeDb('historical preservation', () => {
  it('retires a competency without deleting it, and keeps its targets', async () => {
    const school = await schoolId(client);
    const { rows: before } = await client.query(
      `select id from competency.competency where school_id = $1 and key = 'innovation'`,
      [school],
    );
    const competencyId = before[0].id;

    const { rows: targetsBefore } = await client.query(
      `select count(*)::int as n from competency.competency_target where competency_id = $1`,
      [competencyId],
    );

    await client.query('begin');
    try {
      await client.query('select set_config($1,$2,true)', [
        'request.jwt.claim.sub',
        DEMO_USERS.principal,
      ]);
      await client.query(`select competency.retire_competency($1, $2)`, [
        competencyId,
        'Superseded by the revised reflective practice competency for 2027-28.',
      ]);

      const { rows: after } = await client.query(
        `select status, retired_at, retired_by, retirement_reason
           from competency.competency where id = $1`,
        [competencyId],
      );
      expect(after[0].status).toBe('retired');
      expect(after[0].retired_at).not.toBeNull();
      expect(after[0].retired_by).toBe(DEMO_USERS.principal);
      expect(after[0].retirement_reason).toMatch(/Superseded/);

      // The row survives, and so do its targets.
      const { rows: targetsAfter } = await client.query(
        `select count(*)::int as n from competency.competency_target where competency_id = $1`,
        [competencyId],
      );
      expect(targetsAfter[0].n).toBe(targetsBefore[0].n);

      // Its indicators retire with it, but are not deleted either.
      const { rows: ind } = await client.query(
        `select count(*) filter (where status='retired')::int as retired,
                count(*)::int as total
           from competency.indicator where competency_id = $1`,
        [competencyId],
      );
      expect(ind[0].retired).toBe(ind[0].total);
      expect(ind[0].total).toBeGreaterThan(0);
    } finally {
      await client.query('rollback');
    }
  });

  it('will not retire a competency without a reason', async () => {
    const school = await schoolId(client);
    const { rows } = await client.query(
      `select id from competency.competency where school_id = $1 and key = 'innovation'`,
      [school],
    );
    await client.query('begin');
    await client.query('select set_config($1,$2,true)', [
      'request.jwt.claim.sub',
      DEMO_USERS.principal,
    ]);
    await expect(
      client.query(`select competency.retire_competency($1, $2)`, [rows[0].id, 'too short']),
    ).rejects.toThrow(/competency_retirement_complete/);
    await client.query('rollback');
  });

  it('a retired competency drops out of resolved expectations but stays on record', async () => {
    const school = await schoolId(client);
    const profile = await teacherProfileId(client, DEMO_USERS.neha);
    const year = await currentYearId(client);
    const { rows } = await client.query(
      `select id from competency.competency where school_id = $1 and key = 'innovation'`,
      [school],
    );

    await client.query('begin');
    try {
      await client.query('select set_config($1,$2,true)', [
        'request.jwt.claim.sub',
        DEMO_USERS.principal,
      ]);
      await client.query(`select competency.retire_competency($1, $2)`, [
        rows[0].id,
        'Retired during the 2027-28 framework review after consultation.',
      ]);

      const { rows: resolved } = await client.query(
        `select count(*)::int as n from competency.resolve_targets($1,$2)
          where competency_key = 'innovation'`,
        [profile, year],
      );
      expect(resolved[0].n).toBe(0);

      const { rows: still } = await client.query(
        `select count(*)::int as n from competency.competency where id = $1`,
        [rows[0].id],
      );
      expect(still[0].n).toBe(1);
    } finally {
      await client.query('rollback');
    }
  });

  it('keeps framework versions distinct so past years stay explainable', async () => {
    const { rows } = await client.query(
      `select key, version, status from competency.framework order by key, version`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) expect(r.version).toBeGreaterThanOrEqual(1);
    expect(rows.map((r) => r.key)).toContain('npst_2023');
    expect(rows.map((r) => r.key)).toContain('school_professional_practice');
  });
});

// ---------------------------------------------------------------------------

describeDb('source labelling integrity', () => {
  it('every "aligned" item cites an external reference', async () => {
    for (const table of [
      'competency.competency',
      'competency.indicator',
      'competency.standard',
      'competency.domain',
    ]) {
      const { rows } = await client.query(
        `select count(*)::int as n from ${table}
          where source_alignment = 'aligned' and external_reference is null`,
      );
      expect(rows[0].n, `${table} has unreferenced aligned rows`).toBe(0);
    }
  });

  it('school-defined items make no external claim', async () => {
    const { rows } = await client.query(
      `select count(*)::int as n from competency.competency
        where source_alignment = 'school_defined' and external_reference is not null`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('NPST-aligned competencies point at the verified NPST source', async () => {
    const { rows } = await client.query(
      `select count(*)::int as n
         from competency.competency c
         join regulatory.source s on s.id = c.regulatory_source_id
        where c.source_framework = 'npst' and s.verification_status = 'verified'`,
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(15);
  });

  it('rejects a vague, unobservable indicator', async () => {
    const { rows: c } = await client.query(
      `select id, school_id from competency.competency limit 1`,
    );
    await client.query('begin');
    await expect(
      client.query(
        `insert into competency.indicator
           (school_id, competency_id, key, statement, source_framework, source_alignment)
         values ($1,$2,'vague','Is a good teacher who tries hard','school','school_defined')`,
        [c[0].school_id, c[0].id],
      ),
    ).rejects.toThrow(/indicator_statement_observable/);
    await client.query('rollback');
  });
});

// ---------------------------------------------------------------------------

describeDb('schema-wide security invariants', () => {
  const SCHEMAS = ['core', 'regulatory', 'audit', 'competency', 'kpi', 'evidence', 'growth'];

  it('every table has Row Level Security enabled', async () => {
    const { rows } = await client.query(
      `select n.nspname || '.' || c.relname as t
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = any($1) and c.relkind = 'r' and not c.relrowsecurity`,
      [SCHEMAS],
    );
    expect(rows.map((r) => r.t)).toEqual([]);
  });

  it('every table with RLS has at least one policy, so none is silently unreadable', async () => {
    const { rows } = await client.query(
      `select n.nspname || '.' || c.relname as t
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = any($1) and c.relkind = 'r' and c.relrowsecurity
          and not exists (
            select 1 from pg_policies p
             where p.schemaname = n.nspname and p.tablename = c.relname)`,
      [SCHEMAS],
    );
    expect(rows.map((r) => r.t)).toEqual([]);
  });

  it('the authenticated role can reach every schema, so policies actually run', async () => {
    // Migration 0008 exists because a policy on an unreachable schema is dead
    // code. Stage 2 added four schemas; this asserts they were not forgotten.
    for (const schema of SCHEMAS) {
      const { rows } = await client.query(
        `select has_schema_privilege('authenticated', $1, 'USAGE') as ok`,
        [schema],
      );
      expect(rows[0].ok, `authenticated cannot use schema ${schema}`).toBe(true);
    }
  });

  it('the anon role can reach none of them', async () => {
    for (const schema of SCHEMAS) {
      const { rows } = await client.query(
        `select has_schema_privilege('anon', $1, 'USAGE') as ok`,
        [schema],
      );
      expect(rows[0].ok, `anon can reach schema ${schema}`).toBe(false);
    }
  });

  it('every SECURITY DEFINER function pins its search_path', async () => {
    const { rows } = await client.query(
      `select n.nspname || '.' || p.proname as f
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = any($1) and p.prosecdef
          and not exists (
            select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
             where cfg like 'search_path=%')`,
      [SCHEMAS],
    );
    expect(rows.map((r) => r.f)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describeDb('staff directory visibility (regression: migration 0018)', () => {
  it('a teacher can see colleagues, not just themselves', async () => {
    const seen = await asUser(client, DEMO_USERS.rajesh, async (c) => {
      const { rows } = await c.query(`select count(*)::int as n from core.app_user`);
      return rows[0].n;
    });
    // Was 1 before the fix — the policy's inline subquery ran under the
    // caller's own RLS and could never see anyone else's role assignment.
    expect(seen).toBeGreaterThan(1);
  });

  it('a teacher can see the name of the person reviewing their KPI', async () => {
    const named = await asUser(client, DEMO_USERS.rajesh, async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n
           from kpi.teacher_kpi k
           join core.teacher_profile tp on tp.id = k.teacher_profile_id
           join core.app_user r on r.id = k.reviewer_user_id
          where tp.user_id = auth.uid()`,
      );
      return rows[0].n;
    });
    expect(named).toBeGreaterThan(0);
  });

  it('directory access does not leak beyond the schools you belong to', async () => {
    // Compute the expected membership as superuser. Doing it inside the RLS
    // session would repeat the very mistake this migration fixed: the subquery
    // would itself be filtered.
    const { rows: expected } = await client.query(
      `select distinct ura.user_id
         from core.user_role_assignment ura
         join core.school s on s.id = ura.school_id
        where s.slug = 'demo-school'`,
    );
    const allowed = new Set(expected.map((r) => r.user_id as string));

    const visible = await asUser(client, DEMO_USERS.rajesh, async (c) => {
      const { rows } = await c.query(`select id from core.app_user`);
      return rows.map((r) => r.id as string);
    });

    expect(visible.length).toBeGreaterThan(1);
    expect(visible.filter((id) => !allowed.has(id))).toEqual([]);
  });
});
