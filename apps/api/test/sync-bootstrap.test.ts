import './setup-env';
import { describe, expect, it, vi } from 'vitest';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import { SyncBootstrapService } from '../src/sync/sync-bootstrap.service';
import type { RequestUser } from '../src/common/types';

function worker(): RequestUser {
  return {
    id: 'u1',
    email: 'worker@farm.local',
    farmId: 'f1',
    role: 'WORKER',
    sessionId: 's1',
    permissions: [...ROLE_PERMISSIONS.WORKER],
  };
}

describe('SyncBootstrapService', () => {
  it('returns one modules map and skips keys the role cannot read', async () => {
    const summary = vi.fn().mockResolvedValue({ animals: 1 });
    const listAnimals = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const listBatches = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const listExpenses = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const listRevenue = vi.fn();
    const listInventory = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const listHealth = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const listBreeding = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const listProduction = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const listFeed = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const pnlGet = vi.fn();
    const farmOverview = vi.fn();
    const membersList = vi.fn();
    const cohort = vi.fn().mockResolvedValue({ groups: [] });
    const listTasks = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const prisma = {
      auditEvent: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    const service = new SyncBootstrapService(
      prisma as never,
      { summary } as never,
      { list: listAnimals, cohort } as never,
      { list: listBatches } as never,
      { list: listExpenses } as never,
      { list: listRevenue } as never,
      { list: listInventory } as never,
      { list: listHealth } as never,
      { list: listBreeding } as never,
      { list: listProduction } as never,
      { list: listFeed } as never,
      { get: pnlGet } as never,
      { farmOverview } as never,
      { list: membersList } as never,
      { list: listTasks } as never,
    );

    const snap = await service.snapshot(worker());
    expect(snap.fetchedAt).toBeTruthy();
    expect(snap.modules.dashboard).toEqual({ animals: 1 });
    expect(snap.modules.animals).toEqual({ items: [], total: 0 });
    expect(snap.modules.tasks).toEqual({ items: [], total: 0 });
    // Worker has no revenue / finance / reports / audit / users:manage
    expect(snap.modules.revenue).toBeNull();
    expect(snap.modules.pnl).toBeNull();
    expect(snap.modules.reports).toBeNull();
    expect(snap.modules.audit).toBeNull();
    expect(snap.modules.members).toBeNull();
    expect(listRevenue).not.toHaveBeenCalled();
    expect(pnlGet).not.toHaveBeenCalled();
    expect(listAnimals).toHaveBeenCalledOnce();
    expect(listBatches).toHaveBeenCalledTimes(3);
  });
});
