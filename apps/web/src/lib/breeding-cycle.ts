import type { SpeciesConfigDto } from '@farm/contracts';
import type { BreedingDto, HeatLogDto } from '../api/breeding';

export const BREEDING_STAGES = ['heat', 'service', 'pd', 'calving', 'colostrum'] as const;
export type BreedingStage = (typeof BREEDING_STAGES)[number];

export const DESK_FOCUSES = [
  'all',
  'window',
  'heatWatch',
  'pd',
  'calving',
  'colostrum',
  'open',
  'observers',
] as const;
export type DeskFocus = (typeof DESK_FOCUSES)[number];

export type BreedingWorkKind =
  | 'window'
  | 'heatWatch'
  | 'pd'
  | 'calving'
  | 'colostrum'
  | 'open'
  | 'repeat'
  | 'threeHeats';

export interface BreedingWorkItem {
  id: string;
  kind: BreedingWorkKind;
  animalId: string;
  animalLabel: string;
  form: BreedingStage;
  breedingId?: string;
  sortAt: number;
}

export interface BreedingFemale {
  id: string;
  tag: string;
  herdNumber?: string | null;
  name: string | null;
  species: string;
  isPregnant?: boolean;
}

export const FALLBACK_BREEDING_CFG = {
  serviceWindowStartHours: 12,
  serviceWindowEndHours: 18,
  estrusCycleDays: 21,
  pregnancyCheckEarliestDays: 45,
  dryOffDaysBeforeCalving: 60,
  gestationDays: 280,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const CLOSED = new Set(['DELIVERED', 'FAILED']);
const OPEN_STATUSES = new Set(['PREGNANT', 'OPEN', 'INCONCLUSIVE']);

const WORK_ORDER: BreedingWorkKind[] = [
  'colostrum',
  'window',
  'calving',
  'pd',
  'heatWatch',
  'threeHeats',
  'repeat',
  'open',
];

export function parseBreedingStage(value: string | null | undefined): BreedingStage | '' {
  if (value && (BREEDING_STAGES as readonly string[]).includes(value)) {
    return value as BreedingStage;
  }
  return '';
}

export function parseDeskFocus(value: string | null | undefined): DeskFocus {
  if (value && (DESK_FOCUSES as readonly string[]).includes(value)) {
    return value as DeskFocus;
  }
  return 'all';
}

export function breedingPath(opts: {
  animalId?: string;
  form?: BreedingStage;
  breedingId?: string;
  focus?: DeskFocus;
  taskId?: string;
} = {}): string {
  const query = new URLSearchParams();
  if (opts.animalId) query.set('animalId', opts.animalId);
  if (opts.form) query.set('form', opts.form);
  if (opts.breedingId) query.set('breedingId', opts.breedingId);
  if (opts.focus && opts.focus !== 'all') query.set('focus', opts.focus);
  if (opts.taskId) query.set('taskId', opts.taskId);
  const serialized = query.toString();
  return serialized ? `/breeding?${serialized}` : '/breeding';
}

export function cfgForSpecies(
  species: string | undefined,
  configBySpecies: Map<string, SpeciesConfigDto>,
) {
  if (species) {
    const row = configBySpecies.get(species);
    if (row) return row;
  }
  return FALLBACK_BREEDING_CFG;
}

export function animalLabel(
  female: BreedingFemale | undefined,
  fallback?: string | null,
): string {
  if (female) {
    const number = female.herdNumber ?? female.tag;
    return female.name ? `${number} · ${female.name}` : number;
  }
  return fallback || '—';
}

export function suggestedStage(
  animalId: string,
  records: BreedingDto[],
  heats: HeatLogDto[],
  config: Pick<
    typeof FALLBACK_BREEDING_CFG,
    'serviceWindowStartHours' | 'serviceWindowEndHours' | 'pregnancyCheckEarliestDays'
  >,
  now = new Date(),
): BreedingStage {
  const herRecords = recordsFor(animalId, records);
  const latest = herRecords[0];
  const latestHeat = heatsFor(animalId, heats)[0];

  if (latest?.pregnancyStatus === 'DELIVERED' && !latest.colostrumFed) return 'colostrum';
  if (latest && !CLOSED.has(latest.pregnancyStatus) && dueWithinDays(latest, 7, now)) {
    return 'calving';
  }
  if (latest && OPEN_STATUSES.has(latest.pregnancyStatus) && pdDue(latest, config.pregnancyCheckEarliestDays, now)) {
    return 'pd';
  }
  if (latestHeat && awaitingService(latestHeat, herRecords, config, now)) return 'service';
  return 'heat';
}

export function collectBreedingWork(args: {
  records: BreedingDto[];
  heats: HeatLogDto[];
  females: BreedingFemale[];
  configBySpecies: Map<string, SpeciesConfigDto>;
  now?: Date;
}): BreedingWorkItem[] {
  const now = args.now ?? new Date();
  const females = new Map(args.females.map((row) => [row.id, row]));
  const items: BreedingWorkItem[] = [];

  for (const row of args.records) {
    const dam = females.get(row.motherId);
    const label = animalLabel(dam, row.motherTag);
    if (row.pregnancyStatus === 'DELIVERED' && !row.colostrumFed) {
      items.push({
        id: `colostrum:${row.id}`,
        kind: 'colostrum',
        animalId: row.motherId,
        animalLabel: label,
        form: 'colostrum',
        breedingId: row.id,
        sortAt: row.birthDate ? new Date(row.birthDate).getTime() : now.getTime(),
      });
    }
    if (!CLOSED.has(row.pregnancyStatus) && dueWithinDays(row, 14, now)) {
      items.push({
        id: `calving:${row.id}`,
        kind: 'calving',
        animalId: row.motherId,
        animalLabel: label,
        form: 'calving',
        breedingId: row.id,
        sortAt: row.dueDate ? new Date(row.dueDate).getTime() : now.getTime(),
      });
    }
    const cfg = cfgForSpecies(dam?.species, args.configBySpecies);
    if (
      OPEN_STATUSES.has(row.pregnancyStatus) &&
      pdDue(row, cfg.pregnancyCheckEarliestDays, now) &&
      !dueWithinDays(row, 14, now)
    ) {
      items.push({
        id: `pd:${row.id}`,
        kind: 'pd',
        animalId: row.motherId,
        animalLabel: label,
        form: 'pd',
        breedingId: row.id,
        sortAt: new Date(row.matingDate).getTime(),
      });
    }
    if (row.repeatBreeder && !CLOSED.has(row.pregnancyStatus)) {
      items.push({
        id: `repeat:${row.id}`,
        kind: 'repeat',
        animalId: row.motherId,
        animalLabel: label,
        form: 'service',
        breedingId: row.id,
        sortAt: new Date(row.matingDate).getTime(),
      });
    }
    if (
      row.daysOpen != null &&
      row.daysOpen > 120 &&
      row.pregnancyStatus !== 'PREGNANT' &&
      row.pregnancyStatus !== 'DELIVERED'
    ) {
      items.push({
        id: `open:${row.id}`,
        kind: 'open',
        animalId: row.motherId,
        animalLabel: label,
        form: 'heat',
        breedingId: row.id,
        sortAt: now.getTime() - row.daysOpen * DAY_MS,
      });
    }
  }

  const heatsByAnimal = new Map<string, HeatLogDto[]>();
  for (const heat of args.heats) {
    const list = heatsByAnimal.get(heat.animalId) ?? [];
    list.push(heat);
    heatsByAnimal.set(heat.animalId, list);
  }

  for (const [animalId, list] of heatsByAnimal) {
    const dam = females.get(animalId);
    const cfg = cfgForSpecies(dam?.species, args.configBySpecies);
    const sorted = [...list].sort(
      (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
    );
    const latest = sorted[0];
    if (!latest) continue;
    const herRecords = recordsFor(animalId, args.records);
    const label = animalLabel(dam, latest.animalTag);
    if (awaitingService(latest, herRecords, cfg, now)) {
      items.push({
        id: `window:${latest.id}`,
        kind: 'window',
        animalId,
        animalLabel: label,
        form: 'service',
        sortAt: new Date(latest.observedAt).getTime(),
      });
    } else if (heatWatchDue(latest, herRecords, cfg, now)) {
      items.push({
        id: `watch:${latest.id}`,
        kind: 'heatWatch',
        animalId,
        animalLabel: label,
        form: 'heat',
        sortAt: nextHeatAt(latest, cfg.estrusCycleDays).getTime(),
      });
    }
    const thirdHeat = sorted[2];
    if (
      thirdHeat &&
      !herRecords.some((row) => new Date(row.matingDate).getTime() > new Date(thirdHeat.observedAt).getTime())
    ) {
      items.push({
        id: `three:${animalId}`,
        kind: 'threeHeats',
        animalId,
        animalLabel: label,
        form: 'service',
        sortAt: new Date(latest.observedAt).getTime(),
      });
    }
  }

  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => {
      const rank = WORK_ORDER.indexOf(a.kind) - WORK_ORDER.indexOf(b.kind);
      if (rank !== 0) return rank;
      return a.sortAt - b.sortAt;
    });
}

export function filterBreedingWork(items: BreedingWorkItem[], focus: DeskFocus): BreedingWorkItem[] {
  if (focus === 'all' || focus === 'observers') return items;
  if (focus === 'open') return items.filter((item) => item.kind === 'open' || item.kind === 'repeat' || item.kind === 'threeHeats');
  return items.filter((item) => item.kind === focus);
}

export function kpiFocus(kpi: 'daysOpen' | 'heatDetection' | 'interval' | 'conception' | 'firstService' | 'services' | 'firstCalving' | 'openCost'): DeskFocus {
  if (kpi === 'daysOpen' || kpi === 'openCost') return 'open';
  if (kpi === 'heatDetection') return 'observers';
  if (kpi === 'interval' || kpi === 'firstCalving') return 'calving';
  return 'pd';
}

function recordsFor(animalId: string, records: BreedingDto[]): BreedingDto[] {
  return records
    .filter((row) => row.motherId === animalId)
    .sort((a, b) => new Date(b.matingDate).getTime() - new Date(a.matingDate).getTime());
}

function heatsFor(animalId: string, heats: HeatLogDto[]): HeatLogDto[] {
  return heats
    .filter((row) => row.animalId === animalId)
    .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime());
}

