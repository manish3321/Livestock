import { describe, expect, it } from 'vitest';
import {
  YIELD_DROP_CAUSES,
  fallbackEffectivePrice,
  remainingFromMovements,
  shouldSuppressYieldDrop,
  weightedEffectivePrice,
  yieldDropImmediate,
} from '../src/profit/profit-rules';

describe('profit-rules', () => {
  it('uses 85% of the headline rate when no payment exists', () => {
    expect(fallbackEffectivePrice(62)).toBeCloseTo(52.7);
  });

  it('weights the last three payments by litres', () => {
    const price = weightedEffectivePrice([
      { netPayableNpr: 48360, litresSupplied: 1000 },
      { netPayableNpr: 24000, litresSupplied: 500 },
      { netPayableNpr: 48000, litresSupplied: 1000 },
    ]);
    expect(price).toBeCloseTo(120360 / 2500);
  });

  it('suppresses yield drop for a late-lactation buffalo', () => {
    expect(
      shouldSuppressYieldDrop({
        species: 'BUFFALO',
        daysInMilk: 250,
        withholdOpen: false,
        priorRecordDays: 10,
      }),
    ).toBe(true);
  });

  it('flags a 25% drop at 90 days in milk', () => {
    expect(
      shouldSuppressYieldDrop({
        species: 'BUFFALO',
        daysInMilk: 90,
        withholdOpen: false,
        priorRecordDays: 10,
      }),
    ).toBe(false);
    expect(yieldDropImmediate(7.5, 10)).toBe(true);
  });

  it('lists mastitis first among yield-drop causes', () => {
    expect(YIELD_DROP_CAUSES[0]).toBe('mastitis');
  });

  it('derives remaining stock from movements and allows negative', () => {
    expect(
      remainingFromMovements(10, [
        { type: 'OUT', quantity: 12 },
      ]),
    ).toBe(-2);
  });
});
