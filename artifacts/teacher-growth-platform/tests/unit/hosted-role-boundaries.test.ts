import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type DemoPersona = {
  key: string;
  email: string;
};

const hostedPreflight = readFileSync(
  new URL('../../scripts/check-hosted.mjs', import.meta.url),
  'utf8',
);
const demoPersonas = JSON.parse(
  readFileSync(new URL('../../src/lib/demo-personas.json', import.meta.url), 'utf8'),
) as DemoPersona[];

const requiredBoundaryKeys = ['neha', 'vikram', 'principal'] as const;

describe('hosted preflight role-boundary wiring', () => {
  it('keeps every sensitive account in the shared persona roster', () => {
    const rosterKeys = new Set(demoPersonas.map((persona) => persona.key));

    for (const key of requiredBoundaryKeys) {
      expect(
        rosterKeys,
        `Hosted role-boundary preflight requires the "${key}" persona key in src/lib/demo-personas.json`,
      ).toContain(key);
    }
  });

  it('resolves sensitive sessions by persona key, never by role-boundary email literal', () => {
    const sensitiveChecksStart = hostedPreflight.indexOf(
      "console.log('\\nChecking sensitive role boundaries\\n');",
    );
    expect(
      sensitiveChecksStart,
      'Hosted preflight must have a dedicated sensitive role-boundary check section',
    ).toBeGreaterThanOrEqual(0);

    const sensitiveChecks = hostedPreflight.slice(sensitiveChecksStart);
    const requiredPersonas = requiredBoundaryKeys.map((key) => {
      const persona = demoPersonas.find((candidate) => candidate.key === key);
      expect(
        persona,
        `Hosted role-boundary preflight requires the "${key}" persona key in src/lib/demo-personas.json`,
      ).toBeDefined();
      return persona as DemoPersona;
    });

    for (const persona of requiredPersonas) {
      expect(
        sensitiveChecks,
        `Sensitive checks must resolve "${persona.key}" through requireDemoSession("${persona.key}")`,
      ).toMatch(new RegExp(`requireDemoSession\\(['"]${persona.key}['"]\\)`));
      expect(
        hostedPreflight,
        `Sensitive checks must not hard-code the role-boundary email ${persona.email}; use the shared "${persona.key}" persona`,
      ).not.toContain(persona.email);
    }
  });
});
