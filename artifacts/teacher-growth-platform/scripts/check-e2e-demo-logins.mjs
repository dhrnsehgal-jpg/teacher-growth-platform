import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const guardedTestDirectories = [
  {
    directory: fileURLToPath(new URL('../tests/e2e/', import.meta.url)),
    maintainedHelper: 'demo-personas.ts',
  },
  {
    directory: fileURLToPath(new URL('../tests/api/', import.meta.url)),
  },
];
const demoAccessSource = fileURLToPath(new URL('../src/lib/demo-access.ts', import.meta.url));
const demoSchoolEmail = /[A-Z0-9._%+-]+@demo-school\.example\b/i;
const demoPasswordMatch = readFileSync(demoAccessSource, 'utf8').match(
  /export const DEMO_PASSWORD\s*=\s*['"]([^'"]+)['"]/,
);

if (!demoPasswordMatch) {
  throw new Error(
    `Unable to find the canonical DEMO_PASSWORD literal in ${relative(process.cwd(), demoAccessSource)}.`,
  );
}

const demoPassword = demoPasswordMatch[1];

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return filesUnder(path);
    }

    return [path];
  });
}

const violations = [];

for (const { directory, maintainedHelper } of guardedTestDirectories) {
  for (const file of filesUnder(directory)) {
    if (maintainedHelper && relative(directory, file) === maintainedHelper) {
      continue;
    }

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (demoSchoolEmail.test(line)) {
        violations.push({
          file: relative(process.cwd(), file),
          line: index + 1,
          reason:
            'hardcoded @demo-school.example address; move demo accounts to tests/e2e/demo-personas.ts',
        });
      }

      if (line.includes(demoPassword)) {
        violations.push({
          file: relative(process.cwd(), file),
          line: index + 1,
          reason:
            'hardcoded demo password; import DEMO_PASSWORD from tests/e2e/demo-personas.ts instead',
        });
      }
    });
  }
}

if (violations.length > 0) {
  console.error(
    'Demo-login literal check failed. Keep demo credentials centralized in tests/e2e/demo-personas.ts.',
  );

  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line}: ${violation.reason}`);
  }

  process.exitCode = 1;
} else {
  console.log(
    'Demo-login literal check passed: no demo credential literals found outside tests/e2e/demo-personas.ts.',
  );
}
