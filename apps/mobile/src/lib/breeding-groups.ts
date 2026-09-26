import type { AnimalDto, SpeciesConfigDto, TaskDto } from '@farm/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;

export type BreedingRecordLite = {
  id: string;
  motherId?: string;
  motherTag?: string | null;
  matingType?: string;
  matingDate?: string;
  dueDate?: string;
  pregnancyStatus?: string;
  daysRemaining?: number | null;
  daysOpen?: number | null;
  birthDate?: string | null;
  colostrumFed?: boolean | null;
};

export type WatchKind =
  | 'calvingSoon'
  | 'fresh'
  | 'watchingHeat'
  | 'pdWait'
  | 'tooSoon'
  | 'carrying'
  | 'heifers';

export type WalkKind = 'breedToday' | 'checkHeat' | 'pd' | 'dryOff' | 'postCalving';

export type WatchRow = {
  key: string;
  kind: WatchKind;
  animalId: string;
  label: string;
  subtitle: string;
  progress: number | null;
  progressLabel: string | null;
  breedingId?: string;
  recordAction: 'heat' | 'service' | 'pd' | 'calving' | 'animal';
};

export type WalkRow = {
  key: string;
  kind: WalkKind;
  animalId: string | null;
  label: string;
  subtitle: string;
  task: TaskDto;
  breedingId?: string;
};

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function animalLabel(a: Pick<AnimalDto, 'herdNumber' | 'tag' | 'name'>): string {
  const id = a.herdNumber ?? a.tag;
  return a.name?.trim() ? `${id} · ${a.name}` : id;
}

function cfgFor(
  map: Map<string, SpeciesConfigDto>,
  species: string,
): SpeciesConfigDto | undefined {
  return map.get(species);
}

function daysUntilReady(lactationStart: string | null | undefined, waitingDays: number): number | null {
  if (!lactationStart) return null;
  const ready = new Date(lactationStart);
  ready.setDate(ready.getDate() + waitingDays);
  const left = Math.ceil((ready.getTime() - Date.now()) / DAY_MS);
  return left > 0 ? left : null;
}

function monthsOld(dob: string | null | undefined): number | null {
  if (!dob) return null;
  return Math.max(0, Math.round((Date.now() - new Date(dob).getTime()) / ((365.25 / 12) * DAY_MS)));
}

function openServiceForMother(
  records: BreedingRecordLite[],
  motherId: string,
): BreedingRecordLite | undefined {
  return records.find(
    (r) =>
      r.motherId === motherId &&
      r.pregnancyStatus !== 'DELIVERED' &&
      r.pregnancyStatus !== 'FAILED',
  );
}

