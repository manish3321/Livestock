import { describe, expect, it } from 'vitest';
import {
  colostrumTargetLitres,
  costOfOpenDaysNpr,
  expectedCalvingFromPd,
  heatDetectionRatePct,
  hoursAfterBirth,
  inbreedingSharedIds,
  isFreemartinSuspect,
  inferCalvingOutcome,
  mapPdResult,
  pastVoluntaryWaiting,
  ratePct,
  servicesPerConception,
} from '../src/breeding/breeding-rules';

describe('breeding-rules', () => {
  it('sets buffalo EDD to checkDate + (gestationDays − estimatedDaysPregnant)', () => {
    const check = new Date('2026-03-01T00:00:00Z');
    const due = expectedCalvingFromPd(check, 310, 50);
    expect(due.toISOString().slice(0, 10)).toBe('2026-11-16');
  });

  it('marks only the female of a mixed twin pair as freemartin-suspect', () => {
    const calves = [{ sex: 'FEMALE' }, { sex: 'MALE' }];
    expect(isFreemartinSuspect(calves, 0)).toBe(true);
    expect(isFreemartinSuspect(calves, 1)).toBe(false);
    expect(isFreemartinSuspect([{ sex: 'FEMALE' }, { sex: 'FEMALE' }], 0)).toBe(false);
  });

  it('derives twin / abort outcomes', () => {
    expect(inferCalvingOutcome(undefined, 2)).toBe('LIVE_TWINS');
    expect(inferCalvingOutcome('ABORTED', 0)).toBe('ABORTED');
  });

  it('flags colostrum below 10% of birth weight and hours after birth', () => {
    expect(colostrumTargetLitres(32)).toBe(3.2);
    const hours = hoursAfterBirth(new Date('2026-01-01T07:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    expect(hours).toBe(7);
  });

  it('maps live PD aliases and voluntary wait', () => {
    expect(mapPdResult('CONFIRMED')).toBe('PREGNANT');
    expect(mapPdResult('OPEN')).toBe('NOT_PREGNANT');
    const start = new Date('2026-01-01T00:00:00Z');
    expect(pastVoluntaryWaiting(start, 60, new Date('2026-04-06T00:00:00Z'))).toBe(true);
    expect(pastVoluntaryWaiting(start, 60, new Date('2026-02-01T00:00:00Z'))).toBe(false);
  });

  it('costs open days as (interval − target) × yield × effective price', () => {
    expect(costOfOpenDaysNpr(450, 425, 8, 48.36)).toBeCloseTo(25 * 8 * 48.36);
    expect(costOfOpenDaysNpr(400, 425, 8, 48.36)).toBe(0);
  });

  it('computes conception, first-service and services-per-conception rates', () => {
    expect(ratePct(9, 20)).toBe(45);
    expect(servicesPerConception(20, 9)).toBeCloseTo(20 / 9);
    expect(heatDetectionRatePct(10, 20)).toBe(50);
  });

  it('warns when dam and sire share an ancestor within three generations', () => {
    const grand = 'g';
    const dam = 'd';
    const sire = 's';
    const parents = {
      [dam]: { damId: grand, sireId: null },
      [sire]: { damId: grand, sireId: null },
      [grand]: { damId: null, sireId: null },
    };
    expect(inbreedingSharedIds(dam, sire, parents)).toEqual(['g']);
    expect(inbreedingSharedIds(dam, 'unrelated', parents)).toEqual([]);
  });
});
