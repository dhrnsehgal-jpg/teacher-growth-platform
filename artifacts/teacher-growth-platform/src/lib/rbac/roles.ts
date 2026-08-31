/**
 * The nine system roles and their default grants — mirror of
 * `core.provision_school_roles()`.
 *
 * Scope, not role, decides *which* staff a manager can see. A Head of
 * Department and a Vice Principal may hold overlapping permissions; what
 * separates them is the scope attached to their assignment.
 */

import { PERMISSIONS, type Permission } from './permissions';

export const ROLE_KEYS = {
  TEACHER: 'teacher',
  HEAD_OF_DEPARTMENT: 'head_of_department',
  ACADEMIC_COORDINATOR: 'academic_coordinator',
  VICE_PRINCIPAL: 'vice_principal',
  PRINCIPAL: 'principal',
  HR_PD_ADMIN: 'hr_pd_admin',
  MANAGEMENT_APPROVER: 'management_approver',
  COMPLIANCE_ADMIN: 'compliance_admin',
  SYSTEM_ADMIN: 'system_admin',
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export const ASSIGNMENT_SCOPE_TYPES = [
  'school',
  'department',
  'school_stage',
  'individual',
] as const;

export type AssignmentScopeType = (typeof ASSIGNMENT_SCOPE_TYPES)[number];

export interface RoleDefinition {
  readonly key: RoleKey;
  readonly displayName: string;
  /** Scopes this role is normally assigned at. Not enforced; used for defaults. */
  readonly typicalScopes: readonly AssignmentScopeType[];
  readonly permissions: readonly Permission[];
  readonly notes: string;
}

const P = PERMISSIONS;

export const ROLE_DEFINITIONS: Readonly<Record<RoleKey, RoleDefinition>> = {
  [ROLE_KEYS.TEACHER]: {
    key: ROLE_KEYS.TEACHER,
    displayName: 'Teacher',
    typicalScopes: ['school'],
    permissions: [
      P.STAFF_DIRECTORY_READ,
      P.COMPETENCY_READ,
      P.EVIDENCE_SUBMIT,
      P.REGULATORY_READ,
      P.CPD_RECORD_SUBMIT,
    ],
    notes:
      'Access to their own professional record is structural, not permission-based: ' +
      'RLS matches on user id. Teachers can read the regulatory register because the ' +
      'product promises they can see the rule behind every expectation.',
  },

  [ROLE_KEYS.HEAD_OF_DEPARTMENT]: {
    key: ROLE_KEYS.HEAD_OF_DEPARTMENT,
    displayName: 'Head of Department',
    typicalScopes: ['department'],
    permissions: [
      P.STAFF_DIRECTORY_READ,
      P.COMPETENCY_READ,
      P.EVIDENCE_SUBMIT,
      P.REGULATORY_READ,
      P.TEACHER_RECORD_READ_SCOPE,
      P.ASSESSMENT_READ_SCOPE,
      P.ASSESSMENT_CONDUCT,
      P.OBSERVATION_CONDUCT,
      P.EVIDENCE_REVIEW,
      P.CPD_READ_SCOPE,
      P.DEVELOPMENT_PLAN_READ_SCOPE,
      P.DEVELOPMENT_PLAN_APPROVE,
      P.APPRAISAL_READ_SCOPE,
      P.APPRAISAL_CONDUCT,
      P.CAREER_PROGRESSION_READ_SCOPE,
      P.KPI_ASSIGN,
      P.CPD_RECORD_SUBMIT,
      P.SQAAF_READ,
      P.CPD_APPROVE,
      P.SERVICE_RECORD_READ_SCOPE,
    ],
    notes: 'Sees only their own department. Holds no compensation permission.',
  },

  [ROLE_KEYS.ACADEMIC_COORDINATOR]: {
    key: ROLE_KEYS.ACADEMIC_COORDINATOR,
    displayName: 'Academic Coordinator',
    typicalScopes: ['school_stage', 'department'],
    permissions: [
      P.STAFF_DIRECTORY_READ,
      P.COMPETENCY_READ,
      P.EVIDENCE_SUBMIT,
      P.REGULATORY_READ,
      P.TEACHER_RECORD_READ_SCOPE,
      P.ASSESSMENT_READ_SCOPE,
      P.ASSESSMENT_CONDUCT,
      P.OBSERVATION_CONDUCT,
      P.EVIDENCE_REVIEW,
      P.CPD_READ_SCOPE,
      P.DEVELOPMENT_PLAN_READ_SCOPE,
      P.DEVELOPMENT_PLAN_APPROVE,
      P.APPRAISAL_READ_SCOPE,
      P.CAREER_PROGRESSION_READ_SCOPE,
      P.KPI_ASSIGN,
      P.CPD_RECORD_SUBMIT,
      P.SQAAF_READ,
      P.SQAAF_MANAGE,
      P.CPD_APPROVE,
      P.SERVICE_RECORD_READ_SCOPE,
    ],
    notes:
      'Usually scoped to a stage (Foundational, Preparatory, Middle, Secondary). ' +
      'Observes and reviews evidence but does not own the appraisal outcome.',
  },

  [ROLE_KEYS.VICE_PRINCIPAL]: {
    key: ROLE_KEYS.VICE_PRINCIPAL,
    displayName: 'Vice Principal',
    typicalScopes: ['school', 'school_stage'],
    permissions: [
      P.STAFF_DIRECTORY_READ,
      P.COMPETENCY_READ,
      P.REGULATORY_READ,
      P.TEACHER_RECORD_READ_SCOPE,
      P.ASSESSMENT_READ_SCOPE,
      P.ASSESSMENT_CONDUCT,
      P.ASSESSMENT_MODERATE,
      P.OBSERVATION_CONDUCT,
      P.EVIDENCE_REVIEW,
      P.CPD_READ_SCOPE,
      P.CPD_APPROVE,
      P.DEVELOPMENT_PLAN_READ_SCOPE,
      P.DEVELOPMENT_PLAN_APPROVE,
      P.APPRAISAL_READ_SCOPE,
      P.APPRAISAL_CONDUCT,
      P.CAREER_PROGRESSION_READ_SCOPE,
      P.COMPLIANCE_READ,
      P.KPI_ASSIGN,
      P.CPD_RECORD_SUBMIT,
      P.SQAAF_READ,
      P.SQAAF_MANAGE,
      P.SERVICE_RECORD_READ_SCOPE,
      P.REPRESENTATION_REVIEW,
    ],
    notes: 'Moderates assessment across departments. No compensation permission.',
  },

  [ROLE_KEYS.PRINCIPAL]: {
    key: ROLE_KEYS.PRINCIPAL,
    displayName: 'Principal',
    typicalScopes: ['school'],
    permissions: [
      P.SCHOOL_MANAGE,
      P.STAFF_DIRECTORY_READ,
      P.COMPETENCY_READ,
      P.COMPETENCY_MANAGE,
      P.REGULATORY_READ,
      P.TEACHER_RECORD_READ_SCOPE,
      P.ASSESSMENT_READ_SCOPE,
      P.ASSESSMENT_CONDUCT,
      P.ASSESSMENT_MODERATE,
      P.OBSERVATION_CONDUCT,
      P.EVIDENCE_REVIEW,
      P.CPD_READ_SCOPE,
      P.CPD_APPROVE,
      P.DEVELOPMENT_PLAN_READ_SCOPE,
      P.DEVELOPMENT_PLAN_APPROVE,
      P.APPRAISAL_READ_SCOPE,
      P.APPRAISAL_CONDUCT,
      P.APPRAISAL_FINALISE,
      P.INCREMENT_READ,
      P.INCREMENT_RECOMMEND,
      P.CAREER_PROGRESSION_READ_SCOPE,
      P.CAREER_PROGRESSION_RECOMMEND,
      P.COMPLIANCE_READ,
      P.RBAC_READ,
      P.KPI_MANAGE,
      P.KPI_ASSIGN,
      P.CPD_RECORD_SUBMIT,
      P.SQAAF_READ,
      P.SQAAF_MANAGE,
      P.SERVICE_RECORD_READ_SCOPE,
      P.SERVICE_RECORD_MANAGE,
      P.REPRESENTATION_REVIEW,
    ],
    notes:
      'Recommends increments; does not approve them. Recommendation and approval ' +
      'are held by different people so that no single role can move a teacher’s pay.',
  },

  [ROLE_KEYS.HR_PD_ADMIN]: {
    key: ROLE_KEYS.HR_PD_ADMIN,
    displayName: 'HR / Professional Development Administrator',
    typicalScopes: ['school'],
    permissions: [
      P.STAFF_DIRECTORY_READ,
      P.COMPETENCY_READ,
      P.REGULATORY_READ,
      P.TEACHER_RECORD_READ_SCOPE,
      P.TEACHER_RECORD_MANAGE,
      P.CPD_READ_SCOPE,
      P.CPD_MANAGE,
      P.CPD_APPROVE,
      P.DEVELOPMENT_PLAN_READ_SCOPE,
      P.APPRAISAL_READ_SCOPE,
      P.CAREER_PROGRESSION_READ_SCOPE,
      P.COMPLIANCE_READ,
      P.RBAC_READ,
      P.INCREMENT_READ,
      P.KPI_MANAGE,
      P.KPI_ASSIGN,
      P.CPD_RECORD_SUBMIT,
      P.SQAAF_READ,
      P.SQAAF_MANAGE,
      P.SERVICE_RECORD_READ_SCOPE,
      P.SERVICE_RECORD_MANAGE,
      P.REPRESENTATION_REVIEW,
      P.PAY_FRAMEWORK_MANAGE,
    ],
    notes:
      'Administers records and CPD. Can read increment outcomes to process them, ' +
      'but can neither recommend nor approve.',
  },

  [ROLE_KEYS.MANAGEMENT_APPROVER]: {
    key: ROLE_KEYS.MANAGEMENT_APPROVER,
    displayName: 'School Management / Authorised Approver',
    typicalScopes: ['school'],
    permissions: [
      P.STAFF_DIRECTORY_READ,
      P.REGULATORY_READ,
      P.COMPLIANCE_READ,
      P.APPRAISAL_READ_SCOPE,
      P.INCREMENT_READ,
      P.INCREMENT_APPROVE,
      P.CAREER_PROGRESSION_READ_SCOPE,
      P.CAREER_PROGRESSION_APPROVE,
      P.SQAAF_READ,
      P.REPRESENTATION_REVIEW,
    ],
    notes:
      'The only role that approves compensation outcomes. Deliberately holds no ' +
      'assessment or observation permission, so approval stays an independent check.',
  },

  [ROLE_KEYS.COMPLIANCE_ADMIN]: {
    key: ROLE_KEYS.COMPLIANCE_ADMIN,
    displayName: 'Compliance Administrator',
    typicalScopes: ['school'],
    permissions: [
      P.STAFF_DIRECTORY_READ,
      P.REGULATORY_READ,
      P.REGULATORY_MANAGE,
      P.REGULATORY_AUTHORISE_RECALCULATION,
      P.COMPLIANCE_READ,
      P.COMPLIANCE_MANAGE,
      P.AUDIT_READ,
      P.RBAC_READ,
      P.SQAAF_READ,
      P.SQAAF_MANAGE,
    ],
    notes:
      'Owns the regulatory register: verifies sources, records applicability and ' +
      'decides what may be enforced. Holds no permission over any individual’s ' +
      'assessment or pay.',
  },

  [ROLE_KEYS.SYSTEM_ADMIN]: {
    key: ROLE_KEYS.SYSTEM_ADMIN,
    displayName: 'System Administrator',
    typicalScopes: ['school'],
    permissions: [P.SYSTEM_ADMIN, P.SCHOOL_MANAGE, P.RBAC_READ, P.RBAC_MANAGE, P.AUDIT_READ],
    notes:
      'A technical role. Holds no professional, appraisal or compensation ' +
      'permission: platform administration must not become a back door into staff ' +
      'records. Actions are audited like everyone else’s.',
  },
};

export function permissionsForRole(role: RoleKey): readonly Permission[] {
  return ROLE_DEFINITIONS[role].permissions;
}
