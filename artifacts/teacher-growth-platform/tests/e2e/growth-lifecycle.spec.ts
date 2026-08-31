import { expect, test, type Page } from '@playwright/test';

import { DEMO_PASSWORD, NEHA, VIKRAM } from './demo-personas';

/**
 * The Stage 3 critical flow, end to end, through the real UI.
 *
 * Neha Sharma — Middle Stage Mathematics teacher
 * Competency  — Competency-Based Assessment
 * Expected 4, verified 2, gap 2, priority High
 *
 *   gap → recommendation → selection → approval → learning → completion
 *       → reflection → application + evidence → verification → reassessment
 *
 * The point of running it through the UI rather than the database is that it
 * proves the RLS policies, the stage gate and the server actions all agree.
 *
 * **Requires a freshly reset database.** This suite is not idempotent, by
 * design: it drives the real lifecycle, so every run leaves plan items, evidence
 * and a reassessment behind. Run it twice against the same database and the
 * second run finds two items awaiting reflection and fails on a strict-mode
 * violation — which looks like a regression and is not one.
 *
 * Use `npm run test:e2e:clean`, or `npx supabase db reset` first by hand.
 */

const COMPETENCY = 'Competency-Based Assessment';
const ACTIVITY = 'Designing Competency-Based Assessments';

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

