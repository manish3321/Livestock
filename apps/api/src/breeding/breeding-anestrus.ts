import type { TaskPriority, TaskType } from '@farm/contracts';
import { atNepalHour } from '../common/nepal-time';

const DAY_MS = 24 * 60 * 60 * 1000;
const TARGET_DAYS_OPEN = 120;

export interface AnestrusInput {
  species: string;
  status: string;
  isPregnant: boolean;
  lactationStart: Date | null;
  lastHeatAt: Date | null;
  now: Date;
  voluntaryWaitingDays: number;
  herdAvgDailyYield: number;
  effectivePriceNpr: number;
  shortNo: string;
}

export interface AnestrusTask {
  type: TaskType;
  priority: TaskPriority;
  dueAt: Date;
  titleEn: string;
  titleNp: string;
  decision: boolean;
}

function atHour(base: Date, hour: number): Date {
  return atNepalHour(base, hour);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function costOfOpenDays(daysSinceCalving: number, yieldLitres: number, priceNpr: number): number {
  const extra = Math.max(0, daysSinceCalving - TARGET_DAYS_OPEN);
  return Math.round(extra * yieldLitres * priceNpr);
}

/** lastHeatAt must be the most recent heat since lactationStart, not lifetime. */
export function anestrusTasks(input: AnestrusInput): AnestrusTask[] {
  if (input.isPregnant) return [];
  if (input.status !== 'LACTATING' && input.status !== 'ACTIVE') return [];
  if (!input.lactationStart) return [];
  if (input.species !== 'BUFFALO' && input.species !== 'COW') return [];

  const daysSinceCalving = daysBetween(input.lactationStart, input.now);
  const quietFrom = input.lastHeatAt ?? input.lactationStart;
  const daysQuiet = daysBetween(quietFrom, input.now);
  const vwp = input.voluntaryWaitingDays;
  const out: AnestrusTask[] = [];
  const label = input.shortNo;

  if (daysSinceCalving >= vwp && !input.lastHeatAt) {
    out.push({
      type: 'HEAT_WATCH',
      priority: 'NORMAL',
      dueAt: atHour(input.now, 5),
      titleEn: `Heat watch ${label}`,
      titleNp: `${label} रजस्वला हेर्ने`,
      decision: false,
    });
  }

  if (daysQuiet >= 30 && input.species === 'BUFFALO') {
    out.push({
      type: 'SILENT_HEAT_CHECK',
      priority: 'NORMAL',
      dueAt: atHour(input.now, 4),
      titleEn: `Check ${label} between 4 and 7am — buffalo silent heat`,
      titleNp: `${label} बिहान ४ देखि ७ बजेसम्म हेर्नुहोस् — मौन रजस्वला`,
      decision: false,
    });
  }

  if (daysSinceCalving >= vwp + 90) {
    const cost = costOfOpenDays(daysSinceCalving, input.herdAvgDailyYield, input.effectivePriceNpr);
    out.push({
      type: 'ANESTRUS_DECISION',
      priority: 'HIGH',
      dueAt: input.now,
      titleEn: `${label} has not shown heat for ${daysQuiet} days. Delay is costing about NPR ${cost}.`,
      titleNp: `${label} लाई ${daysQuiet} दिन देखि गर्मी आएको छैन। ढिलाइ करिब रु ${cost} पर्छ।`,
      decision: true,
    });
    return out;
  }

  if (daysSinceCalving >= vwp + 60) {
    out.push({
      type: 'ANESTRUS_VET',
      priority: 'HIGH',
      dueAt: input.now,
      titleEn: `${label} — ${daysQuiet} days quiet. Call the vet.`,
      titleNp: `${label} — ${daysQuiet} दिन शान्त। पशु चिकित्सक बोलाउनुहोस्।`,
      decision: true,
    });
    return out;
  }

  if (daysSinceCalving >= vwp + 30) {
    out.push({
      type: 'ANESTRUS_MINERAL',
      priority: 'NORMAL',
      dueAt: input.now,
      titleEn: `${label} has not shown heat for ${daysQuiet} days. Try a daily mineral mixture for 3 weeks before calling the vet — it costs about NPR 400 and often works.`,
      titleNp: `${label} लाई ${daysQuiet} दिन देखि गर्मी आएको छैन। पशु चिकित्सक बोलाउनुअघि ३ हप्ता खनिज मिश्रण दिनुहोस् — करिब रु ४०० पर्छ र प्राय: काम गर्छ।`,
      decision: true,
    });
  }

  return out;
}
