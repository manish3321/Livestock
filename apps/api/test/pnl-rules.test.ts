import { describe, expect, it } from 'vitest';
import { PNL_RATIO_TARGETS } from '@farm/contracts';
import { breakEvenPriceNpr, buildRatioSnapshot, sharePct } from '../src/pnl/pnl-rules';

describe('pnl-rules', () => {
  it('uses the 11.6 healthy dairy bands', () => {
    expect(PNL_RATIO_TARGETS.marginHealthyMinPct).toBe(20);
    expect(PNL_RATIO_TARGETS.marginHealthyMaxPct).toBe(30);
    expect(PNL_RATIO_TARGETS.feedShareMinPct).toBe(45);
    expect(PNL_RATIO_TARGETS.feedShareMaxPct).toBe(60);
    expect(PNL_RATIO_TARGETS.labourShareMinPct).toBe(12);
    expect(PNL_RATIO_TARGETS.labourShareMaxPct).toBe(18);
    expect(PNL_RATIO_TARGETS.healthShareMaxPct).toBe(10);
  });

  it('computes break-even price per litre from costs and sold litres', () => {
    expect(breakEvenPriceNpr(10000, 200)).toBe(50);
    expect(breakEvenPriceNpr(10000, 0)).toBeNull();
  });

  it('marks a healthy dairy inside the bands', () => {
    const snap = buildRatioSnapshot({
      revenue: 100000,
      expenses: 75000,
      feed: 50000,
      labour: 15000,
      health: 8000,
      soldLitres: 2000,
    });
    expect(sharePct(25000, 100000)).toBe(25);
    expect(snap.marginStatus).toBe('IN_RANGE');
    expect(snap.feedStatus).toBe('IN_RANGE');
    expect(snap.labourStatus).toBe('IN_RANGE');
    expect(snap.healthStatus).toBe('IN_RANGE');
    expect(snap.breakEvenPriceNpr).toBe(37.5);
  });

  it('flags health share above 10%', () => {
    const snap = buildRatioSnapshot({
      revenue: 100000,
      expenses: 80000,
      feed: 50000,
      labour: 15000,
      health: 12000,
      soldLitres: 1000,
    });
    expect(snap.healthStatus).toBe('HIGH');
  });
});
