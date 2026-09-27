import { describe, expect, it } from 'vitest';
import { deriveStage, type ReproStageCfg, type ReproStageFacts } from '../src/breeding/repro-stage';

const buffalo: ReproStageCfg = {
  ageFirstServiceMonths: 30,
  voluntaryWaitingDays: 60,
  pregnancyCheckEarliestDays: 45,
  serviceWindowEndHours: 18,
  dryOffDaysBeforeCalving: 60,
};

const cow: ReproStageCfg = {
  ageFirstServiceMonths: 15,
  voluntaryWaitingDays: 50,
  pregnancyCheckEarliestDays: 35,
  serviceWindowEndHours: 18,
  dryOffDaysBeforeCalving: 60,
};

function female(over: Partial<ReproStageFacts> = {}): ReproStageFacts {
  return {
    gender: 'FEMALE',
    status: 'LACTATING',
    doNotBreed: false,
    hasActiveSyncEnrollment: false,
    isPregnant: false,
    daysToCalving: null,
    ageMonths: 60,
    lactationNumber: 2,
    neverServed: false,
    daysInMilk: 90,
    pendingServiceDaysAgo: null,
    hoursSinceHeat: null,
    failedServiceCount: 0,
    daysSinceLastHeatOrCalving: 12,
    ...over,
  };
}

