import { describe, expect, it } from 'vitest';
import type { SpeciesConfigDto } from '@farm/contracts';
import {
  buildBreedingWatch,
  buildReproTimeline,
  countdownUrgency,
  type WatchAnimal,
} from '../src/breeding/breeding-watch';

const buffalo: SpeciesConfigDto = {
  species: 'BUFFALO',
  gestationDays: 310,
  lactationDays: 242,
  voluntaryWaitingDays: 60,
  estrusCycleDays: 21,
  ageFirstServiceMonths: 30,
  pregnancyCheckEarliestDays: 45,
  targetCalvingIntervalDays: 425,
  dryOffDaysBeforeCalving: 60,
  gestationVarianceDays: 10,
  minWeightFirstServiceKg: 300,
  serviceWindowStartHours: 12,
  serviceWindowEndHours: 18,
  silentHeatCheckHour: 4,
  fatMinPercent: 6.5,
  fatMaxPercent: 8,
  tempMinC: 37.5,
  tempMaxC: 39.5,
};

const cow: SpeciesConfigDto = {
  ...buffalo,
  species: 'COW',
  gestationDays: 283,
  lactationDays: 286,
  voluntaryWaitingDays: 50,
  ageFirstServiceMonths: 15,
  pregnancyCheckEarliestDays: 35,
  targetCalvingIntervalDays: 380,
  gestationVarianceDays: 7,
  minWeightFirstServiceKg: 250,
  silentHeatCheckHour: null,
  fatMinPercent: 3.5,
  fatMaxPercent: 4.5,
  tempMinC: 38.0,
  tempMaxC: 39.3,
};

const now = new Date('2026-05-01T08:00:00+05:45');
const cfg = new Map<string, SpeciesConfigDto>([
  ['BUFFALO', buffalo],
  ['COW', cow],
]);

function animal(over: Partial<WatchAnimal> & Pick<WatchAnimal, 'id' | 'stage'>): WatchAnimal {
  return {
    herdNumber: over.herdNumber ?? over.tag ?? 'B01',
    tag: over.tag ?? 'B01',
    name: over.name ?? 'काली',
    species: over.species ?? 'BUFFALO',
    photoUrl: over.photoUrl ?? 'https://farm/photo.jpg',
    penName: over.penName ?? 'Shed 1',
    penSortOrder: over.penSortOrder ?? 1,
    seqNo: over.seqNo ?? 1,
    shed: over.shed ?? 'Shed 1',
    lactationStart: over.lactationStart ?? null,
    dateOfBirth: over.dateOfBirth ?? null,
    expectedCalvingDate: over.expectedCalvingDate ?? null,
    lastHeatAt: over.lastHeatAt ?? null,
    lastServiceAt: over.lastServiceAt ?? null,
    pregnancyConfirmedAt: over.pregnancyConfirmedAt ?? null,
    protocolDay: over.protocolDay ?? null,
    protocolTotalDays: over.protocolTotalDays ?? null,
    protocolNameEn: over.protocolNameEn ?? null,
    protocolNameNp: over.protocolNameNp ?? null,
    ...over,
  };
}

