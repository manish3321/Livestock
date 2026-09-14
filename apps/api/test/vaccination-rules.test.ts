import { describe, expect, it } from 'vitest';
import {
  appliesToAnimal,
  intervalDaysFor,
  lotIsExpired,
  nextDueDate,
  pickFefoLot,
  type ProtocolRow,
} from '../src/vaccinations/vaccination-rules';

const DAY = 24 * 60 * 60 * 1000;

function protocol(overrides: Partial<ProtocolRow> = {}): ProtocolRow {
  return {
    id: '00000000-0000-4000-8000-0000000000f1',
    disease: 'FMD',
    diseaseNp: 'खोरेत',
    species: ['BUFFALO', 'COW'],
    trigger: 'AGE_BASED',
    triggerAgeDays: 180,
    triggerMonth: null,
    boosterAfterDays: 28,
    repeatIntervalDays: 180,
    sexRestriction: 'ANY',
    pregnancyContraindicated: false,
    active: true,
    ...overrides,
  };
}

describe('vaccination-rules', () => {
  it('skips Brucellosis for a pregnant female', () => {
    const bru = protocol({
      disease: 'BRUCELLOSIS',
      triggerAgeDays: 120,
      boosterAfterDays: null,
      repeatIntervalDays: null,
      sexRestriction: 'FEMALE',
      pregnancyContraindicated: true,
    });
    expect(
      appliesToAnimal(bru, { species: 'BUFFALO', gender: 'FEMALE', isPregnant: true }),
    ).toBe(false);
    expect(
      appliesToAnimal(bru, { species: 'BUFFALO', gender: 'FEMALE', isPregnant: false }),
    ).toBe(true);
  });

  it('due date for a 6-month buffalo with no FMD record is today', () => {
    const now = new Date('2026-09-14T00:00:00Z');
    const dob = new Date(now.getTime() - 182 * DAY);
    const due = nextDueDate(protocol(), { dateOfBirth: dob }, null, false, now, new Date(now.getTime() + 60 * DAY));
    expect(due?.toISOString()).toBe(now.toISOString());
  });

  it('deworms calves under 180 days every 30 days', () => {
    const deworm = protocol({
      disease: 'DEWORMING',
      trigger: 'INTERVAL',
      triggerAgeDays: 30,
      boosterAfterDays: null,
      repeatIntervalDays: 90,
    });
    expect(intervalDaysFor(deworm, 90)).toBe(30);
    expect(intervalDaysFor(deworm, 200)).toBe(90);
  });

  it('picks the earliest-expiry lot (FEFO), even if remaining is negative', () => {
    const later = {
      id: 'b',
      lotNumber: 'B',
      qtyRemaining: 10,
      expiryDate: new Date('2026-12-01'),
      receivedOn: new Date('2026-01-01'),
    };
    const sooner = {
      id: 'a',
      lotNumber: 'A',
      qtyRemaining: -2,
      expiryDate: new Date('2026-10-01'),
      receivedOn: new Date('2026-02-01'),
    };
    expect(pickFefoLot([later, sooner])?.id).toBe('a');
  });

  it('treats a lot as expired only after its expiry date', () => {
    const lot = { expiryDate: new Date('2026-09-01T00:00:00Z') };
    expect(lotIsExpired(lot, new Date('2026-09-02T00:00:00Z'))).toBe(true);
    expect(lotIsExpired(lot, new Date('2026-08-31T00:00:00Z'))).toBe(false);
  });
});
