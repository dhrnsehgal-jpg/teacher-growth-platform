/**
 * The demo environment against what the brief asks it to contain.
 *
 * This suite exists because "the demo has data in it" is not checkable by
 * looking at a screen — an auditor found 385 verified competencies and zero
 * learning plans, which looks populated from the dashboard and is empty in the
 * part of the product the whole design is about.
 *
 * It also holds the line that matters most: every person here is fictional and
 * every record synthetic. Never load real employee data into a demo.
 */

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connect, databaseAvailable } from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

let client: Client;
beforeAll(async () => {
  if (available) client = await connect();
});
afterAll(async () => {
  if (available && client) await client.end();
});

describeDb('the demo school', () => {
  it('has at least the twenty fictional teachers the brief asks for', async () => {
    const { rows } = await client.query(`select count(*)::int as n from core.teacher_profile`);
    expect(rows[0].n).toBeGreaterThanOrEqual(20);
  });

  it('covers the posts the brief names', async () => {
    const { rows } = await client.query(
      `select distinct tc.key from core.teacher_profile tp
         join core.teacher_category tc on tc.id = tp.teacher_category_id`,
    );
    const posts = rows.map((r) => r.key as string);
    // Every post the brief lists. "Foundational" is `pre_primary_teacher` in
    // the schema — the brief's word, the school's key.
    for (const post of [
      'principal',
      'vice_principal',
      'academic_coordinator',
      'head_of_department',
      'prt',
      'tgt',
      'pgt',
      'pre_primary_teacher',
      'special_educator',
      'counsellor',
      'physical_education_teacher',
    ]) {
      expect(posts, `${post} has nobody in it`).toContain(post);
    }
  });

  it('spans Kindergarten to Class XII', async () => {
    const { rows } = await client.query(`select count(*)::int as n from core.school_stage`);
    expect(rows[0].n).toBeGreaterThanOrEqual(4);
  });

  it('has multiple departments with teachers in them', async () => {
    const { rows } = await client.query(
      `select count(distinct primary_department_id)::int as n
         from core.teacher_profile where primary_department_id is not null`,
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(4);
  });

  it('has competencies, KPIs and a CPD catalogue', async () => {
    for (const [relation, minimum] of [
      ['competency.competency', 10],
      ['kpi.teacher_kpi', 1],
      ['cpd.activity', 3],
    ] as const) {
      const { rows } = await client.query(`select count(*)::int as n from ${relation}`);
      expect(rows[0].n, relation).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('has different gap profiles rather than one repeated', async () => {
    // A heatmap where everyone sits at the same level demonstrates nothing.
    const { rows } = await client.query(
      `select count(distinct gap_size)::int as sizes,
              count(distinct priority_band_key)::int as bands
         from growth.gap where gap_size > 0`,
    );
    expect(rows[0].sizes).toBeGreaterThanOrEqual(2);
    expect(rows[0].bands).toBeGreaterThanOrEqual(2);
  });

  it('has learning plans at several points in the lifecycle', async () => {
    // The gap this suite was written for. Items must exist AND be spread: nine
    // items all sitting at `proposed` would demonstrate as little as none.
    const { rows } = await client.query(
      `select status, count(*)::int as n from growth.learning_plan_item group by status`,
    );
    expect(rows.length, 'plan items are all at one stage').toBeGreaterThanOrEqual(3);
    const total = rows.reduce((s, r) => s + r.n, 0);
    expect(total).toBeGreaterThanOrEqual(5);
  });

  it('has development that reached verified impact, and some that has not', async () => {
    // Both halves matter. Everything verified would imply the gate is a
    // formality; nothing verified would leave the point of the design unshown.
    const { rows } = await client.query(
      `select count(*) filter (where impact_verified_at is not null)::int as verified,
              count(*) filter (where impact_verified_at is null)::int as not_verified
         from growth.learning_plan_item`,
    );
    expect(rows[0].verified).toBeGreaterThan(0);
    expect(rows[0].not_verified).toBeGreaterThan(0);
  });

  it('has evidence, SQAAF mappings and an appraisal history', async () => {
    for (const [relation, minimum] of [
      ['evidence.evidence', 1],
      ['sqaaf.evidence_map', 1],
      ['appraisal.appraisal', 1],
    ] as const) {
      const { rows } = await client.query(`select count(*)::int as n from ${relation}`);
      expect(rows[0].n, relation).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('is entirely fictional, and says so on the records it generates', async () => {
    const { rows } = await client.query(
      `select count(*)::int as n from core.app_user where email not like '%@demo-school.example'`,
    );
    expect(rows[0].n, 'an address outside the demo domain is in the demo data').toBe(0);

    const { rows: rationale } = await client.query(
      `select count(*)::int as n from assessment.verified_competency
        where rationale not ilike '%demo%' and determined_from ? 'demo'`,
    );
    expect(rationale[0].n).toBe(0);
  });

  it('leaves nothing in a manager approval queue', async () => {
    // Load-bearing for the e2e suite, not cosmetic: the Stage 3 lifecycle spec
    // finds Neha's pending item with `.first()`, and a seeded item in the same
    // queue could be matched instead — a failure that reads as a regression in
    // the approval flow and is not one.
    const { rows } = await client.query(
      `select count(*)::int as n from growth.learning_plan_item where status = 'proposed'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('leaves Differentiated Instruction free for the cohort-plan spec', async () => {
    const { rows } = await client.query(
      `select count(*)::int as n
         from growth.learning_plan_item i
         join competency.competency c on c.id = i.competency_id
        where c.key = 'differentiated_instruction'`,
    );
    expect(rows[0].n).toBe(0);
  });
});

describeDb('the scripted personas are as complete as the cohort', () => {
  it('every teacher has a comparable number of assessed competencies', async () => {
    // The defect this catches: the Stage 1-5 seed gave the scripted personas
    // only the competencies each scenario needed — one, for Neha — while the
    // Stage 6 cohort block gave sixteen new teachers all twenty-four. Neha's
    // own dashboard then read "0 of your 1 assessed competencies", which looks
    // like a bug on the persona every walkthrough uses.
    const { rows } = await client.query(
      `select min(n)::int as lowest, max(n)::int as highest from (
         select count(*) as n from assessment.verified_competency
          group by teacher_profile_id) t`,
    );
    expect(rows[0].lowest).toBeGreaterThanOrEqual(rows[0].highest - 1);
  });

  it("preserves Neha's scripted gap exactly, and leaves it her top priority", async () => {
    // The Stage 3 lifecycle spec depends on both: the gap being 2 levels, and
    // it ranking above everything else in her top five.
    const { rows } = await client.query(
      `select c.key, g.gap_size, g.priority_score
         from growth.gap g
         join competency.competency c on c.id = g.competency_id
         join core.teacher_profile tp on tp.id = g.teacher_profile_id
         join core.app_user u on u.id = tp.user_id
        where u.email like 'neha%' and g.gap_size > 0
        order by g.priority_score desc`,
    );
    expect(rows[0].key).toBe('competency_based_assessment');
    expect(rows[0].gap_size).toBe(2);
  });

  it('leaves Digital Pedagogy unverified for the capture spec', async () => {
    // The assessment-capture spec drives self-assessment, supervisor rating and
    // verification from scratch, so it needs a competency with nothing on it.
    const { rows } = await client.query(
      `select count(*)::int as n
         from assessment.verified_competency vc
         join competency.competency c on c.id = vc.competency_id
         join core.teacher_profile tp on tp.id = vc.teacher_profile_id
        where c.key = 'digital_pedagogy' and tp.employee_code not like 'EMP-30%'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('nobody verified their own competency', async () => {
    const { rows } = await client.query(
      `select count(*)::int as n
         from assessment.verified_competency vc
         join core.teacher_profile tp on tp.id = vc.teacher_profile_id
        where vc.verified_by = tp.user_id`,
    );
    expect(rows[0].n).toBe(0);
  });
});
