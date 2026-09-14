import type {
  MarkerColor,
  MarkerMeaning,
  MilkDisposal,
  OutboxState,
  RecordingMode,
  ScanMethod,
  Species,
  SyncMutation,
  TagSequenceBlockDto,
  TaskPriority,
  TaskType,
} from '@farm/contracts';

export const CACHE_HORIZON_DAYS = 30;
export const CACHE_HORIZON_MS = CACHE_HORIZON_DAYS * 24 * 60 * 60 * 1000;
export const TAP_MIN_PX = 48;

export interface CachedAnimal {
  id: string;
  tag: string;
  shortNo: string | null;
  name: string | null;
  species: string;
  status: string;
  gender: string;
  isPregnant: boolean;
  penName: string | null;
  photoUrl: string | null;
  photoLocalPath: string | null;
  rolling7Mean: number | null;
  version: number;
  lactationStartDate: string | null;
  expectedCalvingDate: string | null;
  deletedAt: string | null;
}

export interface CachedWithhold {
  id: string;
  animalId: string;
  drugName: string;
  endDate: string;
  messageNp: string;
}

export interface CachedMarker {
  id: string;
  animalId: string;
  color: MarkerColor | string;
  meaning: MarkerMeaning | string;
  validUntil: string | null;
}

export interface CachedTask {
  id: string;
  animalId: string | null;
  type: TaskType | string;
  titleEn: string;
  titleNp: string;
  dueAt: string;
  priority: TaskPriority | string;
  status: string;
}

export interface CachedPhoto {
  animalId: string;
  url: string;
  localPath: string | null;
}

export interface OutboxItem {
  id: string;
  state: OutboxState;
  mutation?: SyncMutation;
  rest?:
    | { kind: 'milk'; body: Record<string, unknown> }
    | { kind: 'milk-patch'; id: string; litres: number; reason?: string }
    | { kind: 'scan'; body: Record<string, unknown> }
    | { kind: 'round-start'; body: Record<string, unknown> }
    | { kind: 'round-finish'; id: string; body: Record<string, unknown> };
  error?: string;
  current?: Record<string, unknown> | null;
}

export interface ConflictRow {
  id: string;
  entityType: string;
  entityId: string;
  local: Record<string, unknown> | null;
  current: Record<string, unknown> | null;
  createdAt: string;
}

export interface LocalRound {
  id: string;
  mode: RecordingMode;
  session: string | null;
  date: string;
  status: 'ACTIVE' | 'FINISHED' | 'ABANDONED';
  recordedIds: string[];
  lastSaved: { animalId: string; litres: string; entryId: string | null } | null;
}

export interface LocalMilk {
  id: string;
  animalId: string;
  roundId: string;
  session: string;
  litres: number;
  disposal: MilkDisposal | string;
  recordedAt: string;
}

export interface FarmSnapshot {
  animals: CachedAnimal[];
  photos: CachedPhoto[];
  withholds: CachedWithhold[];
  markers: CachedMarker[];
  tasks: CachedTask[];
  tagBlocks: TagSequenceBlockDto[];
  pullCursor: number;
}

export interface FarmStore {
  deviceId: string;
  accessToken: string | null;
  refreshToken: string | null;
  pullCursor: number;
  animals: Map<string, CachedAnimal>;
  photos: Map<string, CachedPhoto>;
  withholds: Map<string, CachedWithhold>;
  markers: Map<string, CachedMarker>;
  tasks: Map<string, CachedTask>;
  tagBlocks: TagSequenceBlockDto[];
  outbox: OutboxItem[];
  conflicts: ConflictRow[];
  round: LocalRound | null;
  milk: LocalMilk[];
}

export function newDeviceId(): string {
  return `android-${crypto.randomUUID()}`;
}

export function createStore(deviceId = newDeviceId()): FarmStore {
  return {
    deviceId,
    accessToken: null,
    refreshToken: null,
    pullCursor: 0,
    animals: new Map(),
    photos: new Map(),
    withholds: new Map(),
    markers: new Map(),
    tasks: new Map(),
    tagBlocks: [],
    outbox: [],
    conflicts: [],
    round: null,
    milk: [],
  };
}

export function pruneTasks(store: FarmStore, now = new Date()): void {
  const horizon = now.getTime() + CACHE_HORIZON_MS;
  for (const [id, task] of store.tasks) {
    if (new Date(task.dueAt).getTime() > horizon) store.tasks.delete(id);
  }
}

export function upsertAnimal(store: FarmStore, animal: CachedAnimal): void {
  if (animal.deletedAt) {
    store.animals.delete(animal.id);
    return;
  }
  store.animals.set(animal.id, animal);
  if (animal.photoUrl) {
    store.photos.set(animal.id, {
      animalId: animal.id,
      url: animal.photoUrl,
      localPath: animal.photoLocalPath,
    });
  }
}

export function applySnapshot(store: FarmStore, snap: FarmSnapshot, now = new Date()): void {
  store.animals.clear();
  store.photos.clear();
  store.withholds.clear();
  store.markers.clear();
  store.tasks.clear();
  for (const a of snap.animals) upsertAnimal(store, a);
  for (const p of snap.photos) store.photos.set(p.animalId, p);
  for (const w of snap.withholds) store.withholds.set(w.id, w);
  for (const m of snap.markers) store.markers.set(m.id, m);
  for (const t of snap.tasks) store.tasks.set(t.id, t);
  store.tagBlocks = snap.tagBlocks;
  store.pullCursor = snap.pullCursor;
  pruneTasks(store, now);
}

export type { Species, ScanMethod, RecordingMode };
