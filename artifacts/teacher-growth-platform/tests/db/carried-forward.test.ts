/**
 * The four items carried across stages and closed together:
 * malware scanning, moderation, configurable models, year-on-year comparison.
 *
 * The scanning tests are the ones that matter. Everything else here is a
 * feature; that one is a safety gate, and its failure mode is serving malware
 * to a colleague.
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

/**
 * Runs a query as a signed-in user WITHOUT opening a transaction.
 *
 * `asUser` wraps its work in begin/rollback, which is wrong inside a test that
 * already has a transaction open — the inner rollback would discard the setup
 * the test just did. This switches the role for the duration and switches back.
 */
async function asRoleInline<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
  await client.query('set local role authenticated');
  try {
    return await fn();
  } finally {
    await client.query('reset role');
  }
}

// ---------------------------------------------------------------------------
describeDb('malware scanning gate', () => {
  it('defaults every uploaded file to pending, never clean', async () => {
    const { rows } = await client.query(
      `select scan_status, count(*)::int as n from evidence.evidence
        where storage_path is not null group by 1`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.scan_status).toBe('pending');
  });

  it('refuses to serve a pending file, and says why', async () => {
    await asUser(client, DEMO_USERS.rajesh, async (c) => {
      const { rows: ev } = await c.query(
        `select id from evidence.evidence where storage_path is not null limit 1`,
      );
      const { rows } = await c.query(`select * from evidence.file_servable($1)`, [ev[0].id]);
      expect(rows[0].servable).toBe(false);
      expect(rows[0].reason).toMatch(/awaiting a virus scan/i);
      // The path is withheld too, so a caller ignoring the flag still cannot
      // mint a signed URL for it.
      expect(rows[0].storage_path).toBeNull();
    });
  });

  it('serves it once a scan records it clean', async () => {
    await client.query('begin');
    try {
      const { rows: ev } = await client.query(
        `select id from evidence.evidence where storage_path is not null limit 1`,
      );
      await client.query(
        `select evidence.record_scan_result($1, 'clean', 'clamav', '1.3.1', 'No signatures matched.')`,
        [ev[0].id],
      );
      await asUser(client, DEMO_USERS.rajesh, async (c) => {
        const { rows } = await c.query(`select * from evidence.file_servable($1)`, [ev[0].id]);
        expect(rows[0].servable).toBe(true);
        expect(rows[0].storage_path).not.toBeNull();
      });
    } finally {
      await client.query('rollback');
    }
  });

  it('never serves an infected file', async () => {
    await client.query('begin');
    try {
      const { rows: ev } = await client.query(
        `select id from evidence.evidence where storage_path is not null limit 1`,
      );
      await client.query(
        `select evidence.record_scan_result($1, 'infected', 'clamav', '1.3.1', 'Eicar-Test-Signature')`,
        [ev[0].id],
      );
      // Role switched inline rather than via asUser: this is already inside a
      // transaction, and asUser's own rollback would end it early.
      const { rows } = await asRoleInline(DEMO_USERS.rajesh, () =>
        client.query(`select * from evidence.file_servable($1)`, [ev[0].id]),
      );
      expect(rows[0].servable).toBe(false);
      expect(rows[0].reason).toMatch(/unsafe/i);
      expect(rows[0].storage_path).toBeNull();
    } finally {
      await client.query('rollback');
    }
  });

  it('treats a failed scan as not clean', async () => {
    await client.query('begin');
    try {
      const { rows: ev } = await client.query(
        `select id from evidence.evidence where storage_path is not null limit 1`,
      );
      await client.query(
        `select evidence.record_scan_result($1, 'failed', 'clamav', '1.3.1', 'Timed out.')`,
        [ev[0].id],
      );
      // Role switched inline rather than via asUser: this is already inside a
      // transaction, and asUser's own rollback would end it early.
      const { rows } = await asRoleInline(DEMO_USERS.rajesh, () =>
        client.query(`select * from evidence.file_servable($1)`, [ev[0].id]),
      );
      expect(rows[0].servable).toBe(false);
    } finally {
      await client.query('rollback');
    }
  });

  it('the storage policy also requires a clean scan, not just scope', async () => {
    const { rows } = await client.query(
      `select qual from pg_policies
        where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'`,
    );
    // One SELECT policy only — a second permissive one would OR the condition
    // away, which is the mistake this assertion exists to catch.
    expect(rows.length).toBe(1);
    expect(rows[0].qual).toMatch(/object_is_clean/);
    expect(rows[0].qual).toMatch(/can_view_staff_record/);
  });

  it('will not let an ordinary user mark their own upload clean', async () => {
    await asUser(client, DEMO_USERS.rajesh, async (c) => {
      const { rows: ev } = await c.query(
        `select id from evidence.evidence where storage_path is not null limit 1`,
      );
      await expect(
        c.query(`select evidence.record_scan_result($1, 'clean', 'me', null, null)`, [ev[0].id]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('requires a person and a reason to skip a scan on a file', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `update evidence.evidence set scan_status = 'skipped'
            where storage_path is not null`,
        ),
      ).rejects.toThrow(/evidence_scan_skip_authorised/);
    } finally {
      await client.query('rollback');
    }
  });

  it('a record with no file is never servable, whatever its scan status', async () => {
    const { rows: ev } = await client.query(
      `select id from evidence.evidence where storage_path is null limit 1`,
    );
    await asUser(client, DEMO_USERS.rajesh, async (c) => {
      const { rows } = await c.query(`select * from evidence.file_servable($1)`, [ev[0].id]);
      if (rows.length > 0) {
        expect(rows[0].servable).toBe(false);
        expect(rows[0].reason).toMatch(/No file is attached/i);
      }
    });
  });
});

// ---------------------------------------------------------------------------
describeDb('moderation across assessors', () => {
  async function session(c: Client) {
    const { rows } = await c.query(
      `insert into assessment.moderation_session
         (school_id, academic_year_id, title, scope_note, convenor_user_id, status, held_on)
       values ($1, $2, 'Mathematics moderation, term 2',
               'Competency-Based Assessment ratings across the Mathematics department.',
               $3, 'in_progress', current_date)
       returning id`,
      [school, year, DEMO_USERS.principal],
    );
    return rows[0].id as string;
  }

  async function ratingToModerate(c: Client) {
    const { rows } = await c.query(
      `select r.id, r.competency_id, r.level_id, a.teacher_profile_id
         from assessment.competency_rating r
         join assessment.teacher_assessment a on a.id = r.teacher_assessment_id
        where a.teacher_profile_id = $1 and r.source = 'supervisor'
          and r.superseded_by_id is null
        limit 1`,
      [neha],
    );
    return rows[0];
  }

  it('upholding is an outcome, and requires a reason', async () => {
    await client.query('begin');
    try {
      const s = await session(client);
      const r = await ratingToModerate(client);
      await expect(
        client.query(
          `insert into assessment.moderation_item
             (school_id, session_id, rating_id, teacher_profile_id, competency_id,
              original_level_id, outcome, decided_at)
           values ($1, $2, $3, $4, $5, $6, 'upheld', now())`,
          [school, s, r.id, r.teacher_profile_id, r.competency_id, r.level_id],
        ),
      ).rejects.toThrow(/moderation_item_decided/);
    } finally {
      await client.query('rollback');
    }
  });

  it('an adjustment writes a new rating and supersedes the original', async () => {
    await client.query('begin');
    try {
      const s = await session(client);
      const r = await ratingToModerate(client);
      const { rows: level } = await client.query(
        `select id from competency.proficiency_level
          where scale_id = (select scale_id from competency.proficiency_level where id = $1)
            and ordinal = 3`,
        [r.level_id],
      );

      const { rows: item } = await client.query(
        `insert into assessment.moderation_item
           (school_id, session_id, rating_id, teacher_profile_id, competency_id,
            original_level_id, outcome, moderated_level_id, rationale, decided_at)
         values ($1, $2, $3, $4, $5, $6, 'adjusted', $7,
                 'The panel found the evidence supported level 3 against the agreed descriptors.', now())
         returning resulting_rating_id`,
        [school, s, r.id, r.teacher_profile_id, r.competency_id, r.level_id, level[0].id],
      );

      expect(item[0].resulting_rating_id).toBeTruthy();

      const { rows: newRating } = await client.query(
        `select source, level_id, rationale from assessment.competency_rating where id = $1`,
        [item[0].resulting_rating_id],
      );
      expect(newRating[0].source).toBe('moderation');
      expect(newRating[0].level_id).toBe(level[0].id);
      expect(newRating[0].rationale).toMatch(/Moderated by panel/);

      // The original is superseded, not deleted — the assessor's judgement
      // stays readable beside the panel's.
      const { rows: original } = await client.query(
        `select superseded_by_id from assessment.competency_rating where id = $1`,
        [r.id],
      );
      expect(original[0].superseded_by_id).toBe(item[0].resulting_rating_id);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses a moderated level from a different proficiency scale', async () => {
    await client.query('begin');
    try {
      const s = await session(client);
      const r = await ratingToModerate(client);
      const { rows: other } = await client.query(
        `select pl.id from competency.proficiency_level pl
          where pl.scale_id <> (select scale_id from competency.proficiency_level where id = $1)
          limit 1`,
        [r.level_id],
      );
      await expect(
        client.query(
          `insert into assessment.moderation_item
             (school_id, session_id, rating_id, teacher_profile_id, competency_id,
              original_level_id, outcome, moderated_level_id, rationale, decided_at)
           values ($1, $2, $3, $4, $5, $6, 'adjusted', $7,
                   'Attempting to moderate onto a level from another scale entirely.', now())`,
          [school, s, r.id, r.teacher_profile_id, r.competency_id, r.level_id, other[0].id],
        ),
      ).rejects.toThrow(/different proficiency scale/);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses a teacher sitting on a panel moderating their own rating', async () => {
    await client.query('begin');
    try {
      const s = await session(client);
      const r = await ratingToModerate(client);
      await client.query(
        `insert into assessment.moderation_participant (school_id, session_id, user_id)
         values ($1, $2, $3)`,
        [school, s, DEMO_USERS.neha],
      );
      await expect(
        client.query(
          `insert into assessment.moderation_item
             (school_id, session_id, rating_id, teacher_profile_id, competency_id, original_level_id)
           values ($1, $2, $3, $4, $5, $6)`,
          [school, s, r.id, r.teacher_profile_id, r.competency_id, r.level_id],
        ),
      ).rejects.toThrow(/cannot sit on a panel moderating their own rating/);
    } finally {
      await client.query('rollback');
    }
  });

  it('requires a written conclusion to complete a session', async () => {
    await client.query('begin');
    try {
      const s = await session(client);
      await expect(
        client.query(
          `update assessment.moderation_session set status = 'completed' where id = $1`,
          [s],
        ),
      ).rejects.toThrow(/moderation_completed_summarised/);
    } finally {
      await client.query('rollback');
    }
  });

  it('lets a teacher see moderation of their own rating', async () => {
    await client.query('begin');
    try {
      const s = await session(client);
      const r = await ratingToModerate(client);
      await client.query(
        `insert into assessment.moderation_item
           (school_id, session_id, rating_id, teacher_profile_id, competency_id, original_level_id)
         values ($1, $2, $3, $4, $5, $6)`,
        [school, s, r.id, r.teacher_profile_id, r.competency_id, r.level_id],
      );
      await asUser(client, DEMO_USERS.neha, async (c) => {
        const { rows } = await c.query(`select id from assessment.moderation_item`);
        expect(rows.length).toBe(1);
      });
    } finally {
      await client.query('rollback');
    }
  });
});

// ---------------------------------------------------------------------------
describeDb('year-on-year comparison', () => {
  it('reports SQAAF per year without fanning out the counts', async () => {
    const { rows } = await client.query(
      `select standards_rated, open_gaps, actions_total from sqaaf.self_assessment_by_year`,
    );
    expect(Number(rows[0].standards_rated)).toBe(4);
    // The first version of this view joined ratings, gaps and actions together
    // and reported four gaps where there is one.
    expect(Number(rows[0].open_gaps)).toBe(1);
    expect(Number(rows[0].actions_total)).toBe(1);
  });

  it('cross-checks the gap count against the table', async () => {
    const { rows } = await client.query(
      `select (select count(*)::int from sqaaf.evidence_gap where resolved_at is null) as actual,
              (select open_gaps::int from sqaaf.self_assessment_by_year limit 1) as reported`,
    );
    expect(rows[0].reported).toBe(rows[0].actual);
  });

  it('carries the model version alongside a growth score', async () => {
    const { rows } = await client.query(
      `select total_percent, model_version, previous_percent from appraisal.growth_score_by_year`,
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].model_version)).toBe(1);
    // No prior year, so no comparison — reported as null rather than as zero.
    expect(rows[0].previous_percent).toBeNull();
  });

  it('counts only verified CPD hours, showing claimed separately', async () => {
    const { rows } = await client.query(
      `select hours_credited, hours_awaiting, records_verified from compliance.cpd_by_year`,
    );
    expect(Number(rows[0].hours_credited)).toBe(38);
    expect(Number(rows[0].hours_awaiting)).toBe(0);
    expect(Number(rows[0].records_verified)).toBe(7);
  });
});
