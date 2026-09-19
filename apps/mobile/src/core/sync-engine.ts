import type {
  AnimalDto,
  FarmWithholdDto,
  LoginResponse,
  MarkerCohortDto,
  PageResult,
  RoundRemainingDto,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  TagSequenceBlockClaim,
  TagSequenceBlockDto,
  TaskDto,
} from '@farm/contracts';
import { SPECIES } from '@farm/contracts';
import { applySnapshot, type FarmStore } from './store';
import { alertsFromStore, type NotificationEngine, syncLocalAlerts } from './notify';
import { applyPullChanges, applyPushResults, pendingMutations, pendingRest } from './scan-round';
import { needsClaim, rememberBlock } from './tag-blocks';

export interface FarmApi {
  login(email: string, password: string, deviceId: string): Promise<LoginResponse>;
  pull(cursor: number, token: string): Promise<SyncPullResponse>;
  push(body: SyncPushRequest, token: string): Promise<SyncPushResponse>;
  listAnimals(page: number, token: string): Promise<PageResult<AnimalDto>>;
  activeWithholds(token: string): Promise<FarmWithholdDto[]>;
  markerCohort(token: string): Promise<MarkerCohortDto>;
  listTasks(dueBefore: string, token: string): Promise<PageResult<TaskDto>>;
  claimBlock(body: TagSequenceBlockClaim, token: string): Promise<TagSequenceBlockDto>;
  remaining(roundId: string, token: string): Promise<RoundRemainingDto>;
  postRest(path: string, body: unknown, token: string): Promise<unknown>;
  patchRest(path: string, body: unknown, token: string): Promise<unknown>;
}

export async function hydrateFromNetwork(
  store: FarmStore,
  api: FarmApi,
  now = new Date(),
): Promise<void> {
  const token = store.accessToken;
  if (!token) return;
  const animals: AnimalDto[] = [];
  for (let page = 1; page < 50; page += 1) {
    const batch = await api.listAnimals(page, token);
    animals.push(...batch.items);
    if (animals.length >= batch.total || batch.items.length === 0) break;
  }
  const dueBefore = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const [withholds, cohort, tasks] = await Promise.all([
    api.activeWithholds(token),
    api.markerCohort(token),
    api.listTasks(dueBefore, token),
  ]);
  applySnapshot(store, {
    pullCursor: store.pullCursor,
    tagBlocks: store.tagBlocks,
    photos: animals
      .filter((a) => a.photoUrl)
      .map((a) => ({ animalId: a.id, url: a.photoUrl!, localPath: store.photos.get(a.id)?.localPath ?? null })),
    animals: animals.map((a) => ({
      id: a.id,
      tag: a.tag,
      shortNo: a.herdNumber,
      name: a.name,
      species: a.species,
      status: a.status,
      gender: a.gender,
      isPregnant: a.isPregnant,
      penName: a.shed,
      photoUrl: a.photoUrl,
      photoLocalPath: store.photos.get(a.id)?.localPath ?? null,
      rolling7Mean: store.animals.get(a.id)?.rolling7Mean ?? null,
      version: a.version,
      lactationStartDate: a.lactationStartDate,
      expectedCalvingDate: a.expectedCalvingDate,
      deletedAt: a.deletedAt,
    })),
    withholds: withholds.map((w) => ({
      id: w.id,
      animalId: w.animalId,
      drugName: w.drugName,
      endDate: w.endDate,
      messageNp: w.messageNp,
    })),
    markers: cohort.groups.flatMap((g) =>
      g.animals.map((a) => ({
        id: a.markerId,
        animalId: a.animalId,
        color: g.color,
        meaning: g.meaning,
        validUntil: a.validUntil,
      })),
    ),
    tasks: tasks.items.map((t) => ({
      id: t.id,
      animalId: t.animalId,
      type: t.type,
      titleEn: t.titleEn,
      titleNp: t.titleNp,
      dueAt: t.dueAt,
      priority: t.priority,
      status: t.status,
    })),
  }, now);
}

export async function refreshMeansFromRound(
  store: FarmStore,
  api: FarmApi,
  roundId: string,
): Promise<void> {
  if (!store.accessToken) return;
  const remaining = await api.remaining(roundId, store.accessToken);
  for (const row of remaining.remaining) {
    const animal = store.animals.get(row.id);
    if (animal) animal.rolling7Mean = row.usualLitres;
  }
}

export async function ensureTagBlocks(store: FarmStore, api: FarmApi): Promise<void> {
  if (!store.accessToken) return;
  for (const species of SPECIES) {
    if (!needsClaim(store, species)) continue;
    const block = await api.claimBlock(
      { deviceId: store.deviceId, species },
      store.accessToken,
    );
    rememberBlock(store, block);
  }
}

export async function runSync(
  store: FarmStore,
  api: FarmApi,
  engine?: NotificationEngine,
): Promise<{ conflicts: number }> {
  const token = store.accessToken;
  if (!token) return { conflicts: 0 };

  const mutations = pendingMutations(store);
  if (mutations.length) {
    const pushed = await api.push({ deviceId: store.deviceId, mutations }, token);
    applyPushResults(store, pushed);
  }

  for (const item of pendingRest(store)) {
    try {
      if (item.rest?.kind === 'milk') await api.postRest('/v1/milk', item.rest.body, token);
      else if (item.rest?.kind === 'milk-patch') {
        await api.patchRest(`/v1/milk/${item.rest.id}`, { litres: item.rest.litres, reason: item.rest.reason }, token);
      } else if (item.rest?.kind === 'scan') await api.postRest('/v1/scans', item.rest.body, token);
      else if (item.rest?.kind === 'round-start') await api.postRest('/v1/rounds', item.rest.body, token);
      else if (item.rest?.kind === 'round-finish') {
        const finished = (await api.postRest(
          `/v1/rounds/${item.rest.id}/finish`,
          item.rest.body,
          token,
        )) as { milkRoundId?: string | null } | undefined;
        if (store.round?.id === item.rest.id && finished?.milkRoundId) {
          store.round.milkRoundId = finished.milkRoundId;
        }
      } else if (item.rest?.kind === 'weight') {
        await api.postRest(`/v1/animals/${item.rest.animalId}/weights`, item.rest.body, token);
      } else if (item.rest?.kind === 'health') {
        await api.postRest('/v1/health-records', item.rest.body, token);
      } else if (item.rest?.kind === 'expense') {
        await api.postRest('/v1/expenses', item.rest.body, token);
      } else if (item.rest?.kind === 'task-complete') {
        await api.patchRest(`/v1/tasks/${item.rest.id}/complete`, item.rest.body, token);
      }
      item.state = 'synced';
    } catch (err) {
      item.state = 'failed';
      item.error = err instanceof Error ? err.message : 'SYNC_FAILED';
    }
  }
  store.outbox = store.outbox.filter((o) => o.state !== 'synced');

  let cursor = store.pullCursor;
  for (let i = 0; i < 20; i += 1) {
    const page = await api.pull(cursor, token);
    applyPullChanges(store, page.changes);
    cursor = page.nextCursor;
    store.pullCursor = cursor;
    if (!page.hasMore) break;
  }

  if (engine) await syncLocalAlerts(engine, store);
  return { conflicts: store.conflicts.length };
}

export { alertsFromStore };
