import type {
  MilkDisposal,
  RecordingMode,
  ScanMethod,
  ScanResolveDto,
  SyncChange,
  SyncMutation,
  SyncPushResponse,
} from '@farm/contracts';
import { expectedRange, parseScanPayload, rankAnimalMatch } from './scan-payload';
import type { CachedAnimal, ConflictRow, FarmStore, OutboxItem } from './store';
import { upsertAnimal } from './store';

const DAY_MS = 24 * 60 * 60 * 1000;

const NEXT_ACTION: Record<RecordingMode, ScanResolveDto['nextAction']> = {
  MILKING: 'MILK_ENTRY',
  VACCINATION: 'DOSE_CONFIRM',
  TREATMENT: 'DOSE_CONFIRM',
  WEIGHING: 'WEIGHT_ENTRY',
  HEALTH_CHECK: 'SYMPTOM_PICKER',
  MARKER_PLACEMENT: 'MARKER_CONFIRM',
  BROWSE: 'PROFILE',
};

export type ScanLookup =
  | { status: 'ok'; dto: ScanResolveDto }
  | { status: 'ambiguous'; hits: CachedAnimal[] }
  | { status: 'none' };

export function startLocalRound(
  store: FarmStore,
  input: { id: string; mode: RecordingMode; session?: string | null; date?: string },
): void {
  store.round = {
    id: input.id,
    mode: input.mode,
    session: input.session ?? null,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    status: 'ACTIVE',
    recordedIds: [],
    lastSaved: null,
  };
}

export function remainingAnimals(store: FarmStore): CachedAnimal[] {
  const recorded = new Set(store.round?.recordedIds ?? []);
  return [...store.animals.values()].filter((a) => {
    if (recorded.has(a.id) || a.deletedAt) return false;
    if (store.round?.mode === 'MILKING') {
      return a.gender === 'FEMALE' && !['SOLD', 'DEAD', 'CULLED', 'DRY'].includes(a.status);
    }
    return !['SOLD', 'DEAD', 'CULLED'].includes(a.status);
  });
}

export function resolveLocalScan(store: FarmStore, raw: string, method: ScanMethod): ScanLookup {
  const parsed = parseScanPayload(raw);
  let animal = parsed.animalId ? store.animals.get(parsed.animalId) : undefined;
  if (!animal && parsed.query) {
    const hits = [...store.animals.values()]
      .map((a) => ({ animal: a, rank: rankAnimalMatch(parsed.query!, a) }))
      .filter((row): row is { animal: CachedAnimal; rank: number } => row.rank != null)
      .sort((a, b) => a.rank - b.rank || (a.animal.shortNo ?? '').localeCompare(b.animal.shortNo ?? ''))
      .map((row) => row.animal);
    if (hits.length > 1) return { status: 'ambiguous', hits };
    animal = hits[0];
  }
  if (!animal) return { status: 'none' };

  const withhold = [...store.withholds.values()].find(
    (w) => w.animalId === animal.id && new Date(w.endDate).getTime() >= Date.now(),
  );
  const markers = [...store.markers.values()].filter((m) => m.animalId === animal.id);
  const milk = store.milk.find((m) => m.animalId === animal.id && m.roundId === store.round?.id);
  const range = expectedRange(animal.rolling7Mean);
  const daysInMilk = animal.lactationStartDate
    ? Math.floor((Date.now() - new Date(animal.lactationStartDate).getTime()) / DAY_MS)
    : null;
  const daysToCalving = animal.expectedCalvingDate
    ? Math.ceil((new Date(animal.expectedCalvingDate).getTime() - Date.now()) / DAY_MS)
    : null;

  void method;
  const dto: ScanResolveDto = {
    animal: {
      id: animal.id,
      shortNo: animal.shortNo,
      name: animal.name,
      nameNp: animal.name,
      species: animal.species,
      penName: animal.penName,
      photoUrl: animal.photoLocalPath ?? animal.photoUrl,
    },
    status: {
      status: animal.status,
      isPregnant: animal.isPregnant,
      daysInMilk,
      daysToCalving,
    },
    blocks: withhold
      ? [
          {
            kind: 'MILK_WITHHOLD',
            until: withhold.endDate.slice(0, 10),
            drug: withhold.drugName,
            messageNp: withhold.messageNp,
            blocksDisposal: ['SOLD'],
          },
        ]
      : [],
    markers: markers.map((m) => ({
      reason: m.meaning === 'MILK_WITHHOLD' ? 'WITHHOLD' : String(m.meaning),
      colour: String(m.color),
      until: withhold?.endDate.slice(0, 10) ?? null,
    })),
    context: {
      rolling7Mean: animal.rolling7Mean,
      alreadyRecordedThisRound: milk != null,
      existingValue: milk?.litres ?? null,
      existingEntryId: milk?.id ?? null,
      expectedRangeLow: range.low,
      expectedRangeHigh: range.high,
    },
    nextAction: NEXT_ACTION[store.round?.mode ?? 'MILKING'],
  };
  return { status: 'ok', dto };
}

