import { describe, expect, it } from 'vitest';
import { applySnapshot, createStore, pruneTasks } from '../src/core/store';
import {
  remainingAnimals,
  resolveLocalScan,
  saveMilkLocal,
  startLocalRound,
  undoLastMilk,
} from '../src/core/scan-round';

const ANIMAL_ID = '11111111-1111-4111-8111-111111111111';

function seedStore() {
  const store = createStore('android-device-1');
  applySnapshot(store, {
    pullCursor: 0,
    tagBlocks: [],
    photos: [{ animalId: ANIMAL_ID, url: '/v1/animals/' + ANIMAL_ID + '/photo', localPath: 'file://b04.jpg' }],
    animals: [
      {
        id: ANIMAL_ID,
        tag: 'BUF004',
        shortNo: 'B04',
        name: 'Kali',
        species: 'BUFFALO',
        status: 'LACTATING',
        gender: 'FEMALE',
        isPregnant: false,
        penName: 'Shed 1',
        photoUrl: '/v1/animals/' + ANIMAL_ID + '/photo',
        photoLocalPath: 'file://b04.jpg',
        rolling7Mean: 12.4,
        version: 1,
        lactationStartDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
        expectedCalvingDate: null,
        deletedAt: null,
      },
    ],
    withholds: [
      {
        id: 'hold-1',
        animalId: ANIMAL_ID,
        drugName: 'Oxytet',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        messageNp: 'दूध बेच्नु हुँदैन',
      },
    ],
    markers: [],
    tasks: [],
  });
  startLocalRound(store, { id: '22222222-2222-4222-8222-222222222222', mode: 'MILKING', session: 'MORNING' });
  return store;
}

describe('native scan-to-record', () => {
  it('resolves a printed QR locally without a network', () => {
    const store = seedStore();
    const result = resolveLocalScan(store, `https://farm.local/scan/a/${ANIMAL_ID}`, 'CAMERA');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.dto.animal.shortNo).toBe('B04');
    expect(result.dto.context.rolling7Mean).toBe(12.4);
    expect(result.dto.context.expectedRangeLow).toBeCloseTo(7.4);
    expect(result.dto.blocks[0]?.kind).toBe('MILK_WITHHOLD');
    expect(result.dto.nextAction).toBe('MILK_ENTRY');
  });

  it('saves milk instantly and queues sync, including an out-of-range confirm', () => {
    const store = seedStore();
    const far = saveMilkLocal(store, { animalId: ANIMAL_ID, litres: 124, disposal: 'DISCARDED' });
    expect(far).toEqual({ ok: false, code: 'YIELD_OUT_OF_RANGE' });
    const saved = saveMilkLocal(store, {
      animalId: ANIMAL_ID,
      litres: 12.5,
      disposal: 'DISCARDED',
    });
    expect(saved.ok).toBe(true);
    expect(store.milk[0]?.litres).toBe(12.5);
    expect(store.outbox.some((o) => o.rest?.kind === 'milk')).toBe(true);
    expect(remainingAnimals(store).some((a) => a.id === ANIMAL_ID)).toBe(false);
    expect(undoLastMilk(store)).toBe(true);
    expect(remainingAnimals(store).some((a) => a.id === ANIMAL_ID)).toBe(true);
  });

  it('matches a typed short number from the cached shed list', () => {
    const store = seedStore();
    const result = resolveLocalScan(store, '04', 'MANUAL_NUMBER');
    expect(result.status).toBe('ok');
  });
});

describe('30-day cache', () => {
  it('drops tasks due more than 30 days out', () => {
    const store = createStore();
    const keepId = '33333333-3333-4333-8333-333333333333';
    const dropId = '44444444-4444-4444-8444-444444444444';
    const now = new Date('2026-09-14T00:00:00+05:45');
    store.tasks.set(keepId, {
      id: keepId,
      animalId: ANIMAL_ID,
      type: 'COLOSTRUM_FEED',
      titleEn: 'Colostrum +8h',
      titleNp: 'पहुँलो दूध',
      dueAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      priority: 'CRITICAL',
      status: 'PENDING',
    });
    store.tasks.set(dropId, {
      id: dropId,
      animalId: ANIMAL_ID,
      type: 'VACCINATION_DUE',
      titleEn: 'FMD',
      titleNp: 'एफएमडी',
      dueAt: new Date(now.getTime() + 40 * 24 * 60 * 60 * 1000).toISOString(),
      priority: 'HIGH',
      status: 'PENDING',
    });
    pruneTasks(store, now);
    expect(store.tasks.has(keepId)).toBe(true);
    expect(store.tasks.has(dropId)).toBe(false);
  });
});
