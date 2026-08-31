#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

/**
 * Preflight for a hosted Supabase project.
 *
 * Exists because of one specific, expensive failure mode. Eighty-three reads in
 * this codebase destructure `{ data }` and discard `error`:
 *
 *     const { data } = await supabase.schema('core').from('school').select('*');
 *     return (data ?? []) as Row[];
 *
 * So when PostgREST refuses — most likely because a schema is not in the
 * project's "Exposed schemas" list, which on hosted Supabase defaults to
 * `public` alone — the page does not error. It renders empty. Every dashboard
 * comes up blank and nothing anywhere says why.
 *
 * This asks PostgREST directly, with the error left in.
 *
 *   node scripts/check-hosted.mjs https://xxxx.supabase.co <anon-key>
 *
 * It signs in first. Checking as an anonymous caller cannot work: `anon` has no
 * USAGE on these schemas by design, so everything comes back "permission denied
 * for schema core" whether the project is configured correctly or not. Signing
 * in also separates the two failures that matter, which produce different
 * errors and need completely different fixes:
 *
 *   PGRST106 "schema must be one of"  → not in Exposed schemas (a dashboard setting)
 *   42501    "permission denied"      → exposed, but migration 0008 (grants) did not run
 */

const [, , url, key] = process.argv;
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-password-not-for-production';
const DEMO_PERSONAS = JSON.parse(
  readFileSync(new URL('../src/lib/demo-personas.json', import.meta.url), 'utf8'),
);

if (!url || !key) {
  console.error('Usage: node scripts/check-hosted.mjs <supabase-url> <anon-key>');
  process.exit(2);
}

// Fail closed: this check is meaningful only with a public client key. Current
// publishable keys are explicitly named; legacy anon keys are JWTs with role
// "anon". Secret keys and unrecognized opaque values are refused.
let publicKey = key.startsWith('sb_publishable_');
if (!publicKey && !key.startsWith('sb_secret_')) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    publicKey = payload.role === 'anon';
  } catch {
    publicKey = false;
  }
}
if (!publicKey) {
  console.error(
    'Refusing a secret or unrecognized API key. Pass a Supabase anon / publishable key.',
  );
  process.exit(2);
}

/** Every schema this application queries through PostgREST. */
const SCHEMAS = [
  'public',
  'core',
  'regulatory',
  'audit',
  'competency',
  'kpi',
  'evidence',
  'growth',
  'assessment',
  'cpd',
  'compliance',
  'sqaaf',
  'service',
  'appraisal',
  'pay',
  'ai',
  'privacy',
];

/** One table per schema that must exist once migrations have been applied. */
const WITNESS = {
  core: 'school',
  regulatory: 'requirement',
  audit: 'audit_log',
  competency: 'competency',
  kpi: 'template',
  evidence: 'evidence',
  growth: 'gap',
  assessment: 'verified_competency',
  cpd: 'activity',
  compliance: 'cpd_record',
  sqaaf: 'domain',
  service: 'career_event',
  appraisal: 'appraisal',
  pay: 'recommendation',
  ai: 'suggestion',
  privacy: 'retention_policy',
};

const base = url.replace(/\/+$/, '');
let failures = 0;

/** Signs in, so the checks run as a real user rather than as `anon`. */
async function signIn(email) {
  const response = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `HTTP ${response.status}: ${body.slice(0, 200)}. ` +
        'Either the seed has not been run against this project, or the password differs.',
    );
  }
  const session = await response.json();
  if (!session.access_token || !session.user?.id) {
    throw new Error('the response did not include a user session');
  }
  return { token: session.access_token, userId: session.user.id };
}

