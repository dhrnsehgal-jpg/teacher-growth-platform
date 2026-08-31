/**
 * Regulatory classification and verification vocabulary.
 *
 * The rules this module exists to make unbreakable:
 *
 *   1. A school policy is never described as a CBSE rule.
 *   2. An NPST or NEP recommendation is never described as mandatory law.
 *   3. Nothing unverified is ever enforced against a member of staff.
 *
 * The labels below are the only wording the UI may use for a requirement's
 * standing. They are exported as data rather than written inline in components
 * so a well-meaning copy edit cannot turn "recommended" into "required".
 */

export const AUTHORITY_LAYERS = ['central', 'cbse', 'state', 'school'] as const;
export type AuthorityLayer = (typeof AUTHORITY_LAYERS)[number];

export const REQUIREMENT_CLASSIFICATIONS = ['mandatory', 'recommended', 'school_policy'] as const;
export type RequirementClassification = (typeof REQUIREMENT_CLASSIFICATIONS)[number];

export const VERIFICATION_STATUSES = [
  'verified',
  'requires_verification',
  'superseded',
  'not_applicable',
  'potentially_applicable',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const AUTHORITY_LAYER_LABELS: Readonly<Record<AuthorityLayer, string>> = {
  central: 'Central / National',
  cbse: 'CBSE',
  state: 'Punjab (State)',
  school: 'School policy',
};

/**
 * How a requirement of each classification must be described to a teacher.
 * `attribution` is the phrase that precedes the authority name.
 */
export const CLASSIFICATION_PRESENTATION: Readonly<
  Record<
    RequirementClassification,
    { readonly label: string; readonly attribution: string; readonly tone: 'binding' | 'advisory' }
  >
> = {
  mandatory: {
    label: 'Mandatory',
    attribution: 'Required by',
    tone: 'binding',
  },
  recommended: {
    label: 'Recommended',
    attribution: 'Recommended by',
    tone: 'advisory',
  },
  school_policy: {
    label: 'School policy',
    attribution: 'Adopted as school policy by',
    tone: 'advisory',
  },
};

export const VERIFICATION_STATUS_LABELS: Readonly<Record<VerificationStatus, string>> = {
  verified: 'Verified',
  requires_verification: 'Requires verification',
  superseded: 'Superseded',
  not_applicable: 'Not applicable',
  potentially_applicable: 'Potentially applicable',
};

/**
 * Builds the attribution line shown against a requirement.
 *
 * A school-layer requirement is always attributed to the school, whatever its
 * subject matter. This is what stops "our CPD policy" being rendered as "CBSE
 * requires" merely because the policy was written to align with CBSE guidance.
 */
export function describeRequirement(input: {
  layer: AuthorityLayer;
  classification: RequirementClassification;
  authorityName: string;
  verification: VerificationStatus;
}): string {
  const presentation = CLASSIFICATION_PRESENTATION[input.classification];
  const authority =
    input.classification === 'school_policy'
      ? `${input.authorityName} (${AUTHORITY_LAYER_LABELS.school})`
      : `${input.authorityName} (${AUTHORITY_LAYER_LABELS[input.layer]})`;

  const base = `${presentation.attribution} ${authority}`;

  return input.verification === 'verified'
    ? base
    : `${base} — ${VERIFICATION_STATUS_LABELS[input.verification].toLowerCase()}`;
}

/**
 * The gate every compliance calculation passes through, mirroring
 * `regulatory.is_enforceable_for_school()`.
 *
 * Enforcement requires all three: the rule binds, we have checked it, and this
 * school has determined it applies. Anything else is displayed, never applied.
 */
export function isEnforceable(input: {
  classification: RequirementClassification;
  requirementVerification: VerificationStatus;
  sourceVerification: VerificationStatus;
  schoolApplicability: VerificationStatus;
  isEnforcedBySchool: boolean;
}): boolean {
  return (
    input.classification === 'mandatory' &&
    input.requirementVerification === 'verified' &&
    input.sourceVerification === 'verified' &&
    input.schoolApplicability === 'verified' &&
    input.isEnforcedBySchool
  );
}

/** True when a status means "we have not actually checked this". */
export function isUnconfirmed(status: VerificationStatus): boolean {
  return status === 'requires_verification' || status === 'potentially_applicable';
}
