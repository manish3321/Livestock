import type { SyncBootstrapResponse } from '@farm/contracts';
import { randomId } from '../core/id';
import type { FarmStore, ModuleOutboxItem } from '../core/store';
import type { HttpFarmApi } from '../api/http-farm-api';

/** Stable cache keys for day-one offline of every module list/summary. */
export const MODULE_CACHE_PATHS = {
  dashboard: '/v1/dashboard/summary',
  animals: '/v1/animals?page=1&pageSize=100&sort=tag&order=asc',
  batches: '/v1/batches?page=1&pageSize=100',
  groups: '/v1/batches?page=1&pageSize=100&kind=POULTRY',
  fish: '/v1/batches?page=1&pageSize=100&kind=FISH',
  expenses: '/v1/expenses?page=1&pageSize=100',
  revenue: '/v1/revenue?page=1&pageSize=100',
  inventory: '/v1/inventory?page=1&pageSize=100',
  health: '/v1/health-records?page=1&pageSize=100',
  breeding: '/v1/breeding?page=1&pageSize=100',
  production: '/v1/production?page=1&pageSize=100',
  feed: '/v1/feed?page=1&pageSize=100',
  pnl: '/v1/pnl',
  reports: '/v1/reports/farm-overview',
  audit: '/v1/audit?page=1&pageSize=50',
  members: '/v1/farms/me/members',
  cohort: '/v1/markers/cohort',
} as const;

/** List modules that must be walked page by page in the legacy fan-out. */
const PAGED_MODULE_KEYS = new Set([
  'animals',
  'batches',
  'groups',
  'fish',
  'health',
  'breeding',
  'feed',
  'inventory',
  'production',
  'expenses',
  'revenue',
  'tasks',
]);

/** Hard stop per module (20 x 100 rows), mirrors the API bootstrap cap. */
export const MAX_MODULE_PAGES = 20;

interface PagedPayload {
  items: unknown[];
  page?: number;
  pageSize?: number;
  total?: number;
}

function isPagedPayload(v: unknown): v is PagedPayload {
  return !!v && typeof v === 'object' && Array.isArray((v as PagedPayload).items);
}

function withPage(path: string, page: number): string {
  return /([?&])page=\d+/.test(path)
    ? path.replace(/([?&])page=\d+/, `$1page=${page}`)
    : `${path}${path.includes('?') ? '&' : '?'}page=${page}`;
}

/**
 * GET a list endpoint and follow pages until one is short, empty, or `total`
 * is reached (max MAX_MODULE_PAGES). Returns the first response's shape with
 * items merged, page 1 and pageSize widened to the combined length.
 */
export async function fetchAllPages<T = unknown>(api: HttpFarmApi, path: string): Promise<T> {
  const first = await api.get<T>(withPage(path, 1));
  if (!isPagedPayload(first)) return first;

  const items: unknown[] = [...first.items];
  let total = first.total;
  let last: PagedPayload = first;
  let pages = 1;

  while (
    last.items.length > 0 &&
    last.items.length >= (first.pageSize ?? 100) &&
    (total === undefined || items.length < total)
  ) {
    if (pages >= MAX_MODULE_PAGES) break;
    const next = await api.get<T>(withPage(path, pages + 1));
    pages += 1;
    if (!isPagedPayload(next)) break;
    items.push(...next.items);
    if (next.total !== undefined) total = next.total;
    last = next;
  }

  if (pages === 1) return first;
  return {
    ...first,
    items,
    page: 1,
    pageSize: Math.max(first.pageSize ?? 100, items.length),
    ...(total !== undefined ? { total } : {}),
  } as T;
}

function tasksCachePath(): string {
  return `/v1/tasks?page=1&pageSize=100&dueBefore=${encodeURIComponent(
    new Date(Date.now() + 30 * 864e5).toISOString(),
  )}`;
}

export function setModuleCache(store: FarmStore, key: string, payload: unknown): void {
  store.moduleCache[key] = { fetchedAt: new Date().toISOString(), payload };
}

export function getModuleCache<T>(store: FarmStore, key: string): T | null {
  const hit = store.moduleCache[key];
  return hit ? (hit.payload as T) : null;
}

/**
 * Refresh every offline module screen. Prefers one bootstrap round trip;
 * falls back to the old per-path GETs if the API is still on an older deploy.
 */
export async function prefetchAllModules(store: FarmStore, api: HttpFarmApi): Promise<void> {
  try {
    const snap = await api.get<SyncBootstrapResponse>('/v1/sync/bootstrap');
    for (const [key, payload] of Object.entries(snap.modules ?? {})) {
      if (payload != null) setModuleCache(store, key, payload);
    }
    return;
  } catch {
    /* older API or offline — try the legacy fan-out below */
  }

  const entries: Array<[string, string]> = [
    ...Object.entries(MODULE_CACHE_PATHS),
    ['tasks', tasksCachePath()],
  ];
  await Promise.all(
    entries.map(async ([key, path]) => {
      try {
        const data = PAGED_MODULE_KEYS.has(key) ? await fetchAllPages(api, path) : await api.get(path);
        setModuleCache(store, key, data);
      } catch {
        /* keep previous cache */
      }
    }),
  );
}

/**
 * Stale-while-revalidate: return cache immediately when present, then refresh.
 * Callers that need the network result should await the returned promise's refresh.
 */
export async function cachedGet<T>(
  store: FarmStore,
  api: HttpFarmApi,
  cacheKey: string,
  path: string,
): Promise<{ data: T; fromCache: boolean }> {
  try {
    const data = await api.get<T>(path);
    setModuleCache(store, cacheKey, data);
    return { data, fromCache: false };
  } catch {
    const cached = getModuleCache<T>(store, cacheKey);
    if (cached !== null) return { data: cached, fromCache: true };
    throw new Error('OFFLINE_NO_CACHE');
  }
}

export function enqueueModuleMutation(
  store: FarmStore,
  item: Omit<ModuleOutboxItem, 'id' | 'state'>,
): void {
  store.moduleOutbox.push({
    id: randomId(),
    state: 'pending',
    ...item,
  });
}

export async function flushModuleOutbox(store: FarmStore, api: HttpFarmApi): Promise<number> {
  let flushed = 0;
  for (const item of [...store.moduleOutbox]) {
    if (item.state !== 'pending' && item.state !== 'failed') continue;
    item.state = 'sending';
    try {
      if (item.method === 'POST') await api.post(item.path, item.body);
      else if (item.method === 'PATCH') await api.patch(item.path, item.body);
      else await api.del(item.path);
      flushed += 1;
      store.moduleOutbox = store.moduleOutbox.filter((x) => x.id !== item.id);
    } catch (err) {
      item.state = 'failed';
      item.error = err instanceof Error ? err.message : 'flush failed';
    }
  }
  return flushed;
}
