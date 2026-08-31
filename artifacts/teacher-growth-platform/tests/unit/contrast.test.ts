/**
 * The palette, measured against WCAG rather than eyeballed.
 *
 * These ratios were computed once and the tokens set from the result — the
 * control border was at 1.34:1, which is invisible, and nobody would have
 * noticed by looking. Locking them here means a future palette change has to
 * face the arithmetic instead of a designer's judgement of "looks fine".
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');

/** Pulls the `--name: H S% L%;` triples out of one `:root` block. */
function palette(scope: 'light' | 'dark'): Record<string, [number, number, number]> {
  const dark = css.indexOf('prefers-color-scheme: dark');
  const region = scope === 'light' ? css.slice(0, dark) : css.slice(dark);
  const out: Record<string, [number, number, number]> = {};
  for (const m of region.matchAll(/--([a-z-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
    out[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

function luminance([h, s, l]: [number, number, number]): number {
  const hn = h / 360;
  const sn = s / 100;
  const ln = l / 100;
  const f = (n: number) => {
    const k = (n + hn * 12) % 12;
    const a = sn * Math.min(ln, 1 - ln);
    return ln - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
}

function ratio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, what it is, the minimum WCAG sets for it] */
const PAIRS: [string, string, string, number][] = [
  ['foreground', 'background', 'body text (1.4.3)', 4.5],
  ['muted-foreground', 'background', 'secondary text (1.4.3)', 4.5],
  ['muted-foreground', 'muted', 'secondary text on a chip (1.4.3)', 4.5],
  ['foreground', 'muted', 'text on a chip (1.4.3)', 4.5],
  ['caution-foreground', 'caution', 'verification warnings (1.4.3)', 4.5],
  ['background', 'foreground', 'inverted text on the critical band (1.4.3)', 4.5],
  ['input', 'background', 'the border that identifies a form control (1.4.11)', 3.0],
  ['ring', 'background', 'the focus indicator (1.4.11)', 3.0],
];

for (const scope of ['light', 'dark'] as const) {
  describe(`${scope} palette`, () => {
    const pal = palette(scope);

    for (const [fg, bg, what, min] of PAIRS) {
      it(`${what} — ${fg} on ${bg} clears ${min}:1`, () => {
        expect(pal[fg], `--${fg} missing from the ${scope} palette`).toBeDefined();
        expect(pal[bg], `--${bg} missing from the ${scope} palette`).toBeDefined();
        expect(ratio(pal[fg]!, pal[bg]!)).toBeGreaterThanOrEqual(min);
      });
    }

    it('defines every token the other mode defines', () => {
      // A token present in one mode and absent in the other inherits a colour
      // from the wrong palette, which is how contrast quietly disappears.
      const other = palette(scope === 'light' ? 'dark' : 'light');
      expect(Object.keys(pal).sort()).toEqual(Object.keys(other).sort());
    });
  });
}