describe('deriveStage', () => {
  it('resolves a male and a terminal status to NOT_BREEDING', () => {
    expect(deriveStage(female({ gender: 'MALE' }), buffalo)).toBe('NOT_BREEDING');
    expect(deriveStage(female({ status: 'SOLD' }), buffalo)).toBe('NOT_BREEDING');
    expect(deriveStage(female({ status: 'DEAD' }), buffalo)).toBe('NOT_BREEDING');
    expect(deriveStage(female({ status: 'CULLED' }), buffalo)).toBe('NOT_BREEDING');
  });

  it('honours doNotBreed before the pregnant branch', () => {
    expect(deriveStage(female({ doNotBreed: true, isPregnant: true, daysToCalving: 3 }), buffalo)).toBe(
      'DO_NOT_BREED',
    );
  });

  it('resolves an active protocol regardless of other conditions', () => {
    expect(
      deriveStage(
        female({ hasActiveSyncEnrollment: true, isPregnant: true, daysToCalving: 3 }),
        buffalo,
      ),
    ).toBe('UNDER_PROTOCOL');
  });

  it('sends a lactating pregnant buffalo 30 days from calving to PREGNANT_DRYOFF_DUE', () => {
    expect(
      deriveStage(
        female({ isPregnant: true, daysToCalving: 30, status: 'LACTATING' }),
        buffalo,
      ),
    ).toBe('PREGNANT_DRYOFF_DUE');
  });

  it('lets CALVING_IMMINENT beat DRY_PREGNANT', () => {
    expect(
      deriveStage(female({ isPregnant: true, daysToCalving: 4, status: 'DRY' }), buffalo),
    ).toBe('CALVING_IMMINENT');
  });

  it('uses DRY_PREGNANT when dried off and more than a week out', () => {
    expect(
      deriveStage(female({ isPregnant: true, daysToCalving: 20, status: 'DRY' }), buffalo),
    ).toBe('DRY_PREGNANT');
  });

  it('uses PREGNANT_EARLY when more than 60 days remain', () => {
    expect(
      deriveStage(female({ isPregnant: true, daysToCalving: 120, status: 'LACTATING' }), buffalo),
    ).toBe('PREGNANT_EARLY');
  });

  it('sends a buffalo 15 days in milk to FRESH, not VOLUNTARY_WAIT', () => {
    expect(deriveStage(female({ daysInMilk: 15, neverServed: false }), buffalo)).toBe('FRESH');
  });

  it('sends a buffalo 45 days in milk to VOLUNTARY_WAIT (VWP 60)', () => {
    expect(deriveStage(female({ daysInMilk: 45 }), buffalo)).toBe('VOLUNTARY_WAIT');
  });

  it('treats cow VWP 50 as the boundary: 49 wait, 50 awaiting heat', () => {
    expect(deriveStage(female({ daysInMilk: 45 }), cow)).toBe('VOLUNTARY_WAIT');
    expect(deriveStage(female({ daysInMilk: 49 }), cow)).toBe('VOLUNTARY_WAIT');
    expect(deriveStage(female({ daysInMilk: 50, daysSinceLastHeatOrCalving: 10 }), cow)).toBe(
      'AWAITING_HEAT',
    );
  });

  it('marks a young female as CALF and an unserved adult as HEIFER_READY', () => {
    expect(deriveStage(female({ ageMonths: 18, lactationNumber: 0, neverServed: true }), buffalo)).toBe(
      'CALF',
    );
    expect(deriveStage(female({ ageMonths: 32, lactationNumber: 0, neverServed: true }), buffalo)).toBe(
      'HEIFER_READY',
    );
  });

  it('splits pending service on pregCheckEarliestDays', () => {
    expect(deriveStage(female({ daysInMilk: 90, pendingServiceDaysAgo: 20 }), buffalo)).toBe(
      'SERVED_UNCONFIRMED',
    );
    expect(deriveStage(female({ daysInMilk: 90, pendingServiceDaysAgo: 45 }), buffalo)).toBe(
      'PREGNANCY_CHECK_DUE',
    );
    expect(deriveStage(female({ daysInMilk: 90, pendingServiceDaysAgo: 20 }), cow)).toBe(
      'SERVED_UNCONFIRMED',
    );
    expect(deriveStage(female({ daysInMilk: 90, pendingServiceDaysAgo: 35 }), cow)).toBe(
      'PREGNANCY_CHECK_DUE',
    );
  });

  it('opens IN_HEAT while the service window is still open', () => {
    expect(deriveStage(female({ daysInMilk: 90, hoursSinceHeat: 10 }), buffalo)).toBe('IN_HEAT');
    expect(deriveStage(female({ daysInMilk: 90, hoursSinceHeat: 18 }), buffalo)).toBe('IN_HEAT');
    expect(deriveStage(female({ daysInMilk: 90, hoursSinceHeat: 19 }), buffalo)).toBe('AWAITING_HEAT');
  });

  it('lets IN_HEAT beat REPEAT_BREEDER', () => {
    expect(
      deriveStage(female({ daysInMilk: 90, hoursSinceHeat: 4, failedServiceCount: 4 }), buffalo),
    ).toBe('IN_HEAT');
  });

  it('flags three failed services as REPEAT_BREEDER', () => {
    expect(deriveStage(female({ daysInMilk: 90, failedServiceCount: 3 }), buffalo)).toBe(
      'REPEAT_BREEDER',
    );
  });

  it('flags anestrus after 30 quiet days past VWP', () => {
    expect(
      deriveStage(female({ daysInMilk: 95, daysSinceLastHeatOrCalving: 40 }), buffalo),
    ).toBe('ANESTRUS_SUSPECTED');
    expect(
      deriveStage(female({ daysInMilk: 95, daysSinceLastHeatOrCalving: 30 }), buffalo),
    ).toBe('AWAITING_HEAT');
  });

  it('always returns exactly one stage', () => {
    const samples: ReproStageFacts[] = [
      female(),
      female({ gender: 'MALE' }),
      female({ isPregnant: true, daysToCalving: 2 }),
      female({ daysInMilk: 10 }),
      female({ pendingServiceDaysAgo: 40 }),
      female({ hasActiveSyncEnrollment: true }),
    ];
    for (const facts of samples) {
      const stage = deriveStage(facts, buffalo);
      expect(typeof stage).toBe('string');
      expect(stage.length).toBeGreaterThan(0);
    }
  });
});
