import { expect, test, type Page } from '@playwright/test';

import { DEMO_PASSWORD, HARPREET, NEHA, PRINCIPAL, VIKRAM } from './demo-personas';

/**
 * Stage 4 end to end: the CPD compliance loop and the SQAAF improvement loop,
 * driven through the real UI.
 *
 * **Requires a freshly reset database**, for the same reason as
 * `growth-lifecycle.spec.ts`: this suite creates records that persist. Run
 * `npm run test:e2e:clean`, which also clears `.next` — running `next build`
 * while a dev server is up overwrites the server's own build output, and
 * Playwright then reuses a server that throws
 * `__webpack_modules__[moduleId] is not a function` on every route.
 *
 * What it proves that a database test cannot: that the RLS policies, the server
 * actions and the pages agree — a teacher can log CPD but not credit it, a
 * reviewer can credit it, and the credited hours reach the dashboard.
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

test('the CPD dashboard shows the seeded position against the CBSE scheme', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/cpd');

  // The headline, and both splits, exactly as the requirement configuration says.
  await expect(page.getByText('38', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('/ 50 hours')).toBeVisible();

  const bySource = page.locator('section', { hasText: 'By source' }).first();
  await expect(bySource.getByText('18 / 25')).toBeVisible();
  await expect(bySource.getByText('20 / 25')).toBeVisible();

  const byDomain = page.locator('section', { hasText: 'By domain' }).first();
  await expect(byDomain.getByText('10 / 12')).toBeVisible();
  await expect(byDomain.getByText('18 / 24')).toBeVisible();
  await expect(byDomain.getByText('10 / 14')).toBeVisible();

  // The rule is shown, with its verification status — never a bare number.
  await expect(page.getByText('CBSE CPD requirement, 2025 scheme').first()).toBeVisible();
  await expect(page.getByText(/affiliation/i).first()).toBeVisible();

  // The multi-competency record does not inflate anything.
  await expect(page.getByText(/Linked to 4 competencies/)).toBeVisible();
  await expect(page.getByText(/Linking does not change the hours/)).toBeVisible();

  await signOut(page);
});

test('a teacher logs CPD, and the hours do not count until verified', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/cpd');

  await page.getByLabel('What did you attend?').fill('Inclusive classrooms workshop');
  await page.getByLabel('CPD domain').selectOption({ label: 'Knowledge and Practice' });
  await page.getByLabel('Source', { exact: true }).selectOption({ label: 'School / in-house' });
  await page.getByLabel('Provider').fill('School Professional Development Team');
  await page.getByLabel('Date (YYYY-MM-DD)').fill('2026-09-22');
  await page.getByLabel('Hours attended').fill('4');
  await page.getByRole('button', { name: 'Submit for verification' }).click();

  // The record appears as a claim, and the total is unchanged at 38.
  await expect(page.getByText('Inclusive classrooms workshop')).toBeVisible();
  await expect(page.getByText('4 h claimed')).toBeVisible();
  await expect(page.getByText('/ 50 hours')).toBeVisible();
  await expect(page.getByText('38', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/awaiting verification/)).toBeVisible();

  await signOut(page);
});

test('the Head of Department verifies it and the hours land', async ({ page }) => {
  await signIn(page, VIKRAM);
  await page.goto('/compliance');

  const pending = page.locator('li', { hasText: 'Inclusive classrooms workshop' });
  await expect(pending).toBeVisible();
  await expect(pending.getByText('4 h claimed')).toBeVisible();

  // Credit fewer hours than claimed — a reviewer may reduce, never inflate.
  await pending.getByLabel('Decision').selectOption('verify');
  await pending.getByLabel('Hours to credit').fill('3');
  await pending.getByLabel('Note').fill('Attendance register shows three hours, not four.');
  await pending.getByRole('button', { name: 'Record decision' }).click();

  // Outcome, not toast: the record leaves the review queue.
  await expect(
    page.locator('li', { hasText: 'Inclusive classrooms workshop' }).getByLabel('Decision'),
  ).toHaveCount(0);

  await signOut(page);

  await signIn(page, NEHA);
  await page.goto('/cpd');
  await expect(page.getByText('41', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('3 h credited')).toBeVisible();
  await signOut(page);
});

test('the CPD training record appears on the teacher service/profile record', async ({ page }) => {
  // The brief asks for training documentation to be integrated with the Teacher
  // Service/Profile record, not only shown on a CPD page of its own.
  await signIn(page, NEHA);
  await page.goto('/me');

  const cpd = page.locator('section', { hasText: 'Continuous professional development' }).last();
  await expect(cpd).toBeVisible();
  await expect(cpd.getByText('/ 50 hours')).toBeVisible();

  // Every documentation field the brief lists, as a service record.
  for (const header of [
    'Programme',
    'Provider',
    'Dates',
    'Domain',
    'Source',
    'Hours',
    'Certificate',
    'Approval',
  ]) {
    await expect(cpd.getByRole('columnheader', { name: header })).toBeVisible();
  }
  await expect(
    cpd.getByText('Competency Based Assessment (Secondary Level) - Mathematics'),
  ).toBeVisible();

  await signOut(page);
});

test('the management dashboard reports CPD by department, stage and category', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/compliance');

  await expect(page.locator('section', { hasText: 'CPD by department' }).last()).toBeVisible();
  await expect(page.locator('section', { hasText: 'CPD by staff category' }).last()).toBeVisible();

  const byStage = page.locator('section', { hasText: 'CPD by stage' }).last();
  await expect(byStage).toBeVisible();
  await expect(byStage.getByText('Middle Stage')).toBeVisible();
  // A teacher spanning stages is counted in each, so the caveat must be shown.
  await expect(byStage.getByText(/do not sum to the whole-school figure/)).toBeVisible();

  await signOut(page);
});

test('a teacher cannot reach another teacher CPD record', async ({ page }) => {
  await signIn(page, HARPREET);
  await page.goto('/cpd');
  // Harpreet has no CPD of her own and cannot see Neha's.
  await expect(page.getByText('Inclusive classrooms workshop')).toHaveCount(0);
  await expect(
    page.getByText('Competency Based Assessment (Secondary Level) - Mathematics'),
  ).toHaveCount(0);
  await signOut(page);
});

test('SQAAF states what it cannot evidence, and runs an improvement action to completion', async ({
  page,
}) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/sqaaf');

  // The verified structure.
  await expect(page.getByText(/84 standards across seven domains, 336 marks/)).toBeVisible();
  await expect(page.getByText('Level IV — Dynamic Evolving').first()).toBeVisible();

  // The honesty requirement: three domains are declared out of scope.
  const coverage = page.locator('section', { hasText: 'What this platform can evidence' });
  await expect(coverage.getByText('Not covered by this platform')).toHaveCount(3);
  await expect(coverage.getByText('Primary evidence source')).toHaveCount(1);

  // Nothing is submitted to CBSE.
  await expect(page.getByText(/does not submit to CBSE/)).toBeVisible();

  // Run the seeded action through its remaining states to completion.
  // Scoped to the plan: standard 1.6.4 also appears in the standards list above,
  // and an unscoped locator matches both.
  const plan = page.locator('section', { hasText: 'Self-improvement plan' }).last();
  const action = plan.locator('li', { hasText: 'Assessment of skills and competencies' });
  await expect(action).toBeVisible();

  for (const next of ['In progress', 'Evidence submitted', 'Under review']) {
    await action.getByLabel('Move to').selectOption({ label: next });
    await action.getByRole('button', { name: 'Update' }).click();
    await expect(action.getByText(next.toLowerCase(), { exact: false }).first()).toBeVisible();
  }

  await action.getByLabel('Move to').selectOption({ label: 'Completed' });
  await action
    .getByLabel('Note')
    .fill('Two moderated assessment designs received from each department.');
  await action.getByRole('button', { name: 'Update' }).click();

  // Completion removes the control, because completed is terminal.
  await expect(
    plan.locator('li', { hasText: 'Assessment of skills and competencies' }).getByLabel('Move to'),
  ).toHaveCount(0);

  await signOut(page);
});

test('the readiness pack is partial by design and says so', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/sqaaf/readiness-pack');

  await expect(page.getByText(/This pack is partial by design/)).toBeVisible();
  await expect(page.getByText(/of 84 standards/).first()).toBeVisible();
  await expect(page.getByText(/Nothing has been sent to CBSE/)).toBeVisible();
  await expect(page.getByText(/submission window for this year is unverified/)).toBeVisible();

  // Ratings carry their rationale, and the plan uses CBSE's own columns.
  await expect(page.getByText(/Level 3 · Stable/).first()).toBeVisible();
  await expect(page.getByText(/Annexure F template/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Aspirational' })).toBeVisible();

  await signOut(page);
});
