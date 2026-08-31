/**
 * The CBSE CPD Guidelines 2025 (Notification TRG-02/2025), migration `0030`.
 *
 * These assert two different things, and the distinction is the point of the
 * whole regulatory layer:
 *
 *   1. The requirement is VERIFIED — it says what the notification says.
 *   2. It is nevertheless NOT ENFORCED for this school, because the school's
 *      CBSE affiliation is unverified.
 *
 * A test suite that only checked (1) would let the platform start asserting CBSE
 * compliance for a school that may not be affiliated. The gate is the feature.
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

/** Every requirement the notification establishes. */
const CPD_KEYS = [
  'cbse.cpd.annual_hours',
  'cbse.cpd.domain_allocation',
  'cbse.cpd.academic_task_equivalence',
  'cbse.cpd.recording_and_portals',
  'cbse.cpd.enforcement',
  'cbse.cpd.official_duty_protection',
  'cbse.cpd.npst_alignment',
];

describeDb('CBSE CPD Guidelines 2025 — the source', () => {
  it('is verified, and carries the notification number and retrieval evidence', async () => {
    const { rows } = await client.query(
      `select s.verification_status, s.reference_number, s.issued_on::text as issued_on,
              s.retrieved_at, s.verified_at, s.notes, a.name as authority
         from regulatory.source s
         join regulatory.authority a on a.id = s.authority_id
        where s.source_url like '%CPD_Guidelines2025%'`,
    );
    expect(rows).toHaveLength(1);
    const source = rows[0];
    expect(source.verification_status).toBe('verified');
    expect(source.reference_number).toContain('TRG-02/2025');
    expect(source.issued_on).toBe('2025-04-01');
    expect(source.authority).toContain('Central Board of Secondary Education');

    // "Verified" must mean someone actually read it, and the row must say how —
    // otherwise the status is an assertion rather than a record.
    expect(source.retrieved_at).not.toBeNull();
    expect(source.verified_at).not.toBeNull();
    expect(source.notes ?? '').not.toHaveLength(0);
  });

  it('records Notification 16/2021 separately, and does NOT claim it was read', async () => {
    // The 25+25 split originates in 16/2021. We know it only through CBSE's 2025
    // citation of it. Marking it verified would launder a citation into a source.
    const { rows } = await client.query(
      `select verification_status from regulatory.source where reference_number = 'Notification 16/2021'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].verification_status).toBe('requires_verification');
  });
});

describeDb('CBSE CPD Guidelines 2025 — the requirements', () => {
  it('records all seven as mandatory and verified', async () => {
    const { rows } = await client.query(
      `select requirement_key, classification, verification_status
         from regulatory.requirement
        where requirement_key like 'cbse.cpd.%' order by requirement_key`,
    );
    expect(rows.map((r) => r.requirement_key).sort()).toEqual([...CPD_KEYS].sort());
    for (const row of rows) {
      expect(row.classification, row.requirement_key).toBe('mandatory');
      expect(row.verification_status, row.requirement_key).toBe('verified');
    }
  });

  it('quotes the 25 + 25 split verbatim and states the 50-hour total in the title', async () => {
    // The separation is deliberate. `requirement_text` carries the notification's
    // own sentence, which specifies 25 + 25 and never writes "50" — that figure is
    // the sum. Putting 50 into the quoted text would be editing CBSE's words. It
    // belongs in the title, which is ours to write.
    const { rows } = await client.query(
      `select title, requirement_text from regulatory.requirement
        where requirement_key = 'cbse.cpd.annual_hours'`,
    );
    const { title, requirement_text: text } = rows[0];
    expect(text.match(/25 hours/g) ?? []).toHaveLength(2);
    expect(text).not.toMatch(/50/);
    expect(title).toMatch(/50 hours/);
  });

  it('caps academic-task equivalence at 11 hours, as the notification does', async () => {
    const { rows } = await client.query(
      `select requirement_text from regulatory.requirement
        where requirement_key = 'cbse.cpd.academic_task_equivalence'`,
    );
    expect(rows[0].requirement_text).toMatch(/11/);
  });

  it('names the CBSE Training Portal and OASIS, not UDISE+', async () => {
    // UDISE+/BRC/BEO/DEO is the NCERT mechanism for government schools. Applying
    // it to a private CBSE school was the Stage 1 open question; CBSE answers it.
    const { rows } = await client.query(
      `select requirement_text from regulatory.requirement
        where requirement_key = 'cbse.cpd.recording_and_portals'`,
    );
    const text = (rows[0].requirement_text as string).toUpperCase();
    expect(text).toContain('OASIS');
    expect(text).not.toContain('UDISE');
  });

  it('every requirement cites the source it came from', async () => {
    const { rows } = await client.query(
      `select r.requirement_key, s.reference_number
         from regulatory.requirement r
         join regulatory.source s on s.id = r.source_id
        where r.requirement_key like 'cbse.cpd.%'`,
    );
    expect(rows).toHaveLength(CPD_KEYS.length);
    for (const row of rows) {
      expect(row.reference_number, row.requirement_key).toContain('TRG-02/2025');
    }
  });
});

describeDb('CBSE CPD compliance stays gated on affiliation', () => {
  it('the school CBSE affiliation is still unverified', async () => {
    const { rows } = await client.query(
      `select cbse_affiliation_status from core.school_regulatory_profile limit 1`,
    );
    expect(rows[0].cbse_affiliation_status).toBe('unverified');
  });

  it('applicability is potentially_applicable — verified requirement, undetermined for us', async () => {
    const { rows } = await client.query(
      `select r.requirement_key, srs.applicability, srs.is_enforced, srs.determination_note
         from regulatory.requirement r
         join regulatory.school_requirement_status srs on srs.requirement_id = r.id
        where r.requirement_key like 'cbse.cpd.%'`,
    );
    expect(rows).toHaveLength(CPD_KEYS.length);
    for (const row of rows) {
      expect(row.applicability, row.requirement_key).toBe('potentially_applicable');
      expect(row.is_enforced, row.requirement_key).toBe(false);
      // The note must say what would lift the gate, or nobody can act on it.
      expect(row.determination_note ?? '', row.requirement_key).toMatch(/affiliation/i);
    }
  });

  it('is_enforceable_for_school() refuses every CPD requirement', async () => {
    const { rows } = await client.query(
      `select r.requirement_key,
              regulatory.is_enforceable_for_school(s.id, r.requirement_key) as enforceable
         from regulatory.requirement r
         cross join core.school s
        where r.requirement_key like 'cbse.cpd.%'`,
    );
    expect(rows).toHaveLength(CPD_KEYS.length);
    for (const row of rows) {
      expect(row.enforceable, row.requirement_key).toBe(false);
    }
  });
});
