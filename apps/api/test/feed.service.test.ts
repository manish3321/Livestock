import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { RequestUser } from '../src/common/types';
import { FeedService } from '../src/feed/feed.service';
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

function makeDb() {
  const items = new Map<string, any>();
  const lots: any[] = [];
  const movements: any[] = [];
  const feeds: any[] = [];
  const logs: any[] = [];
  const tasks: any[] = [];
  const db: any = {
    items,
    lots,
    movements,
    feeds,
    logs,
    tasks,
    $transaction: async (fn: any) => fn(db),
    inventoryItem: {
      findFirst: async ({ where }: any) => items.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = items.get(where.id);
        if (data.currentStock != null) row.currentStock = data.currentStock;
        return row;
      },
    },
    stockLot: {
      findMany: async ({ where }: any) => lots.filter((l) => l.itemId === where.itemId),
      update: async ({ where, data }: any) => {
        const row = lots.find((l) => l.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    stockMovement: {
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), ...data };
        movements.push(row);
        return row;
      },
      findMany: async ({ where }: any) => movements.filter((m) => m.lotId === where.lotId),
    },
    feedRecord: {
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), ...data };
        feeds.push(row);
        return row;
      },
    },
    feedLog: {
      create: async ({ data }: any) => {
        const row = {
          id: randomUUID(),
          createdAt: new Date(),
          animal: null,
          herdBatch: null,
          ...data,
        };
        logs.push(row);
        return row;
      },
    },
    task: {
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), status: 'PENDING', ...data };
        tasks.push(row);
        return row;
      },
    },
  };
  return db;
}

describe('FeedService Phase 6', () => {
  let db: any;
  let svc: FeedService;

  beforeEach(() => {
    db = makeDb();
    svc = new FeedService(db, fakeAudit);
  });

  it('issues from the lot closest to expiry first', async () => {
    const itemId = randomUUID();
    const soon = randomUUID();
    const later = randomUUID();
    db.items.set(itemId, {
      id: itemId,
      farmId: FARM,
      name: 'Dana',
      currentStock: 50,
      deletedAt: null,
    });
    db.lots.push(
      {
        id: later,
        itemId,
        farmId: FARM,
        lotNumber: 'L2',
        qtyReceived: 30,
        qtyRemaining: 30,
        expiryDate: new Date('2026-12-01'),
        receivedOn: new Date('2026-01-01'),
      },
      {
        id: soon,
        itemId,
        farmId: FARM,
        lotNumber: 'L1',
        qtyReceived: 20,
        qtyRemaining: 20,
        expiryDate: new Date('2026-10-01'),
        receivedOn: new Date('2026-02-01'),
      },
    );
    await svc.create(user(), {
      feedType: 'concentrate',
      quantityKg: 5,
      costPerKg: 40,
      inventoryItemId: itemId,
      occurredAt: new Date(),
    });
    expect(db.movements[0].lotId).toBe(soon);
    expect(Number(db.lots.find((l: any) => l.id === soon).qtyRemaining)).toBe(15);
  });

  it('allows feeding past remaining stock and raises STOCK_RECONCILE', async () => {
    const itemId = randomUUID();
    const lotId = randomUUID();
    db.items.set(itemId, {
      id: itemId,
      farmId: FARM,
      name: 'Dana',
      currentStock: 2,
      deletedAt: null,
    });
    db.lots.push({
      id: lotId,
      itemId,
      farmId: FARM,
      lotNumber: 'L1',
      qtyReceived: 2,
      qtyRemaining: 2,
      expiryDate: new Date('2026-10-01'),
      receivedOn: new Date('2026-02-01'),
    });
    await svc.create(user(), {
      feedType: 'concentrate',
      quantityKg: 5,
      costPerKg: 40,
      inventoryItemId: itemId,
      occurredAt: new Date(),
    });
    expect(Number(db.lots[0].qtyRemaining)).toBe(-3);
    expect(db.tasks.some((t: any) => t.type === 'STOCK_RECONCILE')).toBe(true);
    expect(db.feeds).toHaveLength(1);
  });
});
