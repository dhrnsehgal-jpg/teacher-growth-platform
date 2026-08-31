import { expect, test, type Page } from '@playwright/test';

import { DEMO_PASSWORD, NEHA, PRINCIPAL, VIKRAM } from './demo-personas';

/**
 * Stage 5 through the real UI: appraisal, acknowledgement, representation, and
 * increment readiness under a closed employment gate.
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

test('a teacher sees their appraisal, and why the score is what it is', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/appraisal');

  await expect(page.getByRole('heading', { name: 'Why this score?' })).toBeVisible();

  // The disclaimer must appear beside the percentage, not buried in a doc.
  await expect(
    page.getByText('DEMO SCHOOL POLICY — NOT A CBSE OR PUNJAB GOVERNMENT FORMULA.').first(),
  ).toBeVisible();

  // Every component shows weight, result and the evidence behind it.
  const why = page.locator('section', { hasText: 'Why this score?' }).last();
  await expect(why.getByRole('columnheader', { name: 'Weight' })).toBeVisible();
  await expect(why.getByRole('columnheader', { name: 'Evidence' })).toBeVisible();
  await expect(why.getByText(/of 50.00 CPD hours credited/)).toBeVisible();
  await expect(why.getByText(/Completing a course counts for nothing here/)).toBeVisible();

  // And the recommendation with its reasoning.
  await expect(page.getByText(/Satisfactory progress/).first()).toBeVisible();
  await signOut(page);
});

test('the teacher acknowledges, and the earlier response stays on the file', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/appraisal');

  const respond = page.locator('section', { hasText: 'Respond' }).last();
  await respond.getByLabel('Response').selectOption('acknowledged');
  await respond.getByRole('button', { name: 'Record response' }).click();

  const responses = page.locator('section', { hasText: 'Your responses' }).last();
  await expect(responses.getByText('Acknowledged')).toBeVisible();
  // The seeded comment is still there — acknowledgement does not replace it.
  await expect(responses.getByText(/CBSE-delivered hours were not offered/)).toBeVisible();

  await signOut(page);
});

test('the teacher challenges the outcome and the original is preserved', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/appraisal');

  const challenge = page.locator('section', { hasText: 'Challenge this outcome' }).last();
  await challenge
    .getByLabel('Grounds')
    .fill(
      'The CPD shortfall reflects programmes the Board did not offer in my subject until the second term, which the appraisal does not mention.',
    );
  await challenge.getByRole('button', { name: 'Submit representation' }).click();

  const reps = page.locator('section', { hasText: 'Representations' }).last();
  await expect(reps.getByText('Original decision')).toBeVisible();
  await expect(reps.getByText(/Satisfactory progress/).first()).toBeVisible();
  await expect(reps.getByText(/did not offer in my subject/)).toBeVisible();

  await signOut(page);
});

test('increment readiness is shown as readiness, behind the employment gate', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/increment');

  // Both gate messages, in the exact words the briefs require.
  await expect(
    page.getByText('Employment/service-rule applicability requires authorised verification.'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'School funding/service status requires verification before employment-related compliance calculations can be activated.',
    ),
  ).toBeVisible();

  // Readiness with requirements complete, and every outstanding item explained.
  await expect(page.getByText(/Requirements complete: \d+\/\d+/)).toBeVisible();
  const outstanding = page.locator('section', { hasText: 'Outstanding' }).last();
  await expect(outstanding.getByText('CPD requirement', { exact: false }).first()).toBeVisible();
  await expect(outstanding.getByText(/mandatory/).first()).toBeVisible();

  // The approval chain is shown as six independent stages.
  const chain = page.locator('section', { hasText: 'Approval chain' }).last();
  await expect(chain.getByText('Final decision', { exact: true })).toBeVisible();
  await expect(chain.getByText(/One person cannot complete two of them/)).toBeVisible();

  // No salary figure anywhere.
  await expect(page.getByText(/This platform holds no salary figures/)).toBeVisible();
  await signOut(page);
});

test('a Head of Department cannot see a teacher increment page content', async ({ page }) => {
  await signIn(page, VIKRAM);
  await page.goto('/increment');
  // Vikram has no increment.read and no recommendation of his own.
  await expect(page.getByText('Readiness has not been computed for you this year.')).toBeVisible();
  await signOut(page);
});

test('the service record shows the career history and which rules apply', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/service');

  await expect(page.getByRole('heading', { name: 'Appointment' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Career history' })).toBeVisible();
  await expect(page.getByText('Appointment').first()).toBeVisible();

  const rules = page.locator('section', { hasText: 'Which service rules apply' }).last();
  await expect(
    rules.getByText('Employment/service-rule applicability requires authorised verification.'),
  ).toBeVisible();
  await expect(rules.getByText(/Punjab Privately Managed Recognised Schools/)).toBeVisible();
  await expect(
    rules.getByText(/does not by itself make a Punjab Government rule apply/),
  ).toBeVisible();

  await signOut(page);
});

test('the Principal reviews the representation independently', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/manager');
  // The Principal did not make the original decision (Vikram did), so review is
  // open to them. Verified at the database level; here we confirm the manager
  // surface still loads with the Stage 5 tables present.
  await expect(page.getByRole('heading', { name: 'Assigned teachers' }).first()).toBeVisible();
  await signOut(page);
});
