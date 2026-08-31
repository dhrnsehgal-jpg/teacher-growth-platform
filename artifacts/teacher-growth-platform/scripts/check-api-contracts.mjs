#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * Run the real PostgREST contract suites against a seeded Supabase project.
 *
 * The URL and anon key are intentionally read only from the environment. CI
 * should provide API_CONTRACT_SUPABASE_URL and API_CONTRACT_SUPABASE_ANON_KEY
 * as secret-backed variables for its dedicated seeded project. The
 * NEXT_PUBLIC_* fallback keeps the command convenient in a checked-out
 * development environment that already points at that project.
 *
 * This command never uses a service-role key, never resets or seeds a
 * database, and runs the existing read-only hosted preflight before Vitest.
 */

const url =
  process.env.API_CONTRACT_SUPABASE_URL ??
  process.env.SUPABASE_API_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.API_CONTRACT_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    'API contract checks require API_CONTRACT_SUPABASE_URL and ' +
      'API_CONTRACT_SUPABASE_ANON_KEY (or the configured NEXT_PUBLIC_SUPABASE_* values).',
  );
  process.exit(2);
}

const baseUrl = url.replace(/\/+$/, '');
let healthResponse;
try {
  healthResponse = await Promise.race([
    fetch(`${baseUrl}/auth/v1/settings`, {
      headers: { apikey: anonKey },
    }),
    delay(5000, undefined, { ref: false }).then(() => {
      throw new Error('request timed out after 5 seconds');
    }),
  ]);
} catch (error) {
  console.error(
    `Cannot reach the seeded Supabase environment: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}

if (!healthResponse.ok) {
  console.error(
    `Seeded Supabase environment returned HTTP ${healthResponse.status} from /auth/v1/settings.`,
  );
  process.exit(1);
}

const env = {
  ...process.env,
  SUPABASE_API_URL: baseUrl,
  SUPABASE_ANON_KEY: anonKey,
};

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} was terminated by ${signal}`));
      } else {
        resolve(code ?? 1);
      }
    });
  });

console.log(`Running API contract checks against ${baseUrl}`);

const preflightExit = await run(process.execPath, ['scripts/check-hosted.mjs', baseUrl, anonKey]);
if (preflightExit !== 0) {
  process.exit(preflightExit);
}

const vitestExit = await run('pnpm', [
  'exec',
  'vitest',
  'run',
  'tests/api/postgrest.test.ts',
  'tests/api/stage4-postgrest.test.ts',
  'tests/api/embed-contract.test.ts',
]);
process.exit(vitestExit);
