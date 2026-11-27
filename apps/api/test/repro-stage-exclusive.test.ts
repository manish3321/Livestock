import './setup-env';
import { describe, expect, it } from 'vitest';
import { deriveStage, type ReproStageCfg, type ReproStageFacts } from '../src/breeding/repro-stage';

const cfg: ReproStageCfg = {
  ageFirstServiceMonths: 15,
  voluntaryWaitingDays: 60,
  pregnancyCheckEarliestDays: 35,
  serviceWindowEndHours: 24,
  dryOffDaysBeforeCalving: 60,
};

function base(over: Partial<ReproStageFacts> = {}): ReproStageFacts {
  return {
    gender: 'FEMALE',
    status: 'ACTIVE',
    doNotBreed: false,
    hasActiveSyncEnrollment: false,
    isPregnant: false,
    daysToCalving: null,
    ageMonths: 36,
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

describe('repro stage exclusivity', () => {
  it('pregnant animals are never in Waiting stages', () => {
    const stage = deriveStage(
      base({ isPregnant: true, daysToCalving: 200 }),
      cfg,
    );
    expect(stage).toBe('PREGNANT_EARLY');
    expect(['VOLUNTARY_WAIT', 'AWAITING_HEAT']).not.toContain(stage);
  });

  it('open females after VWP land in AWAITING_HEAT, not pregnancy', () => {
    const stage = deriveStage(base({ isPregnant: false, daysInMilk: 90 }), cfg);
    expect(stage).toBe('AWAITING_HEAT');
    expect(stage.startsWith('PREGNANT')).toBe(false);
  });

  it('voluntary wait is exclusive of pregnancy labels', () => {
    const stage = deriveStage(base({ daysInMilk: 40, isPregnant: false }), cfg);
    expect(stage).toBe('VOLUNTARY_WAIT');
  });
});
