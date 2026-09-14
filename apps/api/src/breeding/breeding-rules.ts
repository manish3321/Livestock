import type { CalvingOutcome, HeatSign } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const HEAT_SIGNS = new Set<HeatSign>([
  'STANDING_HEAT',
  'MOUNTING_OTHERS',
  'MUCUS_DISCHARGE',
  'VULVA_SWELLING',
  'BELLOWING',
  'RESTLESSNESS',
  'REDUCED_MILK',
  'TAIL_RAISED',
  'OFF_FEED',
]);

/** Section 5.3 — PD date plus remaining gestation, never a hardcoded 260. */
export function expectedCalvingFromPd(
  checkDate: Date,
  gestationDays: number,
  estimatedDaysPregnant: number,
): Date {
  const due = new Date(checkDate);
  due.setUTCDate(due.getUTCDate() + (gestationDays - estimatedDaysPregnant));
  return due;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

export function atLocalHour(date: Date, hour: number): Date {
  const next = new Date(date);
  next.setHours(hour, 0, 0, 0);
  return next;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function hoursAfterBirth(fedAt: Date, dob: Date): number {
  return (fedAt.getTime() - dob.getTime()) / HOUR_MS;
}

export function colostrumTargetLitres(birthWeightKg: number | null | undefined): number | null {
  if (birthWeightKg == null || birthWeightKg <= 0) return null;
  return Number(birthWeightKg) * 0.1;
}

export function pastVoluntaryWaiting(
  lactationStart: Date | null | undefined,
  waitingDays: number,
  now: Date,
): boolean {
  if (!lactationStart) return false;
  return daysBetween(lactationStart, now) >= waitingDays;
}

export function isFreemartinSuspect(
  calves: Array<{ sex: string }>,
  index: number,
): boolean {
  const sexes = new Set(calves.map((c) => c.sex));
  return calves.length >= 2 && sexes.has('FEMALE') && sexes.has('MALE') && calves[index]?.sex === 'FEMALE';
}

export function inferCalvingOutcome(
  outcome: string | undefined,
  liveCount: number,
): CalvingOutcome {
  if (outcome === 'ABORTED') return 'ABORTED';
  if (outcome === 'STILLBORN') return 'STILLBORN';
  if (liveCount >= 3) return 'LIVE_TRIPLETS';
  if (liveCount === 2) return 'LIVE_TWINS';
  if (outcome === 'LIVE_TWINS' || outcome === 'LIVE_TRIPLETS' || outcome === 'LIVE_SINGLE') {
    return outcome;
  }
  return 'LIVE_SINGLE';
}

export function parseComplications(raw: unknown): Array<
  | 'RETAINED_PLACENTA'
  | 'MILK_FEVER'
  | 'PROLAPSE'
  | 'METRITIS'
  | 'DYSTOCIA'
  | 'KETOSIS'
  | 'NONE'
> {
  const allowed = new Set([
    'RETAINED_PLACENTA',
    'MILK_FEVER',
    'PROLAPSE',
    'METRITIS',
    'DYSTOCIA',
    'KETOSIS',
    'NONE',
  ]);
  const items = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return items
    .map((item) => String(item).toUpperCase().replace(/\s+/g, '_'))
    .filter((item): item is 'RETAINED_PLACENTA' | 'MILK_FEVER' | 'PROLAPSE' | 'METRITIS' | 'DYSTOCIA' | 'KETOSIS' | 'NONE' =>
      allowed.has(item),
    );
}

export function mapPdResult(result: string): 'PREGNANT' | 'NOT_PREGNANT' | 'INCONCLUSIVE' {
  if (result === 'PREGNANT' || result === 'CONFIRMED') return 'PREGNANT';
  if (result === 'NOT_PREGNANT' || result === 'OPEN') return 'NOT_PREGNANT';
  return 'INCONCLUSIVE';
}

export function mapColostrumSource(
  source?: string,
): 'OWN_DAM' | 'OTHER_COW' | 'STORED_FROZEN' | 'COMMERCIAL_REPLACER' {
  if (source === 'OTHER_COW' || source === 'OTHER_DAM') return 'OTHER_COW';
  if (source === 'STORED_FROZEN' || source === 'FROZEN') return 'STORED_FROZEN';
  if (source === 'COMMERCIAL_REPLACER' || source === 'REPLACER') return 'COMMERCIAL_REPLACER';
  return 'OWN_DAM';
}

export function parseHeatSigns(signs?: string, signList?: string[]): HeatSign[] {
  const raw = [...(signList ?? []), ...(signs ? signs.split(/[,|]/) : [])];
  return [...new Set(raw.map((s) => s.trim().toUpperCase()).filter((s): s is HeatSign => HEAT_SIGNS.has(s as HeatSign)))];
}

export function mergeBreedComposition(
  dam: unknown,
  sire: unknown,
  damBreed?: string | null,
): Record<string, number> | null {
  const a = asComp(dam) ?? (damBreed ? { [damBreed.toLowerCase()]: 1 } : null);
  const b = asComp(sire);
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, number> = {};
  for (const key of keys) out[key] = ((a[key] ?? 0) + (b[key] ?? 0)) / 2;
  return out;
}

function asComp(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(value as Record<string, unknown>)) {
    const num = Number(n);
    if (Number.isFinite(num) && num > 0) out[key] = num;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Task pending unique is (farmId, animalId, type, sourceRefId UUID).
 * Encode a slot on the last byte so +2h / +8h / +16h and FPT days do not collide.
 */
export function derivedSlotId(baseId: string, slot: number): string {
  const hex = baseId.replace(/-/g, '').toLowerCase().padEnd(32, '0').slice(0, 32);
  const last = ((parseInt(hex.slice(30, 32), 16) + slot) & 0xff).toString(16).padStart(2, '0');
  const h = `${hex.slice(0, 30)}${last}`;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function nextColostrumHours(completedHours: number): 8 | 16 | null {
  if (completedHours <= 2) return 8;
  if (completedHours <= 8) return 16;
  return null;
}

export function colostrumSlotHours(hoursAfterBirth: number): 2 | 8 | 16 {
  if (hoursAfterBirth <= 4) return 2;
  if (hoursAfterBirth <= 12) return 8;
  return 16;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function ratePct(numer: number, denom: number): number | null {
  if (denom <= 0) return null;
  return (numer / denom) * 100;
}

export function servicesPerConception(serviceCount: number, conceptions: number): number | null {
  if (conceptions <= 0) return null;
  return serviceCount / conceptions;
}

export function monthsBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / ((365.25 / 12) * DAY_MS));
}

/** Section 5.4 — only the days past the species target cost money. */
export function costOfOpenDaysNpr(
  calvingIntervalDays: number,
  targetCalvingIntervalDays: number,
  avgDailyYield: number,
  effectivePriceNpr: number,
): number {
  if (avgDailyYield <= 0 || effectivePriceNpr <= 0) return 0;
  return Math.max(0, calvingIntervalDays - targetCalvingIntervalDays) * avgDailyYield * effectivePriceNpr;
}

export function heatDetectionRatePct(detectedHeats: number, expectedHeats: number): number | null {
  return ratePct(detectedHeats, expectedHeats);
}

export function expectedHeats(openDays: number, estrusCycleDays: number): number {
  if (estrusCycleDays <= 0 || openDays <= 0) return 0;
  return openDays / estrusCycleDays;
}

export type ParentLink = { damId: string | null; sireId: string | null };

/** Ancestors up to `generations` levels (parents, grandparents, great-grandparents at 3). */
export function collectAncestorIds(
  startId: string,
  parentsOf: Record<string, ParentLink>,
  generations = 3,
): Set<string> {
  const out = new Set<string>();
  let frontier = [startId];
  for (let g = 0; g < generations; g++) {
    const next: string[] = [];
    for (const id of frontier) {
      const parents = parentsOf[id];
      if (!parents) continue;
      for (const parent of [parents.damId, parents.sireId]) {
        if (parent && !out.has(parent)) {
          out.add(parent);
          next.push(parent);
        }
      }
    }
    frontier = next;
  }
  return out;
}

export function inbreedingSharedIds(
  damId: string,
  sireId: string,
  parentsOf: Record<string, ParentLink>,
  generations = 3,
): string[] {
  if (damId === sireId) return [sireId];
  const damAnc = collectAncestorIds(damId, parentsOf, generations);
  const sireAnc = collectAncestorIds(sireId, parentsOf, generations);
  const shared = new Set<string>();
  if (damAnc.has(sireId)) shared.add(sireId);
  if (sireAnc.has(damId)) shared.add(damId);
  for (const id of damAnc) {
    if (sireAnc.has(id)) shared.add(id);
  }
  return [...shared];
}

export type PedigreeWalk = {
  id: string;
  tag: string;
  herdNumber: string | null;
  name: string | null;
  damId: string | null;
  sireId: string | null;
  dam: PedigreeWalk | null;
  sire: PedigreeWalk | null;
};

export function buildPedigreeTree(
  id: string,
  byId: Map<string, Omit<PedigreeWalk, 'dam' | 'sire'>>,
  depth = 3,
): PedigreeWalk | null {
  const row = byId.get(id);
  if (!row) return null;
  return {
    ...row,
    dam: depth > 0 && row.damId ? buildPedigreeTree(row.damId, byId, depth - 1) : null,
    sire: depth > 0 && row.sireId ? buildPedigreeTree(row.sireId, byId, depth - 1) : null,
  };
}
