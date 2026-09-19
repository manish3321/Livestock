import type {
  FarmStore,
  LocalMilk,
  LocalRound,
  OutboxItem,
  ConflictRow,
  CachedAnimal,
  CachedPhoto,
  CachedWithhold,
  CachedMarker,
  CachedTask,
} from '../core/store';
import type { TagSequenceBlockDto } from '@farm/contracts';
import type { ModuleCacheEntry, ModuleOutboxItem } from '../core/store';

export interface PersistedFarmState {
  version: 2;
  deviceId: string;
  pullCursor: number;
  animals: CachedAnimal[];
  photos: CachedPhoto[];
  withholds: CachedWithhold[];
  markers: CachedMarker[];
  tasks: CachedTask[];
  tagBlocks: TagSequenceBlockDto[];
  outbox: OutboxItem[];
  conflicts: ConflictRow[];
  round: LocalRound | null;
  milk: LocalMilk[];
  moduleCache: Record<string, ModuleCacheEntry>;
  moduleOutbox: ModuleOutboxItem[];
}

export function serializeStore(store: FarmStore): PersistedFarmState {
  return {
    version: 2,
    deviceId: store.deviceId,
    pullCursor: store.pullCursor,
    animals: [...store.animals.values()],
    photos: [...store.photos.values()],
    withholds: [...store.withholds.values()],
    markers: [...store.markers.values()],
    tasks: [...store.tasks.values()],
    tagBlocks: store.tagBlocks,
    outbox: store.outbox,
    conflicts: store.conflicts,
    round: store.round,
    milk: store.milk,
    moduleCache: store.moduleCache ?? {},
    moduleOutbox: store.moduleOutbox ?? [],
  };
}

export function applyPersistedState(
  store: FarmStore,
  data: PersistedFarmState | (Omit<PersistedFarmState, 'version' | 'moduleCache' | 'moduleOutbox'> & { version: 1 }),
): void {
  store.deviceId = data.deviceId;
  store.pullCursor = data.pullCursor;
  store.animals = new Map(data.animals.map((a) => [a.id, a]));
  store.photos = new Map(data.photos.map((p) => [p.animalId, p]));
  store.withholds = new Map(data.withholds.map((w) => [w.id, w]));
  store.markers = new Map(data.markers.map((m) => [m.id, m]));
  store.tasks = new Map(data.tasks.map((t) => [t.id, t]));
  store.tagBlocks = data.tagBlocks ?? [];
  store.outbox = data.outbox ?? [];
  store.conflicts = data.conflicts ?? [];
  store.round = data.round
    ? { ...data.round, offlineOnly: data.round.offlineOnly ?? false }
    : null;
  store.milk = data.milk ?? [];
  store.moduleCache =
    'moduleCache' in data && data.moduleCache ? data.moduleCache : {};
  store.moduleOutbox =
    'moduleOutbox' in data && data.moduleOutbox ? data.moduleOutbox : [];
}
