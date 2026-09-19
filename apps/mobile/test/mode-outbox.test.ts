import { describe, expect, it } from 'vitest';
import { createStore } from '../src/core/store';
import {
  enqueueExpense,
  enqueueTaskComplete,
  saveHealthLocal,
  saveWeightLocal,
  startLocalRound,
} from '../src/core/scan-round';

describe('mode outbox', () => {
  it('queues weight and health writes', () => {
    const store = createStore();
    startLocalRound(store, {
      id: '44444444-4444-4444-8444-444444444444',
      mode: 'WEIGHING',
      offlineOnly: false,
    });
    expect(saveWeightLocal(store, { animalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', weightKg: 420 }).ok).toBe(
      true,
    );
    expect(store.outbox.some((o) => o.rest?.kind === 'weight')).toBe(true);

    startLocalRound(store, {
      id: '55555555-5555-4555-8555-555555555555',
      mode: 'VACCINATION',
      offlineOnly: false,
    });
    expect(
      saveHealthLocal(store, {
        animalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        type: 'VACCINATION',
        title: 'FMD',
        medicine: 'FMD-vax',
      }).ok,
    ).toBe(true);
    expect(store.outbox.some((o) => o.rest?.kind === 'health')).toBe(true);
  });

  it('queues expense and task complete', () => {
    const store = createStore();
    enqueueExpense(store, { category: 'FEED', amount: 100, description: 'bran' });
    enqueueTaskComplete(store, '66666666-6666-4666-8666-666666666666', { byScan: false });
    expect(store.outbox.some((o) => o.rest?.kind === 'expense')).toBe(true);
    expect(store.outbox.some((o) => o.rest?.kind === 'task-complete')).toBe(true);
  });
});
