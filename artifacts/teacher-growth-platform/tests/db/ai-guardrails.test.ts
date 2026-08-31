/**
 * The AI assistant's prohibitions.
 *
 * The brief lists eleven things AI must not do. Most of them are prevented by
 * the shape of the schema — there is no path from `ai.suggestion` to any score,
 * outcome or decision — and that absence is what the first test asserts. The
 * rest are refusals the database makes.
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

async function insertSuggestion(overrides: Record<string, unknown> = {}) {
  const row = {
    school_id: school,
    teacher_profile_id: neha,
    academic_year_id: year,
    kind: 'explain_competency_gap',
    headline: 'Competency-Based Assessment sits below expectation',
    body: 'The verified level is 2 against an expected 4, which the gap engine scored 80 out of 100.',
    inputs: JSON.stringify([{ source: 'Gap', detail: 'Verified 2, expected 4' }]),
    ...overrides,
  };
  const cols = Object.keys(row);
  const vals = cols.map((_, i) => `$${i + 1}`);
  return client.query(
    `insert into ai.suggestion (${cols.join(',')}) values (${vals.join(',')}) returning id`,
    Object.values(row),
  );
}

describeDb('AI cannot change anything', () => {
  it('no table in the platform references ai.suggestion', async () => {
    // The prohibition is structural: if nothing points at a suggestion, no
    // engine can consume one. This is the assertion that keeps it that way.
    const { rows } = await client.query(
      `select c.conrelid::regclass::text as referencing
         from pg_constraint c
        where c.contype = 'f'
          and c.confrelid = 'ai.suggestion'::regclass`,
    );
    expect(rows).toEqual([]);
  });

  it('the suggestion table holds no score, level or decision column', async () => {
    const { rows } = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'ai' and table_name = 'suggestion'
          and (column_name ~ 'level|score|outcome|decision|approve|increment|salary')`,
    );
    expect(rows).toEqual([]);
  });

  it('keeps the advisory label on every suggestion', async () => {
    await client.query('begin');
    try {
      const { rows } = await insertSuggestion();
      const { rows: stored } = await client.query(
        `select advisory_label from ai.suggestion where id = $1`,
        [rows[0].id],
      );
      expect(stored[0].advisory_label).toBe(
        'AI-assisted recommendation — professional judgement required.',
      );
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses a suggestion whose label has been stripped', async () => {
    await client.query('begin');
    try {
      await expect(insertSuggestion({ advisory_label: 'Recommendation' })).rejects.toThrow(
        /ai_suggestion_label_intact/,
      );
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses a suggestion that cites no evidence', async () => {
    await client.query('begin');
    try {
      await expect(insertSuggestion({ inputs: JSON.stringify([]) })).rejects.toThrow(
        /ai_suggestion_inputs_present/,
      );
    } finally {
      await client.query('rollback');
    }
  });
});

describeDb('AI cannot invent regulation', () => {
  it('refuses an uncited CBSE claim', async () => {
    await client.query('begin');
    try {
      await expect(
        insertSuggestion({
          body: 'CBSE requires every teacher to complete 80 hours of CPD each year in this subject.',
        }),
      ).rejects.toThrow(/states a regulatory requirement but cites none/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses an uncited Punjab claim', async () => {
    await client.query('begin');
    try {
      await expect(
        insertSuggestion({
          body: 'Punjab mandates a minimum increment for every confirmed teacher after five years.',
        }),
      ).rejects.toThrow(/cites none/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('refuses a claim citing a requirement that is not verified', async () => {
    await client.query('begin');
    try {
      await expect(
        insertSuggestion({
          body: 'CBSE requires an annual SQAAF submission window in September.',
          inputs: JSON.stringify([
            { source: 'Requirement', detail: 'Punjab rule', requirement_key: 'punjab.made.up' },
          ]),
        }),
      ).rejects.toThrow(/not a verified requirement/i);
    } finally {
      await client.query('rollback');
    }
  });

  it('allows a claim that cites a genuinely verified requirement', async () => {
    await client.query('begin');
    try {
      const { rows } = await insertSuggestion({
        kind: 'explain_cpd_compliance_deficit',
        body: 'CBSE requires 50 hours of CPD a year, split 25 through the Board and 25 by the school.',
        inputs: JSON.stringify([
          {
            source: 'Verified regulatory requirement',
            detail: '50 hours of CPD per year',
            requirement_key: 'cbse.cpd.annual_hours',
          },
        ]),
      });
      expect(rows[0].id).toBeTruthy();
    } finally {
      await client.query('rollback');
    }
  });
});

describeDb('external AI assistance is off until the controls exist', () => {
  it('is disabled, and no configuration claims otherwise', async () => {
    const { rows } = await client.query(
      `select count(*) filter (where external_assistance_enabled) as enabled from ai.configuration`,
    );
    expect(Number(rows[0].enabled)).toBe(0);
  });

  it('refuses to enable it without the agreement, review and controls', async () => {
    await client.query('begin');
    try {
      await expect(
        client.query(
          `insert into ai.configuration (school_id, external_assistance_enabled, provider)
           values ($1, true, 'some-provider')`,
          [school],
        ),
      ).rejects.toThrow(/ai_config_enable_requires_controls/);
    } finally {
      await client.query('rollback');
    }
  });

  it('accepts it when every control is recorded', async () => {
    await client.query('begin');
    try {
      const { rows } = await client.query(
        `insert into ai.configuration
           (school_id, external_assistance_enabled, provider, model, data_region,
            processing_agreement_reference, privacy_review_reference, controls_note,
            enabled_by, enabled_at)
         values ($1, true, 'example-provider', 'example-model', 'ap-south-1',
                 'DPA-2026-014', 'PRIV-REV-2026-03',
                 'Data processing agreement signed, region confirmed in India, names and free text withheld.',
                 $2, now())
         returning external_assistance_enabled`,
        [school, DEMO_USERS.principal],
      );
      expect(rows[0].external_assistance_enabled).toBe(true);
    } finally {
      await client.query('rollback');
    }
  });

  it('defaults to withholding names and free text', async () => {
    await client.query('begin');
    try {
      const { rows } = await client.query(
        `insert into ai.configuration (school_id) values ($1)
         returning send_teacher_names, send_free_text, redaction_note`,
        [school],
      );
      expect(rows[0].send_teacher_names).toBe(false);
      expect(rows[0].send_free_text).toBe(false);
      expect(rows[0].redaction_note).toMatch(/withheld from any external service by default/i);
    } finally {
      await client.query('rollback');
    }
  });
});

describeDb('suggestion visibility', () => {
  it('a teacher sees suggestions about themselves', async () => {
    await client.query('begin');
    try {
      await insertSuggestion();
      await asUser(client, DEMO_USERS.neha, async (c) => {
        const { rows } = await c.query(`select id from ai.suggestion`);
        expect(rows.length).toBe(1);
      });
    } finally {
      await client.query('rollback');
    }
  });

  it('a teacher outside scope sees none', async () => {
    await client.query('begin');
    try {
      await insertSuggestion();
      await asUser(client, DEMO_USERS.harpreet, async (c) => {
        const { rows } = await c.query(`select id from ai.suggestion`);
        expect(rows).toEqual([]);
      });
    } finally {
      await client.query('rollback');
    }
  });

  it('acting on a suggestion records who and when', async () => {
    await client.query('begin');
    try {
      const { rows } = await insertSuggestion();
      await expect(
        client.query(`update ai.suggestion set acted_on = true where id = $1`, [rows[0].id]),
      ).rejects.toThrow(/ai_suggestion_acted_recorded/);
    } finally {
      await client.query('rollback');
    }
  });
});
