import { expect, test, type Page } from '@playwright/test';

import { DEMO_PASSWORD, NEHA } from './demo-personas';

/**
 * The Growth Assistant, through the real UI.
 *
 * The database tests prove the prohibitions. These prove the surface honours
 * them: the advisory label is shown, the evidence is listed, and the page says
 * plainly that nothing left the system.
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

test('the assistant states what it cannot do, and where data goes', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/assistant');

  const scope = page.locator('section', { hasText: 'What this can and cannot do' }).last();
  await expect(scope.getByText(/Change a competency score/)).toBeVisible();
  await expect(scope.getByText(/Make an appraisal decision or approve an increment/)).toBeVisible();
  await expect(scope.getByText(/State a CBSE or Punjab requirement it cannot cite/)).toBeVisible();
  await expect(scope.getByText(/no engine reads/)).toBeVisible();

  const privacy = page.locator('section', { hasText: 'Where your data goes' }).last();
  await expect(privacy.getByText(/switched off/)).toBeVisible();
  await expect(privacy.getByText(/Nothing about you has been sent anywhere/)).toBeVisible();

  await signOut(page);
});

test('it explains a gap from stored records, with the label and the evidence', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/assistant');

  const ask = page.locator('section', { hasText: 'Ask the assistant' }).last();
  await ask.getByLabel('What would you like explained?').selectOption('explain_competency_gap');
  await ask.getByRole('button', { name: 'Explain this' }).click();

  // The label the brief requires, on the suggestion itself.
  await expect(
    page.getByText('AI-assisted recommendation — professional judgement required.').first(),
  ).toBeVisible();

  // Composed from the real gap, not generic advice.
  await expect(page.getByText(/Competency-Based Assessment/).first()).toBeVisible();
  await expect(page.getByText(/priority score|scored 80/).first()).toBeVisible();

  // "Show the input evidence used."
  await expect(page.getByText(/Evidence this was built from/).first()).toBeVisible();

  await signOut(page);
});

test('it explains the CPD shortfall, citing the verified requirement', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/assistant');

  const ask = page.locator('section', { hasText: 'Ask the assistant' }).last();
  await ask
    .getByLabel('What would you like explained?')
    .selectOption('explain_cpd_compliance_deficit');
  await ask.getByRole('button', { name: 'Explain this' }).click();

  await expect(page.getByText(/38 of 50 CPD hours credited/).first()).toBeVisible();
  await expect(
    page.getByText(/Hours count only once a reviewer has verified/).first(),
  ).toBeVisible();

  await signOut(page);
});

test('a suggestion is a draft until a person records what they decided', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/assistant');

  const first = page.locator('section').filter({ hasText: 'Evidence this was built from' }).first();
  await first
    .getByLabel('What did you decide?')
    .fill('Agreed with my HoD to take the competency-based assessment course next term.');
  await first.getByRole('button', { name: 'Record what you decided' }).click();

  await expect(page.getByText(/You recorded:/).first()).toBeVisible();
  await signOut(page);
});

test('every kind the assistant offers actually produces something', async ({ page }) => {
  // Five of the eleven declared kinds used to return null and show the
  // "nothing to explain" message — including four the brief names outright.
  // A menu entry that never produces anything is worse than an absent one: the
  // teacher concludes the feature is broken, or that they have no feedback.
  await signIn(page, NEHA);
  await page.goto('/assistant');

  const kinds = [
    'explain_competency_gap',
    'explain_assessment_feedback',
    'recommend_development_goal',
    'explain_cpd_match',
    'draft_development_plan',
    'summarise_reflections',
    'summarise_evidence',
    'observation_themes',
    'post_cpd_reflection_support',
    'explain_progression_requirements',
    'explain_cpd_compliance_deficit',
  ];

  for (const kind of kinds) {
    await page.goto('/assistant');
    const ask = page.locator('section', { hasText: 'Ask the assistant' }).last();
    await ask.getByLabel('What would you like explained?').selectOption(kind);
    await ask.getByRole('button', { name: 'Explain this' }).click();

    // "Nothing to explain" is the null path. Reaching it for a kind the menu
    // offers is the defect this test exists to catch.
    await expect(
      page.getByText(/nothing to explain|no records/i),
      `"${kind}" produced nothing`,
    ).toHaveCount(0);

    // The advisory label is on every output, and is the proof one was produced.
    await expect(
      page.getByText('AI-assisted recommendation — professional judgement required.').first(),
    ).toBeVisible();

    // And the inputs it used are shown, never an unsourced assertion.
    await expect(page.getByText(/Evidence this was built from/).first()).toBeVisible();
  }

  await signOut(page);
});

test('progression advice says a person decides, and publishes no criteria list', async ({
  page,
}) => {
  await signIn(page, NEHA);
  await page.goto('/assistant');
  const ask = page.locator('section', { hasText: 'Ask the assistant' }).last();
  await ask
    .getByLabel('What would you like explained?')
    .selectOption('explain_progression_requirements');
  await ask.getByRole('button', { name: 'Explain this' }).click();

  await expect(
    page.getByText(/professional judgement made at appraisal by a person/),
  ).toBeVisible();
  await expect(page.getByText(/not calculated/)).toBeVisible();
  // The reason there is no checklist has to be stated, not left as an absence.
  await expect(page.getByText(/has not yet established which service rules apply/)).toBeVisible();
});