async function readRows(token, schema, table, query) {
  const response = await fetch(`${base}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Accept-Profile': schema,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${schema}.${table} returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const rows = JSON.parse(body);
  if (!Array.isArray(rows)) throw new Error(`${schema}.${table} did not return a row array`);
  return rows;
}

async function callRpc(token, schema, fn, args) {
  const response = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Profile': schema,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${schema}.${fn} returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  return JSON.parse(body);
}

function report(ok, message) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
  if (!ok) failures += 1;
}

const sessions = new Map();
console.log(`Checking sign-in for all ${DEMO_PERSONAS.length} demo chooser accounts\n`);
for (const persona of DEMO_PERSONAS) {
  try {
    const session = await signIn(persona.email);
    sessions.set(persona.key, session);
    report(true, `${persona.email} (${persona.role}) can sign in`);
  } catch (error) {
    report(
      false,
      `${persona.email} (${persona.role}) cannot sign in: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// Do not run role-boundary checks with a partial roster. A missing account is
// already a release blocker, and continuing would make the resulting errors
// ambiguous instead of identifying the broken account above.
if (sessions.size !== DEMO_PERSONAS.length) {
  console.error('\nDemo account sign-in checks failed. Do not deploy.');
  process.exit(1);
}

function requireDemoSession(personaKey) {
  const persona = DEMO_PERSONAS.find((candidate) => candidate.key === personaKey);
  if (!persona) {
    throw new Error(
      `Sensitive role check expected demo persona "${personaKey}" in the shared roster`,
    );
  }

  const session = sessions.get(persona.key);
  if (!session) {
    throw new Error(
      `Sensitive role check expected ${persona.name} (${persona.key}) to have a signed-in account`,
    );
  }

  return { persona, session };
}

let token;
try {
  token = requireDemoSession('neha').session.token;
} catch (error) {
  console.error(
    `\nPreflight error: ${error instanceof Error ? error.message : String(error)}. Do not deploy.`,
  );
  process.exit(1);
}
console.log('\nAll demo chooser accounts signed in successfully.\n');

async function check(schema) {
  const table = WITNESS[schema];
  if (!table) return { schema, ok: true, note: 'no witness table needed' };

  const response = await fetch(`${base}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Accept-Profile': schema,
    },
  });

  if (response.ok) return { schema, ok: true, note: `${table} reachable` };

  const body = await response.text();
  // The two failures look nothing alike, and the distinction is the whole
  // point: one is a dashboard setting, the other is an unapplied migration.
  const note = /schema must be one of|not exposed|PGRST106/i.test(body)
    ? 'NOT EXPOSED — add this schema in Settings → API → Exposed schemas'
    : /permission denied for schema|42501/i.test(body)
      ? 'EXPOSED BUT NOT GRANTED — migration 0008_grants.sql has not run'
      : /does not exist|PGRST205/i.test(body)
        ? `table ${table} missing — migrations not applied`
        : `HTTP ${response.status}: ${body.slice(0, 160)}`;
  return { schema, ok: false, note };
}

console.log(`Checking ${base}\n`);

for (const schema of SCHEMAS) {
  const result = await check(schema);
  if (!result.ok) failures += 1;
  console.log(`${result.ok ? '  ok  ' : ' FAIL '} ${schema.padEnd(12)} ${result.note}`);
}

// Anonymous access must be refused everywhere. If a table comes back with rows
// to an unauthenticated caller, RLS is not doing its job on the hosted project.
// Deliberately with the ANON key and no session, which is the check that
// matters: a stranger with the publishable key must get nothing.
const leak = await fetch(`${base}/rest/v1/teacher_profile?select=id&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'core' },
});
const leaked = leak.ok && (await leak.json()).length > 0;
console.log(
  `\n${leaked ? ' FAIL ' : '  ok  '} anonymous read of core.teacher_profile ${
    leaked ? 'RETURNED ROWS — RLS is not applying' : 'returns nothing, as it must'
  }`,
);
if (leaked) failures += 1;

console.log('\nChecking sensitive role boundaries\n');
try {
  const { persona: neha, session: nehaSession } = requireDemoSession('neha');
  const { persona: vikram, session: vikramSession } = requireDemoSession('vikram');
  const { persona: gurpreet, session: gurpreetSession } = requireDemoSession('principal');

  const nehaRecommendations = await readRows(
    nehaSession.token,
    'pay',
    'recommendation',
    'select=id,teacher_profile_id&order=id.asc&limit=1',
  );
  report(
    nehaRecommendations.length > 0,
    `${neha.name}'s increment recommendation exists${
      nehaRecommendations.length > 0 ? '' : ' (expected at least 1 row, received 0)'
    }`,
  );

  if (nehaRecommendations.length > 0) {
    const recommendation = nehaRecommendations[0];
    const vikramRows = await readRows(
      vikramSession.token,
      'pay',
      'recommendation',
      `select=id&id=eq.${encodeURIComponent(recommendation.id)}`,
    );
    report(
      vikramRows.length === 0,
      `${vikram.name} cannot read ${neha.name}'s increment recommendation${
        vikramRows.length === 0 ? '' : ' — SENSITIVE PAY ROW LEAKED'
      }`,
    );
  }

  const schools = await readRows(gurpreetSession.token, 'core', 'school', 'select=id&limit=1');
  const gurpreetSchool = schools.length === 1 ? schools[0] : undefined;
  if (schools.length !== 1) {
    report(
      false,
      `${gurpreet.name}'s school could not be identified (expected 1 row, received ${schools.length})`,
    );
  } else {
    const hasAuditRead = await callRpc(gurpreetSession.token, 'core', 'has_permission', {
      p_school_id: gurpreetSchool.id,
      p_permission: 'audit.read',
    });
    report(
      hasAuditRead === false,
      `${gurpreet.name} lacks audit.read${hasAuditRead === false ? '' : ' — PERMISSION LEAKED'}`,
    );
  }

  const nehaProfiles = await readRows(
    nehaSession.token,
    'core',
    'teacher_profile',
    `select=id,school_id&user_id=eq.${encodeURIComponent(nehaSession.userId)}`,
  );
  report(
    nehaProfiles.length === 1,
    `${neha.name}'s teacher profile is identifiable${
      nehaProfiles.length === 1 ? '' : ` (expected 1 row, received ${nehaProfiles.length})`
    }`,
  );

  if (nehaProfiles.length === 1 && gurpreetSchool) {
    const nehaProfile = nehaProfiles[0];
    const sameSchool = nehaProfile.school_id === gurpreetSchool.id;
    report(sameSchool, `${neha.name} and ${gurpreet.name} belong to the same seeded school`);

    // Neha can identify entries about her own teacher profile through the
    // narrow "own record" policy. The witness must also not be authored by
    // Gurpreet, because either condition would legitimately let Gurpreet read it.
    const nehaAuditRows = await readRows(
      nehaSession.token,
      'audit',
      'audit_log',
      `select=id,actor_user_id&school_id=eq.${encodeURIComponent(
        gurpreetSchool.id,
      )}&entity_schema=eq.core&entity_table=eq.teacher_profile&entity_id=eq.${encodeURIComponent(
        nehaProfile.id,
      )}&order=id.asc`,
    );
    const auditWitness = nehaAuditRows.find((row) => row.actor_user_id !== gurpreetSession.userId);
    report(
      auditWitness !== undefined,
      `A ${neha.name} audit witness not authored by ${gurpreet.name} exists${
        auditWitness === undefined ? ` (checked ${nehaAuditRows.length} row(s))` : ''
      }`,
    );

    if (sameSchool && auditWitness) {
      const gurpreetRows = await readRows(
        gurpreetSession.token,
        'audit',
        'audit_log',
        `select=id&id=eq.${encodeURIComponent(auditWitness.id)}`,
      );
      report(
        gurpreetRows.length === 0,
        `${gurpreet.name} cannot read the third-party school audit row${
          gurpreetRows.length === 0 ? '' : ' — AUDIT ROW LEAKED'
        }`,
      );
    }
  }
} catch (error) {
  report(false, `sensitive boundary check could not complete: ${error.message}`);
}

console.log(
  failures === 0
    ? '\nAll schemas reachable; anonymous and sensitive role boundaries are intact.'
    : `\n${failures} problem(s). Do not deploy — see each FAIL above.`,
);
process.exit(failures === 0 ? 0 : 1);
