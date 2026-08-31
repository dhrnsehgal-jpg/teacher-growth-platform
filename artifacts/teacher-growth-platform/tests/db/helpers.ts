/**
 * Database test harness.
 *
 * These tests run against a real PostgreSQL server so that constraints,
 * triggers, RLS policies and the target-resolution SQL are exercised as they
 * will actually behave — none of which a mock can tell you.
 *
 * Start one with:  ./scripts/local-postgres/run.sh start
 * Or point TEST_DATABASE_URL at any database with the migrations applied.
 *
 * When no database is reachable the suites skip rather than fail, so
 * `npm run check` stays green on a machine without one.
 */

import { Client } from 'pg';

export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/tgp';

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

export async function databaseAvailable(): Promise<boolean> {
  try {
    const client = new Client({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 1500,
    });
    await client.connect();
    await client.query('select 1');
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs a callback as a signed-in user: sets the JWT subject claim and switches
 * to the `authenticated` role, so RLS applies exactly as it would in the app.
 * Everything happens inside a transaction that is always rolled back.
 */
export async function asUser<T>(
  client: Client,
  userId: string,
  fn: (c: Client) => Promise<T>,
): Promise<T> {
  await client.query('begin');
  try {
    await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
    await client.query('set local role authenticated');
    return await fn(client);
  } finally {
    await client.query('rollback');
  }
}

/** Ids of the seeded demo staff. Fictional people, synthetic data. */
export const DEMO_USERS = {
  simran: '00000000-0000-4000-8000-000000000201', // Foundational teacher
  harpreet: '00000000-0000-4000-8000-000000000202', // PRT
  neha: '00000000-0000-4000-8000-000000000203', // TGT
  rajesh: '00000000-0000-4000-8000-000000000204', // PGT, Physics
  anjali: '00000000-0000-4000-8000-000000000205', // HOD Science
  vikram: '00000000-0000-4000-8000-000000000206', // HOD Mathematics
  principal: '00000000-0000-4000-8000-000000000210',
} as const;

export async function schoolId(client: Client): Promise<string> {
  const { rows } = await client.query(`select id from core.school where slug = 'demo-school'`);
  return rows[0].id as string;
}

export async function currentYearId(client: Client): Promise<string> {
  const { rows } = await client.query(`select id from core.academic_year where is_current limit 1`);
  return rows[0].id as string;
}

export async function teacherProfileId(client: Client, userId: string): Promise<string> {
  const { rows } = await client.query(`select id from core.teacher_profile where user_id = $1`, [
    userId,
  ]);
  return rows[0].id as string;
}

/** Resolved target level for one competency, for one teacher. */
export async function targetFor(
  client: Client,
  userId: string,
  competencyKey: string,
): Promise<{ level: string; ordinal: number; specificity: number } | null> {
  const profile = await teacherProfileId(client, userId);
  const year = await currentYearId(client);
  const { rows } = await client.query(
    `select target_level_key as level, target_ordinal as ordinal, specificity
       from competency.resolve_targets($1, $2)
      where competency_key = $3`,
    [profile, year, competencyKey],
  );
  return rows[0] ?? null;
}
