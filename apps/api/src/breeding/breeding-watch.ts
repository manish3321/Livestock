import type {
  BreedingWatchDto,
  CountdownDto,
  CountdownKind,
  CountdownUrgency,
  ReproMilestoneDto,
  ReproNextEventDto,
  ReproStage,
  ReproTimelineDto,
  SpeciesConfigDto,
  WatchGroupDto,
  WatchGroupKey,
  WatchItemDto,
} from '@farm/contracts';
import { addDays, addHours } from './breeding-rules';
import { seqFromHerd } from './breeding-board';
import { monthsOfAge, wholeDays } from './repro-stage';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const FRESH_DAYS = 21;

export const WATCH_GROUP_ORDER: WatchGroupKey[] = [
  'CALVING_SOON',
  'FRESH',
  'WATCHING_HEAT',
  'BREED_NOW',
  'WAITING_CHECK',
  'TOO_SOON',
  'ON_PROTOCOL',
  'CARRYING',
  'HEIFERS',
  'DECISIONS',
];

export const STAGE_TO_WATCH_GROUP: Partial<Record<ReproStage, WatchGroupKey>> = {
  CALVING_IMMINENT: 'CALVING_SOON',
  DRY_PREGNANT: 'CALVING_SOON',
  PREGNANT_DRYOFF_DUE: 'CALVING_SOON',
  FRESH: 'FRESH',
  AWAITING_HEAT: 'WATCHING_HEAT',
  ANESTRUS_SUSPECTED: 'WATCHING_HEAT',
  IN_HEAT: 'BREED_NOW',
  SERVED_UNCONFIRMED: 'WAITING_CHECK',
  PREGNANCY_CHECK_DUE: 'WAITING_CHECK',
  VOLUNTARY_WAIT: 'TOO_SOON',
  UNDER_PROTOCOL: 'ON_PROTOCOL',
  PREGNANT_EARLY: 'CARRYING',
  HEIFER_READY: 'HEIFERS',
  REPEAT_BREEDER: 'DECISIONS',
  DO_NOT_BREED: 'DECISIONS',
};

const GROUP_META: Record<
  WatchGroupKey,
  { labelEn: string; labelNp: string; colour: WatchGroupDto['colour'] }
> = {
  CALVING_SOON: { labelEn: 'Calving soon', labelNp: 'बियाउने बेला', colour: 'BLUE' },
  FRESH: { labelEn: 'Fresh', labelNp: 'भर्खर ब्याएको', colour: 'GREY' },
  WATCHING_HEAT: { labelEn: 'Watching for heat', labelNp: 'गर्मी हेरिँदै', colour: 'YELLOW' },
  BREED_NOW: { labelEn: 'Breed now', labelNp: 'अहिले सेवा', colour: 'RED' },
  WAITING_CHECK: { labelEn: 'Waiting for pregnancy check', labelNp: 'गर्भ जाँच पर्खाइ', colour: 'BLUE' },
  TOO_SOON: { labelEn: 'Too soon to breed', labelNp: 'सेवा गर्न चाँडो', colour: 'GREY' },
  ON_PROTOCOL: { labelEn: 'On protocol', labelNp: 'प्रोटोकलमा', colour: 'PURPLE' },
  CARRYING: { labelEn: 'Carrying', labelNp: 'गर्भवती', colour: 'BLUE' },
  HEIFERS: { labelEn: 'Heifers', labelNp: 'बाच्छी', colour: 'AMBER' },
  DECISIONS: { labelEn: 'Needs a decision', labelNp: 'निर्णय चाहिन्छ', colour: 'AMBER' },
};

