import { describe, expect, it } from 'vitest';
import { createStore } from '../src/core/store';
import { applyPersistedState, serializeStore } from '../src/persistence/serialize';
import { finishLocalRound, saveMilkLocal, startLocalRound } from '../src/core/scan-round';

describe('persistence serialize', () => {
  it('round-trips animals outbox and offline round', () => {
    const store = createStore('android-test');
    store.animals.set('a1', {
      id: 'a1',
      tag: 'B1',
      shortNo: '1',
      name: 'Maya',
      species: 'BUFFALO',
      status: 'ACTIVE',
      gender: 'FEMALE',
      isPregnant: false,
      penName: null,
      photoUrl: null,
      photoLocalPath: null,
      rolling7Mean: 4,
      version: 1,
      lactationStartDate: null,
      expectedCalvingDate: null,
      deletedAt: null,
    });
    startLocalRound(store, {
      id: '11111111-1111-4111-8111-111111111111',
      mode: 'MILKING',
      session: 'MORNING',
      offlineOnly: true,
    });
    saveMilkLocal(store, { animalId: 'a1', litres: 3.5, disposal: 'SOLD' });
    const snap = serializeStore(store);
    const next = createStore('other');
    applyPersistedState(next, snap);
    expect(next.animals.get('a1')?.tag).toBe('B1');
    expect(next.round?.offlineOnly).toBe(true);
    expect(next.milk).toHaveLength(1);
    expect(next.outbox.some((o) => o.rest?.kind === 'round-start')).toBe(true);
    expect(next.outbox.some((o) => o.rest?.kind === 'milk')).toBe(true);
  });
});

describe('finishLocalRound', () => {
  it('enqueues finish only for online rounds', () => {
    const online = createStore();
    startLocalRound(online, {
      id: '22222222-2222-4222-8222-222222222222',
      mode: 'MILKING',
      session: 'MORNING',
      offlineOnly: false,
    });
    finishLocalRound(online);
    expect(online.round?.status).toBe('FINISHED');
    expect(online.outbox.some((o) => o.rest?.kind === 'round-finish')).toBe(true);

    const offline = createStore();
    startLocalRound(offline, {
      id: '33333333-3333-4333-8333-333333333333',
      mode: 'MILKING',
      session: 'MORNING',
      offlineOnly: true,
    });
    finishLocalRound(offline);
    expect(offline.round?.status).toBe('FINISHED');
    expect(offline.outbox.some((o) => o.rest?.kind === 'round-finish')).toBe(false);
  });
});
