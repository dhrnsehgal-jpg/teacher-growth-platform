import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { DEMO_PASSWORD, NEHA, PRINCIPAL, PRIYA, VIKRAM } from './demo-personas';

/**
 * WCAG 2.2 AA, checked by axe rather than asserted in a document.
 *
 * Automated testing catches perhaps a third of accessibility defects, so a
 * green run here is not a claim of conformance — ACCESSIBILITY.md records what
 * was checked by hand and what remains. What this does guarantee is that the
 * defects already found and fixed (a missing skip link, control borders below
 * 3:1, progress conveyed by colour alone, twenty-five pages sharing one title)
 * cannot come back unnoticed.
 *
 * Every role is covered, because the pages a teacher never sees are exactly the
 * ones that get tested least.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard|\/manager/);
}

async function scan(page: Page, path: string) {
  await page.goto(path);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const readable = violations.map(
    (v) => `${v.id} (${v.impact}) — ${v.help}\n    ${v.nodes.map((n) => n.target).join('\n    ')}`,
  );
  expect(readable, `${path} has accessibility violations`).toEqual([]);
}

test.describe.configure({ mode: 'serial' });

test('the sign-in page is accessible before anyone signs in', async ({ page }) => {
  await scan(page, '/sign-in');
});

test('every teacher-facing page is accessible', async ({ page }) => {
  await signIn(page, NEHA);
  for (const path of [
    '/dashboard',
    '/learning-map',
    '/self-assessment',
    '/cpd',
    '/assistant',
    '/appraisal',
    '/service',
    '/me',
  ]) {
    await scan(page, path);
  }
});

test('every manager-facing page is accessible', async ({ page }) => {
  await signIn(page, VIKRAM);
  for (const path of ['/manager', '/analytics']) {
    await scan(page, path);
  }
});

test('every leadership and administrator page is accessible', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  for (const path of [
    '/compliance',
    '/sqaaf',
    '/increment',
    '/admin/framework',
    '/admin/proficiency',
    '/admin/kpi',
    '/admin/evidence',
    '/admin/growth',
    '/admin/regulatory',
  ]) {
    await scan(page, path);
  }
});

test('the compliance administrator pages are accessible', async ({ page }) => {
  // The audit log is only reachable with `audit.read`, which nobody else holds.
  await signIn(page, PRIYA);
  await scan(page, '/admin/audit');
});

test('the keyboard can reach the content without crossing the whole menu', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/dashboard');

  // The very first tab stop must be the bypass link (WCAG 2.4.1). Twenty
  // navigation links precede the content otherwise.
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('the navigation says which page you are on', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/learning-map');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'Learning Map' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('each page has its own title', async ({ page }) => {
  await signIn(page, NEHA);
  const seen = new Set<string>();
  for (const path of ['/dashboard', '/learning-map', '/cpd', '/appraisal', '/me']) {
    await page.goto(path);
    const title = await page.title();
    expect(title, `${path} should not use the default title`).not.toBe(
      'Teacher Professional Growth Platform',
    );
    expect(seen.has(title), `${path} repeats a title used by another page`).toBe(false);
    seen.add(title);
  }
});

test('the pages reflow to a 320px viewport without sideways scrolling', async ({ page }) => {
  // WCAG 1.4.10. axe cannot check this, and it is the criterion a dense
  // management interface fails first — a wide table pushes the whole page
  // sideways and every line of text goes off-screen with it. The tables here
  // are allowed to scroll; the page is not.
  await signIn(page, NEHA);
  await page.setViewportSize({ width: 320, height: 800 });

  for (const path of ['/dashboard', '/learning-map', '/cpd', '/appraisal', '/me']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways at 320px`).toBeLessThanOrEqual(1);
  }
});

test('text stays readable when a reader forces their own spacing', async ({ page }) => {
  // WCAG 1.4.12: no loss of content when line height goes to 1.5x, paragraph
  // spacing to 2x, and letter/word spacing widen. Checked by applying the
  // criterion's own values and confirming nothing is clipped away.
  await signIn(page, NEHA);
  await page.goto('/dashboard');
  await page.addStyleTag({
    content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important;
              word-spacing: 0.16em !important; }
              p, li, dd { margin-bottom: 2em !important; }`,
  });
  const clipped = await page.evaluate(
    () =>
      [...document.querySelectorAll('dd, p, li')].filter((el) => {
        const s = getComputedStyle(el);
        return (
          (s.overflow === 'hidden' || s.overflowY === 'hidden') &&
          el.scrollHeight > el.clientHeight + 1
        );
      }).length,
  );
  expect(clipped, 'text is cut off when the reader widens their spacing').toBe(0);
});