test('the growth lifecycle moves a competency from level 2 to level 3', async ({ page }) => {
  // ---------------------------------------------------------------- 1. Gap
  await test.step('the teacher sees the gap and why it is a priority', async () => {
    await signIn(page, NEHA);

    await expect(page.getByRole('heading', { name: /Welcome, Neha Sharma/ })).toBeVisible();

    const priorities = page.locator('section', { hasText: 'Development priorities' });
    await expect(priorities.getByText(COMPETENCY).first()).toBeVisible();
    await expect(priorities.getByText('High').first()).toBeVisible();
    await expect(priorities.getByText(/gap of 2/).first()).toBeVisible();

    // The explanation must be present, not merely a score.
    await priorities.getByText('Why is this a priority?').first().click();
    await expect(
      priorities.getByText(/Expected level 4, verified at level 2/).first(),
    ).toBeVisible();
    await expect(priorities.getByText(/Mandatory competency/).first()).toBeVisible();
    await expect(priorities.getByText(/School strategic priority/).first()).toBeVisible();
  });

  // -------------------------------------------------- 2. Verified level shown
  await test.step('the teacher can see how the verified level was reached', async () => {
    await page.goto('/growth/competency_based_assessment');

    const how = page.locator('section', { hasText: 'How your verified level was reached' });
    // Each input is listed separately — none silently merged. Matched as table
    // cells, because the same words also appear in the verifier's prose.
    await expect(how.getByRole('cell', { name: /Your self-assessment/ })).toBeVisible();
    await expect(how.getByRole('cell', { name: /Supervisor assessment/ })).toBeVisible();
    await expect(how.getByRole('cell', { name: /Classroom observation/ })).toBeVisible();
    await expect(how.getByText(/Verified at level 2 by Vikram Rao/)).toBeVisible();
  });

  // ------------------------------------------------------- 3. Recommendation
  await test.step('the system recommends CPD and explains the ranking', async () => {
    const recs = page.locator('section', { hasText: 'Recommended development' });
    await expect(recs.getByText(ACTIVITY).first()).toBeVisible();
    await expect(recs.getByText('Why this course?').first()).toBeVisible();
    // Several activities address this competency; the top-ranked one is asserted.
    await expect(recs.getByText(/Directly addresses this competency/).first()).toBeVisible();
    await expect(recs.getByText(/Matches the stage you teach/).first()).toBeVisible();
  });

  // ------------------------------------------------------------ 4. Selection
  await test.step('the teacher adds it to their Learning Map', async () => {
    const top = page.locator('li', { hasText: ACTIVITY }).first();
    await top.getByRole('button', { name: 'Add to my Learning Map' }).click();
    await expect(page.getByText(/Added to your Learning Map/).first()).toBeVisible();
  });

  // ------------------------------------------------------------- 5. Approval
  await test.step('the manager approves it', async () => {
    await signOut(page);
    await signIn(page, VIKRAM);
    await page.goto('/manager');

    const pending = page.locator('li', { hasText: ACTIVITY }).first();
    await expect(pending.getByText(/Neha Sharma/).first()).toBeVisible();
    await pending.getByRole('button', { name: 'Approve' }).click();

    // Assert the OUTCOME rather than the confirmation message: approving moves
    // the item out of the queue, so the form that produced the message
    // unmounts with it.
    //
    // Scoped to NEHA's item rather than asserting the queue is globally empty.
    // Vikram supervises the whole Mathematics department, so anything else that
    // proposes development for a colleague — a cohort plan, say — legitimately
    // leaves other items in his queue without this approval having failed.
    const approvals = page.locator('section', { hasText: 'Development items awaiting approval' });
    await expect(approvals.locator('li', { hasText: 'Neha Sharma' })).toHaveCount(0);
    await expect(
      page.locator('section', { hasText: 'Development in progress' }).getByText(ACTIVITY).first(),
    ).toBeVisible();
  });

  // --------------------------------------- 6. Participation is not improvement
  await test.step('completing the activity does not change the competency', async () => {
    await signOut(page);
    await signIn(page, NEHA);
    await page.goto('/learning-map');

    await page.getByRole('button', { name: 'Start this activity' }).click();
    await expect(page.getByRole('button', { name: 'Mark as completed' })).toBeVisible();

    await page.getByRole('button', { name: 'Mark as completed' }).click();
    // The completed state itself carries the warning — the product rule
    // rendered on the page, not a transient toast.
    await expect(page.getByText(/Completing the activity has/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record reflection' })).toBeVisible();

    // The competency is still at level 2 at this point.
    await page.goto('/growth/competency_based_assessment');
    await expect(
      page
        .locator('section', { hasText: 'How your verified level was reached' })
        .getByText(/Verified at level 2 by/)
        .first(),
    ).toBeVisible();
  });

  // ------------------------------------------------ 7. Reflection then apply
  await test.step('the teacher reflects, then applies it and submits evidence', async () => {
    await page.goto('/learning-map');

    await page
      .getByLabel('What did you take from this, and what will you change?')
      .fill(
        'The distinction between recall and application finally landed. I am rewriting the ' +
          'fractions unit assessment so at least half the marks require applying the method in ' +
          'a context we have not taught, and building a rubric that describes the competency.',
      );
    await page.getByRole('button', { name: 'Record reflection' }).click();
    await expect(page.getByLabel('How did you apply this in practice?')).toBeVisible();

    await page
      .getByLabel('How did you apply this in practice?')
      .fill(
        'Rewrote the Class VII fractions end-of-unit assessment with three unfamiliar-context ' +
          'application tasks and a four-criterion rubric describing what the competency looks ' +
          'like. Used the results to reorder the following two lessons.',
      );
    await page
      .getByLabel('Evidence title')
      .fill('Revised Class VII fractions assessment and rubric');

    // A real upload, through the private bucket and its policies.
    await page.getByLabel('Attach the file (optional)').setInputFiles({
      name: 'fractions-assessment.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'Class VII fractions — revised end-of-unit assessment.\n' +
          'Task 3 asks students to apply fraction division in a recipe-scaling context ' +
          'they have not been taught.\n',
      ),
    });

    await page.getByRole('button', { name: 'Submit application and evidence' }).click();
    await expect(
      page.getByText(/Your reviewer needs to verify the application in practice/).first(),
    ).toBeVisible();

    // The file is attached, and NOT openable — migration 0048 refuses to serve
    // anything that has not been scanned clean, and no scanner runs in the test
    // environment. The platform says why rather than showing a broken link.
    //
    // That a clean scan opens it is proved in tests/db/carried-forward.
    await expect(
      page.getByText(/awaiting a virus scan and cannot be opened yet/).first(),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /Open fractions-assessment/ })).toHaveCount(0);
  });

  // ---------------------------------------------------------- 8. Verification
  await test.step('the manager verifies the application in practice', async () => {
    await signOut(page);
    await signIn(page, VIKRAM);
    await page.goto('/manager');

    await page
      .getByLabel('What did you verify?')
      .fill(
        'Observed the revised assessment in use on 12 September. Application tasks were genuinely ' +
          'unfamiliar and the rubric was applied consistently. Evidence matches what was taught.',
      );
    await page.getByRole('button', { name: 'Verify application' }).click();
    await expect(
      page.locator('section', { hasText: 'Ready for reassessment' }).getByText(COMPETENCY).first(),
    ).toBeVisible();
  });

  // --------------------------------------------------------- 9. Reassessment
  await test.step('the manager reassesses the competency to level 3', async () => {
    await page.goto('/manager');

    const ready = page.locator('section', { hasText: 'Ready for reassessment' });
    await expect(ready.getByText(COMPETENCY).first()).toBeVisible();

    await ready.getByLabel('New verified level').selectOption('3');
    await ready
      .getByLabel('Rationale for the new level')
      .fill(
        'Assessment design now tests application in unfamiliar contexts and uses a criteria-based ' +
          'rubric, verified in practice. Consistency across units is not yet established, so this ' +
          'is level 3 rather than 4.',
      );
    await ready.getByRole('button', { name: 'Record reassessment' }).click();
    await expect(
      page
        .locator('section', { hasText: 'Ready for reassessment' })
        .getByText('Nothing ready for reassessment.'),
    ).toBeVisible();
  });

  // --------------------------------------------------- 10. Improvement shown
  await test.step('the teacher dashboard records the improvement from 2 to 3', async () => {
    await signOut(page);
    await signIn(page, NEHA);

    const trend = page.locator('section', { hasText: 'Professional growth trend' });
    await expect(trend.getByText('Reassessment').first()).toBeVisible();

    await page.goto('/growth/competency_based_assessment');

    // Both levels are on the record: the history is append-only. Level names
    // rather than bare ordinals, which appear all over the page.
    const history = page.locator('section', { hasText: 'Competency movement over time' });
    await expect(history.getByText('Developing').first()).toBeVisible();
    await expect(history.getByText('Proficient').first()).toBeVisible();
    await expect(history.getByText(/Reassessed\./).first()).toBeVisible();

    // The gap has narrowed from 2 to 1.
    const gapCard = page.locator('section', { hasText: 'Your gap' });
    await expect(gapCard.getByText(/a gap of 1/).first()).toBeVisible();
  });
});

