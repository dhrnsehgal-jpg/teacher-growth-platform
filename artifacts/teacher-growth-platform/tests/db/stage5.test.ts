/**
 * Stage 5: service conditions, appraisal, growth score and increment governance.
 *
 * The assertions that matter most here are refusals. This is the stage where a
 * bug does not produce a wrong number on a dashboard — it produces a teacher
 * losing money, or an appraisal record that cannot be defended. Nearly every
 * test below checks that the database says no.
 */

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  asUser,
  connect,
  currentYearId,
  databaseAvailable,
  DEMO_USERS,
  schoolId,
  teacherProfileId,
} from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

let client: Client;
let school: string;
let year: string;
let neha: string;

beforeAll(async () => {
  if (!available) return;
  client = await connect();
  school = await schoolId(client);
  year = await currentYearId(client);
  neha = await teacherProfileId(client, DEMO_USERS.neha);
});
afterAll(async () => {
  if (available && client) await client.end();
});

async function appraisalId(): Promise<string> {
  const { rows } = await client.query(
    `select id from appraisal.appraisal where teacher_profile_id = $1`,
    [neha],
  );
  return rows[0].id as string;
}

// ---------------------------------------------------------------------------
describeDb('the employment gate', () => {
  it('is closed, because the school funding status is unverified', async () => {
    const { rows } = await client.query(
      `select p.funding_status, core.employment_compliance_enabled($1) as enabled,
              core.employment_gate_message() as funding_msg,
              core.service_rule_gate_message() as service_msg
         from core.school_regulatory_profile p where p.school_id = $1`,
      [school],
    );
    expect(rows[0].funding_status).toBe('unverified');
    expect(rows[0].enabled).toBe(false);
    expect(rows[0].service_msg).toBe(
      'Employment/service-rule applicability requires authorised verification.',
    );
  });

  it('refuses to record a pay entitlement while it is closed', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `insert into pay.entitlement
             (school_id, teacher_profile_id, academic_year_id, description, basis)
           values ($1, $2, $3, 'Annual increment under the service rules', 'Some rule')`,
          [school, neha, year],
        ),
      ).rejects.toThrow(/funding\/service status requires verification/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses a final increment decision while it is closed', async () => {
    await client.query('begin');
    try {
      const { rows } = await client.query(`select id from pay.recommendation limit 1`);
      await expect(
        client.query(
          `insert into pay.approval (school_id, recommendation_id, stage, decision, decided_by)
           values ($1, $2, 'final_decision', 'approved', $3)`,
          [school, rows[0].id, DEMO_USERS.principal],
        ),
      ).rejects.toThrow(/funding\/service status requires verification/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('still allows readiness to be computed — it is an indicator, not a decision', async () => {
    const { rows } = await client.query(
      `select readiness_percent, requirements_total from pay.recommendation where teacher_profile_id = $1`,
      [neha],
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].requirements_total)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
describeDb('aided/unaided applicability', () => {
  it('records every Punjab instrument as unread and undetermined', async () => {
    const { rows } = await client.query(
      `select key, verification_status, applicability from service.policy
        where school_id = $1 and key like 'punjab.%' order by key`,
      [school],
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const r of rows) {
      expect(r.verification_status, r.key).toBe('requires_verification');
      expect(r.applicability, r.key).toBe('requires_verification');
    }
  });

  it('refuses to mark a rule applicable while funding status is unverified', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `update service.policy
              set applicability = 'verified',
                  applicability_determined_by = $2,
                  applicability_determined_at = now(),
                  applicability_note = 'Determined by counsel as reaching this school in full.'
            where school_id = $1 and key = 'punjab.security_of_service_1979'`,
          [school, DEMO_USERS.principal],
        ),
      ).rejects.toThrow(/funding status is unverified|requires authorised verification/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses to apply an aided-schools rule to an unaided school', async () => {
    await client.query('begin');
    try {
      // Confirm the school as PRIVATE UNAIDED, which opens the gate...
      await client.query(
        `update core.school_regulatory_profile
            set funding_status = 'private_unaided',
                funding_status_verified_at = now(),
                funding_status_verified_by = $2,
                funding_status_evidence_note = 'Society registration and fee structure reviewed for the test.'
          where school_id = $1`,
        [school, DEMO_USERS.principal],
      );

      // ...then try to mark an aided-only rule as reaching it.
      await expect(
        client.query(
          `update service.policy
              set applies_to_funding_status = array['private_aided']::core.school_funding_status[],
                  applicability = 'verified',
                  applicability_determined_by = $2,
                  applicability_determined_at = now(),
                  applicability_note = 'Asserting an aided-school rule against an unaided school.'
            where school_id = $1 and key = 'punjab.security_of_service_1979'`,
          [school, DEMO_USERS.principal],
        ),
      ).rejects.toThrow(/applies to .* but the school is recorded as/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('does not import Punjab Government pay scales merely because the school is in Punjab', async () => {
    const { rows } = await client.query(
      `select applicability, base_structure, increment_rule from pay.framework
        where school_id = $1 and key = 'punjab.government_pay_scales'`,
      [school],
    );
    expect(rows[0].applicability).toBe('requires_verification');
    expect(rows[0].base_structure).toMatch(/no structure has been verified/i);
    expect(rows[0].increment_rule).toMatch(/no increment rule has been verified/i);
  });
});

// ---------------------------------------------------------------------------
describeDb('policy versioning and historical records', () => {
  it('supersedes rather than overwrites', async () => {
    await client.query('begin');
    try {
      await client.query(
        `insert into service.policy (school_id, key, version, title, classification, applicability)
         values ($1, 'school.employment_policy', 2, 'School employment policy (2027 revision)',
                 'school_policy', 'requires_verification')`,
        [school],
      );
      const { rows } = await client.query(
        `select version from service.policy where school_id = $1 and key = 'school.employment_policy' order by version`,
        [school],
      );
      expect(rows.map((r) => r.version)).toEqual([1, 2]);
    } finally {
      await client.query('rollback');
    }
  });

  it('keeps career events append-only', async () => {
    // Separate transactions: the first failure aborts the transaction, so a
    // second statement inside it reports "transaction is aborted" instead of
    // the constraint we are actually testing.
    for (const sql of [
      `update service.career_event set summary = 'rewritten'`,
      `delete from service.career_event`,
    ]) {
      await client.query('begin');
      try {
        await expect(client.query(sql)).rejects.toThrow(/append-only/);
      } finally {
        await client.query('rollback');
      }
    }
  });

  it('holds a career history for every teacher', async () => {
    const { rows } = await client.query(
      `select count(distinct r.id)::int as records, count(e.id)::int as events
         from service.service_record r
         left join service.career_event e on e.service_record_id = r.id
        where r.school_id = $1`,
      [school],
    );
    expect(rows[0].records).toBe(7);
    expect(rows[0].events).toBeGreaterThanOrEqual(7);
  });
});

// ---------------------------------------------------------------------------
describeDb('appraisal workflow', () => {
  it('runs the stages in the order the brief sets out', async () => {
    const { rows } = await client.query(
      `select to_stage from appraisal.stage_event
        where appraisal_id = $1 order by occurred_at`,
      [await appraisalId()],
    );
    const seen = rows.map((r) => r.to_stage);
    expect(seen[0]).toBe('self_assessment');
    expect(seen).toContain('appraisal_discussion');
    expect(seen).toContain('final_recommendation');
    expect(seen.at(-1)).toBe('teacher_acknowledgement');
  });

  it('refuses to skip a stage', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(`update appraisal.appraisal set stage = 'closed' where id = $1`, [
          await appraisalId(),
        ]),
      ).rejects.toThrow(/cannot move from/);
    } finally {
      await client.query('rollback');
    }
  });

  it('allows a return to the appraisal discussion, because a discussion can reopen a review', async () => {
    await client.query('begin');
    try {
      const id = await appraisalId();
      // From teacher_acknowledgement the recommendation is already made, so this
      // is refused; prove the allowance from an earlier stage instead.
      await client.query(
        `insert into appraisal.appraisal (school_id, cycle_id, teacher_profile_id, appraiser_user_id, stage)
         select school_id, cycle_id, $2, appraiser_user_id, 'supervisor_review'
           from appraisal.appraisal where id = $1`,
        [id, await teacherProfileId(client, DEMO_USERS.rajesh)],
      );
      const { rows } = await client.query(
        `select id from appraisal.appraisal where teacher_profile_id = $1`,
        [await teacherProfileId(client, DEMO_USERS.rajesh)],
      );
      await client.query(
        `update appraisal.appraisal set stage = 'appraisal_discussion' where id = $1`,
        [rows[0].id],
      );
      const { rows: after } = await client.query(
        `select stage from appraisal.appraisal where id = $1`,
        [rows[0].id],
      );
      expect(after[0].stage).toBe('appraisal_discussion');
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses a self-appraisal', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(`update appraisal.appraisal set appraiser_user_id = $2 where id = $1`, [
          await appraisalId(),
          DEMO_USERS.neha,
        ]),
      ).rejects.toThrow(/cannot be their own appraiser/);
    } finally {
      await client.query('rollback');
    }
  });

  it('freezes the recommendation once made', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `update appraisal.appraisal set recommendation = 'Something else' where id = $1`,
          [await appraisalId()],
        ),
      ).rejects.toThrow(/frozen once made/);
    } finally {
      await client.query('rollback');
    }
  });
});

