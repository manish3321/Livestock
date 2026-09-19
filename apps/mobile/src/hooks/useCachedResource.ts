import { useCallback, useEffect, useState } from 'react';
import { cachedGet } from '../offline/module-cache';
import { useFarm } from '../state/FarmProvider';

export function useCachedResource<T>(cacheKey: string, path: string) {
  const { store, api, persist, revision } = useFarm();
  const [data, setData] = useState<T | null>(() => {
    const hit = store.moduleCache[cacheKey];
    return hit ? (hit.payload as T) : null;
  });
  const [loading, setLoading] = useState(!store.moduleCache[cacheKey]);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await cachedGet<T>(store, api, cacheKey, path);
      setData(result.data);
      setFromCache(result.fromCache);
      persist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [api, cacheKey, path, persist, store]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  return { data, loading, fromCache, error, reload };
}
