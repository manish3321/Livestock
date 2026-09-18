import { REPRO_STAGES, type ReproStage } from '@farm/contracts';

export { REPRO_STAGES };
export type { ReproStage };

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const EXIT_STATUSES = new Set(['SOLD', 'DEAD', 'CULLED']);

export type ReproStageCfg = {
  ageFirstServiceMonths: number;
  voluntaryWaitingDays: number;
  pregnancyCheckEarliestDays: number;
  serviceWindowEndHours: number;
  dryOffDaysBeforeCalving: number;
};

export type ReproStageFacts = {
  gender: 'MALE' | 'FEMALE';
  status: string;
  doNotBreed: boolean;
  hasActiveSyncEnrollment: boolean;
  isPregnant: boolean;
  daysToCalving: number | null;
  ageMonths: number | null;
  lactationNumber: number;
  neverServed: boolean;
  daysInMilk: number | null;
  pendingServiceDaysAgo: number | null;
  hoursSinceHeat: number | null;
  failedServiceCount: number;
  daysSinceLastHeatOrCalving: number | null;
};

export function wholeDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / HOUR_MS;
}

export function monthsOfAge(dateOfBirth: Date | null | undefined, now: Date): number | null {
  if (!dateOfBirth) return null;
  return Math.round((now.getTime() - dateOfBirth.getTime()) / ((365.25 / 12) * DAY_MS));
}

/**
 * First match wins. An animal can satisfy several conditions; the earlier one
 * is the more urgent. Every species-dependent number comes from cfg.
 */
export function deriveStage(facts: ReproStageFacts, cfg: ReproStageCfg): ReproStage {
  if (facts.gender === 'MALE') return 'NOT_BREEDING';
  if (EXIT_STATUSES.has(facts.status)) return 'NOT_BREEDING';
  if (facts.doNotBreed) return 'DO_NOT_BREED';

  if (facts.hasActiveSyncEnrollment) return 'UNDER_PROTOCOL';

  if (facts.isPregnant) {
    const d = facts.daysToCalving;
    if (d != null && d <= 7) return 'CALVING_IMMINENT';
    if (facts.status === 'DRY') return 'DRY_PREGNANT';
    if (d != null && d <= cfg.dryOffDaysBeforeCalving) return 'PREGNANT_DRYOFF_DUE';
    return 'PREGNANT_EARLY';
  }

  if (facts.ageMonths != null && facts.ageMonths < cfg.ageFirstServiceMonths) return 'CALF';
  if (facts.lactationNumber === 0 && facts.neverServed) return 'HEIFER_READY';

  const dim = facts.daysInMilk;
  if (dim != null && dim <= 21) return 'FRESH';
  if (dim != null && dim < cfg.voluntaryWaitingDays) return 'VOLUNTARY_WAIT';

  if (facts.pendingServiceDaysAgo != null) {
    if (facts.pendingServiceDaysAgo < cfg.pregnancyCheckEarliestDays) return 'SERVED_UNCONFIRMED';
    return 'PREGNANCY_CHECK_DUE';
  }

  if (facts.hoursSinceHeat != null && facts.hoursSinceHeat <= cfg.serviceWindowEndHours) {
    return 'IN_HEAT';
  }

  if (facts.failedServiceCount >= 3) return 'REPEAT_BREEDER';

  const quiet = facts.daysSinceLastHeatOrCalving;
  if (
    quiet != null &&
    quiet > 30 &&
    dim != null &&
    dim >= cfg.voluntaryWaitingDays
  ) {
    return 'ANESTRUS_SUSPECTED';
  }

  return 'AWAITING_HEAT';
}

export function daysToCalving(expectedCalvingDate: Date | null | undefined, now: Date): number | null {
  if (!expectedCalvingDate) return null;
  return wholeDays(now, expectedCalvingDate);
}

export function daysInMilk(lactationStartDate: Date | null | undefined, now: Date): number | null {
  if (!lactationStartDate) return null;
  return wholeDays(lactationStartDate, now);
}