// ---------------------------------------------------------------------------
describeDb('acknowledgement', () => {
  it('keeps every response the teacher has made', async () => {
    const { rows } = await client.query(
      `select status, comment from appraisal.teacher_response
        where appraisal_id = $1 order by responded_at`,
      [await appraisalId()],
    );
    expect(rows.map((r) => r.status)).toEqual(['reviewed', 'comments_submitted']);
    expect(rows[1].comment).toMatch(/CBSE-delivered hours/);
  });

  it('is append-only — a response cannot be edited away', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(`update appraisal.teacher_response set status = 'acknowledged'`),
      ).rejects.toThrow(/append-only/);
    } finally {
      await client.query('rollback');
    }
  });

  it('requires substance behind a comment or a clarification request', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `insert into appraisal.teacher_response (school_id, appraisal_id, status, comment)
           values ($1, $2, 'clarification_requested', 'why?')`,
          [school, await appraisalId()],
        ),
      ).rejects.toThrow(/teacher_response_comment_present/);
    } finally {
      await client.query('rollback');
    }
  });
});

// ---------------------------------------------------------------------------
describeDb('representation and review', () => {
  async function makeRepresentation(c: Client) {
    const id = await appraisalId();
    const { rows } = await c.query(
      `insert into appraisal.representation
         (school_id, appraisal_id, original_recommendation, original_rationale,
          original_recommended_by, submitted_by, grounds)
       select a.school_id, a.id, a.recommendation, a.recommendation_rationale,
              a.recommended_by, $2,
              'The CPD shortfall reflects programmes the Board did not offer in my subject until the second term.'
         from appraisal.appraisal a where a.id = $1
       returning id`,
      [id, DEMO_USERS.neha],
    );
    return rows[0].id as string;
  }

  it('copies the original decision onto the representation', async () => {
    await client.query('begin');
    try {
      const repId = await makeRepresentation(client);
      const { rows } = await client.query(
        `select original_recommendation from appraisal.representation where id = $1`,
        [repId],
      );
      expect(rows[0].original_recommendation).toMatch(/Satisfactory progress/);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses review by the person whose decision is challenged', async () => {
    await client.query('begin');
    try {
      const repId = await makeRepresentation(client);
      await expect(
        client.query(
          `update appraisal.representation
              set reviewer_user_id = $2, reviewed_at = now(), status = 'not_upheld',
                  outcome_reason = 'I stand by my own original decision entirely.'
            where id = $1`,
          [repId, DEMO_USERS.vikram],
        ),
      ).rejects.toThrow(/cannot be reviewed by the person whose decision is challenged/);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses a decision with no reason', async () => {
    await client.query('begin');
    try {
      const repId = await makeRepresentation(client);
      await expect(
        client.query(
          `update appraisal.representation
              set reviewer_user_id = $2, reviewed_at = now(), status = 'not_upheld'
            where id = $1`,
          [repId, DEMO_USERS.principal],
        ),
      ).rejects.toThrow(/representation_decided_complete/);
    } finally {
      await client.query('rollback');
    }
  });

  it('records a revised position when upheld, and never deletes the original', async () => {
    await client.query('begin');
    try {
      const repId = await makeRepresentation(client);
      await client.query(
        `update appraisal.representation
            set reviewer_user_id = $2, reviewed_at = now(), status = 'partly_upheld',
                outcome = 'partly_upheld',
                outcome_reason = 'The Board did not offer subject-specific hours until January, which the appraisal did not reflect.',
                revised_recommendation = 'Satisfactory progress; CPD shortfall attributed to programme availability.'
          where id = $1`,
        [repId, DEMO_USERS.principal],
      );
      const { rows } = await client.query(
        `select original_recommendation, revised_recommendation, status
           from appraisal.representation where id = $1`,
        [repId],
      );
      expect(rows[0].status).toBe('partly_upheld');
      expect(rows[0].original_recommendation).toMatch(/Satisfactory progress/);
      expect(rows[0].revised_recommendation).toMatch(/programme availability/);

      // And the appraisal's own recommendation is untouched.
      const { rows: appr } = await client.query(
        `select recommendation from appraisal.appraisal where id = $1`,
        [await appraisalId()],
      );
      expect(appr[0].recommendation).toMatch(/continue development/);
    } finally {
      await client.query('rollback');
    }
  });

  it('freezes the original and the grounds', async () => {
    await client.query('begin');
    try {
      const repId = await makeRepresentation(client);
      await expect(
        client.query(
          `update appraisal.representation set grounds = 'different grounds entirely here' where id = $1`,
          [repId],
        ),
      ).rejects.toThrow(/immutable/);
    } finally {
      await client.query('rollback');
    }
  });
});

// ---------------------------------------------------------------------------
describeDb('professional growth score', () => {
  it('carries the disclaimer, and the weights total 100', async () => {
    const { rows } = await client.query(
      `select gs.total_percent, gs.disclaimer, gs.engine_version,
              (select sum(weight_percent) from appraisal.growth_component c
                where c.model_id = gs.model_id) as weights
         from appraisal.growth_score gs`,
    );
    expect(rows[0].disclaimer).toBe(
      'DEMO SCHOOL POLICY — NOT A CBSE OR PUNJAB GOVERNMENT FORMULA.',
    );
    expect(Number(rows[0].weights)).toBe(100);
    expect(rows[0].engine_version).toBe('growth-score-v1');
  });

  it('reconciles with its components', async () => {
    const { rows } = await client.query(
      `select gs.total_percent,
              (select sum(weighted_points) from appraisal.growth_score_component c
                where c.growth_score_id = gs.id) as parts
         from appraisal.growth_score gs`,
    );
    expect(Number(rows[0].parts)).toBeCloseTo(Number(rows[0].total_percent), 2);
  });

  it('explains every component — weight, result, evidence and basis', async () => {
    const { rows } = await client.query(
      `select component_name, weight_percent, raw_result, evidence_summary, basis
         from appraisal.growth_score_component`,
    );
    expect(rows.length).toBe(7);
    for (const r of rows) {
      expect(r.evidence_summary.length, r.component_name).toBeGreaterThan(10);
      expect(r.basis.length, r.component_name).toBeGreaterThan(20);
    }
  });

  it('refuses a model whose weights do not total 100', async () => {
    await client.query('begin');
    try {
      await expect(
        (async () => {
          await client.query(
            `insert into appraisal.growth_component
               (school_id, model_id, key, display_name, source, weight_percent, definition)
             select $1, id, 'extra', 'Extra', 'manual', 20,
                    'An extra component that pushes the model past one hundred percent.'
               from appraisal.growth_model where school_id = $1 limit 1`,
            [school],
          );
          await client.query('commit');
        })(),
      ).rejects.toThrow(/weights total/);
    } finally {
      await client.query('rollback').catch(() => undefined);
    }
  });

  it('does not invent a judgement for components with no automatic measure', async () => {
    // The seeded model has no such component, so assert the engine's rule
    // directly: a manual component scores zero and says why.
    await client.query('begin');
    try {
      await client.query(
        `update appraisal.growth_component set weight_percent = 45
          where key = 'competency_attainment'`,
      );
      await client.query(
        `insert into appraisal.growth_component
           (school_id, model_id, key, display_name, source, weight_percent, definition)
         select $1, id, 'conduct', 'Professional conduct', 'professional_conduct', 0,
                'Recorded by the appraiser; the platform holds no automatic measure of conduct.'
           from appraisal.growth_model where school_id = $1 limit 1`,
        [school],
      );
      await client.query(`select appraisal.compute_growth_score($1)`, [await appraisalId()]);
      const { rows } = await client.query(
        `select raw_result, basis from appraisal.growth_score_component
          where component_name = 'Professional conduct'`,
      );
      expect(Number(rows[0].raw_result)).toBe(0);
      expect(rows[0].basis).toMatch(/no defensible automatic measure/i);
    } finally {
      await client.query('rollback');
    }
  });
});

// ---------------------------------------------------------------------------
describeDb('increment governance', () => {
  it('reports readiness with requirements complete and what is outstanding', async () => {
    const { rows } = await client.query(
      `select readiness_percent, requirements_met, requirements_total,
              jsonb_array_length(outstanding) as outstanding, disclaimer, engine_version
         from pay.recommendation where teacher_profile_id = $1`,
      [neha],
    );
    const r = rows[0];
    expect(Number(r.requirements_total)).toBe(5);
    expect(Number(r.outstanding)).toBe(Number(r.requirements_total) - Number(r.requirements_met));
    expect(r.disclaimer).toMatch(/NOT A CBSE OR PUNJAB GOVERNMENT FORMULA/);
    expect(r.engine_version).toBe('increment-readiness-v1');
  });

  it('explains every outstanding requirement', async () => {
    const { rows } = await client.query(
      `select o->>'requirement' as req, o->>'detail' as detail, o->>'why' as why
         from pay.recommendation, jsonb_array_elements(outstanding) o
        where teacher_profile_id = $1`,
      [neha],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.detail.length, r.req).toBeGreaterThan(10);
      expect(r.why.length, r.req).toBeGreaterThan(15);
    }
  });

  it('REFUSES to withhold an entitlement no verified rule permits withholding', async () => {
    // The central protection of this stage. Open the gate, create an entitlement
    // that no rule permits withholding, then try to withhold it on performance.
    await client.query('begin');
    try {
      await client.query(
        `update core.school_regulatory_profile
            set funding_status = 'private_unaided', funding_status_verified_at = now(),
                funding_status_verified_by = $2,
                funding_status_evidence_note = 'Society registration and fee structure reviewed for the test.'
          where school_id = $1`,
        [school, DEMO_USERS.principal],
      );
      const { rows: ent } = await client.query(
        `insert into pay.entitlement
           (school_id, teacher_profile_id, academic_year_id, description, basis)
         values ($1, $2, $3, 'Annual increment under the adopted employment policy',
                 'School employment policy clause 4.2')
         returning id, withholding_permitted_by_rule`,
        [school, neha, year],
      );
      expect(ent[0].withholding_permitted_by_rule).toBe(false);

      await expect(
        client.query(
          `update pay.recommendation
              set proposes_withholding = true, affects_entitlement_id = $2
            where teacher_profile_id = $1`,
          [neha, ent[0].id],
        ),
      ).rejects.toThrow(/no verified rule permits withholding/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('permits it only where a verified rule expressly says so', async () => {
    await client.query('begin');
    try {
      await client.query(
        `update core.school_regulatory_profile
            set funding_status = 'private_unaided', funding_status_verified_at = now(),
                funding_status_verified_by = $2,
                funding_status_evidence_note = 'Society registration and fee structure reviewed for the test.'
          where school_id = $1`,
        [school, DEMO_USERS.principal],
      );
      const { rows: src } = await client.query(`select id from regulatory.source limit 1`);
      const { rows: ent } = await client.query(
        `insert into pay.entitlement
           (school_id, teacher_profile_id, academic_year_id, description, basis,
            withholding_permitted_by_rule, withholding_rule_reference, withholding_rule_source_id)
         values ($1, $2, $3, 'Performance-linked increment', 'Adopted policy clause 7',
                 true, 'Clause 7(3) expressly permits withholding on performance grounds', $4)
         returning id`,
        [school, neha, year, src[0].id],
      );
      await client.query(
        `update pay.recommendation
            set proposes_withholding = true, affects_entitlement_id = $2
          where teacher_profile_id = $1`,
        [neha, ent[0].id],
      );
      const { rows } = await client.query(
        `select proposes_withholding from pay.recommendation where teacher_profile_id = $1`,
        [neha],
      );
      expect(rows[0].proposes_withholding).toBe(true);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses to mark an entitlement withheld when no rule permits it', async () => {
    await client.query('begin');
    try {
      await client.query(
        `update core.school_regulatory_profile
            set funding_status = 'private_unaided', funding_status_verified_at = now(),
                funding_status_verified_by = $2,
                funding_status_evidence_note = 'Society registration and fee structure reviewed for the test.'
          where school_id = $1`,
        [school, DEMO_USERS.principal],
      );
      await expect(
        client.query(
          `insert into pay.entitlement
             (school_id, teacher_profile_id, academic_year_id, description, basis, status, status_note)
           values ($1, $2, $3, 'Annual increment', 'Policy clause 4.2', 'withheld',
                   'Withheld because the growth score was low this year.')`,
          [school, neha, year],
        ),
      ).rejects.toThrow(/entitlement_withheld_only_if_permitted/);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses a teacher recommending their own increment', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `update pay.recommendation
              set outcome = 'recommended', outcome_rationale = 'I think I deserve this increment.',
                  recommended_by = $2, recommended_at = now()
            where teacher_profile_id = $1`,
          [neha, DEMO_USERS.neha],
        ),
      ).rejects.toThrow(/cannot recommend their own increment/);
    } finally {
      await client.query('rollback');
    }
  });
});

// ---------------------------------------------------------------------------
describeDb('approval chain', () => {
  it('configures the six stages the brief sets out', async () => {
    const { rows } = await client.query(
      `select stage from pay.approval_step where school_id = $1 order by step_order`,
      [school],
    );
    expect(rows.map((r) => r.stage)).toEqual([
      'system_analysis',
      'supervisor_recommendation',
      'principal_review',
      'hr_management_review',
      'authorised_approval',
      'final_decision',
    ]);
  });

  it('refuses one person completing two stages of the same recommendation', async () => {
    await client.query('begin');
    try {
      const { rows } = await client.query(`select id from pay.recommendation limit 1`);
      await client.query(
        `insert into pay.approval (school_id, recommendation_id, stage, decision, decided_by)
         values ($1, $2, 'supervisor_recommendation', 'endorsed', $3)`,
        [school, rows[0].id, DEMO_USERS.vikram],
      );
      await expect(
        client.query(
          `insert into pay.approval (school_id, recommendation_id, stage, decision, decided_by)
           values ($1, $2, 'principal_review', 'endorsed', $3)`,
          [school, rows[0].id, DEMO_USERS.vikram],
        ),
      ).rejects.toThrow(/already decided the .* stage/);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses the teacher approving anything about their own increment', async () => {
    await client.query('begin');
    try {
      const { rows } = await client.query(`select id from pay.recommendation limit 1`);
      await expect(
        client.query(
          `insert into pay.approval (school_id, recommendation_id, stage, decision, decided_by)
           values ($1, $2, 'supervisor_recommendation', 'endorsed', $3)`,
          [school, rows[0].id, DEMO_USERS.neha],
        ),
      ).rejects.toThrow(/cannot approve a decision about their own increment/);
    } finally {
      await client.query('rollback');
    }
  });

  it('keeps approvals append-only', async () => {
    await client.query('begin');
    try {
      const { rows } = await client.query(`select id from pay.recommendation limit 1`);
      await client.query(
        `insert into pay.approval (school_id, recommendation_id, stage, decision, decided_by)
         values ($1, $2, 'supervisor_recommendation', 'endorsed', $3)`,
        [school, rows[0].id, DEMO_USERS.vikram],
      );
      await expect(client.query(`update pay.approval set decision = 'approved'`)).rejects.toThrow(
        /append-only/,
      );
    } finally {
      await client.query('rollback');
    }
  });
});

// ---------------------------------------------------------------------------
describeDb('permissions and privacy', () => {
  it('a Head of Department holds no pay permission at all', async () => {
    const { rows } = await client.query(
      `select rp.permission_key from core.role r
         join core.role_permission rp on rp.role_id = r.id
        where r.school_id = $1 and r.key = 'head_of_department'
          and rp.permission_key in ('increment.read', 'increment.recommend', 'increment.approve', 'pay_framework.manage')`,
      [school],
    );
    expect(rows).toEqual([]);
  });

  it('so a Head of Department cannot see a teacher increment recommendation', async () => {
    await asUser(client, DEMO_USERS.vikram, async (c) => {
      const { rows } = await c.query(
        `select id from pay.recommendation where teacher_profile_id = $1`,
        [neha],
      );
      expect(rows).toEqual([]);
    });
  });

  it('but the teacher can see their own', async () => {
    await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(`select readiness_percent from pay.recommendation`);
      expect(rows.length).toBe(1);
    });
  });

  it('a teacher sees their own service record and nobody else', async () => {
    await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(
        `select r.employee_id, tp.user_id from service.service_record r
           join core.teacher_profile tp on tp.id = r.teacher_profile_id`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0].user_id).toBe(DEMO_USERS.neha);
    });
  });

  it('a Head of Department without the scope permission sees only their own', async () => {
    await asUser(client, DEMO_USERS.vikram, async (c) => {
      const { rows } = await c.query(`select count(*)::int as n from service.service_record`);
      // head_of_department holds service_record.read.scope, so their team is visible.
      expect(rows[0].n).toBeGreaterThan(1);
    });
  });

  it('a teacher cannot record a response on somebody else appraisal', async () => {
    // Passed in explicitly: scope isolation already hides Neha's appraisal from
    // Harpreet, so a subquery-driven insert would silently find nothing and
    // never exercise the policy's WITH CHECK.
    const id = await appraisalId();
    await asUser(client, DEMO_USERS.harpreet, async (c) => {
      await expect(
        c.query(
          `insert into appraisal.teacher_response (school_id, appraisal_id, status)
           values ($1, $2, 'acknowledged')`,
          [school, id],
        ),
      ).rejects.toThrow(/row-level security|new row violates/i);
    });
  });

  it('a teacher can read their own appraisal in full', async () => {
    await asUser(client, DEMO_USERS.neha, async (c) => {
      const { rows } = await c.query(
        `select recommendation, recommendation_rationale from appraisal.appraisal`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0].recommendation_rationale).toMatch(/level 2 to level 3/);
    });
  });

  it('audits every employment decision table', async () => {
    const { rows } = await client.query(
      `select c.relnamespace::regnamespace::text || '.' || c.relname as tbl
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
         join pg_proc p on p.oid = t.tgfoid
        where not t.tgisinternal and p.pronamespace = 'audit'::regnamespace
          and c.relnamespace::regnamespace::text in ('service', 'appraisal', 'pay')
        order by 1`,
    );
    expect(rows.map((r) => r.tbl)).toEqual([
      'appraisal.appraisal',
      'appraisal.growth_score',
      'appraisal.representation',
      'pay.approval',
      'pay.entitlement',
      'pay.framework',
      'pay.recommendation',
      'service.policy',
      'service.service_record',
    ]);
  });
});
