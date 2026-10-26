import { useCallback, useEffect, useRef, useState } from 'react';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import { useFarm } from '../state/FarmProvider';

/**
 * Show cached module data immediately, then refresh from the network in the
 * background. Avoids the "blank for a minute" wait after a task when sync is
 * busy refreshing offline copies.
 */
export function useCachedResource<T>(cacheKey: string, path: string) {
  const { store, api, persist, revision } = useFarm();
  const [data, setData] = useState<T | null>(() => getModuleCache<T>(store, cacheKey));
  const [loading, setLoading] = useState(() => getModuleCache<T>(store, cacheKey) === null);
  const [fromCache, setFromCache] = useState(() => getModuleCache<T>(store, cacheKey) !== null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const lastPath = useRef(path);

  const reload = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const cached = getModuleCache<T>(store, cacheKey);
      if (cached !== null) {
        setData(cached);
        setFromCache(true);
        setLoading(false);
      } else if (!opts?.quiet) {
        setLoading(true);
      }
      setError(null);
      try {
        const next = await api.get<T>(path);
        setModuleCache(store, cacheKey, next);
        setData(next);
        setFromCache(false);
        persist();
      } catch (err) {
        if (cached === null) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [api, cacheKey, path, persist, store],
  );

  useEffect(() => {
    const pathChanged = lastPath.current !== path;
    lastPath.current = path;
    void reload({ quiet: !pathChanged && getModuleCache<T>(store, cacheKey) !== null });
  }, [reload, revision, cacheKey, path, store]);

  return { data, loading, fromCache, error, reload: () => reload() };
}