describe('breeding watch', () => {
  it('omits empty groups and skips CALF / NOT_BREEDING', () => {
    const watch = buildBreedingWatch({
      now,
      configBySpecies: cfg,
      animals: [
        animal({
          id: 'a1',
          stage: 'CALVING_IMMINENT',
          expectedCalvingDate: new Date('2026-05-03T00:00:00+05:45'),
        }),
        animal({ id: 'a2', tag: 'B02', stage: 'CALF' }),
        animal({ id: 'a3', tag: 'B03', stage: 'NOT_BREEDING' }),
      ],
    });
    expect(watch.groups.map((g) => g.key)).toEqual(['CALVING_SOON']);
    expect(watch.groups.every((g) => g.items.length > 0)).toBe(true);
    expect(watch.totalAnimals).toBe(1);
  });

  it('puts a populated countdown on every item with progressPct 0–100', () => {
    const watch = buildBreedingWatch({
      now,
      configBySpecies: cfg,
      animals: [
        animal({
          id: 'a1',
          stage: 'PREGNANT_EARLY',
          expectedCalvingDate: new Date('2026-06-28T00:00:00+05:45'),
        }),
        animal({
          id: 'a2',
          tag: 'B07',
          stage: 'AWAITING_HEAT',
          lastHeatAt: new Date('2026-04-10T05:00:00+05:45'),
        }),
        animal({
          id: 'a3',
          tag: 'B19',
          stage: 'ANESTRUS_SUSPECTED',
          lactationStart: new Date('2026-02-01T00:00:00+05:45'),
        }),
      ],
    });
    const items = watch.groups.flatMap((g) => g.items);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.countdown).toBeTruthy();
      expect(item.countdown.progressPct).toBeGreaterThanOrEqual(0);
      expect(item.countdown.progressPct).toBeLessThanOrEqual(100);
      expect(item.countdown.labelEn.length).toBeGreaterThan(0);
      expect(item.countdown.labelNp.length).toBeGreaterThan(0);
      expect(item.contextEn.length).toBeGreaterThan(0);
      expect(item.contextNp.length).toBeGreaterThan(0);
      expect(item.photoUrl).toBeTruthy();
      expect(item.penName).toBe('Shed 1');
    }
  });

  it('marks IMMINENT within 1 day and OVERDUE past the target', () => {
    expect(
      countdownUrgency({ kind: 'DAYS_TO_EVENT', remaining: 1, unit: 'DAYS', elapsed: 309, total: 310 }),
    ).toBe('IMMINENT');
    expect(
      countdownUrgency({ kind: 'DAYS_TO_EVENT', remaining: -2, unit: 'DAYS', elapsed: 312, total: 310 }),
    ).toBe('OVERDUE');
    expect(
      countdownUrgency({
        kind: 'HOURS_TO_DEADLINE',
        remaining: 5,
        unit: 'HOURS',
        elapsed: 13,
        total: 18,
      }),
    ).toBe('IMMINENT');

    const watch = buildBreedingWatch({
      now,
      configBySpecies: cfg,
      animals: [
        animal({
          id: 'soon',
          tag: 'B31',
          stage: 'CALVING_IMMINENT',
          expectedCalvingDate: new Date('2026-05-02T00:00:00+05:45'),
        }),
        animal({
          id: 'late',
          tag: 'B40',
          stage: 'CALVING_IMMINENT',
          expectedCalvingDate: new Date('2026-04-20T00:00:00+05:45'),
        }),
      ],
    });
    const items = watch.groups[0]!.items;
    expect(items.find((r) => r.shortNo === 'B31')?.countdown.urgency).toBe('IMMINENT');
    expect(items.find((r) => r.shortNo === 'B40')?.countdown.urgency).toBe('OVERDUE');
  });

  it('sorts by the group key then pen.sortOrder then seqNo', () => {
    const watch = buildBreedingWatch({
      now,
      configBySpecies: cfg,
      animals: [
        animal({
          id: 'a1',
          tag: 'B23',
          seqNo: 23,
          penSortOrder: 2,
          stage: 'CALVING_IMMINENT',
          expectedCalvingDate: new Date('2026-05-13T00:00:00+05:45'),
        }),
        animal({
          id: 'a2',
          tag: 'B09',
          seqNo: 9,
          penSortOrder: 1,
          stage: 'CALVING_IMMINENT',
          expectedCalvingDate: new Date('2026-06-28T00:00:00+05:45'),
        }),
        animal({
          id: 'a3',
          tag: 'B31',
          seqNo: 31,
          penSortOrder: 1,
          stage: 'CALVING_IMMINENT',
          expectedCalvingDate: new Date('2026-05-03T00:00:00+05:45'),
        }),
        animal({
          id: 'heat',
          tag: 'B07',
          stage: 'AWAITING_HEAT',
          lastHeatAt: new Date('2026-04-10T00:00:00+05:45'),
        }),
      ],
    });
    expect(watch.groups.map((g) => g.key)).toEqual(['CALVING_SOON', 'WATCHING_HEAT']);
    expect(watch.groups[0]!.items.map((r) => r.shortNo)).toEqual(['B31', 'B23', 'B09']);
  });

  it('filters to the group for ?stage=', () => {
    const watch = buildBreedingWatch({
      now,
      configBySpecies: cfg,
      stage: 'AWAITING_HEAT',
      animals: [
        animal({
          id: 'a1',
          stage: 'AWAITING_HEAT',
          lastHeatAt: new Date('2026-04-17T00:00:00+05:45'),
        }),
        animal({
          id: 'a2',
          tag: 'B19',
          stage: 'ANESTRUS_SUSPECTED',
          lactationStart: new Date('2026-02-01T00:00:00+05:45'),
        }),
      ],
    });
    expect(watch.groups).toHaveLength(1);
    expect(watch.groups[0]!.key).toBe('WATCHING_HEAT');
    expect(watch.groups[0]!.items).toHaveLength(1);
    expect(watch.groups[0]!.items[0]!.stage).toBe('AWAITING_HEAT');
  });

  it('uses buffalo VWP 60 and cow PD 35 from SpeciesConfig', () => {
    const watch = buildBreedingWatch({
      now,
      configBySpecies: cfg,
      animals: [
        animal({
          id: 'b',
          tag: 'B47',
          stage: 'VOLUNTARY_WAIT',
          lactationStart: new Date('2026-03-24T00:00:00+05:45'),
        }),
        animal({
          id: 'c',
          tag: 'C02',
          species: 'COW',
          stage: 'PREGNANCY_CHECK_DUE',
          lastServiceAt: new Date('2026-03-15T00:00:00+05:45'),
        }),
      ],
    });
    const wait = watch.groups.find((g) => g.key === 'TOO_SOON')!.items[0]!;
    expect(wait.countdown.total).toBe(60);
    expect(wait.countdown.labelEn).toContain('of 60');
    const pd = watch.groups.find((g) => g.key === 'WAITING_CHECK')!.items[0]!;
    expect(pd.countdown.total).toBe(35);
    expect(pd.countdown.urgency).toBe('OVERDUE');
  });
});

