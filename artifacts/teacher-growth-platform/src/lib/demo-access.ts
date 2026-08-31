/**
 * Password-free access to the demo, for walkthroughs. DEVELOPMENT ONLY.
 *
 * This does NOT weaken the security model, and that distinction is the whole
 * design of it. It performs a real Supabase sign-in as a seeded demo account,
 * so the browser ends up holding an ordinary session and every page runs under
 * the same Row Level Security, the same permissions and the same gates as a
 * production visit. What it removes is the typing, not the boundary — a teacher
 * still cannot see a colleague's appraisal, and the Principal still cannot read
 * the audit log.
 *
 * Three conditions must ALL hold or the route returns 404:
 *
 *   1. NODE_ENV is not production
 *   2. DEMO_NO_LOGIN is set
 *   3. The account is one of the seeded demo addresses
 *
 * The flag is deliberately separate from NODE_ENV: a staging deployment
 * running a development build would otherwise hand out sessions to anyone who
 * found the URL.
 */

import demoPersonas from './demo-personas.json';

/** Seeded personas worth opening the demo as, in walkthrough order. */
export const DEMO_PERSONAS = demoPersonas;

export type DemoPersona = (typeof DEMO_PERSONAS)[number];

export function demoAccessEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEMO_NO_LOGIN === '1';
}

/**
 * The seeded password. Read from the environment rather than written here, so
 * this file carries no credential even for the demo — and it is checked against
 * the known demo value, so a real password cannot be driven through this route
 * by setting the variable to something else.
 */
export const DEMO_PASSWORD = 'demo-password-not-for-production';

export function findPersona(key: string | null): DemoPersona | undefined {
  return DEMO_PERSONAS.find((p) => p.key === key);
}
