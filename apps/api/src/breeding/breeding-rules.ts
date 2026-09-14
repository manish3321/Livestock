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
