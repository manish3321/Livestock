import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, type SyncMutation } from '@farm/contracts';
import { AnimalApplier } from '../src/sync/animal.applier';
import { SyncService } from '../src/sync/sync.service';
import type { RequestUser } from '../src/common/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { FakePrisma, fakeAudit } from './fakes';

const FARM_ID = randomUUID();
const OTHER_FARM_ID = randomUUID();

function user(role: 'ADMIN' | 'MANAGER' | 'WORKER', farmId = FARM_ID): RequestUser {
  return {
    id: randomUUID(),
    email: `${role.toLowerCase()}@farm.local`,
    farmId,
    role,
    sessionId: randomUUID(),
    permissions: ROLE_PERMISSIONS[role],
  };
}

function createMutation(overrides: Partial<SyncMutation> = {}): SyncMutation {
  return {
    clientMutationId: randomUUID(),
    entityType: 'animal',
    entityId: randomUUID(),
    op: 'create',
    payload: {
      tag: 'BUF010',
      species: 'BUFFALO',
      breed: 'Murrah',
      gender: 'FEMALE',
      status: 'ACTIVE',
    },
    occurredAt: new Date(),
    ...overrides,
  };
}

describe('SyncService.push', () => {
  let prisma: FakePrisma;
  let service: SyncService;

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new SyncService(
      prisma as unknown as PrismaService,
      fakeAudit,
      new AnimalApplier(),
    );
  });

  it('applies a create and writes ledger + change log', async () => {
    const mutation = createMutation();
    const res = await service.push(user('WORKER'), {
      deviceId: 'device-0001',
      mutations: [mutation],
    });

    expect(res.results[0]).toMatchObject({ status: 'applied', serverVersion: 1 });
    expect(prisma.animals.get(mutation.entityId)?.tag).toBe('BUF010');
    expect(prisma.changeLog).toHaveLength(1);
    expect(prisma.mutationRecords.get(mutation.clientMutationId)).toMatchObject({
      status: 'APPLIED',
    });
  });

  it('is idempotent: replaying the same mutation returns duplicate, no double write', async () => {
    const mutation = createMutation();
    const worker = user('WORKER');
    await service.push(worker, { deviceId: 'd1', mutations: [mutation] });
    const replay = await service.push(worker, { deviceId: 'd1', mutations: [mutation] });

    expect(replay.results[0]?.status).toBe('duplicate');
    expect(prisma.animals.size).toBe(1);
    expect(prisma.changeLog).toHaveLength(1);
  });

  it('detects update conflicts via baseVersion and returns the current record', async () => {
    const create = createMutation();
    const worker = user('WORKER');
    await service.push(worker, { deviceId: 'd1', mutations: [create] });

    // Server-side change bumps version to 2.
    await service.push(worker, {
      deviceId: 'd2',
      mutations: [
        createMutation({
          op: 'update',
          entityId: create.entityId,
          payload: { color: 'Grey' },
          baseVersion: 1,
        }),
      ],
    });

    // Offline client still at version 1 pushes a stale update.
    const stale = await service.push(worker, {
      deviceId: 'd1',
      mutations: [
        createMutation({
          op: 'update',
          entityId: create.entityId,
          payload: { color: 'Brown' },
          baseVersion: 1,
        }),
      ],
    });

    expect(stale.results[0]?.status).toBe('conflict');
    expect((stale.results[0]?.current as { version: number }).version).toBe(2);
    expect(prisma.animals.get(create.entityId)?.color).toBe('Grey');
  });

  it('denies delete for workers but allows it for managers', async () => {
    const create = createMutation();
    const worker = user('WORKER');
    await service.push(worker, { deviceId: 'd1', mutations: [create] });

    const denied = await service.push(worker, {
      deviceId: 'd1',
      mutations: [createMutation({ op: 'delete', entityId: create.entityId, baseVersion: 1 })],
    });
    expect(denied.results[0]?.status).toBe('failed');
    expect(denied.results[0]?.error).toContain('PERMISSION_DENIED');

    const allowed = await service.push(user('MANAGER'), {
      deviceId: 'd2',
      mutations: [createMutation({ op: 'delete', entityId: create.entityId, baseVersion: 1 })],
    });
    expect(allowed.results[0]?.status).toBe('applied');
    expect(prisma.animals.get(create.entityId)?.deletedAt).not.toBeNull();
  });

  it('accepts a duplicate tag, renumbers the second animal, and raises a reprint task', async () => {
    const worker = user('WORKER');
    await service.push(worker, { deviceId: 'device-0001', mutations: [createMutation()] });
    const secondId = randomUUID();
    const dupTag = await service.push(worker, {
      deviceId: 'device-0001',
      mutations: [createMutation({ entityId: secondId })],
    });
    expect(dupTag.results[0]?.status).toBe('applied');
    expect(prisma.animals.get(secondId)?.tag).toBe('BUF011');
    expect(prisma.tasks.some((t) => t.type === 'RETAG_REQUIRED')).toBe(true);
  });

  it('rejects invalid payloads without blocking the rest of the batch', async () => {
    const bad = createMutation({ payload: { tag: 'oops' } });
    const good = createMutation({
      payload: { tag: 'COW010', species: 'COW', breed: 'Jersey', gender: 'FEMALE', status: 'ACTIVE' },
    });
    const res = await service.push(user('WORKER'), {
      deviceId: 'd1',
      mutations: [bad, good],
    });
    expect(res.results[0]?.status).toBe('failed');
    expect(res.results[0]?.error).toContain('VALIDATION_ERROR');
    expect(res.results[1]?.status).toBe('applied');
  });

  it('scopes updates to the caller farm', async () => {
    const create = createMutation();
    await service.push(user('WORKER'), { deviceId: 'd1', mutations: [create] });

    const foreign = await service.push(user('WORKER', OTHER_FARM_ID), {
      deviceId: 'd9',
      mutations: [
        createMutation({ op: 'update', entityId: create.entityId, payload: { color: 'X' } }),
      ],
    });
    expect(foreign.results[0]?.status).toBe('failed');
    expect(foreign.results[0]?.error).toContain('NOT_FOUND');
  });
});

describe('SyncService.pull', () => {
  it('returns farm-scoped changes after the cursor with pagination', async () => {
    const prisma = new FakePrisma();
    const service = new SyncService(
      prisma as unknown as PrismaService,
      fakeAudit,
      new AnimalApplier(),
    );
    const worker = user('WORKER');
    const tags = ['BUF011', 'BUF012', 'BUF013'];
    for (const tag of tags) {
      await service.push(worker, {
        deviceId: 'd1',
        mutations: [
          createMutation({ payload: { tag, species: 'BUFFALO', breed: 'Murrah', gender: 'FEMALE', status: 'ACTIVE' } }),
        ],
      });
    }

    const page1 = await service.pull(worker, 0, 2);
    expect(page1.changes).toHaveLength(2);
    expect(page1.hasMore).toBe(true);

    const page2 = await service.pull(worker, page1.nextCursor, 2);
    expect(page2.changes).toHaveLength(1);
    expect(page2.hasMore).toBe(false);

    const foreign = await service.pull(user('WORKER', OTHER_FARM_ID), 0, 10);
    expect(foreign.changes).toHaveLength(0);
  });
});
