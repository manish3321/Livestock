import { describe, expect, it } from 'vitest';
import { anestrusTasks, costOfOpenDays } from '../src/breeding/breeding-anestrus';
import { nepalHourIn } from './fakes';

const base = {
  species: 'BUFFALO',
  status: 'LACTATING',
  isPregnant: false,
  now: new Date('2026-03-17T05:00:00+05:45'),
  voluntaryWaitingDays: 60,
  herdAvgDailyYield: 8,
  effectivePriceNpr: 48,
  shortNo: 'B12',
};

describe('anestrusTasks', () => {
  it('buffalo 95 days post-calving with no heat gets mineral, not vet', () => {
    const calved = new Date('2025-12-12T00:00:00+05:45');
    const tasks = anestrusTasks({ ...base, lactationStart: calved, lastHeatAt: null });
    expect(tasks.some((t) => t.type === 'ANESTRUS_MINERAL')).toBe(true);
    expect(tasks.some((t) => t.type === 'ANESTRUS_VET')).toBe(false);
    expect(nepalHourIn(tasks.find((t) => t.type === 'SILENT_HEAT_CHECK')!.dueAt)).toBe(4);
  });

  it('cow 41 days quiet does not get silent heat', () => {
    const tasks = anestrusTasks({
      ...base,
      species: 'COW',
      voluntaryWaitingDays: 50,
      lactationStart: new Date('2026-02-04T00:00:00+05:45'),
      lastHeatAt: null,
    });
    expect(tasks.some((t) => t.type === 'SILENT_HEAT_CHECK')).toBe(false);
  });

  it('buffalo 125 days post-calving produces ANESTRUS_VET at HIGH', () => {
    const tasks = anestrusTasks({
      ...base,
      lactationStart: new Date('2025-11-12T00:00:00+05:45'),
      lastHeatAt: null,
    });
    const vet = tasks.find((t) => t.type === 'ANESTRUS_VET');
    expect(vet?.priority).toBe('HIGH');
    expect(tasks.some((t) => t.type === 'ANESTRUS_MINERAL')).toBe(false);
  });

  it('decision body includes NPR cost', () => {
    const tasks = anestrusTasks({
      ...base,
      lactationStart: new Date('2025-10-01T00:00:00+05:45'),
      lastHeatAt: null,
    });
    const decision = tasks.find((t) => t.type === 'ANESTRUS_DECISION');
    expect(decision?.titleEn).toMatch(/NPR \d+/);
    expect(costOfOpenDays(160, 8, 48)).toBeGreaterThan(0);
  });

  it('a heat this lactation is not treated as anestrus heat-watch', () => {
    const tasks = anestrusTasks({
      ...base,
      lactationStart: new Date('2026-01-01T00:00:00+05:45'),
      lastHeatAt: new Date('2026-03-10T05:00:00+05:45'),
    });
    expect(tasks.some((t) => t.type === 'HEAT_WATCH')).toBe(false);
  });
});
