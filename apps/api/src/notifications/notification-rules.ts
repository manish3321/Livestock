import type { TaskPriority, TaskType } from '@farm/contracts';

export const MAX_NON_CRITICAL_PER_DAY = 5;
export const QUIET_START_HOUR = 20;
export const QUIET_END_HOUR = 5;
export const SILENT_HEAT_OPT_IN_HOUR = 4;
export const ESCALATE_MANAGER_MS = 30 * 60 * 1000;
export const ESCALATE_OWNER_MS = 60 * 60 * 1000;
export const SMS_UCS2_CHARS_PER_SEGMENT = 70;
export const SMS_GSM7_CHARS_PER_SEGMENT = 160;
export const SMS_COST_NPR = 1;
export const DISMISSALS_BEFORE_MUTE_OFFER = 3;
export const OVERDUE_HIGH_MS = 24 * 60 * 60 * 1000;

/** Section 9.3 — urgency used when a generator did not set one. */
export const TRIGGER_CATALOGUE: Record<
  TaskType,
  { urgency: TaskPriority; sms: boolean }
> = {
  COLOSTRUM_FEED: { urgency: 'CRITICAL', sms: true },
  CALVING_WATCH: { urgency: 'CRITICAL', sms: true },
  VET_URGENT: { urgency: 'CRITICAL', sms: true },
  POSTPARTUM_CHECK: { urgency: 'HIGH', sms: false },
  HEAT_WATCH: { urgency: 'HIGH', sms: false },
  SILENT_HEAT_CHECK: { urgency: 'NORMAL', sms: false },
  SERVICE_WINDOW: { urgency: 'HIGH', sms: false },
  PREGNANCY_CHECK: { urgency: 'HIGH', sms: false },
  DRY_OFF: { urgency: 'HIGH', sms: false },
  VACCINATION_DUE: { urgency: 'HIGH', sms: false },
  MEDICATION_DOSE: { urgency: 'HIGH', sms: false },
  MILK_WITHHOLD_END: { urgency: 'NORMAL', sms: false },
  YIELD_DROP: { urgency: 'HIGH', sms: false },
  STOCK_REORDER: { urgency: 'NORMAL', sms: false },
  LOT_EXPIRING: { urgency: 'NORMAL', sms: false },
  MISSING_PRODUCTION: { urgency: 'LOW', sms: false },
  STOCK_RECONCILE: { urgency: 'NORMAL', sms: false },
  TANK_VARIANCE: { urgency: 'HIGH', sms: false },
  APPLY_MARKER: { urgency: 'HIGH', sms: false },
  REMOVE_MARKER: { urgency: 'HIGH', sms: false },
  RETAG_REQUIRED: { urgency: 'HIGH', sms: false },
  TREATMENT_FOLLOWUP: { urgency: 'HIGH', sms: false },
  REPEAT_BREEDER: { urgency: 'HIGH', sms: false },
};

/**
 * 9.3 heat-stress has no TaskType and no weather source in this phase.
 * Keep it in the catalogue; do not invent a weather fetch.
 */
export const HEAT_STRESS_TRIGGER = {
  id: 'HEAT_STRESS',
  when: 'THI > 78',
  urgency: 'HIGH' as const,
  sms: false,
} as const;

export function nepalHour(now: Date, timeZone = 'Asia/Kathmandu'): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).find((p) => p.type === 'hour')?.value;
  return Number(hour ?? '0');
}

