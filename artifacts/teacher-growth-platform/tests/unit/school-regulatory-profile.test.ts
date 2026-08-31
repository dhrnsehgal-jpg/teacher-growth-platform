import { describe, expect, it } from 'vitest';

import {
  outstandingVerifications,
  schoolRegulatoryProfileSchema,
} from '@/lib/validation/school-regulatory-profile';

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

describe('school regulatory profile validation', () => {
  it('defaults to Punjab, India with everything unverified', () => {
    const parsed = schoolRegulatoryProfileSchema.parse({ schoolId: SCHOOL_ID });

    expect(parsed.state).toBe('Punjab');
    expect(parsed.country).toBe('India');
    expect(parsed.fundingStatus).toBe('unverified');
    expect(parsed.cbseAffiliationStatus).toBe('unverified');
    expect(parsed.ownershipType).toBe('unverified');
    expect(parsed.minorityStatus).toBe('unverified');
  });

  it('rejects a funding status set without a verifier', () => {
    const result = schoolRegulatoryProfileSchema.safeParse({
      schoolId: SCHOOL_ID,
      fundingStatus: 'private_unaided',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('fundingStatusVerifiedBy');
      expect(paths).toContain('fundingStatusVerifiedAt');
      expect(paths).toContain('fundingStatusEvidenceNote');
    }
  });

  it('accepts a funding status backed by a named verification', () => {
    const result = schoolRegulatoryProfileSchema.safeParse({
      schoolId: SCHOOL_ID,
      fundingStatus: 'private_unaided',
      fundingStatusVerifiedAt: '2026-08-20T10:00:00.000Z',
      fundingStatusVerifiedBy: USER_ID,
      fundingStatusEvidenceNote:
        'Confirmed against the school recognition certificate dated 2019-04-01; no aided posts sanctioned.',
    });

    expect(result.success).toBe(true);
  });

  it('will not record Senior Secondary status against an unverified affiliation', () => {
    const result = schoolRegulatoryProfileSchema.safeParse({
      schoolId: SCHOOL_ID,
      isSeniorSecondary: true,
    });

    expect(result.success).toBe(false);
  });

  it('rejects an affiliation period that ends before it starts', () => {
    const result = schoolRegulatoryProfileSchema.safeParse({
      schoolId: SCHOOL_ID,
      cbseAffiliationStatus: 'regular',
      cbseAffiliationValidFrom: '2025-04-01',
      cbseAffiliationValidTo: '2024-04-01',
    });

    expect(result.success).toBe(false);
  });
});

describe('outstanding verification checklist', () => {
  it('leads with funding status and says what it blocks', () => {
    const outstanding = outstandingVerifications({
      fundingStatus: 'unverified',
      cbseAffiliationStatus: 'unverified',
      ownershipType: 'unverified',
      minorityStatus: 'unverified',
      applicableServiceFramework: null,
      applicablePayFramework: null,
      district: null,
    });

    expect(outstanding[0]).toContain('funding status');
    expect(outstanding[0]).toContain('employment and pay compliance');
    expect(outstanding).toHaveLength(7);
  });

  it('empties as facts are confirmed', () => {
    const outstanding = outstandingVerifications({
      fundingStatus: 'private_unaided',
      cbseAffiliationStatus: 'regular',
      ownershipType: 'society',
      minorityStatus: 'non_minority',
      applicableServiceFramework: 'School service rules, 2024 edition',
      applicablePayFramework: 'School pay structure approved by the governing body',
      district: 'Ludhiana',
    });

    expect(outstanding).toEqual([]);
  });
});
