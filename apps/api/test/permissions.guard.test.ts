import './setup-env';
import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ROLE_PERMISSIONS, type Permission, type Role } from '@farm/contracts';
import { PermissionsGuard } from '../src/auth/permissions.guard';
import { PERMISSIONS_KEY } from '../src/common/decorators';

function contextFor(role: Role | null, required?: Permission[]): ExecutionContext {
  const handler = () => undefined;
  if (required) Reflect.defineMetadata(PERMISSIONS_KEY, required, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: role
          ? { role, permissions: ROLE_PERMISSIONS[role] }
          : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('passes routes without permission metadata', () => {
    expect(guard.canActivate(contextFor('WORKER'))).toBe(true);
  });

  it('denies workers financial reads (deny, not hide)', () => {
    expect(() =>
      guard.canActivate(contextFor('WORKER', ['finance:read'])),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(contextFor('WORKER', ['revenue:read'])),
    ).toThrow(ForbiddenException);
  });

  it('denies managers admin-only permissions', () => {
    expect(() =>
      guard.canActivate(contextFor('MANAGER', ['users:manage'])),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(contextFor('MANAGER', ['expenses:approve-escalated'])),
    ).toThrow(ForbiddenException);
  });

  it('allows what the role grants', () => {
    expect(guard.canActivate(contextFor('WORKER', ['expenses:submit']))).toBe(true);
    expect(guard.canActivate(contextFor('MANAGER', ['expenses:approve']))).toBe(true);
    expect(guard.canActivate(contextFor('ADMIN', ['users:manage', 'audit:read']))).toBe(true);
  });

  it('rejects requests without an authenticated user', () => {
    expect(guard.canActivate(contextFor(null, ['animals:read']))).toBe(false);
  });
});
