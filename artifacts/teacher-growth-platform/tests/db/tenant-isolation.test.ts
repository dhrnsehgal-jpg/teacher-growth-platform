/**
 * One school must never reach another school's data.
 *
 * Every other suite runs against a single seeded school, which means none of
 * them can catch the failure that matters most here: a policy that scopes to
 * "your own record" but forgets to scope to your own school looks perfectly
 * correct until a second tenant exists. So this one builds a second school —
 * inside a transaction that is always rolled back, so the demo environment
 * stays the single Punjab school the brief asks for — and looks from both
 * sides.
 *
 * Both directions are tested. A policy can be right one way and wrong the
 * other, and "the new school cannot see the old one" is the easy half.
 */

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connect, databaseAvailable, DEMO_USERS } from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

let client: Client;
beforeAll(async () => {
  if (available) client = await connect();
});
afterAll(async () => {
  if (available && client) await client.end();
});

const RIVAL_USER = '00000000-0000-4000-8000-0000000009f1';

interface Fixture {
  rivalSchool: string;
  rivalProfile: string;
  demoSchool: string;
  demoProfile: string;
}

/**
 * Creates a second school with one teacher in it, runs `fn`, and rolls back.
 *
 * The role switching happens inside this transaction rather than through
 * `asUser`, which opens its own — nested, the fixture would be discarded
 * before anything could look at it.
 */
async function withRivalSchool<T>(fn: (f: Fixture, as: AsRole) => Promise<T>): Promise<T> {
  await client.query('begin');
  try {
    const { rows: school } = await client.query(
      `insert into core.school (slug, legal_name, display_name)
       values ('rival-school', 'Test Fixture School Society', 'Rival Public School')
       returning id`,
    );
    const rivalSchool = school[0].id as string;
    await client.query('select core.provision_school_roles($1)', [rivalSchool]);

    await client.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [
      RIVAL_USER,
    ]);
    await client.query(
      `insert into core.app_user (id, email, full_name)
       values ($1, 'fixture.teacher@rival-school.invalid', 'Fixture Teacher')`,
      [RIVAL_USER],
    );
    await client.query(
      `insert into core.user_role_assignment (school_id, user_id, role_id)
       select $1, $2, id from core.role where school_id = $1 and key = 'teacher'`,
      [rivalSchool, RIVAL_USER],
    );
    const { rows: prof } = await client.query(
      `insert into core.teacher_profile (school_id, user_id) values ($1, $2) returning id`,
      [rivalSchool, RIVAL_USER],
    );

    const { rows: demo } = await client.query(
      `select s.id as school, p.id as profile
         from core.school s
         join core.teacher_profile p on p.school_id = s.id
        where s.slug = 'demo-school' and p.user_id = $1`,
      [DEMO_USERS.neha],
    );

    const as: AsRole = async (userId, body) => {
      await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
      await client.query('set local role authenticated');
      try {
        return await body();
      } finally {
        await client.query('reset role');
      }
    };

    return await fn(
      {
        rivalSchool,
        rivalProfile: prof[0].id as string,
        demoSchool: demo[0].school as string,
        demoProfile: demo[0].profile as string,
      },
      as,
    );
  } finally {
    await client.query('rollback');
  }
}

type AsRole = <T>(userId: string, body: () => Promise<T>) => Promise<T>;

