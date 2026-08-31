/**
 * Validation for the School Regulatory Profile.
 *
 * The profile decides which rules reach this school, so its integrity rules are
 * strict and match the database constraints rather than merely echoing them:
 *
 *   * funding status may only leave "unverified" together with a named verifier,
 *     a timestamp and a note recording which document was seen;
 *   * nothing may be silently defaulted to a plausible-looking value.
 */

import { z } from 'zod';
import { SCHOOL_FUNDING_STATUSES } from '../regulatory/employment-gate';

export const SCHOOL_OWNERSHIP_TYPES = [
  'society',
  'trust',
  'section_8_company',
  'government_body',
  'other',
  'unverified',
] as const;

export const MINORITY_STATUSES = ['minority', 'non_minority', 'unverified'] as const;

export const AFFILIATION_STATUSES = [
  'provisional',
  'regular',
  'extended',
  'applied',
  'withdrawn',
  'unverified',
] as const;

const optionalTrimmed = z
  .string()
  .trim()
  .min(1)
  .nullish()
  .transform((v) => v ?? null);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)')
  .nullish()
  .transform((v) => v ?? null);

export const schoolRegulatoryProfileSchema = z
  .object({
    schoolId: z.string().uuid(),

    // Location. Punjab is the default because the platform is being built for a
    // Punjab school, but it stays an editable field for multi-school use.
    country: z.string().trim().min(1).default('India'),
    state: z.string().trim().min(1).default('Punjab'),
    district: optionalTrimmed,
    blockOrTehsil: optionalTrimmed,
    postalCode: optionalTrimmed,

    // CBSE affiliation
    cbseAffiliationNumber: optionalTrimmed,
    cbseSchoolCode: optionalTrimmed,
    cbseAffiliationStatus: z.enum(AFFILIATION_STATUSES).default('unverified'),
    cbseAffiliationValidFrom: isoDate,
    cbseAffiliationValidTo: isoDate,
    isSeniorSecondary: z
      .boolean()
      .nullish()
      .transform((v) => v ?? null),

    // State recognition
    stateRecognitionNumber: optionalTrimmed,
    stateRecognitionAuthority: optionalTrimmed,
    stateRecognitionValidFrom: isoDate,
    stateRecognitionValidTo: isoDate,

    // Ownership and funding
    ownershipType: z.enum(SCHOOL_OWNERSHIP_TYPES).default('unverified'),
    managingBodyName: optionalTrimmed,
    managingBodyRegistrationNumber: optionalTrimmed,
    fundingStatus: z.enum(SCHOOL_FUNDING_STATUSES).default('unverified'),
    minorityStatus: z.enum(MINORITY_STATUSES).default('unverified'),

    // Applicable frameworks — free text on purpose. Naming the service or pay
    // framework that binds a school is a legal determination; a closed dropdown
    // would invite a guess.
    applicableServiceFramework: optionalTrimmed,
    applicablePayFramework: optionalTrimmed,
    applicableRecognitionAuthority: optionalTrimmed,

    // Verification of the gating facts
    fundingStatusVerifiedAt: z
      .string()
      .datetime()
      .nullish()
      .transform((v) => v ?? null),
    fundingStatusVerifiedBy: z
      .string()
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
    fundingStatusEvidenceNote: z
      .string()
      .trim()
      .min(10, 'Record which document establishes the funding status (at least 10 characters).')
      .nullish()
      .transform((v) => v ?? null),

    affiliationVerifiedAt: z
      .string()
      .datetime()
      .nullish()
      .transform((v) => v ?? null),
    affiliationVerifiedBy: z
      .string()
      .uuid()
      .nullish()
      .transform((v) => v ?? null),

    notes: optionalTrimmed,
  })
  .superRefine((value, ctx) => {
    // Mirrors constraint profile_funding_verification_complete.
    if (value.fundingStatus !== 'unverified') {
      const missing: string[] = [];
      if (!value.fundingStatusVerifiedAt) missing.push('fundingStatusVerifiedAt');
      if (!value.fundingStatusVerifiedBy) missing.push('fundingStatusVerifiedBy');
      if (!value.fundingStatusEvidenceNote) missing.push('fundingStatusEvidenceNote');

      for (const field of missing) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message:
            'Funding status can only leave "unverified" when a named person has recorded ' +
            'the verification and the document it rests on.',
        });
      }
    }

    if (
      value.cbseAffiliationValidFrom &&
      value.cbseAffiliationValidTo &&
      value.cbseAffiliationValidTo < value.cbseAffiliationValidFrom
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cbseAffiliationValidTo'],
        message: 'Affiliation validity cannot end before it starts.',
      });
    }

    // Senior Secondary status is a claim about the affiliation, so it cannot be
    // asserted while the affiliation itself is unverified.
    if (value.isSeniorSecondary === true && value.cbseAffiliationStatus === 'unverified') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isSeniorSecondary'],
        message:
          'Senior Secondary status cannot be recorded while the CBSE affiliation status is unverified.',
      });
    }
  });

export type SchoolRegulatoryProfileInput = z.input<typeof schoolRegulatoryProfileSchema>;
export type SchoolRegulatoryProfile = z.output<typeof schoolRegulatoryProfileSchema>;

/**
 * Fields a person must still confirm before the profile can drive compliance.
 * Drives the "requires verification" checklist on the school settings screen.
 */
export function outstandingVerifications(
  profile: Pick<
    SchoolRegulatoryProfile,
    | 'fundingStatus'
    | 'cbseAffiliationStatus'
    | 'ownershipType'
    | 'minorityStatus'
    | 'applicableServiceFramework'
    | 'applicablePayFramework'
    | 'district'
  >,
): string[] {
  const outstanding: string[] = [];

  if (profile.fundingStatus === 'unverified') {
    outstanding.push(
      'School funding status (private aided / private unaided / government) — blocks all employment and pay compliance.',
    );
  }
  if (profile.cbseAffiliationStatus === 'unverified') {
    outstanding.push('CBSE affiliation status and affiliation number.');
  }
  if (profile.ownershipType === 'unverified') {
    outstanding.push('Ownership structure (society / trust / Section 8 company).');
  }
  if (profile.minorityStatus === 'unverified') {
    outstanding.push('Minority or non-minority status.');
  }
  if (!profile.district) {
    outstanding.push('District — determines the recognition authority within Punjab.');
  }
  if (!profile.applicableServiceFramework) {
    outstanding.push('Applicable service framework for staff.');
  }
  if (!profile.applicablePayFramework) {
    outstanding.push('Applicable pay framework.');
  }

  return outstanding;
}
