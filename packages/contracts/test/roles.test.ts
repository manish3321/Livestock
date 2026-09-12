import { describe, expect, it } from 'vitest';
import {
  MODULES,
  MODULE_ACCESS,
  ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  modulesForRole,
} from '../src/roles';

describe('RBAC permission map', () => {
  it('covers all modules', () => {
    expect(MODULES).toHaveLength(18);
    for (const m of MODULES) {
      expect(MODULE_ACCESS[m].length).toBeGreaterThan(0);
    }
  });

  it('exposes individual animals and counted batches as separate modules', () => {
    expect(MODULES).toContain('animals');
    expect(MODULES).toContain('batches');
    for (const role of ROLES) {
      expect(modulesForRole(role)).toContain('animals');
      expect(modulesForRole(role)).toContain('batches');
    }
  });

  it('restricts the admin module to admins', () => {
    expect(MODULE_ACCESS.admin).toEqual(['ADMIN']);
    expect(modulesForRole('ADMIN')).toContain('admin');
    expect(modulesForRole('MANAGER')).not.toContain('admin');
    expect(modulesForRole('WORKER')).not.toContain('admin');
  });

  it('denies workers all financial access', () => {
    expect(hasPermission('WORKER', 'finance:read')).toBe(false);
    expect(hasPermission('WORKER', 'revenue:read')).toBe(false);
    expect(hasPermission('WORKER', 'expenses:approve')).toBe(false);
    expect(modulesForRole('WORKER')).not.toContain('revenue');
    expect(modulesForRole('WORKER')).not.toContain('pnl');
    expect(modulesForRole('WORKER')).not.toContain('reports');
  });

  it('limits the vet to health work and the cooperative to viewing', () => {
    expect(hasPermission('VET', 'health:write')).toBe(true);
    expect(hasPermission('VET', 'finance:read')).toBe(false);
    expect(hasPermission('COOP', 'production:read')).toBe(true);
    expect(hasPermission('COOP', 'animals:write')).toBe(false);
    expect(modulesForRole('VET')).toContain('health');
    expect(modulesForRole('COOP')).toContain('reports');
    expect(modulesForRole('COOP')).not.toContain('shed');
  });

  it('lets workers record in the shed and read the inbox', () => {
    expect(hasPermission('WORKER', 'tasks:read')).toBe(true);
    expect(hasPermission('WORKER', 'tasks:manage')).toBe(false);
    expect(hasPermission('MANAGER', 'tasks:manage')).toBe(true);
    expect(modulesForRole('WORKER')).toContain('shed');
    expect(modulesForRole('WORKER')).toContain('inbox');
  });

  it('lets workers submit expenses and enter data', () => {
    expect(hasPermission('WORKER', 'expenses:submit')).toBe(true);
    expect(hasPermission('WORKER', 'animals:write')).toBe(true);
    expect(hasPermission('WORKER', 'production:write')).toBe(true);
  });

  it('reserves escalated approval and administration for admins', () => {
    expect(hasPermission('MANAGER', 'expenses:approve')).toBe(true);
    expect(hasPermission('MANAGER', 'expenses:approve-escalated')).toBe(false);
    expect(hasPermission('MANAGER', 'users:manage')).toBe(false);
    expect(hasPermission('ADMIN', 'expenses:approve-escalated')).toBe(true);
    expect(hasPermission('ADMIN', 'users:manage')).toBe(true);
  });

  it('admin permissions are a superset of manager, manager of worker', () => {
    const worker = new Set(ROLE_PERMISSIONS.WORKER);
    const manager = new Set(ROLE_PERMISSIONS.MANAGER);
    const admin = new Set(ROLE_PERMISSIONS.ADMIN);
    for (const p of worker) expect(manager.has(p)).toBe(true);
    for (const p of manager) expect(admin.has(p)).toBe(true);
  });
});
