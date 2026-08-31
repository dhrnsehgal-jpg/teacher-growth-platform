/**
 * Regulatory presentation and gating invariants.
 *
 * These encode the product's non-negotiable rules as tests, so a future change
 * that would let a school policy be shown as a CBSE rule fails the build.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CLASSIFICATION_PRESENTATION,
  describeRequirement,
  isEnforceable,
  isUnconfirmed,
  VERIFICATION_STATUSES,
} from '@/lib/regulatory/status';
import {
  EMPLOYMENT_GATE_MESSAGE,
  evaluateEmploymentGate,
  isGatedCapability,
  punjabEmploymentRuleApplicability,
} from '@/lib/regulatory/employment-gate';

describe('requirement attribution', () => {
  it('never describes a school policy as a CBSE rule', () => {
    const line = describeRequirement({
      layer: 'school',
      classification: 'school_policy',
      authorityName: 'School Governing Body',
      verification: 'verified',
    });

    expect(line).toContain('School policy');
    expect(line).not.toContain('CBSE');
    expect(line).not.toContain('Required by');
  });

  it('a school policy aligned to CBSE guidance is still attributed to the school', () => {
    // The trap: a CPD policy written to mirror CBSE guidance is the school's
    // policy, not a CBSE mandate.
    const line = describeRequirement({
      layer: 'cbse',
      classification: 'school_policy',
      authorityName: 'School Governing Body',
      verification: 'verified',
    });

    expect(line).toContain('School policy');
    expect(line).not.toContain('CBSE');
  });

  it('never describes a recommendation as required', () => {
    for (const layer of ['central', 'cbse', 'state', 'school'] as const) {
      const line = describeRequirement({
        layer,
        classification: 'recommended',
        authorityName: 'NCTE',
        verification: 'verified',
      });
      expect(line.startsWith('Recommended by')).toBe(true);
      expect(line).not.toContain('Required by');
    }
  });

  it('flags anything not verified in the attribution line', () => {
    for (const status of VERIFICATION_STATUSES) {
      const line = describeRequirement({
        layer: 'cbse',
        classification: 'mandatory',
        authorityName: 'CBSE',
        verification: status,
      });
      if (status === 'verified') {
        expect(line).toBe('Required by CBSE (CBSE)');
      } else {
        expect(line).toContain('—');
      }
    }
  });

  it('only mandatory requirements read as binding', () => {
    expect(CLASSIFICATION_PRESENTATION.mandatory.tone).toBe('binding');
    expect(CLASSIFICATION_PRESENTATION.recommended.tone).toBe('advisory');
    expect(CLASSIFICATION_PRESENTATION.school_policy.tone).toBe('advisory');
  });
});

describe('enforceability', () => {
  const enforceable = {
    classification: 'mandatory',
    requirementVerification: 'verified',
    sourceVerification: 'verified',
    schoolApplicability: 'verified',
    isEnforcedBySchool: true,
  } as const;

  it('allows a fully verified mandatory requirement', () => {
    expect(isEnforceable(enforceable)).toBe(true);
  });

  it.each([
    ['a recommendation', { ...enforceable, classification: 'recommended' as const }],
    ['a school policy', { ...enforceable, classification: 'school_policy' as const }],
    [
      'an unverified requirement',
      { ...enforceable, requirementVerification: 'requires_verification' as const },
    ],
    [
      'an unverified source',
      { ...enforceable, sourceVerification: 'requires_verification' as const },
    ],
    [
      'undetermined applicability',
      { ...enforceable, schoolApplicability: 'potentially_applicable' as const },
    ],
    [
      'a superseded requirement',
      { ...enforceable, requirementVerification: 'superseded' as const },
    ],
    ['a rule the school has not switched on', { ...enforceable, isEnforcedBySchool: false }],
  ])('refuses to enforce %s', (_label, input) => {
    expect(isEnforceable(input)).toBe(false);
  });
});

describe('unconfirmed statuses', () => {
  it('treats requires_verification and potentially_applicable as unchecked', () => {
    expect(isUnconfirmed('requires_verification')).toBe(true);
    expect(isUnconfirmed('potentially_applicable')).toBe(true);
    expect(isUnconfirmed('verified')).toBe(false);
    expect(isUnconfirmed('not_applicable')).toBe(false);
    expect(isUnconfirmed('superseded')).toBe(false);
  });
});

describe('employment gate', () => {
  it('blocks while funding status is unverified', () => {
    const result = evaluateEmploymentGate({
      fundingStatus: 'unverified',
      fundingStatusVerifiedAt: null,
      fundingStatusVerifiedBy: null,
    });

    expect(result.enabled).toBe(false);
    expect(result.message).toBe(EMPLOYMENT_GATE_MESSAGE);
  });

  it('blocks a funding status asserted without a verifier', () => {
    const result = evaluateEmploymentGate({
      fundingStatus: 'private_unaided',
      fundingStatusVerifiedAt: null,
      fundingStatusVerifiedBy: null,
    });

    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('verification_incomplete');
    expect(result.message).toBe(EMPLOYMENT_GATE_MESSAGE);
  });

  it('opens once funding status is verified by a named person', () => {
    const result = evaluateEmploymentGate({
      fundingStatus: 'private_unaided',
      fundingStatusVerifiedAt: '2026-08-20T10:00:00.000Z',
      fundingStatusVerifiedBy: '00000000-0000-0000-0000-000000000001',
    });

    expect(result.enabled).toBe(true);
    expect(result.message).toBeNull();
  });

  it('uses the exact required wording', () => {
    expect(EMPLOYMENT_GATE_MESSAGE).toBe(
      'School funding/service status requires verification before employment-related compliance calculations can be activated.',
    );
  });

  it('matches the wording defined in SQL', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const file = readdirSync(dir).find((n) => n.includes('school_regulatory_profile'));
    expect(file).toBeDefined();
    const sql = readFileSync(join(dir, file as string), 'utf8');
    expect(sql).toContain(EMPLOYMENT_GATE_MESSAGE);
  });

  it('gates employment consequences but not professional growth', () => {
    expect(isGatedCapability('increment_readiness')).toBe(true);
    expect(isGatedCapability('pay_framework_calculation')).toBe(true);
    expect(isGatedCapability('service_rule_compliance')).toBe(true);

    expect(isGatedCapability('cpd_tracking')).toBe(false);
    expect(isGatedCapability('competency_assessment')).toBe(false);
    expect(isGatedCapability('development_plan')).toBe(false);
  });
});

describe('Punjab employment rule applicability', () => {
  it('cannot decide anything while funding status is unverified', () => {
    expect(
      punjabEmploymentRuleApplicability({
        fundingStatus: 'unverified',
        ruleAppliesToFundingStatuses: ['private_aided'],
      }),
    ).toBe('requires_verification');
  });

  it('stays potentially applicable when the rule text has not been read', () => {
    expect(
      punjabEmploymentRuleApplicability({
        fundingStatus: 'private_unaided',
        ruleAppliesToFundingStatuses: null,
      }),
    ).toBe('potentially_applicable');
  });

  it('excludes an unaided school from an aided-post rule', () => {
    expect(
      punjabEmploymentRuleApplicability({
        fundingStatus: 'private_unaided',
        ruleAppliesToFundingStatuses: ['private_aided'],
      }),
    ).toBe('not_applicable');
  });

  it('includes an aided school in an aided-post rule', () => {
    expect(
      punjabEmploymentRuleApplicability({
        fundingStatus: 'private_aided',
        ruleAppliesToFundingStatuses: ['private_aided'],
      }),
    ).toBe('verified');
  });
});
