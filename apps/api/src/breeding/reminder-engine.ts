import type { ReproStage, Species, SpeciesConfigDto } from '@farm/contracts';
import { atNepalHour } from '../common/nepal-time';
import { addDays, addHours, derivedSlotId } from './breeding-rules';
import {
  REMINDER_RULE_SLOT,
  SYSTEM_REMINDER_RULES,
  type ReminderRuleDef,
} from './reminder-catalog';

export type ReminderContext = {
  event?: string;
  enteredStage?: ReproStage;
  species: Species;
  shortNo: string;
  now: Date;
  /** Heat / service / calving / feeding time. */
  anchorAt: Date;
  /** UUID used to derive idempotent sourceRefId. */
  anchorId: string;
  animalId: string;
  status?: string;
  lactationStart?: Date | null;
  expectedCalvingDate?: Date | null;
  placentaExpelled?: boolean;
  wasBred?: boolean;
  colostrumHours?: number;
  serviceCount?: number;
  daysQuiet?: number;
  daysSinceService?: number;
  costOfDelay?: number;
  aiCost?: number;
  inVoluntaryWait?: boolean;
  vars?: Record<string, string | number>;
};

export type PlannedReminder = {
  code: string;
  taskType: ReminderRuleDef['taskType'];
  priority: ReminderRuleDef['priority'];
  dueAt: Date;
  titleEn: string;
  titleNp: string;
  channels: ReminderRuleDef['channels'];
  actionKeys: string[];
  sourceRefId: string;
  sourceRefType: string;
  repeating: boolean;
  maxRepeats?: number;
};

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] == null ? `{${key}}` : String(vars[key]),
  );
}

export function resolveFarmRules(
  system: ReminderRuleDef[],
  farmRows: ReminderRuleDef[],
): ReminderRuleDef[] {
  const byCode = new Map<string, ReminderRuleDef>();
  for (const row of system) byCode.set(row.code, row);
  for (const row of farmRows) byCode.set(row.code, row);
  return [...byCode.values()].filter((row) => row.active !== false);
}

/** Species-dependent offsets come from SpeciesConfig, never from a hardcoded table cell. */
export function resolveOffset(
  rule: ReminderRuleDef,
  cfg: SpeciesConfigDto,
): { days: number; hours: number } {
  switch (rule.code) {
    case 'VWP_ENDING':
      return { days: cfg.voluntaryWaitingDays - 3, hours: 0 };
    case 'HEAT_WATCH_CYCLE':
    case 'HEAT_RETURN_WATCH':
      return { days: cfg.estrusCycleDays - 2, hours: 0 };
    case 'SERVICE_WINDOW_OPEN':
      return { days: 0, hours: cfg.serviceWindowStartHours };
    case 'SERVICE_WINDOW_CLOSING':
      return { days: 0, hours: cfg.serviceWindowEndHours - 3 };
    case 'SERVICE_WINDOW_MISSED':
      return { days: 0, hours: cfg.serviceWindowEndHours };
    case 'PREG_CHECK_DUE':
      return { days: cfg.pregnancyCheckEarliestDays, hours: 0 };
    case 'DRY_OFF_DUE':
      return { days: -cfg.dryOffDaysBeforeCalving, hours: 0 };
    case 'DRY_OFF_OVERDUE':
      return { days: -(cfg.dryOffDaysBeforeCalving - 10), hours: 0 };
    case 'CALVING_LATE':
      return { days: cfg.gestationVarianceDays, hours: 0 };
    default:
      return { days: rule.offsetDays ?? 0, hours: rule.offsetHours ?? 0 };
  }
}

