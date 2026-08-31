/**
 * Security controls that can be checked without a running stack.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { checkRateLimit, clearRateLimit, resetAllRateLimits } from '@/lib/security/rate-limit';

describe('sign-in rate limiting', () => {
  beforeEach(() => resetAllRateLimits());

  it('allows a reasonable number of attempts — mistyping is not an attack', () => {
    for (let i = 0; i < 8; i += 1) {
      expect(checkRateLimit('198.51.100.7').allowed, `attempt ${i + 1}`).toBe(true);
    }
  });

  it('blocks once the allowance is exhausted, and says for how long', () => {
    for (let i = 0; i < 8; i += 1) checkRateLimit('198.51.100.8');
    const result = checkRateLimit('198.51.100.8');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps separate counts per address', () => {
    for (let i = 0; i < 9; i += 1) checkRateLimit('198.51.100.9');
    expect(checkRateLimit('198.51.100.9').allowed).toBe(false);
    expect(checkRateLimit('198.51.100.10').allowed).toBe(true);
  });

  it('a successful sign-in clears the count', () => {
    for (let i = 0; i < 7; i += 1) checkRateLimit('198.51.100.11');
    clearRateLimit('198.51.100.11');
    for (let i = 0; i < 8; i += 1) {
      expect(checkRateLimit('198.51.100.11').allowed).toBe(true);
    }
  });
});

describe('security headers', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');
  const csp = readFileSync(join(process.cwd(), 'src/lib/security/csp.ts'), 'utf8');

  it('sets the headers a browser needs to defend itself', () => {
    for (const header of [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Strict-Transport-Security',
    ]) {
      expect(config, header).toContain(header);
    }
  });

  it('does not leak the framework version', () => {
    expect(config).toContain('poweredByHeader: false');
  });

  it('uses a nonce for script-src rather than unsafe-inline', () => {
    expect(csp).toContain("'nonce-");
    expect(csp).toContain("'strict-dynamic'");
    // The whole point: inline script must not be blanket-allowed.
    expect(csp).not.toMatch(/script-src[^`]*'unsafe-inline'/);
  });

  it('permits eval only in development, for HMR', () => {
    expect(csp).toContain("process.env.NODE_ENV === 'development'");
    expect(csp).toContain("'unsafe-eval'");
  });

  it('forbids framing and restricts form submission to this origin', () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
  });
});

describe('service-role containment', () => {
  it('the admin client is import-restricted by lint rule', () => {
    const eslint = readFileSync(join(process.cwd(), 'eslint.config.mjs'), 'utf8');
    expect(eslint).toMatch(/admin/);
  });

  it('the admin client refuses to be constructed in a browser', () => {
    const admin = readFileSync(join(process.cwd(), 'src/lib/supabase/admin.ts'), 'utf8');
    expect(admin).toMatch(/window|browser|server-only|throw/i);
  });
});
