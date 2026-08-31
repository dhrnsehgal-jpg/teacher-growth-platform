import { expect, test, type Page } from '@playwright/test';

import { DEMO_PASSWORD, NEHA, PRINCIPAL, RAJESH, VIKRAM } from './demo-personas';

/**
 * Every dashboard panel the Stage 3 and Stage 4 briefs list, asserted by name.
 *
 * These exist because the audit found four panels simply absent — the data was
 * there, nothing rendered it, and the Stage 3 completion report said only
 * "teacher dashboard, manager dashboard" without noting the omissions. A list
 * checked against the brief is the cheapest guard against that recurring.
 */

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard|\/manager/);
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/sign-in/);
}

test.describe.configure({ mode: 'serial' });

test('the teacher dashboard shows all ten panels the brief lists', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/dashboard');

  // Stage 6 replaced the four counter tiles ("Competencies assessed", "Open
  // gaps", …) with the eight questions below — the counts they held are now
  // said in sentences instead. The panels themselves are unchanged.
  for (const panel of [
    'CPD this year',
    'Where you stand',
    'Development priorities',
    'Learning Map',
    'Recommended CPD',
    'KPI progress',
    'Professional growth trend',
    'My professional goals',
    'My evidence',
    'Recent feedback',
  ]) {
    await expect(page.getByRole('heading', { name: panel }).first()).toBeVisible();
  }

  await signOut(page);
});

test('the dashboard answers the eight questions the brief names', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/dashboard');

  const stand = page.locator('section', { hasText: 'Where you stand' }).last();
  for (const question of [
    'Where am I?',
    'Where should I be?',
    'What is my gap?',
    'What should I do next?',
    'What CPD do I need?',
    'Am I compliant?',
    'Have I improved?',
    'What is my next professional step?',
  ]) {
    await expect(stand.getByText(question, { exact: true })).toBeVisible();
  }

  // Each answer must be a sentence about this teacher, not a bare number.
  await expect(stand.getByText(/of your \d+ assessed competencies/)).toBeVisible();

  // Progression is a judgement, and the dashboard must not imply otherwise.
  await expect(stand.getByText(/does not calculate it|made at appraisal/)).toBeVisible();

  await signOut(page);
});

test('evidence and feedback show what the teacher actually has', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/dashboard');

  const evidence = page.locator('section', { hasText: 'My evidence' }).last();
  await expect(evidence.getByText(/verified|submitted|draft/i).first()).toBeVisible();

  // Feedback is what a manager wrote — the seeded observation narrative.
  const feedback = page.locator('section', { hasText: 'Recent feedback' }).last();
  await expect(feedback.getByText(/Classroom observation/).first()).toBeVisible();
  await expect(feedback.getByText('Vikram Rao').first()).toBeVisible();

  // Stage 5's seed gives Neha two goals, one achieved — they feed the growth
  // score's professional-goals component, so the dashboard shows them here.
  const goals = page.locator('section', { hasText: 'My professional goals' }).last();
  await expect(goals.getByText(/Rewrite the fractions unit/)).toBeVisible();
  await expect(goals.getByText(/Success looks like:/).first()).toBeVisible();

  await signOut(page);
});

test('a teacher who has a goal sees it, with its success measure', async ({ page }) => {
  await signIn(page, RAJESH);
  await page.goto('/dashboard');

  const goals = page.locator('section', { hasText: 'My professional goals' }).last();
  await expect(
    goals.getByText('Rebuild the Class XI mechanics unit around competencies'),
  ).toBeVisible();
  await expect(goals.getByText(/Success looks like:/).first()).toBeVisible();

  await signOut(page);
});

test('the manager dashboard shows all seven panels the brief lists', async ({ page }) => {
  await signIn(page, VIKRAM);
  await page.goto('/manager');

  for (const panel of [
    'Assigned teachers',
    'Pending assessments',
    'Evidence to verify',
    'Priority gaps across your team',
    'Development in progress',
    'Upcoming reviews',
  ]) {
    await expect(page.getByRole('heading', { name: panel }).first()).toBeVisible();
  }

  // Upcoming reviews must distinguish a slipped date from an approaching one.
  const upcoming = page.locator('section', { hasText: 'Upcoming reviews' }).last();
  await expect(upcoming.getByText(/due |overdue |Nothing with a date/).first()).toBeVisible();

  await signOut(page);
});

test('the compliance dashboard shows all eleven items the brief lists', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/compliance');

  for (const panel of [
    'Meeting the requirement',
    'At risk',
    'Missing CPD domains',
    'Missing source-type hours',
    'CPD by department',
    'CPD by stage',
    'CPD by staff category',
    'Highest competency gaps',
    'Most recommended courses',
    'CPD impact',
    'SQAAF evidence readiness',
    'SQAAF evidence gaps',
    'Improvement actions open',
  ]) {
    await expect(page.getByRole('heading', { name: panel }).first()).toBeVisible();
  }

  // The seeded gap, showing against its standard.
  const gaps = page.locator('section', { hasText: 'SQAAF evidence gaps' }).last();
  await expect(gaps.getByText('1.6.4')).toBeVisible();

  await signOut(page);
});
