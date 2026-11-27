import './setup-env';
import { describe, expect, it } from 'vitest';
import { countdownFor } from '../src/breeding/breeding-watch';

const cfg = {
  gestationDays: 310,
  voluntaryWaitingDays: 60,
  estrusCycleDays: 21,
  pregnancyCheckEarliestDays: 45,
  serviceWindowEndHours: 18,
  dryOffDaysBeforeCalving: 60,
  ageFirstServiceMonths: 15,
};

describe('ANESTRUS_SUSPECTED quiet labels', () => {
  it('uses silent-heat wording under 60 quiet days', () => {
    const now = new Date('2026-11-26T12:00:00.000Z');
    const { countdown } = countdownFor(
      {
        id: 'a',
        tag: 'C99',
        herdNumber: 'C99',
        name: 'TEST',
        species: 'COW',
        stage: 'ANESTRUS_SUSPECTED',
        lactationStart: new Date('2026-09-01T00:00:00.000Z'),
        lastHeatAt: new Date('2026-10-20T00:00:00.000Z'),
        dateOfBirth: null,
        expectedCalvingDate: null,
        photoUrl: null,
        penName: null,
      } as any,
      cfg,
      now,
    );
    expect(countdown.labelEn).toMatch(/silent heat likely/);
  });

  it('uses anestrus wording at 60+ quiet days (not silent heat)', () => {
    const now = new Date('2026-11-26T12:00:00.000Z');
    const { countdown } = countdownFor(
      {
        id: 'a',
        tag: 'C13',
        herdNumber: 'C13',
        name: 'TEST',
        species: 'COW',
        stage: 'ANESTRUS_SUSPECTED',
        lactationStart: new Date('2026-06-16T20:00:00.000Z'),
        lastHeatAt: null,
        dateOfBirth: new Date('2020-06-16T20:00:00.000Z'),
        expectedCalvingDate: null,
        photoUrl: null,
        penName: null,
      } as any,
      cfg,
      now,
    );
    expect(countdown.labelEn).toMatch(/anestrus likely/);
    expect(countdown.labelEn).not.toMatch(/silent heat/);
    expect(countdown.elapsed).toBeGreaterThanOrEqual(60);
  });
});
