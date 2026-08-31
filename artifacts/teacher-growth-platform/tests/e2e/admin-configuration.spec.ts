import { expect, test, type Locator, type Page } from '@playwright/test';

import { DEMO_PASSWORD, NEHA, PRINCIPAL } from './demo-personas';

/**
 * Stage 2's admin configuration surface, driven through the real forms.
 *
 * The database tests prove the permissions and constraints. These prove the
 * server actions actually assemble a valid row — which is where the three
 * NOT NULL bugs in this feature were found, none of which SQL tests would have
 * caught because the tests wrote their own SQL.
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

/**
 * Selects by the option's value, found from its text.
 *
 * `selectOption({ label })` needs an exact string, and these labels are
 * composed at render time ("Category · Name"), so matching on a fragment and
 * reading the value is both shorter and less brittle than reproducing them.
 */
async function selectByText(select: Locator, fragment: string) {
  const value = await select.locator('option', { hasText: fragment }).first().getAttribute('value');
  expect(value, `no option matching "${fragment}"`).toBeTruthy();
  await select.selectOption(value as string);
}

test.describe.configure({ mode: 'serial' });

test('an authorised user adds a competency and an indicator', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/admin/framework');

  const add = page.locator('section', { hasText: 'Add a competency' }).last();
  await add.getByLabel('Key').fill('assessment_moderation');
  await add.getByLabel('Name').fill('Assessment Moderation');
  await add
    .getByLabel('Description')
    .fill(
      'Moderates assessment design and marking with colleagues so standards are applied consistently across a year group.',
    );
  await add.getByRole('button', { name: 'Add competency' }).click();

  await expect(page.getByText('Assessment Moderation').first()).toBeVisible();

  // Now an indicator on it.
  await page.goto('/admin/framework/assessment_moderation');
  const ind = page.locator('section', { hasText: 'Add an indicator' }).last();
  await ind.getByLabel('Key').fill('moderates_before_reporting');
  await ind
    .getByLabel('Indicator statement')
    .fill('Moderates a sample of marked work with a colleague before reporting grades.');
  await ind.getByRole('button', { name: 'Add indicator' }).click();

  await expect(
    page.getByText('Moderates a sample of marked work with a colleague before reporting grades.'),
  ).toBeVisible();

  await signOut(page);
});

test('a verdict-style indicator is refused, with an explanation', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/admin/framework/assessment_moderation');

  const ind = page.locator('section', { hasText: 'Add an indicator' }).last();
  await ind.getByLabel('Key').fill('is_a_good_teacher');
  await ind.getByLabel('Indicator statement').fill('is a good teacher who marks work carefully');
  await ind.getByRole('button', { name: 'Add indicator' }).click();

  await expect(ind.getByText(/verdict, not an observable behaviour/)).toBeVisible();
  await signOut(page);
});

test('claiming alignment without a citation is refused', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/admin/framework');

  const add = page.locator('section', { hasText: 'Add a competency' }).last();
  await add.getByLabel('Key').fill('uncited_claim');
  await add.getByLabel('Name').fill('Uncited claim');
  await add
    .getByLabel('Description')
    .fill('Claims NPST alignment without citing which clause it aligns to at all.');
  await add.getByLabel('Framework', { exact: true }).selectOption('npst');
  await add.getByLabel('Relationship to that framework').selectOption('aligned');
  await add.getByRole('button', { name: 'Add competency' }).click();

  await expect(add.getByText(/must cite the clause/)).toBeVisible();
  await signOut(page);
});

test('an authorised user sets a role and stage target', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/admin/framework/assessment_moderation');

  const target = page.locator('section', { hasText: 'Set an expected level' }).last();
  await selectByText(target.getByLabel('Expected level'), 'Advanced');
  await selectByText(target.getByLabel('Role'), 'Head of Department');
  await selectByText(target.getByLabel('Stage'), 'Middle Stage');
  await target
    .getByLabel('Why is this expected?')
    .fill('Heads of Department lead moderation for their subject across the Middle Stage.');
  await target.getByRole('button', { name: 'Set target' }).click();

  const targets = page.locator('section', { hasText: 'Targets' }).last();
  await expect(targets.getByText(/head of department/)).toBeVisible();
  await signOut(page);
});

