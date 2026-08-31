/**
 * The password-free demo door, and the three locks on it.
 *
 * This is the one piece of the system that hands out a session without a
 * credential, so it gets tested harder than the thing it bypasses. The risk it
 * carries is not hypothetical: a staging box running a development build, with
 * this flag inherited from a copied `.env`, would let anyone who found the URL
 * sign in as the Principal.
 */

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD, DEMO_PERSONAS, demoAccessEnabled, findPersona } from '@/lib/demo-access';

const original = { ...process.env };
const seedSql = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8');
const seedPersonaEmails = [...seedSql.matchAll(/^\s*--\s*demo-access-persona:\s*(\S+)\s*$/gm)].map(
  (match) => {
    const email = match[1];
    if (!email) throw new Error('A demo access roster entry is missing its email');
    return email.toLowerCase();
  },
);

afterEach(() => {
  process.env = { ...original };
});

/**
 * `NODE_ENV` is typed readonly, and for good reason — production code should
 * never assign it. A test asserting what happens IN production has to, so the
 * cast is confined to this one helper rather than sprinkled through the file.
 */
function setNodeEnv(value: string) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

describe('demo access is off unless deliberately switched on', () => {
  it('is off with no flag set', () => {
    delete process.env.DEMO_NO_LOGIN;
    expect(demoAccessEnabled()).toBe(false);
  });

  it('is off in production even with the flag set', () => {
    // The flag alone must not be enough. A production build is a production
    // build whatever the environment file says.
    setNodeEnv('production');
    process.env.DEMO_NO_LOGIN = '1';
    expect(demoAccessEnabled()).toBe(false);
  });

  it('is off for any value other than exactly "1"', () => {
    setNodeEnv('development');
    for (const value of ['0', 'true', 'yes', '', 'false']) {
      process.env.DEMO_NO_LOGIN = value;
      expect(demoAccessEnabled(), `DEMO_NO_LOGIN=${value}`).toBe(false);
    }
  });

  it('is on only in development with the flag set to 1', () => {
    setNodeEnv('development');
    process.env.DEMO_NO_LOGIN = '1';
    expect(demoAccessEnabled()).toBe(true);
  });
});

describe('the personas it will open as', () => {
  it('matches the seeded demo access roster in both directions', () => {
    const personaEmails = DEMO_PERSONAS.map((p) => p.email.toLowerCase());
    const seededOnly = seedPersonaEmails.filter((email) => !personaEmails.includes(email));
    const personaOnly = personaEmails.filter((email) => !seedPersonaEmails.includes(email));

    expect(
      personaOnly.map((email) => {
        const persona = DEMO_PERSONAS.find((p) => p.email.toLowerCase() === email);
        return `${email} (${persona?.role ?? 'unknown role'})`;
      }),
      'Demo personas missing from supabase/seed.sql',
    ).toEqual([]);
    expect(
      seededOnly.map((email) => `${email} (not listed in DEMO_PERSONAS)`),
      'Seeded demo personas missing from DEMO_PERSONAS',
    ).toEqual([]);
    expect(
      new Set(seedPersonaEmails).size,
      'supabase/seed.sql declares the same demo access email more than once',
    ).toBe(seedPersonaEmails.length);

    // The roster comments above are only a declaration of intent. Make sure
    // each declared account still has a real seed occurrence outside that
    // declaration, rather than passing after its auth/app_user row is removed.
    const seedWithoutRoster = seedSql.replace(/^\s*--\s*demo-access-persona:\s*\S+\s*$/gm, '');
    for (const persona of DEMO_PERSONAS) {
      expect(
        seedWithoutRoster.toLowerCase(),
        `${persona.email} (${persona.role}) is declared but not seeded`,
      ).toContain(persona.email.toLowerCase());
    }
  });

  it('uses only seeded demo-domain addresses', () => {
    // The route can only ever sign in as one of these, so an address outside
    // the demo domain here would be the whole hole.
    for (const p of DEMO_PERSONAS) {
      expect(p.email, p.name).toMatch(/@demo-school\.example$/);
    }
  });

  it('refuses an unknown key rather than falling back to somebody', () => {
    expect(findPersona('nobody')).toBeUndefined();
    expect(findPersona(null)).toBeUndefined();
    expect(findPersona('')).toBeUndefined();
  });

  it('covers the roles a walkthrough needs to contrast', () => {
    const keys = DEMO_PERSONAS.map((p) => p.key);
    // A teacher, their supervisor, leadership, and the compliance
    // administrator — the boundaries only show up by comparison.
    for (const key of [
      'neha',
      'vikram',
      'anjali',
      'vice-principal',
      'academic-coordinator',
      'principal',
      'priya',
    ]) {
      expect(keys).toContain(key);
    }
  });

  it('uses the demo password, which is named so it cannot be mistaken', () => {
    expect(DEMO_PASSWORD).toBe('demo-password-not-for-production');
    expect(DEMO_PASSWORD).toMatch(/not-for-production/);
  });
});