export function nepalCalendarDate(now: Date, timeZone = 'Asia/Kathmandu'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function nepalDayBounds(now: Date): { start: Date; end: Date } {
  const date = nepalCalendarDate(now);
  const start = new Date(`${date}T00:00:00+05:45`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function nepalMonthBounds(now: Date): { start: Date; end: Date } {
  const [year, month] = nepalCalendarDate(now).split('-').map(Number);
  const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+05:45`);
  const nextMonth = month === 12 ? 1 : month! + 1;
  const nextYear = month === 12 ? year! + 1 : year!;
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+05:45`);
  return { start, end };
}

export function isOverdueHigh(dueAt: Date, now: Date): boolean {
  return now.getTime() - dueAt.getTime() >= OVERDUE_HIGH_MS;
}

export function isQuietHours(hour: number): boolean {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

export function shouldHoldUntilMorning(input: {
  priority: string;
  hour: number;
  type: string;
  silentHeatOptIn?: boolean;
}): boolean {
  if (input.priority === 'CRITICAL') return false;
  if (
    input.type === 'SILENT_HEAT_CHECK' &&
    input.silentHeatOptIn &&
    input.hour === SILENT_HEAT_OPT_IN_HOUR
  ) {
    return false;
  }
  return isQuietHours(input.hour);
}

export function remainingNonCriticalSlots(alreadySent: number): number {
  return Math.max(0, MAX_NON_CRITICAL_PER_DAY - alreadySent);
}

export function suppressNonCritical(alreadySent: number, priority: string): boolean {
  if (priority === 'CRITICAL') return false;
  return alreadySent >= MAX_NON_CRITICAL_PER_DAY;
}

export type GroupableTask = {
  id: string;
  type: string;
  titleEn: string;
  titleNp: string;
  priority: string;
};

export type TaskGroup = {
  type: string;
  priority: string;
  tasks: GroupableTask[];
  titleEn: string;
  titleNp: string;
};

export function groupSameType(tasks: GroupableTask[]): TaskGroup[] {
  const buckets = new Map<string, GroupableTask[]>();
  for (const task of tasks) {
    const key = `${task.type}:${diseaseKey(task.titleEn)}`;
    const list = buckets.get(key) ?? [];
    list.push(task);
    buckets.set(key, list);
  }
  return [...buckets.values()].map((group) => {
    const first = group[0]!;
    const disease = diseaseKey(first.titleEn);
    const n = group.length;
    if (n === 1) {
      return {
        type: first.type,
        priority: highestPriority(group),
        tasks: group,
        titleEn: first.titleEn,
        titleNp: first.titleNp,
      };
    }
    return {
      type: first.type,
      priority: highestPriority(group),
      tasks: group,
      titleEn: groupedTitleEn(first.type, n, disease),
      titleNp: groupedTitleNp(first.type, n, disease),
    };
  });
}

function diseaseKey(titleEn: string): string {
  const upper = titleEn.toUpperCase();
  for (const name of ['FMD', 'HS', 'BQ', 'BRUCELLOSIS', 'ANTHRAX', 'THEILERIA', 'NEWCASTLE']) {
    if (upper.includes(name)) return name;
  }
  return '';
}

function groupedTitleEn(type: string, n: number, disease: string): string {
  if (type === 'VACCINATION_DUE' && disease) return `${n} animals due for ${disease}`;
  if (type === 'VACCINATION_DUE') return `${n} animals due for vaccination`;
  return `${n} animals: ${type.replace(/_/g, ' ').toLowerCase()}`;
}

function groupedTitleNp(type: string, n: number, disease: string): string {
  if (type === 'VACCINATION_DUE' && disease) return `${n} पशुलाई ${disease} खोप`;
  if (type === 'VACCINATION_DUE') return `${n} पशुलाई खोप`;
  return `${n} पशु — ${type}`;
}

function highestPriority(group: GroupableTask[]): string {
  const rank = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  return [...group].sort(
    (a, b) => (rank[a.priority as keyof typeof rank] ?? 9) - (rank[b.priority as keyof typeof rank] ?? 9),
  )[0]!.priority;
}

const GSM7 =
  /^[\x00-\x7F€£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà\n\r ]*$/;

export function smsEncoding(text: string): {
  encoding: 'GSM7' | 'UCS2';
  charsPerSegment: number;
  segments: number;
} {
  const unicode = !GSM7.test(text);
  const charsPerSegment = unicode ? SMS_UCS2_CHARS_PER_SEGMENT : SMS_GSM7_CHARS_PER_SEGMENT;
  return {
    encoding: unicode ? 'UCS2' : 'GSM7',
    charsPerSegment,
    segments: Math.max(1, Math.ceil(text.length / charsPerSegment)),
  };
}

export function smsAllowed(input: {
  priority: string;
  overdue?: boolean;
  sentThisMonth: number;
  monthlyCap: number;
}): boolean {
  if (input.sentThisMonth >= input.monthlyCap) return false;
  if (input.priority === 'CRITICAL') return true;
  if (input.priority === 'HIGH' && input.overdue) return true;
  return false;
}

export function offerMute(dismissalsOfType: number): boolean {
  return dismissalsOfType >= DISMISSALS_BEFORE_MUTE_OFFER;
}

export function escalationTarget(
  sentAt: Date,
  now: Date,
  alreadyEscalatedTo: string | null,
): 'MANAGER' | 'OWNER' | null {
  const elapsed = now.getTime() - sentAt.getTime();
  if (elapsed >= ESCALATE_OWNER_MS && alreadyEscalatedTo !== 'OWNER') return 'OWNER';
  if (elapsed >= ESCALATE_MANAGER_MS && !alreadyEscalatedTo) return 'MANAGER';
  return null;
}

/** Digit-by-digit splice. Never TTS. */
export function spliceDigits(value: string): string[] {
  return [...value.replace(/[^0-9]/g, '')].map((d) => `digit-${d}`);
}

const CLIP_BY_TYPE: Record<string, string> = {
  COLOSTRUM_FEED: 'colostrum',
  CALVING_WATCH: 'calving-today',
  VET_URGENT: 'vet-urgent',
  POSTPARTUM_CHECK: 'postpartum',
  HEAT_WATCH: 'heat-watch',
  SILENT_HEAT_CHECK: 'silent-heat',
  SERVICE_WINDOW: 'service-now',
  PREGNANCY_CHECK: 'pregnancy-check',
  DRY_OFF: 'dry-off',
  VACCINATION_DUE: 'vaccination-due',
  MEDICATION_DOSE: 'medication-dose',
  MILK_WITHHOLD_END: 'milk-withhold-end',
  YIELD_DROP: 'yield-drop',
  STOCK_REORDER: 'low-stock',
  LOT_EXPIRING: 'lot-expiring',
  MISSING_PRODUCTION: 'missing-milk',
  STOCK_RECONCILE: 'low-stock',
  TANK_VARIANCE: 'tank-variance',
  APPLY_MARKER: 'apply-marker',
  REMOVE_MARKER: 'remove-marker',
  RETAG_REQUIRED: 'retag',
  TREATMENT_FOLLOWUP: 'follow-up',
  REPEAT_BREEDER: 'repeat-breeder',
};

export function voiceClipsFor(input: {
  type: string;
  titleEn?: string;
  herdNumber?: string | null;
  count?: number;
}): string[] {
  const clips: string[] = [];
  if ((input.count ?? 1) > 1) clips.push('animals-due');
  clips.push(CLIP_BY_TYPE[input.type] ?? 'open-form');
  const disease = input.titleEn ? diseaseKey(input.titleEn).toLowerCase() : '';
  if (disease) clips.push('for', disease);
  if (input.herdNumber) clips.push('number-is', ...spliceDigits(input.herdNumber));
  return clips;
}

/** Native-speaker clip list. Record these; splice digits. Do not TTS Nepali. */
export const VOICE_CLIPS = [
  'colostrum',
  'calving-today',
  'calving-soon',
  'retained-placenta',
  'postpartum',
  'heat-watch',
  'silent-heat',
  'check-buffalo',
  'service-now',
  'pregnancy-check',
  'dry-off',
  'vaccination-due',
  'medication-dose',
  'vet-urgent',
  'milk-withhold-end',
  'low-stock',
  'lot-expiring',
  'yield-drop',
  'tank-variance',
  'apply-marker',
  'remove-marker',
  'retag',
  'follow-up',
  'repeat-breeder',
  'missing-milk',
  'heat-stress',
  'overdue',
  'animals-due',
  'for',
  'fmd',
  'hs',
  'bq',
  'brucellosis',
  'anthrax',
  'number-is',
  'open-form',
  'escalate-manager',
  'escalate-owner',
  ...Array.from({ length: 10 }, (_, i) => `digit-${i}`),
] as const;