/** Watch board — status buckets with progress, matching the web breeding groups. */
export function buildWatchRows(
  females: AnimalDto[],
  records: BreedingRecordLite[],
  configBySpecies: Map<string, SpeciesConfigDto>,
  now = new Date(),
): WatchRow[] {
  const rows: WatchRow[] = [];
  const claimed = new Set<string>();

  const claim = (id: string) => {
    if (claimed.has(id)) return false;
    claimed.add(id);
    return true;
  };

  for (const a of females) {
    const cfg = cfgFor(configBySpecies, a.species);
    const due = a.expectedCalvingDate ? new Date(a.expectedCalvingDate) : null;
    const daysLeft = due ? daysBetween(now, due) : null;
    const open = openServiceForMother(records, a.id);
    const recordDue = open?.dueDate ? new Date(open.dueDate) : null;
    const recordDaysLeft =
      open?.daysRemaining ?? (recordDue ? daysBetween(now, recordDue) : null);

    // Calving soon — due within 14 days
    if (
      (a.isPregnant || open?.pregnancyStatus === 'CONFIRMED' || open?.pregnancyStatus === 'PREGNANT') &&
      ((daysLeft != null && daysLeft <= 14) || (recordDaysLeft != null && recordDaysLeft <= 14))
    ) {
      if (!claim(a.id)) continue;
      const left = daysLeft ?? recordDaysLeft ?? 0;
      const gestation = cfg?.gestationDays ?? 300;
      const elapsed = gestation - Math.max(0, left);
      rows.push({
        key: `calvingSoon-${a.id}`,
        kind: 'calvingSoon',
        animalId: a.id,
        label: animalLabel(a),
        subtitle: left <= 0 ? 'Due today' : `${left}d left`,
        progress: clamp01(elapsed / gestation),
        progressLabel: `${Math.max(0, left)}d`,
        breedingId: open?.id,
        recordAction: 'calving',
      });
      continue;
    }

    // Fresh — recent calving / early lactation within VWP window but "fresh" first ~21d
    const lacStart = a.lactationStartDate ? new Date(a.lactationStartDate) : null;
    const daysSinceCalving = lacStart ? daysBetween(lacStart, now) : null;
    if (
      !a.isPregnant &&
      (a.status === 'LACTATING' || a.status === 'ACTIVE') &&
      daysSinceCalving != null &&
      daysSinceCalving >= 0 &&
      daysSinceCalving <= 21
    ) {
      if (!claim(a.id)) continue;
      rows.push({
        key: `fresh-${a.id}`,
        kind: 'fresh',
        animalId: a.id,
        label: animalLabel(a),
        subtitle: `Day ${daysSinceCalving}`,
        progress: clamp01(daysSinceCalving / 21),
        progressLabel: `${daysSinceCalving}/21`,
        recordAction: 'heat',
      });
      continue;
    }

    // Too soon — past fresh window but still inside voluntary waiting
    const waiting = cfg?.voluntaryWaitingDays ?? 60;
    const tooSoon = daysUntilReady(a.lactationStartDate, waiting);
    if (!a.isPregnant && tooSoon != null && daysSinceCalving != null && daysSinceCalving > 21) {
      if (!claim(a.id)) continue;
      const elapsed = waiting - tooSoon;
      rows.push({
        key: `tooSoon-${a.id}`,
        kind: 'tooSoon',
        animalId: a.id,
        label: animalLabel(a),
        subtitle: `${tooSoon}d to wait`,
        progress: clamp01(elapsed / waiting),
        progressLabel: `${elapsed}/${waiting}`,
        recordAction: 'heat',
      });
      continue;
    }

    // Pregnancy check wait — served, not confirmed, past earliest PD day
    if (
      open &&
      (open.pregnancyStatus === 'PREGNANT' || open.pregnancyStatus === 'OPEN') &&
      open.matingDate
    ) {
      const since = daysBetween(new Date(open.matingDate), now);
      const earliest = cfg?.pregnancyCheckEarliestDays ?? 45;
      if (since >= earliest && !a.isPregnant) {
        if (!claim(a.id)) continue;
        rows.push({
          key: `pdWait-${a.id}`,
          kind: 'pdWait',
          animalId: a.id,
          label: animalLabel(a),
          subtitle: `${since}d since service`,
          progress: clamp01(since / (earliest + 30)),
          progressLabel: `${since}d`,
          breedingId: open.id,
          recordAction: 'pd',
        });
        continue;
      }
      if (since < earliest) {
        if (!claim(a.id)) continue;
        rows.push({
          key: `pdWait-${a.id}`,
          kind: 'pdWait',
          animalId: a.id,
          label: animalLabel(a),
          subtitle: `PD in ${earliest - since}d`,
          progress: clamp01(since / earliest),
          progressLabel: `${since}/${earliest}`,
          breedingId: open.id,
          recordAction: 'pd',
        });
        continue;
      }
    }

    // Carrying — confirmed pregnant, not in calving-soon window
    if (a.isPregnant || open?.pregnancyStatus === 'CONFIRMED') {
      if (!claim(a.id)) continue;
      const left = daysLeft ?? recordDaysLeft;
      const gestation = cfg?.gestationDays ?? 300;
      const elapsed = left != null ? gestation - Math.max(0, left) : null;
      rows.push({
        key: `carrying-${a.id}`,
        kind: 'carrying',
        animalId: a.id,
        label: animalLabel(a),
        subtitle: left != null ? `Due in ${left}d` : 'Pregnant',
        progress: elapsed != null ? clamp01(elapsed / gestation) : null,
        progressLabel: left != null ? `${Math.max(0, left)}d` : null,
        breedingId: open?.id,
        recordAction: 'animal',
      });
      continue;
    }

    // Heifers
    if (a.status === 'HEIFER' || a.status === 'GROWING') {
      if (!claim(a.id)) continue;
      const age = monthsOld(a.dateOfBirth);
      const target = cfg?.ageFirstServiceMonths ?? 24;
      rows.push({
        key: `heifers-${a.id}`,
        kind: 'heifers',
        animalId: a.id,
        label: animalLabel(a),
        subtitle: age != null ? `${age} mo` : 'Heifer',
        progress: age != null ? clamp01(age / target) : null,
        progressLabel: age != null ? `${age}/${target} mo` : null,
        recordAction: 'service',
      });
      continue;
    }

    // Watching for heat — open, past VWP (or never calved)
    if (!a.isPregnant && (tooSoon == null || tooSoon <= 0)) {
      if (!claim(a.id)) continue;
      const cycle = cfg?.estrusCycleDays ?? 21;
      rows.push({
        key: `watchingHeat-${a.id}`,
        kind: 'watchingHeat',
        animalId: a.id,
        label: animalLabel(a),
        subtitle: open?.daysOpen != null ? `${open.daysOpen}d open` : 'Open',
        progress: null,
        progressLabel: `${cycle}d cycle`,
        recordAction: 'heat',
      });
    }
  }

  const order: WatchKind[] = [
    'calvingSoon',
    'fresh',
    'watchingHeat',
    'pdWait',
    'tooSoon',
    'carrying',
    'heifers',
  ];
  rows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.label.localeCompare(b.label));
  return rows;
}

