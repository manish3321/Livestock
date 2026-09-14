import { describe, expect, it } from 'vitest';
import { shouldRaiseTankVariance, soldLitres, tankVariance } from '../src/milk/tank-rules';

describe('tank-rules', () => {
  it('counts SOLD litres only', () => {
    expect(
      soldLitres([
        { destination: 'SOLD', quantity: 10 },
        { destination: 'CALF', quantity: 2 },
        { destination: 'DISCARDED', quantity: 1 },
        { destination: 'SOLD', quantity: 4.5 },
      ]),
    ).toBeCloseTo(14.5);
  });

  it('raises HIGH for a −12% gap', () => {
    const { varianceLitres, variancePct } = tankVariance(88, 100);
    expect(variancePct).toBeCloseTo(-12);
    expect(shouldRaiseTankVariance(varianceLitres, variancePct)).toBe(true);
  });

  it('raises HIGH for any extra litres', () => {
    const { varianceLitres, variancePct } = tankVariance(101, 100);
    expect(variancePct).toBeGreaterThan(0);
    expect(shouldRaiseTankVariance(varianceLitres, variancePct)).toBe(true);
  });

  it('does not raise for a normal −5% loss', () => {
    const { varianceLitres, variancePct } = tankVariance(95, 100);
    expect(shouldRaiseTankVariance(varianceLitres, variancePct)).toBe(false);
  });
});