export function saveMilkLocal(
  store: FarmStore,
  input: {
    animalId: string;
    litres: number;
    disposal: MilkDisposal;
    confirmOutOfRange?: boolean;
  },
): { ok: true; id: string } | { ok: false; code: 'YIELD_OUT_OF_RANGE' | 'NO_ROUND' | 'QTY' } {
  if (!store.round) return { ok: false, code: 'NO_ROUND' };
  const round = store.round;
  if (!Number.isFinite(input.litres) || input.litres <= 0) return { ok: false, code: 'QTY' };
  const animal = store.animals.get(input.animalId);
  const range = expectedRange(animal?.rolling7Mean ?? null);
  if (
    !input.confirmOutOfRange &&
    range.low != null &&
    range.high != null &&
    (input.litres < range.low || input.litres > range.high)
  ) {
    return { ok: false, code: 'YIELD_OUT_OF_RANGE' };
  }

  const existing = store.milk.find((m) => m.animalId === input.animalId && m.roundId === round.id);
  const id = existing?.id ?? crypto.randomUUID();
  const row = {
    id,
    animalId: input.animalId,
    roundId: round.id,
    session: round.session ?? 'MORNING',
    litres: input.litres,
    disposal: input.disposal,
    recordedAt: new Date().toISOString(),
  };
  if (existing) Object.assign(existing, row);
  else store.milk.push(row);
  if (!round.recordedIds.includes(input.animalId)) round.recordedIds.push(input.animalId);
  round.lastSaved = { animalId: input.animalId, litres: String(input.litres), entryId: id };

  const rest = existing
    ? { kind: 'milk-patch' as const, id, litres: input.litres, reason: 'shed-correction' }
    : {
        kind: 'milk' as const,
        body: {
          animalId: input.animalId,
          session: store.round.session ?? 'MORNING',
          litres: input.litres,
          disposal: input.disposal,
          roundId: round.id,
          confirmOutOfRange: input.confirmOutOfRange,
        },
      };
  store.outbox.push({ id: crypto.randomUUID(), state: 'pending', rest });
  store.outbox.push({
    id: crypto.randomUUID(),
    state: 'pending',
    rest: {
      kind: 'scan',
      body: { method: 'CAMERA', roundId: round.id, deviceId: store.deviceId, rawPayload: input.animalId },
    },
  });
  return { ok: true, id };
}

export function undoLastMilk(store: FarmStore): boolean {
  const last = store.round?.lastSaved;
  if (!last || !store.round) return false;
  store.milk = store.milk.filter((m) => m.id !== last.entryId);
  store.round.recordedIds = store.round.recordedIds.filter((id) => id !== last.animalId);
  store.outbox = store.outbox.filter((item) => {
    if (item.rest?.kind === 'milk' && item.rest.body.animalId === last.animalId) return false;
    if (item.rest?.kind === 'milk-patch' && item.rest.id === last.entryId) return false;
    return true;
  });
  store.round.lastSaved = null;
  return true;
}

export function applyPullChanges(store: FarmStore, changes: SyncChange[]): void {
  for (const change of changes) {
    if (change.entityType !== 'animal') continue;
    if (change.deletedAt || !change.data) {
      store.animals.delete(change.entityId);
      continue;
    }
    const data = change.data;
    upsertAnimal(store, {
      id: change.entityId,
      tag: String(data.tag ?? ''),
      shortNo: (data.herdNumber as string | null) ?? null,
      name: (data.name as string | null) ?? null,
      species: String(data.species ?? 'BUFFALO'),
      status: String(data.status ?? 'ACTIVE'),
      gender: String(data.gender ?? 'FEMALE'),
      isPregnant: Boolean(data.isPregnant),
      penName: (data.shed as string | null) ?? null,
      photoUrl: (data.photoUrl as string | null) ?? null,
      photoLocalPath: store.photos.get(change.entityId)?.localPath ?? null,
      rolling7Mean: store.animals.get(change.entityId)?.rolling7Mean ?? null,
      version: change.version,
      lactationStartDate: (data.lactationStartDate as string | null) ?? null,
      expectedCalvingDate: (data.expectedCalvingDate as string | null) ?? null,
      deletedAt: change.deletedAt,
    });
  }
}

export function enqueueAnimalMutation(store: FarmStore, mutation: SyncMutation): void {
  store.outbox.push({ id: mutation.clientMutationId, state: 'pending', mutation });
}

export function applyPushResults(store: FarmStore, response: SyncPushResponse): ConflictRow[] {
  const raised: ConflictRow[] = [];
  for (const result of response.results) {
    const item = store.outbox.find((o) => o.mutation?.clientMutationId === result.clientMutationId);
    if (!item) continue;
    if (result.status === 'applied' || result.status === 'duplicate') {
      item.state = 'synced';
      continue;
    }
    if (result.status === 'conflict') {
      item.state = 'conflict';
      item.current = result.current ?? null;
      const row: ConflictRow = {
        id: result.clientMutationId,
        entityType: item.mutation?.entityType ?? 'animal',
        entityId: item.mutation?.entityId ?? '',
        local: (item.mutation?.payload as Record<string, unknown> | undefined) ?? null,
        current: result.current ?? null,
        createdAt: new Date().toISOString(),
      };
      store.conflicts.push(row);
      raised.push(row);
      continue;
    }
    item.state = 'failed';
    item.error = result.error;
  }
  store.outbox = store.outbox.filter((o) => o.state !== 'synced');
  return raised;
}

export function pendingMutations(store: FarmStore): SyncMutation[] {
  return store.outbox
    .filter((o): o is OutboxItem & { mutation: SyncMutation } => o.state === 'pending' && o.mutation != null)
    .map((o) => o.mutation);
}

export function pendingRest(store: FarmStore): OutboxItem[] {
  return store.outbox.filter((o) => o.state === 'pending' && o.rest != null);
}

export function acceptServerConflict(store: FarmStore, conflictId: string): void {
  const row = store.conflicts.find((c) => c.id === conflictId);
  if (!row?.current) return;
  applyPullChanges(store, [
    {
      entityType: row.entityType,
      entityId: row.entityId,
      version: Number(row.current.version ?? 0),
      deletedAt: (row.current.deletedAt as string | null) ?? null,
      data: row.current,
      seq: 0,
    },
  ]);
  store.conflicts = store.conflicts.filter((c) => c.id !== conflictId);
  store.outbox = store.outbox.filter((o) => o.mutation?.clientMutationId !== conflictId);
}
