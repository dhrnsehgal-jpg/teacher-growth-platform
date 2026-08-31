/**
 * RBAC invariants.
 *
 * These tests exist because the same access rules are expressed twice — in SQL
 * (which enforces them) and in TypeScript (which reasons about them). Drift
 * between the two is the failure mode that would matter most, so it is checked
 * mechanically rather than by review.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ALL_PERMISSIONS,
  COMPENSATION_SENSITIVE_PERMISSIONS,
  PERMISSIONS,
  SEPARATION_OF_DUTIES,
  type Permission,
} from '@/lib/rbac/permissions';
import { ROLE_DEFINITIONS, ROLE_KEYS, type RoleKey } from '@/lib/rbac/roles';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/** All migrations, in application order. */
function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith('.sql'))
    .sort();
}

/**
 * Permission keys, gathered across every migration that inserts into
 * core.permission. Stage 2 adds keys in a later migration, so reading only the
 * original seed would silently miss them.
 */
function permissionBlocks(): string[] {
  const blocks: string[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    let from = 0;
    for (;;) {
      const start = sql.indexOf('insert into core.permission', from);
      if (start === -1) break;
      blocks.push(sql.slice(start, sql.indexOf(';', start)));
      from = start + 1;
    }
  }
  expect(blocks.length, 'permission seed blocks').toBeGreaterThan(0);
  return blocks;
}

function permissionKeysFromSql(): string[] {
  return permissionBlocks().flatMap((block) =>
    [...block.matchAll(/^\s*\('([a-z][a-z0-9_.]*)',/gm)].map((m) => m[1] as string),
  );
}

/**
 * Role → permission grants from the LAST migration that defines
 * core.provision_school_roles(). Later stages redefine the function; the final
 * definition is the one the database ends up with.
 */
function roleGrantsFromSql(): Record<string, string[]> {
  let block: string | null = null;
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const start = sql.indexOf('v_grants jsonb := jsonb_build_object');
    if (start === -1) continue;
    block = sql.slice(start, sql.indexOf('v_display jsonb', start));
  }
  expect(block, 'role grant block').not.toBeNull();

  const grants: Record<string, string[]> = {};
  for (const match of (block as string).matchAll(/'(\w+)',\s*jsonb_build_array\(([^)]*)\)/g)) {
    const role = match[1] as string;
    const body = match[2] as string;
    grants[role] = [...body.matchAll(/'([a-z][a-z0-9_.]*)'/g)].map((m) => m[1] as string);
  }
  return grants;
}

describe('permission catalogue', () => {
  it('matches the SQL seed exactly', () => {
    const fromSql = [...permissionKeysFromSql()].sort();
    const fromTs = [...ALL_PERMISSIONS].sort();
    expect(fromTs).toEqual(fromSql);
  });

  it('has no duplicate keys', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('marks the same permissions compensation-sensitive as the SQL seed', () => {
    const sensitiveInSql = permissionBlocks()
      .flatMap((block) =>
        [...block.matchAll(/^\s*\('([a-z][a-z0-9_.]*)',[^\n]*?,\s*true\),?$/gm)].map(
          (m) => m[1] as string,
        ),
      )
      .sort();

    expect([...COMPENSATION_SENSITIVE_PERMISSIONS].sort()).toEqual(sensitiveInSql);
  });
});

describe('role definitions', () => {
  const sqlGrants = roleGrantsFromSql();

  it('defines all nine roles', () => {
    expect(Object.keys(ROLE_DEFINITIONS).sort()).toEqual(Object.values(ROLE_KEYS).sort());
  });

  it.each(Object.values(ROLE_KEYS))('grants for %s match the SQL seed', (role) => {
    const fromSql = [...(sqlGrants[role] ?? [])].sort();
    const fromTs = [...ROLE_DEFINITIONS[role as RoleKey].permissions].sort();
    expect(fromTs).toEqual(fromSql);
  });

  it('grants only permissions that exist in the catalogue', () => {
    for (const definition of Object.values(ROLE_DEFINITIONS)) {
      for (const permission of definition.permissions) {
        expect(ALL_PERMISSIONS).toContain(permission);
      }
    }
  });
});

describe('separation of duties', () => {
  it.each(SEPARATION_OF_DUTIES)(
    'no single role holds both %s and %s',
    (recommend: Permission, approve: Permission) => {
      const offenders = Object.values(ROLE_DEFINITIONS)
        .filter((r) => r.permissions.includes(recommend) && r.permissions.includes(approve))
        .map((r) => r.key);

      expect(offenders).toEqual([]);
    },
  );

  it('the Principal recommends increments but cannot approve them', () => {
    const principal = ROLE_DEFINITIONS[ROLE_KEYS.PRINCIPAL];
    expect(principal.permissions).toContain(PERMISSIONS.INCREMENT_RECOMMEND);
    expect(principal.permissions).not.toContain(PERMISSIONS.INCREMENT_APPROVE);
  });

  it('only the authorised approver can approve increments', () => {
    const approvers = Object.values(ROLE_DEFINITIONS)
      .filter((r) => r.permissions.includes(PERMISSIONS.INCREMENT_APPROVE))
      .map((r) => r.key);

    expect(approvers).toEqual([ROLE_KEYS.MANAGEMENT_APPROVER]);
  });
});

describe('compensation visibility is a separate grant', () => {
  it.each([
    ROLE_KEYS.TEACHER,
    ROLE_KEYS.HEAD_OF_DEPARTMENT,
    ROLE_KEYS.ACADEMIC_COORDINATOR,
    ROLE_KEYS.VICE_PRINCIPAL,
    ROLE_KEYS.COMPLIANCE_ADMIN,
    ROLE_KEYS.SYSTEM_ADMIN,
  ])('%s holds no compensation-sensitive permission', (role) => {
    const held = ROLE_DEFINITIONS[role as RoleKey].permissions.filter((p) =>
      COMPENSATION_SENSITIVE_PERMISSIONS.includes(p),
    );
    expect(held).toEqual([]);
  });

  it('appraising a teacher does not confer sight of their pay', () => {
    for (const definition of Object.values(ROLE_DEFINITIONS)) {
      if (definition.permissions.includes(PERMISSIONS.APPRAISAL_CONDUCT)) {
        expect(definition.permissions).not.toContain(PERMISSIONS.INCREMENT_APPROVE);
      }
    }
  });
});

describe('system administrator is a technical role', () => {
  const admin = ROLE_DEFINITIONS[ROLE_KEYS.SYSTEM_ADMIN];

  it.each([
    PERMISSIONS.ASSESSMENT_CONDUCT,
    PERMISSIONS.ASSESSMENT_READ_SCOPE,
    PERMISSIONS.APPRAISAL_CONDUCT,
    PERMISSIONS.TEACHER_RECORD_READ_SCOPE,
    PERMISSIONS.INCREMENT_READ,
  ])('does not hold %s', (permission) => {
    expect(admin.permissions).not.toContain(permission);
  });
});

describe('teacher role', () => {
  it('can read the regulatory register', () => {
    // "What is expected of me, and who says so?" must be answerable by the
    // person being measured.
    expect(ROLE_DEFINITIONS[ROLE_KEYS.TEACHER].permissions).toContain(PERMISSIONS.REGULATORY_READ);
  });

  it('cannot read other staff records', () => {
    expect(ROLE_DEFINITIONS[ROLE_KEYS.TEACHER].permissions).not.toContain(
      PERMISSIONS.TEACHER_RECORD_READ_SCOPE,
    );
  });
});