const STAGE_LABEL: Record<ReproStage, { en: string; np: string }> = {
  CALF: { en: 'Calf', np: 'बाच्छा' },
  HEIFER_READY: { en: 'Heifer ready', np: 'बाच्छी तयार' },
  VOLUNTARY_WAIT: { en: 'Too soon to breed', np: 'सेवा गर्न चाँडो' },
  AWAITING_HEAT: { en: 'Watching for heat', np: 'गर्मी हेरिँदै' },
  IN_HEAT: { en: 'In heat', np: 'गर्मीमा' },
  SERVED_UNCONFIRMED: { en: 'Waiting for check', np: 'जाँच पर्खाइ' },
  PREGNANCY_CHECK_DUE: { en: 'Pregnancy check due', np: 'गर्भ जाँच गर्नुपर्ने' },
  PREGNANT_EARLY: { en: 'Pregnant', np: 'गर्भवती' },
  PREGNANT_DRYOFF_DUE: { en: 'Dry-off due', np: 'दूध बन्द गर्नुपर्ने' },
  DRY_PREGNANT: { en: 'Dry, pregnant', np: 'सुक्खा गर्भवती' },
  CALVING_IMMINENT: { en: 'Calving imminent', np: 'ब्याउने बेला' },
  FRESH: { en: 'Fresh', np: 'भर्खर ब्याएको' },
  ANESTRUS_SUSPECTED: { en: 'Anestrus suspected', np: 'गर्मी नआएको शंका' },
  REPEAT_BREEDER: { en: 'Repeat breeder', np: 'दोहोर्याइ सेवा' },
  UNDER_PROTOCOL: { en: 'On protocol', np: 'प्रोटोकलमा' },
  DO_NOT_BREED: { en: 'Do not breed', np: 'प्रजनन नगर्ने' },
  NOT_BREEDING: { en: 'Not breeding', np: 'प्रजननमा छैन' },
};

export type WatchAnimal = {
  id: string;
  herdNumber: string | null;
  tag: string;
  name: string | null;
  species: string;
  stage: ReproStage;
  photoUrl: string | null;
  penName: string | null;
  penSortOrder: number | null;
  seqNo: number | null;
  shed: string | null;
  lactationStart: Date | null;
  dateOfBirth: Date | null;
  expectedCalvingDate: Date | null;
  lastHeatAt: Date | null;
  lastServiceAt: Date | null;
  pregnancyConfirmedAt: Date | null;
  protocolDay: number | null;
  protocolTotalDays: number | null;
  protocolNameEn: string | null;
  protocolNameNp: string | null;
};

export type TimelineTask = {
  titleEn: string;
  titleNp: string;
  dueAt: Date;
  type: string;
};

function isoDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
}

function clampPct(elapsed: number, total: number | null): number {
  if (total == null || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 1000) / 10));
}

export function countdownUrgency(args: {
  kind: CountdownKind;
  remaining: number;
  unit: 'DAYS' | 'HOURS';
  elapsed: number;
  total: number | null;
}): CountdownUrgency {
  if (args.kind === 'DAYS_QUIET') {
    return args.elapsed >= 30 ? 'SOON' : 'CALM';
  }
  if (args.remaining < 0) return 'OVERDUE';
  if (args.unit === 'HOURS' && args.remaining <= 6) return 'IMMINENT';
  if (args.unit === 'DAYS' && args.remaining <= 1) return 'IMMINENT';
  if (args.unit === 'DAYS' && args.remaining <= 7) return 'SOON';
  if (args.total != null && args.total > 0 && args.elapsed / args.total < 0.25) return 'CALM';
  if (args.unit === 'DAYS' && args.remaining > 30) return 'CALM';
  return 'NORMAL';
}

function countdown(partial: {
  kind: CountdownKind;
  eventEn: string;
  eventNp: string;
  targetDate: string | null;
  remaining: number;
  unit: 'DAYS' | 'HOURS';
  total: number | null;
  elapsed: number;
  labelEn: string;
  labelNp: string;
}): CountdownDto {
  const urgency = countdownUrgency(partial);
  return {
    ...partial,
    progressPct: clampPct(partial.elapsed, partial.total),
    urgency,
  };
}

function dimOf(animal: WatchAnimal, now: Date): number | null {
  if (!animal.lactationStart) return null;
  return wholeDays(animal.lactationStart, now);
}

function daysQuietOf(animal: WatchAnimal, now: Date): number {
  const from = animal.lastHeatAt ?? animal.lactationStart ?? animal.dateOfBirth;
  if (!from) return 0;
  return Math.max(0, wholeDays(from, now));
}

function cycleDayOf(animal: WatchAnimal, cycleDays: number, now: Date): number {
  const quiet = daysQuietOf(animal, now);
  if (cycleDays <= 0) return quiet;
  const day = quiet % cycleDays;
  return day === 0 && quiet > 0 ? cycleDays : Math.max(1, day || 1);
}