describe('repro timeline', () => {
  it('returns completed and future milestones with dates', () => {
    const calved = new Date('2025-08-22T00:00:00+05:45');
    const bred = new Date('2025-11-02T00:00:00+05:45');
    const confirmed = new Date('2025-12-17T00:00:00+05:45');
    const edd = new Date('2026-09-08T00:00:00+05:45');
    const timeline = buildReproTimeline({
      now,
      cfg: buffalo,
      animal: animal({
        id: 'a1',
        tag: 'B12',
        stage: 'PREGNANT_EARLY',
        lactationStart: calved,
        lastServiceAt: bred,
        pregnancyConfirmedAt: confirmed,
        expectedCalvingDate: edd,
      }),
      tasks: [
        { titleEn: 'Dry off B12', titleNp: 'दूध बन्द', dueAt: new Date('2026-07-10'), type: 'DRY_OFF' },
        { titleEn: 'Calving watch', titleNp: 'बियाइ', dueAt: new Date('2026-09-01'), type: 'CALVING_WATCH' },
        { titleEn: 'Feed change', titleNp: 'दाना', dueAt: new Date('2026-08-18'), type: 'FEED_TRANSITION' },
        { titleEn: 'Later', titleNp: 'पछि', dueAt: new Date('2026-10-01'), type: 'HEAT_WATCH' },
      ],
    });
    expect(timeline.headlineEn).toContain('Pregnant');
    expect(timeline.headlineEn).toContain('of 310');
    expect(timeline.headlineNp).toContain('गर्भवती');
    const byKey = Object.fromEntries(timeline.milestones.map((m) => [m.key, m]));
    expect(byKey.CALVED?.completed).toBe(true);
    expect(byKey.CALVED?.date).toBe('2025-08-22');
    expect(byKey.BRED?.completed).toBe(true);
    expect(byKey.CONFIRMED?.completed).toBe(true);
    expect(byKey.DRY_OFF?.completed).toBe(false);
    expect(byKey.DRY_OFF?.date).toBeTruthy();
    expect(byKey.CALVING?.completed).toBe(false);
    expect(byKey.CALVING?.remainingDays).toBeGreaterThan(0);
    expect(timeline.next).toHaveLength(3);
    expect(timeline.next[0]?.type).toBe('DRY_OFF');
    expect(timeline.youAreHerePct).toBeGreaterThan(0);
    expect(timeline.youAreHerePct).toBeLessThan(100);
  });
});