test('an authorised user creates a KPI template and assigns it', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.goto('/admin/kpi');

  const create = page.locator('section', { hasText: 'Create a KPI template' }).last();
  await create.getByLabel('Key').fill('moderation_sessions');
  await create.getByLabel('Name').fill('Moderation sessions led');
  await create
    .getByLabel('Description')
    .fill('Number of subject moderation sessions led during the year.');
  await create.getByLabel('What is measured').fill('Sessions led');
  await create.getByLabel('Default target').fill('3');
  await create.getByLabel('Data source').fill('Departmental moderation log');
  await create
    .getByLabel('Evidence requirement')
    .fill('Session agendas and the moderation record sheet.');
  await create.getByRole('button', { name: 'Create template' }).click();

  await expect(page.getByText('Moderation sessions led', { exact: true }).first()).toBeVisible();

  const assign = page.locator('section', { hasText: 'Assign a KPI' }).last();
  await selectByText(assign.getByLabel('KPI template'), 'Moderation sessions led');
  await selectByText(assign.getByLabel('Teacher'), 'Neha Sharma');
  await selectByText(assign.getByLabel('Reviewer'), 'Vikram Rao');
  await assign.getByRole('button', { name: 'Assign KPI' }).click();
  await expect(assign.getByText(/KPI assigned/)).toBeVisible();

  await signOut(page);

  // The teacher sees it on their own profile.
  await signIn(page, NEHA);
  await page.goto('/me');
  // Exact: the KPI description also contains the phrase.
  await expect(page.getByText('Moderation sessions led', { exact: true })).toBeVisible();
  await signOut(page);
});

test('an authorised user defines a proficiency level and an evidence requirement', async ({
  page,
}) => {
  await signIn(page, PRINCIPAL);

  await page.goto('/admin/proficiency');
  const level = page.locator('section', { hasText: 'Define a level' }).last();
  await level.getByLabel('Scale').selectOption({ index: 0 });
  await level.getByLabel('Ordinal').fill('6');
  await level.getByLabel('Key').fill('exemplary');
  await level.getByLabel('Name').fill('Exemplary');
  await level
    .getByLabel('Descriptor')
    .fill('Practice is used as a model for others across the school and beyond it.');
  await level.getByRole('button', { name: 'Add level' }).click();
  await expect(page.getByText('Exemplary').first()).toBeVisible();

  await page.goto('/admin/evidence');
  const req = page.locator('section', { hasText: 'Configure a requirement' }).last();
  await req.getByLabel('Evidence type').selectOption({ index: 0 });
  await req.getByLabel('Minimum count').fill('2');
  await req.getByLabel('Guidance').fill('Two per term, showing planned differentiation.');
  await req.getByRole('button', { name: 'Add requirement' }).click();
  await expect(page.getByText('Two per term, showing planned differentiation.')).toBeVisible();

  await signOut(page);
});

test('a teacher sees no configuration forms at all', async ({ page }) => {
  await signIn(page, NEHA);

  for (const [path, form] of [
    ['/admin/framework', 'Add a competency'],
    ['/admin/kpi', 'Create a KPI template'],
    ['/admin/proficiency', 'Define a level'],
    ['/admin/evidence', 'Configure a requirement'],
  ]) {
    await page.goto(path as string);
    await expect(page.getByText(form as string)).toHaveCount(0);
  }

  // But the framework itself stays readable — a teacher may always read the
  // standard they are held to.
  await page.goto('/admin/framework');
  await expect(page.getByText('Competency Framework').first()).toBeVisible();

  await signOut(page);
});
