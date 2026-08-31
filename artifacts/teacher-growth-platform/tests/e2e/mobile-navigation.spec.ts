import { expect, test, type Page } from '@playwright/test';

import {
  ACADEMIC_COORDINATOR,
  ANJALI,
  DEMO_PASSWORD,
  NEHA,
  PRINCIPAL,
  PRIYA,
  VICE_PRINCIPAL,
  VIKRAM,
} from './demo-personas';
const NAVIGATION_TIMEOUT = 15_000;

const TEACHER_NAVIGATION = [
  { label: 'Dashboard', href: '/dashboard', heading: 'Welcome, Neha Sharma' },
  { label: 'Learning Map', href: '/learning-map', heading: 'My Learning Map' },
  { label: 'Self-assessment', href: '/self-assessment', heading: 'My self-assessment' },
  { label: 'My CPD', href: '/cpd', heading: 'My CPD' },
  { label: 'Assistant', href: '/assistant', heading: 'Growth Assistant' },
  { label: 'My Appraisal', href: '/appraisal', heading: 'My Appraisal' },
  { label: 'Increment Readiness', href: '/increment', heading: 'Increment Readiness' },
  { label: 'Service Record', href: '/service', heading: 'My Service Record' },
  { label: 'My Profile', href: '/me', heading: 'Neha Sharma' },
] as const;

const PRINCIPAL_NAVIGATION = [
  { label: 'Team Dashboard', href: '/manager', heading: 'Manager Dashboard' },
  { label: 'Analytics', href: '/analytics', heading: 'Leadership Analytics' },
  { label: 'Compliance', href: '/compliance', heading: 'Compliance' },
  { label: 'SQAAF', href: '/sqaaf', heading: 'SQAAF' },
  { label: 'Framework', href: '/admin/framework', heading: 'Competency Framework' },
  { label: 'Proficiency', href: '/admin/proficiency', heading: 'Proficiency Levels' },
  { label: 'KPI Templates', href: '/admin/kpi', heading: 'KPI Templates' },
  { label: 'Evidence Rules', href: '/admin/evidence', heading: 'Evidence Requirements' },
  { label: 'Growth Model', href: '/admin/growth', heading: 'Growth & Readiness Models' },
] as const;

const COMPLIANCE_ADMIN_NAVIGATION = [
  { label: 'Compliance', href: '/compliance', heading: 'Compliance' },
  { label: 'SQAAF', href: '/sqaaf', heading: 'SQAAF' },
  { label: 'Regulatory', href: '/admin/regulatory', heading: 'Regulatory Change' },
  { label: 'Audit Log', href: '/admin/audit', heading: 'Audit log' },
] as const;

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

test('mobile navigation regression: every teacher destination opens', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, NEHA);

  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();

  // Keep this list explicit so a missing or permission-filtered link fails at
  // the nav itself, rather than looking like a successful route assertion.
  await expect(nav.getByRole('link')).toHaveCount(TEACHER_NAVIGATION.length);

  for (const destination of TEACHER_NAVIGATION) {
    const link = nav.getByRole('link', { name: destination.label, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', destination.href);
    await link.click();

    await expect(page).toHaveURL(new RegExp(`${destination.href}(?:\\?|$)`), {
      timeout: NAVIGATION_TIMEOUT,
    });
    await expect(page.getByRole('heading', { name: destination.heading, exact: true })).toBeVisible(
      { timeout: NAVIGATION_TIMEOUT },
    );
  }
});

test('mobile navigation regression: every Principal destination opens', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, PRINCIPAL);

  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();

  // The Principal should see the personal destinations plus every role-based
  // destination their permissions expose. Keep this count explicit so a
  // permission-filtered link cannot silently disappear from the mobile nav.
  await expect(nav.getByRole('link')).toHaveCount(
    TEACHER_NAVIGATION.length + PRINCIPAL_NAVIGATION.length,
  );
  await expect(nav.getByRole('link', { name: 'Audit Log', exact: true })).toHaveCount(0);

  // Audit access is reserved for the Compliance Administrator and system
  // administrator. A Principal must also be refused when reaching the route
  // directly, not merely omitted from the mobile navigation.
  await page.goto('/admin/audit');
  await expect(page.getByText(/do not have permission/i)).toBeVisible({
    timeout: NAVIGATION_TIMEOUT,
  });
  await expect(page.getByRole('table')).toHaveCount(0);

  for (const destination of PRINCIPAL_NAVIGATION) {
    const link = nav.getByRole('link', { name: destination.label, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', destination.href);
    await link.click();

    await expect(page).toHaveURL(new RegExp(`${destination.href}(?:\\?|$)`), {
      timeout: NAVIGATION_TIMEOUT,
    });
    await expect(
      page.locator('main').getByRole('heading', { name: destination.heading, exact: true }),
    ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
  }
});

test('mobile navigation regression: restricted leadership personas cannot reach audit log', async ({
  page,
}) => {
  test.setTimeout(120_000);

  // These are the seeded leadership personas that do not hold audit.read.
  // Keep this list aligned with the accounts provisioned by supabase/seed.sql:
  // a missing account or permission-filtered navigation link must fail here.
  for (const email of [VIKRAM, ANJALI, VICE_PRINCIPAL, ACADEMIC_COORDINATOR]) {
    await signIn(page, email);

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Audit Log', exact: true })).toHaveCount(0);

    await page.goto('/admin/audit');
    await expect(page.getByText(/do not have permission/i)).toBeVisible({
      timeout: NAVIGATION_TIMEOUT,
    });
    await expect(page.getByRole('table')).toHaveCount(0);

    await signOut(page);
  }
});

test('mobile navigation regression: every Compliance Administrator destination opens', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, PRIYA);

  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();

  // Priya has the same personal destinations as a teacher plus the
  // compliance and administration links granted by her filtered role.
  await expect(nav.getByRole('link')).toHaveCount(
    TEACHER_NAVIGATION.length + COMPLIANCE_ADMIN_NAVIGATION.length,
  );

  for (const destination of COMPLIANCE_ADMIN_NAVIGATION) {
    const link = nav.getByRole('link', { name: destination.label, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', destination.href);
    await link.click();

    await expect(page).toHaveURL(new RegExp(`${destination.href}(?:\\?|$)`), {
      timeout: NAVIGATION_TIMEOUT,
    });
    await expect(
      page.locator('main').getByRole('heading', { name: destination.heading, exact: true }),
    ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
  }
});
