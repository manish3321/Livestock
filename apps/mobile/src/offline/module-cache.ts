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
  tasks: `/v1/tasks?page=1&pageSize=100&dueBefore=${encodeURIComponent(new Date(Date.now() + 30 * 864e5).toISOString())}`,
  cohort: '/v1/markers/cohort',
} as const;

export function setModuleCache(store: FarmStore, key: string, payload: unknown): void {
  store.moduleCache[key] = { fetchedAt: new Date().toISOString(), payload };
}

export function getModuleCache<T>(store: FarmStore, key: string): T | null {
  const hit = store.moduleCache[key];
  return hit ? (hit.payload as T) : null;
}

export async function prefetchAllModules(store: FarmStore, api: HttpFarmApi): Promise<void> {
  const entries = Object.entries(MODULE_CACHE_PATHS);
  await Promise.all(
    entries.map(async ([key, path]) => {
      try {
        const data = await api.get(path);
        setModuleCache(store, key, data);
      } catch {
        /* keep previous cache */
      }
    }),
  );
}

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
