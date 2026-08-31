/**
 * Privacy controls.
 *
 * None of this makes the platform DPDP-compliant, and no test here claims it
 * does. What they assert is that the machinery behaves: nothing deletes on a
 * schedule, identity is confirmed before a file is handed over, refusals give
 * reasons, and access to somebody else's pay or appraisal is recorded.
 */

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  asUser,
  connect,
  databaseAvailable,
  DEMO_USERS,
  schoolId,
  teacherProfileId,
} from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

let client: Client;
let school: string;
let neha: string;

beforeAll(async () => {
  if (!available) return;
  client = await connect();
  school = await schoolId(client);
  neha = await teacherProfileId(client, DEMO_USERS.neha);
});
afterAll(async () => {
  if (available && client) await client.end();
});

/**
 * Runs work as a signed-in user WITHOUT opening a transaction.
 *
 * `asUser` wraps its body in begin/rollback, which discards anything written
 * inside it — fine for asserting a refusal, useless when the test needs to read
 * back what was just written.
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

describeDb('retention', () => {
  it('records the questions, all undecided', async () => {
    const { rows } = await client.query(
      `select data_class, retain_months, basis_status, disposal_action
         from privacy.retention_policy where school_id = $1 order by data_class`,
      [school],
    );
    expect(rows.length).toBe(8);
    for (const r of rows) {
      expect(r.basis_status, r.data_class).toBe('requires_verification');
      expect(r.retain_months, r.data_class).toBeNull();
      expect(r.disposal_action, r.data_class).toBe('undecided');
    }
  });

  it('a decided period must name who decided and why', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `update privacy.retention_policy set basis_status = 'verified', retain_months = 60
            where school_id = $1 and data_class = 'appraisal'`,
          [school],
        ),
      ).rejects.toThrow(/retention_decided_complete/);
    } finally {
      await client.query('rollback');
    }
  });

  it('nothing in the schema deletes on a schedule', async () => {
    // No trigger, no job, no cascade keyed on a retention period. Retention is
    // surfaced for a person to act on, never acted on automatically.
    // Looks for an actual DELETE statement, not the `on delete cascade` that
    // appears in table DDL — the first version matched that and failed.
    // The namespace filter is materialised first: Postgres is free to evaluate
    // `pg_get_functiondef` before a WHERE clause, and it errors on aggregates
    // like array_agg if it reaches them.
    const { rows } = await client.query(
      `with privacy_functions as materialized (
         select p.oid, p.proname
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'privacy' and p.prokind = 'f'
       )
       select proname from privacy_functions
        where pg_get_functiondef(oid) ~* 'delete[[:space:]]+from'`,
    );
    expect(rows).toEqual([]);
  });

  it('a teacher can read the retention position for their own record', async () => {
    await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(`select count(*)::int as n from privacy.retention_policy`);
      expect(rows[0].n).toBe(8);
    });
  });
});

describeDb('subject requests', () => {
  async function request(c: Client, type = 'access') {
    const { rows } = await c.query(
      `insert into privacy.subject_request (school_id, subject_user_id, request_type, detail)
       values ($1, $2, $3, 'Please provide everything held about me for the current year.')
       returning id`,
      [school, DEMO_USERS.neha, type],
    );
    return rows[0].id as string;
  }

  it('cannot be fulfilled before identity is confirmed', async () => {
    await client.query('begin');
    try {
      const id = await request(client);
      await expect(
        client.query(
          `update privacy.subject_request
              set status = 'fulfilled', handled_by = $2, responded_at = now(),
                  response_note = 'Sent the full extract by internal post to the staffroom.'
            where id = $1`,
          [id, DEMO_USERS.principal],
        ),
      ).rejects.toThrow(/subject_request_identity_before_fulfilment/);
    } finally {
      await client.query('rollback');
    }
  });

  it('a refusal must state its basis', async () => {
    await client.query('begin');
    try {
      const id = await request(client, 'erasure');
      await expect(
        client.query(
          `update privacy.subject_request
              set status = 'refused', handled_by = $2, responded_at = now(),
                  response_note = 'We are unable to action this erasure request at this time.'
            where id = $1`,
          [id, DEMO_USERS.principal],
        ),
      ).rejects.toThrow(/subject_request_refusal_reasoned/);
    } finally {
      await client.query('rollback');
    }
  });

  it('accepts a properly handled request', async () => {
    await client.query('begin');
    try {
      const id = await request(client);
      await client.query(
        `update privacy.subject_request
            set status = 'fulfilled',
                identity_confirmed_by = $2, identity_confirmed_at = now(),
                handled_by = $2, responded_at = now(),
                response_note = 'Identity confirmed in person; full extract provided and receipt signed.'
          where id = $1`,
        [id, DEMO_USERS.principal],
      );
      const { rows } = await client.query(
        `select status from privacy.subject_request where id = $1`,
        [id],
      );
      expect(rows[0].status).toBe('fulfilled');
    } finally {
      await client.query('rollback');
    }
  });

  it('a person raises requests only about themselves', async () => {
    await asUser(client, DEMO_USERS.harpreet, async (c) => {
      await expect(
        c.query(
          `insert into privacy.subject_request (school_id, subject_user_id, request_type, detail)
           values ($1, $2, 'access', 'Send me everything you hold about my colleague.')`,
          [school, DEMO_USERS.neha],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('a person sees their own requests and not a colleague', async () => {
    await client.query('begin');
    try {
      await request(client);
      const other = await asRoleInline(DEMO_USERS.harpreet, () =>
        client.query(`select id from privacy.subject_request`),
      );
      expect(other.rows).toEqual([]);
      const own = await asRoleInline(DEMO_USERS.neha, () =>
        client.query(`select id from privacy.subject_request`),
      );
      expect(own.rows.length).toBe(1);
    } finally {
      await client.query('rollback');
    }
  });
});

describeDb('access logging', () => {
  it('records one person opening another person record', async () => {
    await client.query('begin');
    try {
      await asRoleInline(DEMO_USERS.principal, () =>
        client.query(`select privacy.log_access($1, 'increment_recommendation', 'review')`, [neha]),
      );
      const { rows } = await client.query(
        `select actor_user_id, record_type from privacy.access_log
          where subject_teacher_profile_id = $1`,
        [neha],
      );
      expect(rows.length).toBe(1);
      expect(rows[0].actor_user_id).toBe(DEMO_USERS.principal);
      expect(rows[0].record_type).toBe('increment_recommendation');
    } finally {
      await client.query('rollback');
    }
  });

  it('does not log a person reading their own record', async () => {
    await client.query('begin');
    try {
      await asRoleInline(DEMO_USERS.neha, () =>
        client.query(`select privacy.log_access($1, 'appraisal')`, [neha]),
      );
      const { rows } = await client.query(
        `select count(*)::int as n from privacy.access_log where subject_teacher_profile_id = $1`,
        [neha],
      );
      expect(rows[0].n).toBe(0);
    } finally {
      await client.query('rollback');
    }
  });

  it('lets a teacher see who opened their record', async () => {
    await client.query('begin');
    try {
      await asRoleInline(DEMO_USERS.principal, () =>
        client.query(`select privacy.log_access($1, 'appraisal')`, [neha]),
      );
      const { rows } = await asRoleInline(DEMO_USERS.neha, () =>
        client.query(`select record_type from privacy.access_log`),
      );
      expect(rows.length).toBe(1);
    } finally {
      await client.query('rollback');
    }
  });

  it('is append-only', async () => {
    await client.query('begin');
    try {
      await asRoleInline(DEMO_USERS.principal, () =>
        client.query(`select privacy.log_access($1, 'appraisal')`, [neha]),
      );
      await expect(
        client.query(`update privacy.access_log set record_type = 'nothing'`),
      ).rejects.toThrow(/append-only/);
    } finally {
      await client.query('rollback');
    }
  });
});
