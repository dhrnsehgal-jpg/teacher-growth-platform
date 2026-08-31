/**
 * Employment / pay compliance gate.
 *
 * Punjab service and pay rules do not reach every school in Punjab. Which reach
 * this one turns on its funding status — private aided, private unaided,
 * government — and that is a determination made from documents, not an
 * assumption. Until it is made, everything employment-related stays off.
 *
 * Mirrors `core.employment_compliance_enabled()` and
 * `core.employment_gate_message()`.
 */

import type { VerificationStatus } from './status';

export const SCHOOL_FUNDING_STATUSES = [
  'private_unaided',
  'private_aided',
  'government',
  'other',
  'unverified',
] as const;
export type SchoolFundingStatus = (typeof SCHOOL_FUNDING_STATUSES)[number];

/**
 * The exact wording to display when employment-related calculation is blocked.
 * Do not paraphrase this at a call site: the same sentence must appear
 * everywhere, and it is also defined in SQL as `core.employment_gate_message()`.
 */
export const EMPLOYMENT_GATE_MESSAGE =
  'School funding/service status requires verification before employment-related compliance calculations can be activated.';

export interface EmploymentGateInput {
  fundingStatus: SchoolFundingStatus;
  fundingStatusVerifiedAt: string | Date | null;
  fundingStatusVerifiedBy: string | null;
}

export interface EmploymentGateResult {
  enabled: boolean;
  /** Present only when blocked. */
  message: string | null;
  reason: 'ok' | 'funding_status_unverified' | 'verification_incomplete';
}

export function evaluateEmploymentGate(input: EmploymentGateInput): EmploymentGateResult {
  if (input.fundingStatus === 'unverified') {
    return {
      enabled: false,
      message: EMPLOYMENT_GATE_MESSAGE,
      reason: 'funding_status_unverified',
    };
  }

  // A funding status set without a named verifier and a timestamp is a claim,
  // not a verification. Treated as blocked.
  if (!input.fundingStatusVerifiedAt || !input.fundingStatusVerifiedBy) {
    return {
      enabled: false,
      message: EMPLOYMENT_GATE_MESSAGE,
      reason: 'verification_incomplete',
    };
  }

  return { enabled: true, message: null, reason: 'ok' };
}

/**
 * Which capabilities the gate covers.
 *
 * Professional growth — competencies, evidence, CPD, development planning — is
 * deliberately NOT gated. A teacher can use the whole developmental cycle while
 * the school's funding status is still being confirmed; only consequences that
 * touch employment or pay wait.
 */
export const EMPLOYMENT_GATED_CAPABILITIES = [
  'increment_readiness',
  'increment_recommendation',
  'increment_approval',
  'pay_framework_calculation',
  'service_rule_compliance',
  'statutory_employment_reporting',
] as const;

export type EmploymentGatedCapability = (typeof EMPLOYMENT_GATED_CAPABILITIES)[number];

export function isGatedCapability(capability: string): capability is EmploymentGatedCapability {
  return (EMPLOYMENT_GATED_CAPABILITIES as readonly string[]).includes(capability);
}

/**
 * Applicability of a Punjab employment rule given the school's funding status.
 *
 * Returns `potentially_applicable` rather than a decision when the rule's own
 * applicability has not been established — the honest answer when the source
 * text has not been read.
 */
export function punjabEmploymentRuleApplicability(input: {
  fundingStatus: SchoolFundingStatus;
  ruleAppliesToFundingStatuses: readonly SchoolFundingStatus[] | null;
}): VerificationStatus {
  if (input.fundingStatus === 'unverified') return 'requires_verification';
  if (input.ruleAppliesToFundingStatuses === null) return 'potentially_applicable';
  return input.ruleAppliesToFundingStatuses.includes(input.fundingStatus)
    ? 'verified'
    : 'not_applicable';
}
