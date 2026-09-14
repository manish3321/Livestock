import { describe, expect, it } from 'vitest';
import {
  colostrumTargetLitres,
  expectedCalvingFromPd,
  hoursAfterBirth,
  isFreemartinSuspect,
  inferCalvingOutcome,
  mapPdResult,
  pastVoluntaryWaiting,
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
});
