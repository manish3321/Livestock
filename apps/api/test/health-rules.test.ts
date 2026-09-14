import { describe, expect, it } from 'vitest';
import {
  classifyMastitis,
  estimatedMortalityLoss,
  remainingDoseCount,
  remainingLactationValue,
  temperatureOutOfRange,
} from '../src/health-records/health-rules';

describe('health-rules', () => {
  it('creates 7 remaining doses for a 4-day twice-daily course', () => {
    expect(remainingDoseCount(4, 2, 1)).toBe(7);
  });

  it('classifies CMT {LF:0,RF:0,LR:2,RR:3} with normal appearance as SUBCLINICAL', () => {
    expect(
      classifyMastitis({
        quarterScores: { LF: 0, RF: 0, LR: 2, RR: 3 },
        appearance: 'NORMAL',
      }),
    ).toBe('SUBCLINICAL');
  });

  it('classifies the same scores with CLOTS as CLINICAL', () => {
    expect(
      classifyMastitis({
        quarterScores: { LF: 0, RF: 0, LR: 2, RR: 3 },
        appearance: 'CLOTS',
      }),
    ).toBe('CLINICAL');
  });

  it('flags a temperature outside the species range', () => {
    expect(temperatureOutOfRange(40.2, 38, 39.3)).toBe(true);
    expect(temperatureOutOfRange(38.5, 38, 39.3)).toBe(false);
  });

  it('includes remaining lactation value for a lactating animal at 100 days in milk', () => {
    const remaining = remainingLactationValue({
      status: 'LACTATING',
      daysInMilk: 100,
      lactationDays: 242,
      rolling7Mean: 8,
      effectivePriceNpr: 48.36,
    });
    expect(remaining).toBeCloseTo(142 * 8 * 48.36);
    expect(estimatedMortalityLoss(40000, remaining)).toBeGreaterThan(40000);
  });
});
