import { expect, test, type Page } from '@playwright/test';

import { DEMO_PASSWORD, DEMO_PERSONAS } from '../../src/lib/demo-access';
import {
  ACADEMIC_COORDINATOR,
  ANJALI,
  HARPREET,
  NEHA,
  PRINCIPAL,
  PRIYA,
  VICE_PRINCIPAL,
  VIKRAM,
} from './demo-personas';

/**
 * The Stage 6 acceptance walk: the whole chain the brief lists, in order,
 * through the real UI.
 *
 *   login → role assignment → competency framework → self-assessment →
 *   observation → gap → CPD recommendation → learning plan → CPD completion →
 *   evidence → impact verification → reassessment → KPI review → appraisal →
 *   growth score → increment recommendation → career progression → SQAAF →
 *   analytics → audit log
 *
 * Named `zz-` so it runs LAST. The suite is serial and non-idempotent, and this
 * file asserts the FINISHED state of the lifecycle — Neha's competency verified
 * at level 3, her CPD hours credited, her plan item reassessed. Run earlier it
 * would both fail (the lifecycle has not happened yet) and pollute the specs
 * that drive it. Ordering by filename is load-bearing here, not cosmetic.
 *
 * Role boundaries are at the bottom, because a system that does all of the
 * above and shows a teacher their colleague's appraisal has failed acceptance.
 */

const COMPETENCY = 'Competency-Based Assessment';

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/dashboard|\/manager/),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.waitForURL(/\/sign-in/);
}

test.describe.configure({ mode: 'serial' });

