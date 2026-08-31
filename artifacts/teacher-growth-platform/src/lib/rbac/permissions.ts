/**
 * Permission catalogue — the TypeScript mirror of `core.permission`.
 *
 * The database is the enforcement point (Row Level Security); this module is
 * the vocabulary the application reasons with. `tests/rbac.test.ts` parses the
 * seed migration and fails if the two lists drift apart, so a permission can
 * never exist on only one side.
 */

export const PERMISSIONS = {
  // School configuration
  SCHOOL_MANAGE: 'school.manage',
  STAFF_DIRECTORY_READ: 'staff_directory.read',

  // Access control
  RBAC_READ: 'rbac.read',
  RBAC_MANAGE: 'rbac.manage',

  // Teacher records
  TEACHER_RECORD_READ_SCOPE: 'teacher_record.read.scope',
  TEACHER_RECORD_MANAGE: 'teacher_record.manage',
  SERVICE_RECORD_READ_SCOPE: 'service_record.read.scope',
  SERVICE_RECORD_MANAGE: 'service_record.manage',

  // Competency and assessment
  COMPETENCY_READ: 'competency.read',
  COMPETENCY_MANAGE: 'competency.manage',
  ASSESSMENT_READ_SCOPE: 'assessment.read.scope',
  ASSESSMENT_CONDUCT: 'assessment.conduct',
  ASSESSMENT_MODERATE: 'assessment.moderate',
  OBSERVATION_CONDUCT: 'observation.conduct',
  EVIDENCE_SUBMIT: 'evidence.submit',
  EVIDENCE_REVIEW: 'evidence.review',

  // CPD
  CPD_READ_SCOPE: 'cpd.read.scope',
  CPD_MANAGE: 'cpd.manage',
  CPD_APPROVE: 'cpd.approve',
  CPD_RECORD_SUBMIT: 'cpd_record.submit',

  // KPI
  KPI_MANAGE: 'kpi.manage',
  KPI_ASSIGN: 'kpi.assign',

  // Development planning
  DEVELOPMENT_PLAN_READ_SCOPE: 'development_plan.read.scope',
  DEVELOPMENT_PLAN_APPROVE: 'development_plan.approve',

  // Appraisal
  APPRAISAL_READ_SCOPE: 'appraisal.read.scope',
  APPRAISAL_CONDUCT: 'appraisal.conduct',
  APPRAISAL_FINALISE: 'appraisal.finalise',
  REPRESENTATION_REVIEW: 'representation.review',

  // Compensation-sensitive
  PAY_FRAMEWORK_MANAGE: 'pay_framework.manage',
  INCREMENT_READ: 'increment.read',
  INCREMENT_RECOMMEND: 'increment.recommend',
  INCREMENT_APPROVE: 'increment.approve',
  CAREER_PROGRESSION_READ_SCOPE: 'career_progression.read.scope',
  CAREER_PROGRESSION_RECOMMEND: 'career_progression.recommend',
  CAREER_PROGRESSION_APPROVE: 'career_progression.approve',

  // Regulatory and compliance
  REGULATORY_READ: 'regulatory.read',
  REGULATORY_MANAGE: 'regulatory.manage',
  REGULATORY_AUTHORISE_RECALCULATION: 'regulatory.authorise_recalculation',
  COMPLIANCE_READ: 'compliance.read',
  COMPLIANCE_MANAGE: 'compliance.manage',
  SQAAF_READ: 'sqaaf.read',
  SQAAF_MANAGE: 'sqaaf.manage',

  // Oversight
  AUDIT_READ: 'audit.read',
  SYSTEM_ADMIN: 'system.admin',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

/**
 * Permissions that expose pay, increment or other compensation outcomes.
 *
 * These are granted independently of professional-growth permissions: a Head of
 * Department appraises their team without seeing anyone's increment. Keep this
 * in step with `core.permission.is_compensation_sensitive`.
 */
export const COMPENSATION_SENSITIVE_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.PAY_FRAMEWORK_MANAGE,
  PERMISSIONS.INCREMENT_READ,
  PERMISSIONS.INCREMENT_RECOMMEND,
  PERMISSIONS.INCREMENT_APPROVE,
  PERMISSIONS.CAREER_PROGRESSION_APPROVE,
];

export function isCompensationSensitive(permission: Permission): boolean {
  return COMPENSATION_SENSITIVE_PERMISSIONS.includes(permission);
}

/**
 * Pairs that must never be held by the same role. Checked in tests and by the
 * RBAC review screen: whoever recommends an outcome must not also approve it.
 */
export const SEPARATION_OF_DUTIES: ReadonlyArray<readonly [Permission, Permission]> = [
  [PERMISSIONS.INCREMENT_RECOMMEND, PERMISSIONS.INCREMENT_APPROVE],
  [PERMISSIONS.CAREER_PROGRESSION_RECOMMEND, PERMISSIONS.CAREER_PROGRESSION_APPROVE],
];