function daysToCalving(animal: WatchAnimal, now: Date): number | null {
  if (!animal.expectedCalvingDate) return null;
  return Math.ceil((animal.expectedCalvingDate.getTime() - now.getTime()) / DAY_MS);
}

export function countdownFor(
  animal: WatchAnimal,
  cfg: Pick<
    SpeciesConfigDto,
    | 'gestationDays'
    | 'voluntaryWaitingDays'
    | 'estrusCycleDays'
    | 'pregnancyCheckEarliestDays'
    | 'serviceWindowEndHours'
    | 'dryOffDaysBeforeCalving'
    | 'ageFirstServiceMonths'
  >,
  now: Date,
): { countdown: CountdownDto; contextEn: string; contextNp: string; sortKey: number } {
  const dim = dimOf(animal, now);
  const quiet = daysQuietOf(animal, now);
  const toCalving = daysToCalving(animal, now);

  switch (animal.stage) {
    case 'CALVING_IMMINENT':
    case 'DRY_PREGNANT':
    case 'PREGNANT_DRYOFF_DUE':
    case 'PREGNANT_EARLY': {
      const remaining = toCalving ?? 0;
      const elapsed = cfg.gestationDays - remaining;
      const cd = countdown({
        kind: 'DAYS_TO_EVENT',
        eventEn: 'calving',
        eventNp: 'ब्याउने',
        targetDate: animal.expectedCalvingDate ? isoDate(animal.expectedCalvingDate) : null,
        remaining,
        unit: 'DAYS',
        total: cfg.gestationDays,
        elapsed,
        labelEn:
          remaining < 0
            ? `${Math.abs(remaining)} days overdue`
            : `${remaining} days to calving`,
        labelNp: remaining < 0 ? `${Math.abs(remaining)} दिन ढिलो` : `ब्याउन ${remaining} दिन`,
      });
      return {
        countdown: cd,
        contextEn: cd.labelEn,
        contextNp: cd.labelNp,
        sortKey: remaining,
      };
    }
    case 'FRESH': {
      const elapsed = dim ?? 0;
      const remaining = FRESH_DAYS - elapsed;
      const cd = countdown({
        kind: 'ELAPSED_OF_TARGET',
        eventEn: 'fresh period',
        eventNp: 'नयाँ ब्याइ',
        targetDate: animal.lactationStart ? isoDate(addDays(animal.lactationStart, FRESH_DAYS)) : null,
        remaining,
        unit: 'DAYS',
        total: FRESH_DAYS,
        elapsed,
        labelEn: `${elapsed} of ${FRESH_DAYS} days`,
        labelNp: `${elapsed} / ${FRESH_DAYS} दिन`,
      });
      return { countdown: cd, contextEn: cd.labelEn, contextNp: cd.labelNp, sortKey: elapsed };
    }
    case 'VOLUNTARY_WAIT': {
      const elapsed = dim ?? 0;
      const remaining = cfg.voluntaryWaitingDays - elapsed;
      const cd = countdown({
        kind: 'ELAPSED_OF_TARGET',
        eventEn: 'voluntary wait',
        eventNp: 'पर्खाइ अवधि',
        targetDate: animal.lactationStart
          ? isoDate(addDays(animal.lactationStart, cfg.voluntaryWaitingDays))
          : null,
        remaining,
        unit: 'DAYS',
        total: cfg.voluntaryWaitingDays,
        elapsed,
        labelEn: `${elapsed} of ${cfg.voluntaryWaitingDays} days`,
        labelNp: `${elapsed} / ${cfg.voluntaryWaitingDays} दिन`,
      });
      return { countdown: cd, contextEn: cd.labelEn, contextNp: cd.labelNp, sortKey: -elapsed };
    }
    case 'IN_HEAT': {
      const end = animal.lastHeatAt
        ? addHours(animal.lastHeatAt, cfg.serviceWindowEndHours)
        : now;
      const remaining = Math.ceil((end.getTime() - now.getTime()) / HOUR_MS);
      const elapsed = cfg.serviceWindowEndHours - remaining;
      const cd = countdown({
        kind: 'HOURS_TO_DEADLINE',
        eventEn: 'service window',
        eventNp: 'सेवा समय',
        targetDate: isoDate(end),
        remaining,
        unit: 'HOURS',
        total: cfg.serviceWindowEndHours,
        elapsed,
        labelEn:
          remaining < 0
            ? 'service window closed'
            : `${remaining} hours remaining`,
        labelNp: remaining < 0 ? 'सेवा समय सकियो' : `${remaining} घण्टा बाँकी`,
      });
      return { countdown: cd, contextEn: cd.labelEn, contextNp: cd.labelNp, sortKey: remaining };
    }
    case 'ANESTRUS_SUSPECTED': {
      const cd = countdown({
        kind: 'DAYS_QUIET',
        eventEn: 'heat',
        eventNp: 'गर्मी',
        targetDate: null,
        remaining: quiet,
        unit: 'DAYS',
        total: null,
        elapsed: quiet,
        labelEn: `${quiet} days quiet — silent heat likely`,
        labelNp: `${quiet} दिन शान्त — मौन गर्मी हुनसक्छ`,
      });
      return { countdown: cd, contextEn: cd.labelEn, contextNp: cd.labelNp, sortKey: -quiet };
    }
    case 'AWAITING_HEAT': {
      const day = cycleDayOf(animal, cfg.estrusCycleDays, now);
      const remaining = cfg.estrusCycleDays - day;
      const dueToday = day >= cfg.estrusCycleDays - 1;
      const cd = countdown({
        kind: 'CYCLE_DAY',
        eventEn: 'heat',
        eventNp: 'गर्मी',
        targetDate: animal.lastHeatAt
          ? isoDate(addDays(animal.lastHeatAt, cfg.estrusCycleDays))
          : null,
        remaining,
        unit: 'DAYS',
        total: cfg.estrusCycleDays,
        elapsed: day,
        labelEn: dueToday
          ? `day ${day} of cycle — due today`
          : `day ${day} of cycle`,
        labelNp: dueToday
          ? `चक्रको दिन ${day} — आज आउनुपर्छ`
          : `चक्रको दिन ${day}`,
      });
      return { countdown: cd, contextEn: cd.labelEn, contextNp: cd.labelNp, sortKey: -quiet };
    }
    case 'SERVED_UNCONFIRMED':
    case 'PREGNANCY_CHECK_DUE': {
      const since = animal.lastServiceAt ? wholeDays(animal.lastServiceAt, now) : 0;
      const remaining = cfg.pregnancyCheckEarliestDays - since;
      const checkAt = animal.lastServiceAt
        ? addDays(animal.lastServiceAt, cfg.pregnancyCheckEarliestDays)
        : now;
      const dueNow = remaining <= 0;
      const cd = countdown({
        kind: 'DAYS_TO_EVENT',
        eventEn: 'pregnancy check',
        eventNp: 'गर्भ जाँच',
        targetDate: isoDate(checkAt),
        remaining,
        unit: 'DAYS',
        total: cfg.pregnancyCheckEarliestDays,
        elapsed: since,
        labelEn: dueNow
          ? `bred ${since} days ago — check now`
          : `bred ${since} days ago — ${remaining} days to go`,
        labelNp: dueNow
          ? `${since} दिनअघि सेवा — अहिले जाँच`
          : `${since} दिनअघि सेवा — ${remaining} दिन बाँकी`,
      });
      return { countdown: cd, contextEn: cd.labelEn, contextNp: cd.labelNp, sortKey: -since };
    }
    case 'UNDER_PROTOCOL': {
      const total = animal.protocolTotalDays ?? 0;
      const day = animal.protocolDay ?? 0;
      const remaining = total - day;
      const nameEn = animal.protocolNameEn ?? 'Protocol';
      const nameNp = animal.protocolNameNp ?? 'प्रोटोकल';
      const cd = countdown({
        kind: 'PROTOCOL_DAY',
        eventEn: 'protocol',
        eventNp: 'प्रोटोकल',
        targetDate: null,
        remaining,
        unit: 'DAYS',
        total,
        elapsed: day,
        labelEn: `${nameEn} — day ${day} of ${total}`,
        labelNp: `${nameNp} — दिन ${day} / ${total}`,
      });
      return { countdown: cd, contextEn: cd.labelEn, contextNp: cd.labelNp, sortKey: -day };
    }
    case 'HEIFER_READY': {
      const age = monthsOfAge(animal.dateOfBirth, now) ?? 0;
      const remaining = cfg.ageFirstServiceMonths - age;
      const cd = countdown({
        kind: 'ELAPSED_OF_TARGET',
        eventEn: 'first service',
        eventNp: 'पहिलो सेवा',
        targetDate: null,
        remaining,
        unit: 'DAYS',
        total: cfg.ageFirstServiceMonths,
        elapsed: age,
        labelEn: `${age} months old`,
        labelNp: `${age} महिना`,
      });
      return { countdown: cd, contextEn: cd.labelEn, contextNp: cd.labelNp, sortKey: -age };
    }
    default: {
      const cd = countdown({
        kind: 'DAYS_QUIET',
        eventEn: 'decision',
        eventNp: 'निर्णय',
        targetDate: null,
        remaining: 0,
        unit: 'DAYS',
        total: null,
        elapsed: 0,
        labelEn: STAGE_LABEL[animal.stage].en,
        labelNp: STAGE_LABEL[animal.stage].np,
      });
      return { countdown: cd, contextEn: cd.labelEn, contextNp: cd.labelNp, sortKey: 0 };
    }
  }
}