function anchorAt(rule: ReminderRuleDef, ctx: ReminderContext, cfg: SpeciesConfigDto): Date | null {
  const edd = [
    'DRY_OFF_DUE',
    'DRY_OFF_OVERDUE',
    'FEED_TRANSITION',
    'CALVING_WATCH_7',
    'CALVING_WATCH_3',
    'CALVING_WATCH_1',
    'CALVING_TODAY',
    'CALVING_OVERDUE',
    'CALVING_LATE',
  ];
  if (edd.includes(rule.code)) return ctx.expectedCalvingDate ?? null;
  if (rule.code === 'VWP_ENDING') return ctx.lactationStart ?? null;
  if (
    rule.code === 'ANESTRUS_MINERAL' ||
    rule.code === 'ANESTRUS_VET' ||
    rule.code === 'ANESTRUS_DECISION'
  ) {
    if (!ctx.lactationStart) return null;
    return addDays(ctx.lactationStart, cfg.voluntaryWaitingDays);
  }
  return ctx.anchorAt;
}

export function matchesRule(rule: ReminderRuleDef, ctx: ReminderContext): boolean {
  if (rule.active === false) return false;
  if (rule.species && rule.species.length > 0 && !rule.species.includes(ctx.species)) return false;
  const stageHit = rule.triggerStage != null && rule.triggerStage === ctx.enteredStage;
  const eventHit = rule.triggerEvent != null && rule.triggerEvent === ctx.event;
  if (!stageHit && !eventHit) return false;
  if (rule.code === 'RETAINED_PLACENTA' && ctx.placentaExpelled) return false;
  if (rule.code === 'HEAT_WATCH_CYCLE' && ctx.wasBred) return false;
  if (rule.code.startsWith('SERVICE_WINDOW') && (ctx.wasBred || ctx.inVoluntaryWait)) return false;
  if (rule.code === 'HEAT_WATCH_CYCLE' && ctx.inVoluntaryWait) return false;
  if (rule.code === 'DRY_OFF_OVERDUE' && ctx.status === 'DRY') return false;
  if (rule.code === 'REPEAT_BREEDER_FLAG' && (ctx.serviceCount ?? 0) < 3) return false;
  return true;
}

export function dueAtFor(
  rule: ReminderRuleDef,
  ctx: ReminderContext,
  cfg: SpeciesConfigDto,
): Date | null {
  const start = anchorAt(rule, ctx, cfg);
  if (!start) return null;
  const { days, hours } = resolveOffset(rule, cfg);
  let due = addHours(addDays(start, days), hours);
  if (rule.fireAtHour != null && hours === 0) {
    due = atNepalHour(due, rule.fireAtHour);
  }
  return due;
}

export function planReminders(
  rules: ReminderRuleDef[],
  ctx: ReminderContext,
  cfg: SpeciesConfigDto,
): PlannedReminder[] {
  const vars: Record<string, string | number> = {
    shortNo: ctx.shortNo,
    daysQuiet: ctx.daysQuiet ?? 0,
    n: ctx.daysSinceService ?? 0,
    costOfDelay: ctx.costOfDelay ?? 0,
    serviceCount: ctx.serviceCount ?? 0,
    aiCost: ctx.aiCost ?? 0,
    ...ctx.vars,
  };
  const out: PlannedReminder[] = [];
  for (const rule of rules) {
    if (!matchesRule(rule, ctx)) continue;
    const dueAt = dueAtFor(rule, ctx, cfg);
    if (!dueAt) continue;
    const slot = REMINDER_RULE_SLOT[rule.code] ?? 1;
    out.push({
      code: rule.code,
      taskType: rule.taskType,
      priority: rule.priority,
      dueAt,
      titleEn: interpolate(rule.titleEn, vars),
      titleNp: interpolate(rule.titleNp, vars),
      channels: rule.channels,
      actionKeys: rule.actionKeys ?? [],
      sourceRefType: `rule:${rule.code}`,
      sourceRefId: derivedSlotId(ctx.anchorId, slot),
      repeating: Boolean(rule.repeatEveryDays),
      maxRepeats: rule.maxRepeats,
    });
  }
  return out;
}

export function systemRules(): ReminderRuleDef[] {
  return SYSTEM_REMINDER_RULES;
}
