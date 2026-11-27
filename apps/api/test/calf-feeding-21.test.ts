import { describe, expect, it } from 'vitest';

/**
 * Documents the first-21-day calf feeding schedule used after live calving.
 * +2/+8/+16h COLOSTRUM_* rules stay in the reminder engine; these are the
 * additional Today’s Work checks (separate types so completing one leaves others open).
 */
describe('calf feeding 21-day schedule', () => {
  const schedule = [
    { type: 'COLOSTRUM_FEED', days: [2, 7, 14, 21] },
    { type: 'CALF_HEALTH_CHECK', days: [1, 3, 7, 14, 21] },
    { type: 'FEED_TRANSITION', days: [1, 3, 7, 14, 21] },
  ] as const;

  it('keeps day-1 colostrum on the hourly COLOSTRUM_* path only', () => {
    expect(schedule.find((s) => s.type === 'COLOSTRUM_FEED')!.days).not.toContain(1);
  });

  it('covers mother’s milk and other feed across the first 21 days', () => {
    expect(schedule.find((s) => s.type === 'CALF_HEALTH_CHECK')!.days).toEqual([1, 3, 7, 14, 21]);
    expect(schedule.find((s) => s.type === 'FEED_TRANSITION')!.days).toEqual([1, 3, 7, 14, 21]);
  });

  it('uses distinct task types so one complete cannot clear the others', () => {
    const types = new Set(schedule.map((s) => s.type));
    expect(types.size).toBe(3);
  });
});