export function toWatchItem(
  animal: WatchAnimal,
  cfg: SpeciesConfigDto,
  now: Date,
): WatchItemDto & { sortKey: number } {
  const built = countdownFor(animal, cfg, now);
  return {
    animalId: animal.id,
    shortNo: animal.herdNumber ?? animal.tag,
    name: animal.name,
    species: animal.species,
    stage: animal.stage,
    penName: animal.penName ?? animal.shed ?? '—',
    penSortOrder: animal.penSortOrder ?? 999,
    seqNo: animal.seqNo ?? seqFromHerd(animal.herdNumber),
    photoUrl: animal.photoUrl,
    contextEn: built.contextEn,
    contextNp: built.contextNp,
    countdown: built.countdown,
    sortKey: built.sortKey,
  };
}

export function compareWatchItems(
  a: WatchItemDto & { sortKey: number },
  b: WatchItemDto & { sortKey: number },
): number {
  if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
  if (a.penSortOrder !== b.penSortOrder) return a.penSortOrder - b.penSortOrder;
  if (a.seqNo !== b.seqNo) return a.seqNo - b.seqNo;
  return a.shortNo.localeCompare(b.shortNo);
}

export function buildBreedingWatch(input: {
  animals: WatchAnimal[];
  configBySpecies: Map<string, SpeciesConfigDto>;
  now?: Date;
  stage?: ReproStage;
}): BreedingWatchDto {
  const now = input.now ?? new Date();
  const buckets = new Map<WatchGroupKey, Array<WatchItemDto & { sortKey: number }>>();
  let total = 0;
  for (const animal of input.animals) {
    if (input.stage && animal.stage !== input.stage) continue;
    const groupKey = STAGE_TO_WATCH_GROUP[animal.stage];
    if (!groupKey) continue;
    const cfg = input.configBySpecies.get(animal.species);
    if (!cfg) continue;
    const item = toWatchItem(animal, cfg, now);
    const list = buckets.get(groupKey) ?? [];
    list.push(item);
    buckets.set(groupKey, list);
    total += 1;
  }

  const groups: WatchGroupDto[] = [];
  for (const key of WATCH_GROUP_ORDER) {
    const items = (buckets.get(key) ?? []).sort(compareWatchItems);
    if (items.length === 0) continue;
    const meta = GROUP_META[key];
    groups.push({
      key,
      labelEn: meta.labelEn,
      labelNp: meta.labelNp,
      colour: meta.colour,
      items: items.map((row) => {
        const { sortKey: _ignored, ...item } = row;
        return item;
      }),
    });
  }
  return { totalAnimals: total, groups };
}

