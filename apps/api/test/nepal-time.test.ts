import { describe, expect, it } from 'vitest';
import { NEPAL_UTC_OFFSET_MINUTES, atNepalHour, nepalHourOf } from '../src/common/nepal-time';
import { nepalHourIn } from './fakes';

/**
 * These assertions are absolute instants, so they hold whatever zone the test
 * machine or the deployment target runs in. That is the point: the previous
 * implementation used Date#setHours and produced 09:45 Nepal time on a UTC
 * server, which silently moved the buffalo dawn check out of its window.
 */
describe('Nepal time placement', () => {
  it('is UTC+05:45 with no daylight saving', () => {
    expect(NEPAL_UTC_OFFSET_MINUTES).toBe(345);
  });

  it('places 04:00 Nepal time at 22:15 UTC the previous day', () => {
    const due = atNepalHour(new Date('2026-03-17T00:00:00Z'), 4);
    expect(due.toISOString()).toBe('2026-03-16T22:15:00.000Z');
    expect(nepalHourIn(due)).toBe(4);
  });

  it('places 05:00 and 08:00 Nepal time on the same Nepal calendar day', () => {
    const noonNepal = new Date('2026-03-17T06:15:00Z');
    expect(atNepalHour(noonNepal, 5).toISOString()).toBe('2026-03-16T23:15:00.000Z');
    expect(atNepalHour(noonNepal, 8).toISOString()).toBe('2026-03-17T02:15:00.000Z');
    expect(nepalHourIn(atNepalHour(noonNepal, 5))).toBe(5);
    expect(nepalHourIn(atNepalHour(noonNepal, 8))).toBe(8);
  });

  it('keeps the Nepal calendar date of an instant late in the UTC day', () => {
    // 20:00 UTC on the 17th is already 01:45 on the 18th in Nepal.
    const due = atNepalHour(new Date('2026-03-17T20:00:00Z'), 4);
    expect(due.toISOString()).toBe('2026-03-17T22:15:00.000Z');
    expect(nepalHourIn(due)).toBe(4);
  });

  it('reads back every hour of the day it wrote', () => {
    const anchor = new Date('2026-06-01T09:00:00Z');
    for (let hour = 0; hour < 24; hour += 1) {
      const due = atNepalHour(anchor, hour);
      expect(nepalHourOf(due), `hour ${hour}`).toBe(hour);
      expect(nepalHourIn(due), `hour ${hour} via Intl`).toBe(hour);
    }
  });

  it('agrees with the dispatcher, which reads Nepal hours through Intl', async () => {
    const { nepalHour } = await import('../src/notifications/notification-rules');
    for (const hour of [0, 4, 5, 8, 19, 20, 23]) {
      const due = atNepalHour(new Date('2026-09-16T00:00:00Z'), hour);
      expect(nepalHour(due), `hour ${hour}`).toBe(hour);
    }
  });
});
