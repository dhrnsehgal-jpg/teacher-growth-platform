import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD } from '@/lib/demo-access';

const e2eDirectory = fileURLToPath(new URL('../e2e/', import.meta.url));
const apiDirectory = fileURLToPath(new URL('../api/', import.meta.url));
const checker = fileURLToPath(new URL('../../scripts/check-e2e-demo-logins.mjs', import.meta.url));
const e2eFixture = join(e2eDirectory, `.check-e2e-demo-logins-${process.pid}.spec.ts`);
const apiFixture = join(apiDirectory, `.check-api-demo-logins-${process.pid}.test.ts`);

afterEach(() => {
  for (const fixture of [e2eFixture, apiFixture]) {
    if (existsSync(fixture)) {
      unlinkSync(fixture);
    }
  }
});

function runChecker(): { exitCode: number; output: string } {
  try {
    return {
      exitCode: 0,
      output: execFileSync(process.execPath, [checker], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    const result = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: result.status ?? 0,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  }
}

describe('the demo-login credential guard', () => {
  it('reports the relative path, line, and import remediation for a leaked password', () => {
    writeFileSync(
      e2eFixture,
      ['// temporary fixture', '', `const leakedPassword = '${DEMO_PASSWORD}';`, ''].join('\n'),
    );

    const { exitCode, output } = runChecker();

    const relativeFixture = relative(process.cwd(), e2eFixture);
    expect(exitCode).not.toBe(0);
    expect(output).toContain(
      `- ${relativeFixture}:3: hardcoded demo password; import DEMO_PASSWORD from tests/e2e/demo-personas.ts instead`,
    );
  });

  it('reports the relative path, line, and persona-helper remediation for a leaked email', () => {
    writeFileSync(
      e2eFixture,
      [
        '// temporary fixture',
        '',
        "const leakedEmail = 'neha.sharma@demo-school.example';",
        '',
      ].join('\n'),
    );

    const { exitCode, output } = runChecker();

    const relativeFixture = relative(process.cwd(), e2eFixture);
    expect(exitCode).not.toBe(0);
    expect(output).toContain(
      `- ${relativeFixture}:3: hardcoded @demo-school.example address; move demo accounts to tests/e2e/demo-personas.ts`,
    );
  });

  it('also rejects hardcoded API-test demo emails', () => {
    writeFileSync(
      apiFixture,
      [
        '// temporary fixture',
        '',
        "const leakedEmail = 'neha.sharma@demo-school.example';",
        '',
      ].join('\n'),
    );

    const { exitCode, output } = runChecker();

    const relativeFixture = relative(process.cwd(), apiFixture);
    expect(exitCode).not.toBe(0);
    expect(output).toContain(
      `- ${relativeFixture}:3: hardcoded @demo-school.example address; move demo accounts to tests/e2e/demo-personas.ts`,
    );
  });
});
