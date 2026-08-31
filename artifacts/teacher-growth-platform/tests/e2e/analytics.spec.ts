import { expect, test, type Page } from '@playwright/test';

import { DEMO_PASSWORD, NEHA, PRINCIPAL } from './demo-personas';

/**
 * Leadership analytics and cohort planning.
 *
 * The assertions that matter are the restraint ones: the page must state that
 * CPD impact is association rather than cause, and it must not rank teachers.
 *
 * **Requires a freshly reset database** — see `npm run test:e2e:clean`.
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

test('the heatmap renders the cohort with filters', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/analytics');

  const heatmap = page.locator('section', { hasText: 'Competency heatmap' }).last();
  await expect(heatmap.getByRole('columnheader', { name: 'Teacher' })).toBeVisible();
  await expect(heatmap.getByRole('rowheader', { name: /Neha Sharma/ })).toBeVisible();
  await expect(heatmap.getByRole('rowheader', { name: /Meera Krishnan/ })).toBeVisible();

  // Meaning does not rest on colour.
  await expect(heatmap.getByText(/does not rest on colour/)).toBeVisible();

  // The filters became a form when the brief's remaining three dimensions were
  // added — six links that each replaced the query string could not combine.
  await expect(heatmap.getByLabel('Department', { exact: true })).toBeVisible();
  await expect(heatmap.getByLabel('Teacher category', { exact: true })).toBeVisible();

  await page.goto('/analytics?department=mathematics');
  await expect(
    page.locator('section', { hasText: 'Competency heatmap' }).last().getByRole('rowheader'),
  ).not.toHaveCount(0);

  await signOut(page);
});

test('training needs are stated with the counts behind them', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/analytics');

  const needs = page.locator('section', { hasText: 'Training needs analysis' }).last();
  await expect(needs.getByText(/is a development priority for \d+% of/).first()).toBeVisible();
  await expect(needs.getByText(/of \d+ assessed/).first()).toBeVisible();
  await expect(needs.getByText(/against teachers assessed on that competency/)).toBeVisible();

  await signOut(page);
});

test('CPD impact is presented as association, not cause', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/analytics');

  const impact = page
    .locator('section', { hasText: 'associated with verified improvement' })
    .last();
  await expect(impact.getByText('This is association, not cause.')).toBeVisible();
  await expect(impact.getByText(/cannot separate those/)).toBeVisible();
  await expect(impact.getByRole('columnheader', { name: 'Applied' })).toBeVisible();
  await expect(impact.getByRole('columnheader', { name: 'Impact verified' })).toBeVisible();

  await signOut(page);
});

test('a gap cluster becomes a cohort plan needing manager approval', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/analytics');

  // Deliberately NOT Competency-Based Assessment: that is the competency the
  // Stage 3 lifecycle spec drives, and adding cohort items to Neha's plan would
  // leave her manager's approval queue non-empty when that spec runs.
  await page.goto('/analytics?competency=differentiated_instruction');

  const plan = page.locator('section', { hasText: 'Cohort plan —' }).last();
  await expect(plan.getByText(/The cohort \(\d+\)/)).toBeVisible();
  await expect(plan.getByText(/Relevant CPD/)).toBeVisible();

  await plan
    .getByLabel('Why this cohort needs this')
    .fill('Whole-cohort priority identified from the training needs analysis for this term.');
  await plan.getByRole('button', { name: /Add to \d+ learning plans/ }).click();

  await expect(page.getByText(/Cohort plan created for \d+ teacher/)).toBeVisible();
  await expect(page.getByText(/still needs the teacher/).first()).toBeVisible();

  await signOut(page);
});

test('a teacher cannot see the school-wide analytics', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/analytics');

  // RLS restricts the heatmap to her own row; no other teacher appears.
  const heatmap = page.locator('section', { hasText: 'Competency heatmap' }).last();
  await expect(heatmap.getByRole('rowheader', { name: /Neha Sharma/ })).toBeVisible();
  await expect(heatmap.getByRole('rowheader', { name: /Meera Krishnan/ })).toHaveCount(0);
  await expect(heatmap.getByRole('rowheader', { name: /Rajesh Verma/ })).toHaveCount(0);

  await signOut(page);
});

test('the heatmap offers all six filter dimensions, and they combine', async ({ page }) => {
  // The brief names six. Three were missing, and the filters were links that
  // replaced the whole query string — so only one could ever apply at a time.
  await signIn(page, PRINCIPAL);
  await page.goto('/analytics');

  const heatmap = page.locator('section', { hasText: 'Competency heatmap' }).last();
  for (const label of [
    'Department',
    'Stage',
    'Subject',
    'Teacher category',
    'Career level',
    'Manager',
  ]) {
    await expect(heatmap.getByLabel(label, { exact: true })).toBeVisible();
  }

  // Two at once, which the link version could not do.
  await page.goto('/analytics?department=mathematics&category=tgt');
  await expect(page.getByLabel('Department', { exact: true })).toHaveValue('mathematics');
  await expect(page.getByLabel('Teacher category', { exact: true })).toHaveValue('tgt');
});

test('the school analytics the brief enumerates are all present', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/analytics');

  for (const panel of [
    'Meeting expectation',
    'Open gaps',
    'Verified improvement',
    'Training needs analysis',
    'Competency heatmap',
    'Teachers with the most high-priority gaps',
    'CPD associated with verified improvement',
    'What the school measures',
    'Development investment',
    'Career progression pipeline',
    'Increment recommendations',
    'SQAAF readiness',
  ]) {
    await expect(page.getByRole('heading', { name: panel }).first()).toBeVisible();
  }
});

test('the aggregates state their own limits rather than implying more', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/analytics');

  // KPIs: no achievement figure exists, and the page says so rather than
  // leaving a reader to assume the numbers are performance.
  await expect(
    page.getByText(/No achievement figure is shown because the platform stores none/),
  ).toBeVisible();

  // Progression: a distribution must not read as a promotion queue.
  await expect(page.getByText(/A distribution, not a queue/)).toBeVisible();

  // SQAAF: the denominator is stated, so readiness is not mistaken for the
  // whole framework.
  await expect(page.getByText(/is the honest denominator/)).toBeVisible();

  // Investment: attendance is not return.
  await expect(page.getByText(/hours completed is still only attendance/)).toBeVisible();
});
