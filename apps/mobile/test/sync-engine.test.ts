import { describe, expect, it } from 'vitest';
import type { SyncMutation } from '@farm/contracts';
import { createStore } from '../src/core/store';
import { applyPushResults, enqueueAnimalMutation } from '../src/core/scan-round';
import { runSync, type FarmApi } from '../src/core/sync-engine';

function mutation(): SyncMutation {
  return {
    clientMutationId: '55555555-5555-4555-8555-555555555555',
    entityType: 'animal',
    entityId: '66666666-6666-4666-8666-666666666666',
    op: 'update',
    payload: { color: 'Brown' },
    baseVersion: 1,
    occurredAt: new Date(),
  };
}

describe('client sync', () => {
  it('surfaces a version conflict instead of overwriting the farm copy', async () => {
    const store = createStore('android-device-1');
    store.accessToken = 'token';
    enqueueAnimalMutation(store, mutation());

    const api: FarmApi = {
      login: async () => ({ accessToken: 'x', refreshToken: 'y', expiresIn: 1, user: {} as never }),
      pull: async () => ({ changes: [], nextCursor: 4, hasMore: false }),
      push: async () => ({
        results: [
          {
            clientMutationId: mutation().clientMutationId,
            status: 'conflict',
            current: { id: mutation().entityId, color: 'Grey', version: 2 },
          },
        ],
      }),
      listAnimals: async () => ({ items: [], page: 1, pageSize: 200, total: 0 }),
      activeWithholds: async () => [],
      markerCohort: async () => ({ groups: [] }),
      listTasks: async () => ({ items: [], page: 1, pageSize: 200, total: 0 }),
      claimBlock: async () => ({
        id: 'b',
        farmId: 'f',
        species: 'BUFFALO',
        deviceId: store.deviceId,
        rangeStart: 1,
        rangeEnd: 100,
        nextValue: 1,
        letter: 'B',
        issuedAt: new Date().toISOString(),
        exhaustedAt: null,
      }),
      remaining: async () => ({ round: {} as never, expected: 0, recorded: 0, remaining: [] }),
      postRest: async () => undefined,
      patchRest: async () => undefined,
    };

    const result = await runSync(store, api);
    expect(result.conflicts).toBe(1);
    expect(store.conflicts[0]?.current).toMatchObject({ color: 'Grey', version: 2 });
    expect(store.outbox.find((o) => o.mutation)?.state).toBe('conflict');
  });

  it('marks applied mutations synced after push', () => {
    const store = createStore();
    enqueueAnimalMutation(store, mutation());
    applyPushResults(store, {
      results: [{ clientMutationId: mutation().clientMutationId, status: 'applied', serverVersion: 2 }],
    });
    expect(store.outbox).toHaveLength(0);
    expect(store.conflicts).toHaveLength(0);
  });

  function restApi(postRest: FarmApi['postRest']): FarmApi {
    return {
      login: async () => ({ accessToken: 'x', refreshToken: 'y', expiresIn: 1, user: {} as never }),
      pull: async () => ({ changes: [], nextCursor: 1, hasMore: false }),
      push: async () => ({ results: [] }),
      listAnimals: async () => ({ items: [], page: 1, pageSize: 200, total: 0 }),
      activeWithholds: async () => [],
      markerCohort: async () => ({ groups: [] }),
      listTasks: async () => ({ items: [], page: 1, pageSize: 200, total: 0 }),
      claimBlock: async () => ({}) as never,
      remaining: async () => ({ round: {} as never, expected: 0, recorded: 0, remaining: [] }),
      postRest,
      patchRest: async () => undefined,
    };
  }

  it('keeps shed entries queued when the network drops mid-sync', async () => {
    const store = createStore();
    store.accessToken = 'token';
    store.outbox.push({ id: 'a', state: 'pending', rest: { kind: 'scan', body: {} } });
    store.outbox.push({ id: 'b', state: 'pending', rest: { kind: 'scan', body: {} } });
    const dropped = Object.assign(new Error('NETWORK'), { status: 0 });

    await expect(runSync(store, restApi(async () => Promise.reject(dropped)))).rejects.toBe(dropped);
    expect(store.outbox.map((o) => o.state)).toEqual(['pending', 'pending']);

    await runSync(store, restApi(async () => undefined));
    expect(store.outbox).toHaveLength(0);
  });

  it('marks an entry failed when the server rejects it', async () => {
    const store = createStore();
    store.accessToken = 'token';
    store.outbox.push({ id: 'a', state: 'pending', rest: { kind: 'scan', body: {} } });
    const rejected = Object.assign(new Error('HTTP_400'), { status: 400 });

    await runSync(store, restApi(async () => Promise.reject(rejected)));
    expect(store.outbox[0]).toMatchObject({ state: 'failed', error: 'HTTP_400' });
  });

  it('retries entries an older build marked failed after a network drop', async () => {
    const store = createStore();
    store.accessToken = 'token';
    store.outbox.push({ id: 'a', state: 'failed', error: 'NETWORK', rest: { kind: 'scan', body: {} } });

    await runSync(store, restApi(async () => undefined));
    expect(store.outbox).toHaveLength(0);
  });
});
