import { describe, expect, it } from 'vitest';
import {
  injectionSteps,
  isBuffaloLowSeason,
  protocolReason,
  seasonalWarning,
  suggestProtocolCode,
} from '../src/breeding/breeding-protocol';

describe('suggestProtocol', () => {
  it('returns DOUBLESYNCH for a buffalo quiet 20 days', () => {
    expect(suggestProtocolCode('BUFFALO', 20)).toBe('DOUBLESYNCH');
  });

  it('returns CIDR_COSYNCH for a buffalo quiet 75 days', () => {
    expect(suggestProtocolCode('BUFFALO', 75)).toBe('CIDR_COSYNCH');
  });

  it('returns OVSYNCH for cycling cattle', () => {
    expect(suggestProtocolCode('COW', 18)).toBe('OVSYNCH');
  });

  it('includes a reason in both languages', () => {
    const reason = protocolReason('DOUBLESYNCH', 20);
    expect(reason.reasonEn.length).toBeGreaterThan(20);
    expect(reason.reasonNp.length).toBeGreaterThan(10);
  });

  it('warns when a buffalo protocol starts in May', () => {
    expect(isBuffaloLowSeason(4)).toBe(true);
    const warning = seasonalWarning('BUFFALO', 4);
    expect(warning?.en).toMatch(/40%/);
    expect(warning?.np).toMatch(/४०%/);
  });

  it('Doublesynch has four injection steps plus AI', () => {
    const steps = [
      { day: 0, drug: 'PGF2α', dose: '2 ml' },
      { day: 2, drug: 'GnRH', dose: '2.5 ml' },
      { day: 9, drug: 'PGF2α', dose: '2 ml' },
      { day: 11, drug: 'GnRH', dose: '2.5 ml' },
      { day: 12, action: 'AI', timing: 'morning' },
    ];
    expect(injectionSteps(steps)).toHaveLength(4);
  });
});
