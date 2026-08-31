/**
 * Stage 4's central rule: regulatory values live in versioned configuration,
 * never in application logic.
 *
 * This is easy to state and easy to violate — one `const ANNUAL_CPD_HOURS = 50`
 * added in a hurry and the platform now has two answers to "what is the
 * requirement?", one of which does not change when CBSE does.
 *
 * The test reads the source rather than trusting the convention.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

/** Strips comments, so prose explaining a rule is not mistaken for encoding it. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

describe('regulatory values are configuration, not code', () => {
  const files = sourceFiles(SRC);

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('no CPD hour figure is hard-coded anywhere under src/', () => {
    // The numbers CBSE sets: the annual total, the source split, and the three
    // domain allocations. Any of these appearing as a bare numeric literal in a
    // comparison or assignment is the failure this test exists to catch.
    const forbidden = [
      { value: 50, what: 'the annual CPD total' },
      { value: 25, what: 'the CBSE/school source split' },
      { value: 12, what: 'the Core Values and Ethics allocation' },
      { value: 24, what: 'the Knowledge and Practice allocation' },
      { value: 14, what: 'the Professional Growth allocation' },
      { value: 11, what: 'the academic-task cap' },
    ];

    const offences: string[] = [];
    for (const file of files) {
      const text = code(readFileSync(file, 'utf8'));
      // Only look at lines that also mention CPD, hours or a requirement, so a
      // Tailwind class or an array index does not trip the check.
      for (const [i, line] of text.split('\n').entries()) {
        // No \b here: `_` is a word character, so /\bcpd\b/ misses
        // ANNUAL_CPD_HOURS — which is exactly the name a violation would use.
        if (!/cpd|hour|requirement|allocation|quota|target/i.test(line)) continue;
        if (/className|w-|h-|px-|py-|gap-|text-|rounded|slice\(/.test(line)) continue;
        for (const f of forbidden) {
          const pattern = new RegExp(`(?<![\\w.])${f.value}(?![\\w.])`);
          if (pattern.test(line)) {
            offences.push(
              `${file.replace(process.cwd(), '')}:${i + 1} — ${f.what}: ${line.trim()}`,
            );
          }
        }
      }
    }

    expect(offences, offences.join('\n')).toEqual([]);
  });

  it('no SQAAF structural figure is hard-coded either', () => {
    const offences: string[] = [];
    for (const file of files) {
      const text = code(readFileSync(file, 'utf8'));
      for (const [i, line] of text.split('\n').entries()) {
        if (!/sqaaf|standard|domain|mark|weightage/i.test(line)) continue;
        if (/className|w-|h-|px-|py-|gap-|text-|rounded|slice\(/.test(line)) continue;
        // 84 standards, 336 marks, 40% weightage, 7 domains, 4 levels.
        if (/(?<![\w.])(84|336)(?![\w.])/.test(line)) {
          offences.push(`${file.replace(process.cwd(), '')}:${i + 1} — ${line.trim()}`);
        }
      }
    }
    expect(offences, offences.join('\n')).toEqual([]);
  });

  it('the compliance data layer reads the requirement rather than assuming one', () => {
    const text = readFileSync(join(SRC, 'lib/data/compliance.ts'), 'utf8');
    expect(text).toContain('requirement_version_for_year');
    expect(text).toContain('cpd_progress');
  });

  it('the CPD page refuses to show a target when none is configured', () => {
    const text = readFileSync(join(SRC, 'app/cpd/page.tsx'), 'utf8');
    expect(text).toMatch(/No CPD requirement is configured/);
  });
});