describeDb('tenant isolation', () => {
  it('a teacher sees only their own school in the school table', async () => {
    await withRivalSchool(async (f, as) => {
      const mine = await as(DEMO_USERS.neha, () =>
        client.query(`select id, slug from core.school`),
      );
      expect(mine.rows.map((r) => r.slug)).toEqual(['demo-school']);

      const theirs = await as(RIVAL_USER, () => client.query(`select id, slug from core.school`));
      expect(theirs.rows.map((r) => r.slug)).toEqual(['rival-school']);
    });
  });

  it('neither school can see the other school teacher profiles', async () => {
    await withRivalSchool(async (f, as) => {
      const mine = await as(DEMO_USERS.principal, () =>
        client.query(`select school_id from core.teacher_profile`),
      );
      expect(mine.rows.length).toBeGreaterThan(0);
      expect(mine.rows.every((r) => r.school_id === f.demoSchool)).toBe(true);

      const theirs = await as(RIVAL_USER, () =>
        client.query(`select school_id from core.teacher_profile`),
      );
      expect(theirs.rows.every((r) => r.school_id === f.rivalSchool)).toBe(true);
    });
  });

  it('naming another tenant record by its id still returns nothing', async () => {
    // Scope isolation must not depend on the query being the one the UI writes.
    // Anyone can put an id in a URL.
    await withRivalSchool(async (f, as) => {
      const probe = await as(RIVAL_USER, () =>
        client.query(`select id from core.teacher_profile where id = $1`, [f.demoProfile]),
      );
      expect(probe.rows).toEqual([]);

      const reverse = await as(DEMO_USERS.principal, () =>
        client.query(`select id from core.teacher_profile where id = $1`, [f.rivalProfile]),
      );
      expect(reverse.rows).toEqual([]);
    });
  });

  it('a principal cannot write into the other school', async () => {
    await withRivalSchool(async (f, as) => {
      await as(DEMO_USERS.principal, async () => {
        // A refused statement aborts the transaction, and the fixture lives in
        // it — so the attempt needs its own savepoint to roll back to.
        await client.query('savepoint attempt');
        await expect(
          client.query(`insert into core.teacher_profile (school_id, user_id) values ($1, $2)`, [
            f.rivalSchool,
            DEMO_USERS.neha,
          ]),
        ).rejects.toThrow(/row-level security|permission denied/i);
        await client.query('rollback to savepoint attempt');
      });
    });
  });

  it('can_view_staff_record refuses across schools', async () => {
    // Seven tables carry `school_id` but scope through this function instead of
    // naming the column — ai.suggestion, the appraisal stage trail and teacher
    // response, two CPD child tables, the evidence status history and the plan
    // item trail. All seven are only as isolated as this one function, so it
    // gets its own test rather than being taken on trust.
    await withRivalSchool(async (f, as) => {
      const mine = await as(DEMO_USERS.principal, () =>
        client.query(`select core.can_view_staff_record($1) as ok`, [f.demoProfile]),
      );
      expect(mine.rows[0].ok).toBe(true);

      const theirs = await as(DEMO_USERS.principal, () =>
        client.query(`select core.can_view_staff_record($1) as ok`, [f.rivalProfile]),
      );
      expect(theirs.rows[0].ok).toBe(false);

      const reverse = await as(RIVAL_USER, () =>
        client.query(`select core.can_view_staff_record($1) as ok`, [f.demoProfile]),
      );
      expect(reverse.rows[0].ok).toBe(false);
    });
  });

  it('every school-scoped table carries the scope in its policy', async () => {
    // The structural check behind the behavioural ones: a table holding
    // `school_id` whose policies never mention a school is the shape of the
    // defect this suite exists to catch, and it would pass every single-tenant
    // test in the repository.
    //
    // `can_view_staff_record` counts as scoping because it joins the caller's
    // role assignment to the subject's own school — the test above proves it,
    // and this list would otherwise flag seven tables that are correct.
    const { rows } = await client.query(`
      with scoped as (
        select c.table_schema, c.table_name
          from information_schema.columns c
          join pg_class pc on pc.relname = c.table_name
          join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = c.table_schema
         where c.column_name = 'school_id'
           and c.table_schema not in ('pg_catalog', 'information_schema', 'auth', 'storage')
           and pc.relrowsecurity
      )
      select s.table_schema || '.' || s.table_name as relation
        from scoped s
       where not exists (
         select 1 from pg_policies p
          where p.schemaname = s.table_schema
            and p.tablename = s.table_name
            and (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~
                '(user_school_ids|school_id|shares_school_with|can_view_staff_record)'
       )
       order by 1`);
    expect(rows.map((r) => r.relation)).toEqual([]);
  });
});