function dueWithinDays(row: BreedingDto, days: number, now: Date): boolean {
  if (row.daysRemaining != null) return row.daysRemaining <= days;
  if (!row.dueDate) return false;
  const left = Math.ceil((new Date(row.dueDate).getTime() - now.getTime()) / DAY_MS);
  return left <= days;
}

function pdDue(row: BreedingDto, earliestDays: number, now: Date): boolean {
  const since = (now.getTime() - new Date(row.matingDate).getTime()) / DAY_MS;
  return since >= earliestDays;
}

function awaitingService(
  heat: HeatLogDto,
  records: BreedingDto[],
  config: Pick<typeof FALLBACK_BREEDING_CFG, 'serviceWindowStartHours' | 'serviceWindowEndHours'>,
  now: Date,
): boolean {
  const observed = new Date(heat.observedAt).getTime();
  const servicedAfter = records.some((row) => new Date(row.matingDate).getTime() >= observed);
  if (servicedAfter) return false;
  const start = observed + config.serviceWindowStartHours * HOUR_MS;
  const end = observed + config.serviceWindowEndHours * HOUR_MS;
  const grace = observed + 36 * HOUR_MS;
  return now.getTime() >= start && now.getTime() <= Math.max(end, grace);
}

function nextHeatAt(heat: HeatLogDto, cycleDays: number): Date {
  return new Date(new Date(heat.observedAt).getTime() + cycleDays * DAY_MS);
}

function heatWatchDue(
  heat: HeatLogDto,
  records: BreedingDto[],
  config: Pick<typeof FALLBACK_BREEDING_CFG, 'estrusCycleDays'>,
  now: Date,
): boolean {
  const observed = new Date(heat.observedAt).getTime();
  if (records.some((row) => new Date(row.matingDate).getTime() >= observed)) return false;
  if (records.some((row) => row.pregnancyStatus === 'PREGNANT')) return false;
  const next = nextHeatAt(heat, config.estrusCycleDays).getTime();
  const watchFrom = next - 2 * DAY_MS;
  return now.getTime() >= watchFrom && now.getTime() <= next + DAY_MS;
}
