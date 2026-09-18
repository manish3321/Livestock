import { describe, expect, it } from 'vitest';
import type { BreedingDto, HeatLogDto } from '../api/breeding';
import {
  breedingPath,
  collectBreedingWork,
  filterBreedingWork,
  kpiFocus,
  parseBreedingStage,
  parseDeskFocus,
  suggestedStage,
} from './breeding-cycle';

const ANIMAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CFG = {
  serviceWindowStartHours: 12,
  serviceWindowEndHours: 18,
  pregnancyCheckEarliestDays: 45,
};

function record(partial: Partial<BreedingDto> & Pick<BreedingDto, 'id' | 'motherId'>): BreedingDto {
  return {
    farmId: 'farm',
    matingType: 'AI',
    fatherTagOrAi: null,
    matingDate: '2026-07-01T00:00:00.000Z',
    dueDate: '2027-04-07T00:00:00.000Z',
    pregnancyStatus: 'PREGNANT',
    birthDate: null,
    offspringTag: null,
    notes: null,
    daysRemaining: 120,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...partial,
  };
}

function heat(partial: Partial<HeatLogDto> & Pick<HeatLogDto, 'id' | 'animalId'>): HeatLogDto {
  return {
    animalTag: 'B-12',
    observedAt: '2026-09-15T01:00:00.000Z',
    intensity: 'STRONG',
    observerName: null,
    signs: 'STANDING_HEAT',
    notes: null,
    createdAt: '2026-09-15T01:00:00.000Z',
    ...partial,
  };
}

describe('breeding URL helpers', () => {
  it('builds desk and cycle paths without dropping ids', () => {
    expect(breedingPath()).toBe('/breeding');
    expect(parseBreedingStage('heat')).toBe('heat');
    expect(parseBreedingStage('records')).toBe('');
    expect(parseDeskFocus('pd')).toBe('pd');
    expect(breedingPath({ animalId: ANIMAL, form: 'pd', breedingId: 'rec-1' })).toBe(
      `/breeding?animalId=${ANIMAL}&form=pd&breedingId=rec-1`,
    );
  });

  it('maps herd KPIs onto the matching desk board', () => {
    expect(kpiFocus('daysOpen')).toBe('open');
    expect(kpiFocus('heatDetection')).toBe('observers');
    expect(kpiFocus('interval')).toBe('calving');
    expect(kpiFocus('conception')).toBe('pd');
  });
});

describe('suggestedStage', () => {
  const now = new Date('2026-09-15T16:00:00.000Z');

  it('follows the reproductive cycle instead of defaulting to a blank heat form', () => {
    expect(
      suggestedStage(
        ANIMAL,
        [record({ id: 'c1', motherId: ANIMAL, pregnancyStatus: 'DELIVERED', colostrumFed: false })],
        [],
        CFG,
        now,
      ),
    ).toBe('colostrum');
    expect(
      suggestedStage(
        ANIMAL,
        [record({ id: 'c2', motherId: ANIMAL, daysRemaining: 3 })],
        [],
        CFG,
        now,
      ),
    ).toBe('calving');
    expect(
      suggestedStage(
        ANIMAL,
        [record({ id: 'c3', motherId: ANIMAL, matingDate: '2026-07-20T00:00:00.000Z', daysRemaining: 80 })],
        [],
        CFG,
        now,
      ),
    ).toBe('pd');
    expect(
      suggestedStage(
        ANIMAL,
        [],
        [heat({ id: 'h1', animalId: ANIMAL, observedAt: '2026-09-15T02:00:00.000Z' })],
        CFG,
        now,
      ),
    ).toBe('service');
    expect(suggestedStage(ANIMAL, [], [], CFG, now)).toBe('heat');
  });
});

describe('collectBreedingWork', () => {
  const now = new Date('2026-09-15T16:00:00.000Z');
  const females = [{ id: ANIMAL, tag: 'B-12', herdNumber: '12', name: 'Kali', species: 'BUFFALO' }];

  it('orders colostrum, the service window, and PD ahead of long-open cows', () => {
    const items = collectBreedingWork({
      females,
      configBySpecies: new Map(),
      now,
      records: [
        record({
          id: 'r-col',
          motherId: ANIMAL,
          pregnancyStatus: 'DELIVERED',
          colostrumFed: false,
          birthDate: '2026-09-15T10:00:00.000Z',
        }),
        record({
          id: 'r-open',
          motherId: OTHER,
          motherTag: 'C-4',
          pregnancyStatus: 'OPEN',
          daysOpen: 140,
        }),
      ],
      heats: [heat({ id: 'h1', animalId: ANIMAL, observedAt: '2026-09-15T02:00:00.000Z' })],
    });
    expect(items.map((row) => row.kind)).toEqual(['colostrum', 'window', 'open']);
    expect(items[1]?.form).toBe('service');
    expect(items[0]?.breedingId).toBe('r-col');
  });

  it('keeps three unsaved heats on the board and can filter to that job', () => {
    const items = collectBreedingWork({
      females,
      configBySpecies: new Map(),
      now,
      records: [],
      heats: [
        heat({ id: 'h3', animalId: ANIMAL, observedAt: '2026-09-01T00:00:00.000Z' }),
        heat({ id: 'h2', animalId: ANIMAL, observedAt: '2026-08-10T00:00:00.000Z' }),
        heat({ id: 'h1', animalId: ANIMAL, observedAt: '2026-07-20T00:00:00.000Z' }),
      ],
    });
    expect(items.some((row) => row.kind === 'threeHeats')).toBe(true);
    expect(filterBreedingWork(items, 'open').every((row) => row.kind === 'threeHeats')).toBe(true);
  });
});
