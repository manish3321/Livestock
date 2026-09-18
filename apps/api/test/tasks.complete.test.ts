import './setup-env';
import { randomUUID } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { RequestUser } from '../src/common/types';
import { TasksService } from '../src/tasks/tasks.service';
import { fakeAudit } from './fakes';

const FARM = randomUUID();

function user(): RequestUser {
  return {
    id: randomUUID(),
    email: 'worker@farm.local',
    farmId: FARM,
    role: 'WORKER',
    sessionId: randomUUID(),
    permissions: ROLE_PERMISSIONS.WORKER,
  };
}

describe('tasks.complete', () => {
  const tasks: any[] = [];
  let service: TasksService;

  beforeEach(() => {
    tasks.length = 0;
    const prisma: any = {
      task: {
        findFirst: async ({ where }: any) =>
          tasks.find((t) => t.id === where.id && t.farmId === where.farmId) ?? null,
        update: async ({ where, data }: any) => {
          const row = tasks.find((t) => t.id === where.id);
          Object.assign(row, data);
          return { ...row, animal: { herdNumber: 'B12', name: 'Kali' } };
        },
        count: async ({ where }: any) =>
          tasks.filter((t) => {
            if (where.farmId && t.farmId !== where.farmId) return false;
            if (where.type && t.type !== where.type) return false;
            if (where.status && t.status !== where.status) return false;
            if (where.completedById && t.completedById !== where.completedById) return false;
            if (where.completedAt?.gte && t.completedAt && t.completedAt < where.completedAt.gte) return false;
            return true;
          }).length,
      },
    };
    service = new TasksService(prisma, fakeAudit);
  });

  it('rejects APPLY_MARKER without a scan', async () => {
    const id = randomUUID();
    tasks.push({
      id,
      farmId: FARM,
      animalId: randomUUID(),
      type: 'APPLY_MARKER',
      status: 'PENDING',
      titleEn: 'Band',
      titleNp: 'ब्यान्ड',
      dueAt: new Date(),
      priority: 'HIGH',
      assignedToId: null,
      source: 'AUTO',
      sourceRefType: 'animalMarker',
      sourceRefId: randomUUID(),
      snoozeCount: 0,
      snoozedUntil: null,
      completedAt: null,
      dismissReason: null,
      batchId: null,
      deletedAt: null,
    });
    await expect(service.complete(user(), id, {})).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('completes APPLY_MARKER when byScan is true', async () => {
    const id = randomUUID();
    tasks.push({
      id,
      farmId: FARM,
      animalId: randomUUID(),
      type: 'APPLY_MARKER',
      status: 'PENDING',
      titleEn: 'Band',
      titleNp: 'ब्यान्ड',
      dueAt: new Date(),
      priority: 'HIGH',
      assignedToId: null,
      source: 'AUTO',
      sourceRefType: 'animalMarker',
      sourceRefId: randomUUID(),
      snoozeCount: 0,
      snoozedUntil: null,
      completedAt: null,
      dismissReason: null,
      batchId: null,
      deletedAt: null,
    });
    const done = await service.complete(user(), id, { byScan: true });
    expect(done.status).toBe('DONE');
  });

  it('offers to mute a type after three dismissals', async () => {
    const actor = user();
    for (let i = 0; i < 3; i++) {
      const id = randomUUID();
      tasks.push({
        id,
        farmId: FARM,
        animalId: randomUUID(),
        type: 'STOCK_REORDER',
        status: 'PENDING',
        titleEn: 'Low stock',
        titleNp: 'स्टक',
        dueAt: new Date(),
        priority: 'NORMAL',
        assignedToId: null,
        source: 'AUTO',
        sourceRefType: 'inventoryItem',
        sourceRefId: randomUUID(),
        snoozeCount: 0,
        snoozedUntil: null,
        completedAt: null,
        dismissReason: null,
        batchId: null,
        deletedAt: null,
      });
      const result = await service.dismiss(actor, id, { reason: 'NOT_NEEDED' });
      if (i < 2) expect(result.offerMute).toBeUndefined();
      else expect(result.offerMute).toBe(true);
    }
  });

  it('does not offer to mute a CRITICAL type', async () => {
    const actor = user();
    for (let i = 0; i < 3; i++) {
      const id = randomUUID();
      tasks.push({
        id,
        farmId: FARM,
        animalId: randomUUID(),
        type: 'COLOSTRUM_FEED',
        status: 'PENDING',
        titleEn: 'Colostrum',
        titleNp: 'बिगौती',
        dueAt: new Date(),
        priority: 'CRITICAL',
        assignedToId: null,
        source: 'AUTO',
        sourceRefType: 'calvingEvent',
        sourceRefId: randomUUID(),
        snoozeCount: 0,
        snoozedUntil: null,
        completedAt: null,
        dismissReason: null,
        batchId: null,
        deletedAt: null,
      });
      const result = await service.dismiss(actor, id, { reason: 'NOT_NEEDED' });
      expect(result.offerMute).toBeUndefined();
    }
  });
});