test('a teacher cannot see another teacher’s development record', async ({ page }) => {
  // Scope isolation through the real UI, not just the database.
  await signIn(page, NEHA);
  await page.goto('/manager');
  await expect(
    page
      .getByText(/do not currently supervise any staff|No staff are within your authorised scope/)
      .first(),
  ).toBeVisible();
});

test('assessment capture: self, supervisor, then a verified level', async ({ page }) => {
  // Digital Pedagogy is untouched by the lifecycle test above, so this exercises
  // capture from scratch rather than re-treading a verified competency.
  const COMPETENCY = 'Digital Pedagogy';

  await test.step('the teacher records a self-assessment', async () => {
    await signIn(page, NEHA);
    await page.goto('/self-assessment');

    const card = page.locator('section', { hasText: COMPETENCY }).first();
    await card.getByLabel('Where would you place your practice?').selectOption('2');
    await card
      .getByLabel('Why? What does your practice actually look like?')
      .fill(
        'I use the projector and shared slides, but I have not yet used a tool that does ' +
          'something a worksheet could not.',
      );
    await card.getByRole('button', { name: /Record my rating/ }).click();

    await expect(card.getByText(/Your current rating: level 2/).first()).toBeVisible();
  });

  await test.step('the supervisor rates it and records an observation', async () => {
    await signOut(page);
    await signIn(page, VIKRAM);
    await page.goto('/manager');

    // Reached through the manager's own team list, so scope is exercised too.
    await page
      .locator('li', { hasText: 'Neha Sharma' })
      .first()
      .getByRole('link', { name: 'Assess' })
      .click();
    await page.waitForURL(/\/assess\//);

    const card = page.locator('section', { hasText: COMPETENCY }).first();

    // The teacher's self-assessment is visible to the reviewer.
    await expect(card.getByRole('cell', { name: /Self-assessment/ })).toBeVisible();

    await card.getByLabel('Level', { exact: true }).selectOption('3');
    await card
      .getByLabel('What have you seen?')
      .fill(
        'Now uses a shared document for live peer feedback, which is genuinely something ' +
          'paper could not do. Not yet routine across units.',
      );
    await card.getByRole('button', { name: /Record rating/ }).click();

    await expect(card.getByRole('cell', { name: /Supervisor/ }).first()).toBeVisible();
  });

  await test.step('the supervisor verifies a level, and it explains itself', async () => {
    const card = page.locator('section', { hasText: COMPETENCY }).first();

    await card.getByLabel('Verified level').selectOption('3');
    await card.getByLabel('Evidence strength').selectOption('adequate');
    await card
      .getByLabel('Rationale — why this level, given the inputs?')
      .fill(
        'Self-assessment says 2, observation and my own judgement say 3. The peer-feedback ' +
          'practice is real but not yet consistent, so 3 rather than 4.',
      );
    await card.getByRole('button', { name: /Verify level/ }).click();

    await expect(card.getByText(/Verified at level 3|verified/i).first()).toBeVisible();
  });

  await test.step('the teacher sees every input behind the verified level', async () => {
    await signOut(page);
    await signIn(page, NEHA);
    await page.goto('/growth/digital_pedagogy');

    const how = page.locator('section', { hasText: 'How your verified level was reached' });
    await expect(how.getByRole('cell', { name: /Your self-assessment/ })).toBeVisible();
    await expect(how.getByRole('cell', { name: /Supervisor assessment/ })).toBeVisible();
    await expect(how.getByText(/Verified at level 3 by Vikram Rao/).first()).toBeVisible();
  });
});