const WALK_TYPES: Record<WalkKind, string[]> = {
  breedToday: ['SERVICE_WINDOW'],
  checkHeat: ['HEAT_WATCH', 'SILENT_HEAT_CHECK'],
  pd: ['PREGNANCY_CHECK'],
  dryOff: ['DRY_OFF'],
  postCalving: ['COLOSTRUM_FEED', 'POSTPARTUM_CHECK', 'CALVING_WATCH'],
};

/** Walk board — today's breeding tasks, grouped like the web walk list. */
export function buildWalkRows(tasks: TaskDto[], now = new Date()): WalkRow[] {
  const endOfTomorrow = new Date(now);
  endOfTomorrow.setHours(23, 59, 59, 999);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);

  const open = tasks.filter(
    (t) =>
      (t.status === 'PENDING' || t.status === 'SNOOZED') &&
      new Date(t.dueAt).getTime() <= endOfTomorrow.getTime(),
  );

  const rows: WalkRow[] = [];
  for (const [kind, types] of Object.entries(WALK_TYPES) as [WalkKind, string[]][]) {
    for (const task of open) {
      if (!types.includes(task.type)) continue;
      const label =
        task.animalHerdNumber ??
        task.animalName ??
        task.animalId?.slice(0, 8) ??
        task.titleEn;
      rows.push({
        key: `${kind}-${task.id}`,
        kind,
        animalId: task.animalId,
        label,
        subtitle: task.titleEn,
        task,
        breedingId:
          task.sourceRefType === 'breedingRecord' && task.sourceRefId
            ? task.sourceRefId
            : undefined,
      });
    }
  }

  const order: WalkKind[] = ['breedToday', 'checkHeat', 'pd', 'dryOff', 'postCalving'];
  rows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return rows;
}

export function groupWatchByKind(rows: WatchRow[]): Array<{ kind: WatchKind; items: WatchRow[] }> {
  const order: WatchKind[] = [
    'calvingSoon',
    'fresh',
    'watchingHeat',
    'pdWait',
    'tooSoon',
    'carrying',
    'heifers',
  ];
  return order
    .map((kind) => ({ kind, items: rows.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length > 0);
}

export function groupWalkByKind(rows: WalkRow[]): Array<{ kind: WalkKind; items: WalkRow[] }> {
  const order: WalkKind[] = ['breedToday', 'checkHeat', 'pd', 'dryOff', 'postCalving'];
  return order
    .map((kind) => ({ kind, items: rows.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length > 0);
}
