/**
 * Regulatory change management.
 *
 * The rule that matters: nothing automated may activate a regulatory
 * requirement. Everything else here is workflow discipline.
 */

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asUser, connect, databaseAvailable, DEMO_USERS, schoolId } from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

let client: Client;
let school: string;

beforeAll(async () => {
  if (!available) return;
  client = await connect();
  school = await schoolId(client);
});
afterAll(async () => {
  if (available && client) await client.end();
});

async function newChange(c: Client) {
  const { rows } = await c.query(
    `insert into regulatory.change_request (school_id, title, summary, source_url, raised_by)
     values ($1, 'CBSE Circular 12/2027 — assessment reporting',
             'Appears to change how competency-based assessment outcomes are reported.',
             'https://www.cbse.gov.in/example', $2)
     returning id`,
    [school, DEMO_USERS.principal],
  );
  return rows[0].id as string;
}

describeDb('nothing automated can activate a requirement', () => {
  it('refuses activation with no signed-in person', async () => {
    // As superuser there is no auth.uid(), which is precisely the situation a
    // background job or an AI agent would be in.
    await client.query('begin');
    try {
      await expect(
        client.query(
          `update regulatory.school_requirement_status set is_enforced = true
            where school_id = $1
              and requirement_id = (select id from regulatory.requirement
                                     where requirement_key = 'cbse.cpd.annual_hours')`,
          [school],
        ),
      ).rejects.toThrow(/without a signed-in person|Nothing automated/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses activation by someone without regulatory.manage', async () => {
    await client.query('begin');
    try {
      await asUser(client, DEMO_USERS.neha, async (c) => {
        // RLS refuses the write before the activation trigger is ever reached,
        // so the update matches nothing rather than raising. Both doors are
        // shut; this is simply the outer one.
        const { rowCount } = await c.query(
          `update regulatory.school_requirement_status set is_enforced = true
            where school_id = $1`,
          [school],
        );
        expect(rowCount).toBe(0);
      });
    } finally {
      await client.query('rollback').catch(() => undefined);
    }
  });

  it('allows it for a Compliance Administrator', async () => {
    // The demo Compliance Administrator role exists; find a holder.
    const { rows: holder } = await client.query(
      `select ra.user_id from core.user_role_assignment ra
         join core.role_permission rp on rp.role_id = ra.role_id
        where ra.school_id = $1 and rp.permission_key = 'regulatory.manage' limit 1`,
      [school],
    );
    if (holder.length === 0) return; // no holder seeded; nothing to assert

    await client.query('begin');
    try {
      await asUser(client, holder[0].user_id, async (c) => {
        // Stage 1's own guard also applies: enforcement requires applicability
        // to be `verified` with a named determiner. The Stage 6 trigger adds
        // the requirement that a HUMAN is doing it — both must be satisfied.
        const { rowCount } = await c.query(
          `update regulatory.school_requirement_status
              set applicability = 'verified', determined_by = $2, determined_at = now(),
                  is_enforced = true
            where school_id = $1
              and requirement_id = (select id from regulatory.requirement
                                     where requirement_key = 'cbse.cpd.annual_hours')`,
          [school, holder[0].user_id],
        );
        expect(rowCount).toBe(1);
      });
    } finally {
      await client.query('rollback').catch(() => undefined);
    }
  });
});

describeDb('the change workflow runs in order', () => {
  it('records a change and its arrival', async () => {
    await client.query('begin');
    try {
      const id = await newChange(client);
      const { rows } = await client.query(
        `select stage from regulatory.change_request where id = $1`,
        [id],
      );
      expect(rows[0].stage).toBe('received');

      const { rows: events } = await client.query(
        `select to_stage from regulatory.change_event where change_id = $1`,
        [id],
      );
      expect(events.map((e) => e.to_stage)).toEqual(['received']);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses to skip straight to activation', async () => {
    await client.query('begin');
    try {
      const id = await newChange(client);
      await expect(
        client.query(`update regulatory.change_request set stage = 'activated' where id = $1`, [
          id,
        ]),
      ).rejects.toThrow(/cannot move from received to activated/);
    } finally {
      await client.query('rollback');
    }
  });

  it('requires a written conclusion past the source stage', async () => {
    await client.query('begin');
    try {
      const id = await newChange(client);
      await client.query(
        `update regulatory.change_request set stage = 'source_recorded' where id = $1`,
        [id],
      );
      await expect(
        client.query(`update regulatory.change_request set stage = 'under_review' where id = $1`, [
          id,
        ]),
      ).rejects.toThrow(/change_reviewed_complete/);
    } finally {
      await client.query('rollback');
    }
  });

  it('requires an applicability determination before a version exists', async () => {
    await client.query('begin');
    try {
      const id = await newChange(client);
      await client.query(
        `update regulatory.change_request set stage = 'source_recorded' where id = $1`,
        [id],
      );
      await client.query(
        `update regulatory.change_request
            set stage = 'under_review', reviewed_by = $2, reviewed_at = now(),
                review_note = 'Read the circular in full; it concerns reporting rather than assessment itself.'
          where id = $1`,
        [id, DEMO_USERS.principal],
      );
      await expect(
        client.query(
          `update regulatory.change_request set stage = 'applicability_determined' where id = $1`,
          [id],
        ),
      ).rejects.toThrow(/change_applicability_determined/);
    } finally {
      await client.query('rollback');
    }
  });

  it('notifies administrators at the stages that need action', async () => {
    await client.query('begin');
    try {
      const id = await newChange(client);
      await client.query(
        `update regulatory.change_request set stage = 'source_recorded' where id = $1`,
        [id],
      );
      const { rows } = await client.query(
        `select count(*)::int as n, min(category) as category
           from core.notification where category = 'regulatory_change'`,
      );
      expect(rows[0].n).toBeGreaterThan(0);
      expect(rows[0].category).toBe('regulatory_change');
    } finally {
      await client.query('rollback');
    }
  });

  it('does not notify at every step — that trains people to ignore them', async () => {
    await client.query('begin');
    try {
      const before = await client.query(
        `select count(*)::int as n from core.notification where category = 'regulatory_change'`,
      );
      const id = await newChange(client); // 'received' — no notification
      const after = await client.query(
        `select count(*)::int as n from core.notification where category = 'regulatory_change'`,
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
      expect(id).toBeTruthy();
    } finally {
      await client.query('rollback');
    }
  });

  it('keeps the trail append-only', async () => {
    await client.query('begin');
    try {
      await newChange(client);
      await expect(
        client.query(`update regulatory.change_event set to_stage = 'activated'`),
      ).rejects.toThrow(/append-only/);
    } finally {
      await client.query('rollback');
    }
  });

  it('cannot reject something already activated', async () => {
    await client.query('begin');
    try {
      const id = await newChange(client);
      const steps: [string, Record<string, string>][] = [
        ['source_recorded', {}],
        ['under_review', { review_note: 'Read in full and summarised for the leadership team.' }],
        [
          'applicability_determined',
          {
            review_note: 'Determined to apply to this school subject to affiliation confirmation.',
            applicability_determination: 'potentially_applicable',
            applicability_note: 'Applies to affiliated schools; our affiliation is unverified.',
          },
        ],
      ];
      for (const [stage, extra] of steps) {
        const sets = ['stage = $2', 'reviewed_by = $3', 'reviewed_at = now()'];
        const params: unknown[] = [id, stage, DEMO_USERS.principal];
        let i = 4;
        for (const [k, v] of Object.entries(extra)) {
          sets.push(`${k} = $${i}`);
          params.push(v);
          i += 1;
        }
        await client.query(
          `update regulatory.change_request set ${sets.join(', ')} where id = $1`,
          params,
        );
      }
      await client.query(
        `update regulatory.change_request
            set stage = 'version_created', effective_from = current_date,
                requirement_id = (select id from regulatory.requirement limit 1)
          where id = $1`,
        [id],
      );
      await client.query(`update regulatory.change_request set stage = 'activated' where id = $1`, [
        id,
      ]);
      await expect(
        client.query(`update regulatory.change_request set stage = 'rejected' where id = $1`, [id]),
      ).rejects.toThrow(/cannot be rejected; supersede it instead/);
    } finally {
      await client.query('rollback');
    }
  });
});