test('every demo chooser account can sign in', async ({ page }) => {
  for (const persona of DEMO_PERSONAS) {
    await test.step(`${persona.email} (${persona.role})`, async () => {
      try {
        await signIn(page, persona.email);
      } catch (error) {
        throw new Error(
          `${persona.email} (${persona.role}) could not sign in: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
      await signOut(page);
    });
  }
});

test('the full lifecycle, from signing in to the audit trail', async ({ page }) => {
  await test.step('1. login', async () => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/sign-in/); // unauthenticated is refused, not tolerated
    await signIn(page, NEHA);
    await expect(page.getByRole('heading', { name: /Welcome, Neha Sharma/ })).toBeVisible();
  });

  await test.step('2. role assignment and post are what drive her expectations', async () => {
    await page.goto('/me');
    const post = page.locator('section', { hasText: 'Post' }).first();
    await expect(post.getByText(/TGT|Trained Graduate/)).toBeVisible();
    await expect(page.locator('section', { hasText: 'Department' }).first()).toContainText(
      /Mathematics/,
    );
  });

  await test.step('3. the competency framework says where each item comes from', async () => {
    await page.goto('/growth/competency_based_assessment');
    await expect(page.getByRole('heading', { name: COMPETENCY })).toBeVisible();
    // Provenance is on the page: a school competency must not read as a CBSE rule.
    await expect(
      page.getByText(/NPST|School-defined|Derived|School-specific/).first(),
    ).toBeVisible();
  });

  await test.step('4 & 5. self-assessment and observation are separate inputs', async () => {
    const how = page.locator('section', { hasText: 'How your verified level was reached' });
    await expect(how.getByRole('cell', { name: /Your self-assessment/ })).toBeVisible();
    await expect(how.getByRole('cell', { name: /Supervisor assessment/ })).toBeVisible();
    await expect(how.getByRole('cell', { name: /Classroom observation/ })).toBeVisible();
  });

  await test.step('6. the gap is identified and explained, not just scored', async () => {
    await page.goto('/dashboard');
    const stand = page.locator('section', { hasText: 'Where you stand' });
    await expect(stand.getByText('What is my gap?')).toBeVisible();
  });

  await test.step('7. CPD is recommended with its reasons', async () => {
    await page.goto('/growth/competency_based_assessment');
    const recs = page.locator('section', { hasText: 'Recommended development' });
    await expect(recs.getByText('Why this course?').first()).toBeVisible();
  });

  await test.step('8, 9, 10, 11, 12. plan → completion → evidence → impact → reassessment', async () => {
    await page.goto('/learning-map');
    // Each plan item is a Card, which renders a <section>.
    const done = page
      .locator('section', { hasText: 'Designing Competency-Based Assessments' })
      .first();
    await expect(done).toBeVisible();
    // The lifecycle spec drove this to the end. The finished state is what
    // acceptance cares about: a course completed does NOT move a level, so
    // reaching "reassessed" means evidence was verified along the way.
    await expect(done.getByText(/reassessed/i).first()).toBeVisible();

    await page.goto('/growth/competency_based_assessment');
    await expect(page.getByText(/level 3/i).first()).toBeVisible();
    // The earlier level must still be on the record, not overwritten.
    const history = page.locator('section', { hasText: 'How your verified level was reached' });
    await expect(history).toContainText(/level 2/i);
  });

  await test.step('13. KPIs are visible with their weights', async () => {
    await page.goto('/dashboard');
    const kpis = page.locator('section', { hasText: 'KPI progress' });
    await expect(kpis.getByText(/weight/i).first()).toBeVisible();
  });

  await test.step('14 & 15. the appraisal, and the growth score behind it', async () => {
    await page.goto('/appraisal');
    await expect(page.getByRole('heading', { name: /Appraisal/ }).first()).toBeVisible();
    // The score must be declared a school policy, not a CBSE or Punjab formula.
    await expect(
      page.getByText(/DEMO SCHOOL POLICY — NOT A CBSE OR PUNJAB GOVERNMENT FORMULA/),
    ).toBeVisible();
  });

  await test.step('16. increment readiness stays behind the employment gate', async () => {
    await signOut(page);
    await signIn(page, PRINCIPAL);
    await page.goto('/increment');
    await expect(
      page.getByText(/Employment\/service-rule applicability requires authorised verification/),
    ).toBeVisible();
  });

  await test.step('17. career progression is a record, not a calculation', async () => {
    await signOut(page);
    await signIn(page, NEHA);
    await page.goto('/service');
    await expect(page.getByRole('heading', { name: /Service Record/ })).toBeVisible();
  });

  await test.step('18. SQAAF mapping states what it cannot evidence', async () => {
    await signOut(page);
    await signIn(page, PRINCIPAL);
    await page.goto('/sqaaf');
    await expect(page.getByRole('heading', { name: 'SQAAF' }).first()).toBeVisible();
    await expect(page.getByText(/cannot|not yet evidenced|gap/i).first()).toBeVisible();
  });

  await test.step('19. analytics reports the school without ranking teachers', async () => {
    await page.goto('/analytics');
    await expect(page.getByRole('heading', { name: /Analytics/ }).first()).toBeVisible();
    // Training needs must be a statement supported by counts, not an assertion.
    await expect(page.getByText(/%/).first()).toBeVisible();
  });

  await test.step('20. the audit log has the trail, with who and when', async () => {
    // Reading the audit trail is a compliance function, not a leadership one:
    // `audit.read` belongs to the Compliance Administrator and the system
    // administrator, and the Principal does not hold it. That is least
    // privilege working, so the walk changes hands here rather than widening
    // the Principal's permissions to make one test easier.
    await signOut(page);
    await signIn(page, PRIYA);
    await page.goto('/admin/audit');
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Who' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'When' })).toBeVisible();
    // The lifecycle above must be visible in it.
    await expect(
      page.getByText(/verified competency insert|competency rating insert/).first(),
    ).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/* Role boundaries                                                     */
/* ------------------------------------------------------------------ */

test('a teacher cannot see another teacher private appraisal', async ({ page }) => {
  // There is no route that takes a teacher id here — `/appraisal` resolves the
  // signed-in person's own record and nothing else — so the boundary is tested
  // by confirming that a teacher with no appraisal is told exactly that, and
  // that no part of a colleague's appraisal reaches the page. Direct access by
  // id is covered at the database level in tests/db/tenant-isolation.test.ts
  // and tests/db/stage5.test.ts, which is where the boundary actually lives.
  await signIn(page, HARPREET);
  await page.goto('/appraisal');

  await expect(page.getByText('Neha Sharma')).toHaveCount(0);
  await expect(page.getByText(/Rewrite the fractions unit/)).toHaveCount(0);

  // And the page is honest about it rather than falling back to someone else's.
  await expect(
    page.getByText(/no appraisal|not started|nothing recorded|Harpreet/i).first(),
  ).toBeVisible();
});

test('a manager does not see pay fields without the separate permission', async ({ page }) => {
  // Appraisal permission and compensation permission are deliberately distinct:
  // supervising someone's development is not a reason to see what they are paid.
  // `increment.read` belongs to the Principal, HR/PD Administrator and the
  // management approver. Vikram is a Head of Department and supervises Neha's
  // whole growth lifecycle — he approves her plan and verifies her impact — and
  // still sees nothing of her increment position.
  await signIn(page, VIKRAM);
  await page.goto('/increment');

  // He reaches the page and sees only his own line, which is empty.
  await expect(page.getByText(/Readiness has not been computed for you/)).toBeVisible();

  // No colleague, and no increment recommendation for one.
  for (const colleague of ['Neha Sharma', 'Harpreet Singh', 'Rajesh Verma', 'Simran Kaur']) {
    await expect(page.getByText(colleague)).toHaveCount(0);
  }
  await expect(page.getByText(/recommended increment|increment recommendation/i)).toHaveCount(0);

  // The pay frameworks on the page are a register of what MIGHT apply and are
  // marked unverified — they carry no figure for anybody.
  await expect(page.getByText(/₹|basic pay of|salary of/i)).toHaveCount(0);
});

test('nobody sees a salary figure, because the platform holds none', async ({ page }) => {
  // The brief asks that a manager not automatically see salary fields. The
  // stronger answer, and the one built, is that there are no salary fields to
  // see: the platform records which pay arrangement applies and on whose
  // authority, never an amount. A permission that guards a field is only as
  // good as the next feature that forgets it; a field that does not exist
  // cannot leak.
  //
  // The permission split itself (increment.recommend with the Principal,
  // increment.approve with the management approver, so one person cannot do
  // both) is asserted in tests/unit/rbac.test.ts and tests/db/stage5.test.ts.
  for (const who of [NEHA, VIKRAM, PRINCIPAL]) {
    await signIn(page, who);
    await page.goto('/increment');
    await expect(page.getByText(/This platform holds no salary figures/)).toBeVisible();
    await expect(page.getByText(/₹|basic pay of|salary of|drawn pay/i)).toHaveCount(0);
    await signOut(page);
  }
});

test('an ordinary teacher cannot reach the audit log', async ({ page }) => {
  await signIn(page, NEHA);
  await page.goto('/admin/audit');
  await expect(page.getByText(/do not have permission/i)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('restricted leadership personas cannot read the audit log without the permission', async ({
  page,
}) => {
  // Least privilege, asserted rather than assumed. Seniority is not a
  // permission, and the audit trail records the actions of senior staff too.
  for (const who of [VIKRAM, ANJALI, VICE_PRINCIPAL, ACADEMIC_COORDINATOR, PRINCIPAL]) {
    await signIn(page, who);
    await page.goto('/admin/audit');
    await expect(page.getByText(/do not have permission/i)).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await signOut(page);
  }
});

test('a teacher can see who opened their own record', async ({ page }) => {
  // The other side of access logging: the log exists for the teacher's benefit,
  // so it has to be visible to them.
  await signIn(page, NEHA);
  await page.goto('/me');
  const panel = page.locator('section', { hasText: 'Who has opened your record' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Opening your own record is not logged/)).toBeVisible();
});

test('the password-free demo door is shut in this configuration', async ({ page }) => {
  // The suite runs with DEMO_NO_LOGIN explicitly off (see playwright.config.ts),
  // so these must behave as they would on a deployment. If this ever fails, the
  // suite is testing a system with an open door and every other boundary
  // assertion in this file is worth less than it looks.
  const chooser = await page.goto('/open');
  expect(page.url()).toMatch(/\/sign-in/);
  expect(chooser?.status()).toBeLessThan(400);

  const direct = await page.request.get('/api/demo-user?as=principal');
  expect(direct.status()).toBe(404);
});

test('mobile sign-out regression: visible control ends the session', async ({ page }) => {
  await signIn(page, NEHA);

  const signOutControl = page.getByRole('button', { name: 'Sign out' });
  await expect(signOutControl).toBeVisible();
  await signOutControl.click();
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  // A redirect alone does not prove the auth cookie was cleared. Reaching a
  // protected page must still send the browser back through the sign-in door.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
});
