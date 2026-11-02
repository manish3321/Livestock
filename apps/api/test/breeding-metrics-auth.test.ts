import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { RequestUser } from '../src/common/types';
import { BreedingController } from '../src/breeding/breeding.controller';

function user(role: RequestUser['role']): RequestUser {
  return {
    id: 'u1',
    email: `${role.toLowerCase()}@farm.local`,
    farmId: 'f1',
    role,
    sessionId: 's1',
    permissions: [...ROLE_PERMISSIONS[role]],
  };
}

describe('GET /v1/breeding/metrics role gate', () => {
  const breeding = {
    herdMetrics: vi.fn(async () => ({ conceptionRatePct: 50 })),
  };
  const controller = new BreedingController(
    breeding as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('returns 403 for WORKER', () => {
    breeding.herdMetrics.mockClear();
    expect(() => controller.metrics(user('WORKER'))).toThrow(ForbiddenException);
    expect(breeding.herdMetrics).not.toHaveBeenCalled();
  });

  it('allows MANAGER', async () => {
    breeding.herdMetrics.mockClear();
    const out = await controller.metrics(user('MANAGER'));
    expect(out).toEqual({ conceptionRatePct: 50 });
    expect(breeding.herdMetrics).toHaveBeenCalledOnce();
  });

  it('allows VET', async () => {
    breeding.herdMetrics.mockClear();
    await expect(controller.metrics(user('VET'))).resolves.toBeTruthy();
  });
});
