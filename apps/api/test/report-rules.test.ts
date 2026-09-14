import { describe, expect, it } from 'vitest';
import { groupCooperativeByDay } from '../src/reports/report-rules';

describe('report-rules', () => {
  it('groups cooperative deliveries by day with weighted fat', () => {
    const days = groupCooperativeByDay([
      {
        date: new Date('2026-09-01T01:00:00Z'),
        litresSent: 100,
        litresAccepted: 98,
        litresRejected: 2,
        fat: 6,
        snf: 9,
        scc: 200,
      },
      {
        date: new Date('2026-09-01T10:00:00Z'),
        litresSent: 100,
        litresAccepted: 100,
        litresRejected: 0,
        fat: 8,
        snf: 9,
        scc: 400,
      },
    ]);
    expect(days).toHaveLength(1);
    expect(days[0]?.litresSent).toBe(200);
    expect(days[0]?.fat).toBe(7);
    expect(days[0]?.scc).toBe(300);
  });
});