export function buildReproTimeline(input: {
  animal: WatchAnimal;
  cfg: SpeciesConfigDto;
  tasks: TimelineTask[];
  now?: Date;
}): ReproTimelineDto {
  const now = input.now ?? new Date();
  const { animal, cfg } = input;
  const origin = animal.lactationStart ?? animal.dateOfBirth ?? now;
  const serviceAt = animal.lastServiceAt;
  const edd = animal.expectedCalvingDate;
  const dryOffAt =
    edd != null ? addDays(edd, -cfg.dryOffDaysBeforeCalving) : null;
  const dayOf = (date: Date | null) => (date ? wholeDays(origin, date) : null);
  const remainingOf = (date: Date | null, completed: boolean) => {
    if (completed || !date) return null;
    return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
  };

  const calvedDone = Boolean(animal.lactationStart && animal.lactationStart.getTime() <= now.getTime());
  const bredDone = Boolean(serviceAt && serviceAt.getTime() <= now.getTime());
  const confirmedDone = Boolean(
    animal.pregnancyConfirmedAt && animal.pregnancyConfirmedAt.getTime() <= now.getTime(),
  );
  const dryDone = Boolean(dryOffAt && dryOffAt.getTime() <= now.getTime());
  const calvingDone = Boolean(edd && edd.getTime() <= now.getTime());

  const milestones: ReproMilestoneDto[] = [
    {
      key: 'CALVED',
      labelEn: 'calved',
      labelNp: 'ब्याएको',
      date: animal.lactationStart ? isoDate(animal.lactationStart) : null,
      day: animal.lactationStart ? 0 : null,
      remainingDays: remainingOf(animal.lactationStart, calvedDone),
      completed: calvedDone,
    },
    {
      key: 'BRED',
      labelEn: 'bred',
      labelNp: 'सेवा',
      date: serviceAt ? isoDate(serviceAt) : null,
      day: dayOf(serviceAt),
      remainingDays: remainingOf(serviceAt, bredDone),
      completed: bredDone,
    },
    {
      key: 'CONFIRMED',
      labelEn: 'confirmed',
      labelNp: 'पुष्टि',
      date: animal.pregnancyConfirmedAt ? isoDate(animal.pregnancyConfirmedAt) : null,
      day: dayOf(animal.pregnancyConfirmedAt),
      remainingDays: remainingOf(animal.pregnancyConfirmedAt, confirmedDone),
      completed: confirmedDone,
    },
    {
      key: 'DRY_OFF',
      labelEn: 'dry off',
      labelNp: 'दूध बन्द',
      date: dryOffAt ? isoDate(dryOffAt) : null,
      day: dayOf(dryOffAt),
      remainingDays: remainingOf(dryOffAt, dryDone),
      completed: dryDone,
    },
    {
      key: 'CALVING',
      labelEn: 'calving',
      labelNp: 'ब्याउने',
      date: edd ? isoDate(edd) : null,
      day: dayOf(edd),
      remainingDays: remainingOf(edd, calvingDone),
      completed: calvingDone,
    },
  ];

  const end = edd ?? now;
  const span = Math.max(1, end.getTime() - origin.getTime());
  const here = Math.min(1, Math.max(0, (now.getTime() - origin.getTime()) / span));
  const pregnant = animal.stage.startsWith('PREGNANT') || animal.stage === 'DRY_PREGNANT' || animal.stage === 'CALVING_IMMINENT';
  const daysPregnant =
    serviceAt != null ? wholeDays(serviceAt, now) : edd != null ? cfg.gestationDays - (daysToCalving(animal, now) ?? 0) : null;
  const labels = STAGE_LABEL[animal.stage];
  const headlineEn =
    pregnant && daysPregnant != null
      ? `${labels.en} · day ${daysPregnant} of ${cfg.gestationDays}`
      : labels.en;
  const headlineNp =
    pregnant && daysPregnant != null
      ? `${labels.np} · दिन ${daysPregnant} / ${cfg.gestationDays}`
      : labels.np;

  const next: ReproNextEventDto[] = [...input.tasks]
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
    .slice(0, 3)
    .map((row) => ({
      titleEn: row.titleEn,
      titleNp: row.titleNp,
      dueAt: row.dueAt.toISOString(),
      type: row.type,
    }));

  return {
    animalId: animal.id,
    shortNo: animal.herdNumber ?? animal.tag,
    name: animal.name,
    stage: animal.stage,
    stageLabelEn: labels.en,
    stageLabelNp: labels.np,
    cycleDay: daysPregnant,
    cycleTotal: pregnant ? cfg.gestationDays : null,
    headlineEn,
    headlineNp,
    youAreHerePct: Math.round(here * 1000) / 10,
    milestones,
    next,
  };
}
