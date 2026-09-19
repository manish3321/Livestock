import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import type { AuthUser, TokenPair } from '@farm/contracts';
import { createStore, type FarmStore } from '../core/store';
import { ensureTagBlocks, hydrateFromNetwork, runSync } from '../core/sync-engine';
import type { NotificationEngine } from '../core/notify';
import { createNotifeeEngine, MemoryNotificationEngine } from '../native/notifee-engine';
import { apiBaseUrl } from '../api/config';
import { createHttpFarmApi, type HttpFarmApi } from '../api/http-farm-api';
import { clearTokens, loadOrCreateDeviceId, loadTokens, loginPlatform } from '../api/secure-session';
import { loadPersistedStore, persistStore } from '../persistence/sqlite';
import { cacheAnimalPhotos } from '../photos/cache';
import { flushModuleOutbox, prefetchAllModules } from '../offline/module-cache';

/** Reachability for the Nest API (LAN/emulator), not "public internet". */
async function probeApiReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${apiBaseUrl()}/health/live`, { method: 'GET', signal: ctrl.signal });
    clearTimeout(timer);
    return Boolean(res.status) && res.status >= 200 && res.ok;
  } catch {
    return false;
  }
}

type FarmContextValue = {
  store: FarmStore;
  api: HttpFarmApi;
  ready: boolean;
  user: AuthUser | null;
  online: boolean;
  syncing: boolean;
  revision: number;
  bump: () => void;
  persist: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  syncNow: () => Promise<number>;
  hydrate: () => Promise<void>;
  registerPushDevice: () => Promise<void>;
};

const FarmContext = createContext<FarmContextValue | null>(null);

/** Push tokens need a native/EAS build + Expo account; skip in Expo Go. */
async function tryGetFcmToken(): Promise<string | undefined> {
  return undefined;
}

export function FarmProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef(createStore());
  const engineRef = useRef<NotificationEngine>(new MemoryNotificationEngine());
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [revision, setRevision] = useState(0);
  const wasOffline = useRef(false);

  const bump = useCallback(() => setRevision((n) => n + 1), []);
  const persist = useCallback(() => {
    persistStore(storeRef.current);
    bump();
  }, [bump]);

  const onTokens = useCallback(async (pair: TokenPair) => {
    storeRef.current.accessToken = pair.accessToken;
    storeRef.current.refreshToken = pair.refreshToken;
  }, []);

  const onAuthFailure = useCallback(async () => {
    storeRef.current.accessToken = null;
    storeRef.current.refreshToken = null;
    setUser(null);
    await clearTokens();
    persist();
  }, [persist]);

  const api = useMemo(
    () =>
      createHttpFarmApi({
        getAccessToken: () => storeRef.current.accessToken,
        getRefreshToken: () => storeRef.current.refreshToken,
        onTokens,
        onAuthFailure,
      }),
    [onAuthFailure, onTokens],
  );

  const registerPushDevice = useCallback(async () => {
    if (!storeRef.current.accessToken) return;
    try {
      const fcmToken = await tryGetFcmToken();
      await api.registerDevice({
        id: storeRef.current.deviceId,
        platform: loginPlatform(),
        fcmToken,
      });
    } catch {
      /* push registration is best-effort */
    }
  }, [api]);

  const hydrate = useCallback(async () => {
    if (!storeRef.current.accessToken) return;
    try {
      await hydrateFromNetwork(storeRef.current, api);
      await ensureTagBlocks(storeRef.current, api);
      await prefetchAllModules(storeRef.current, api);
      void cacheAnimalPhotos(storeRef.current).then(() => persist());
      setOnline(true);
      persist();
    } catch {
      // Data errors ≠ offline; only mark offline if the API itself is unreachable.
      const reachable = await probeApiReachable();
      setOnline(reachable);
    }
  }, [api, persist]);

  const syncNow = useCallback(async () => {
    if (!storeRef.current.accessToken) return 0;
    setSyncing(true);
    try {
      await flushModuleOutbox(storeRef.current, api);
      const result = await runSync(storeRef.current, api, engineRef.current);
      await prefetchAllModules(storeRef.current, api);
      setOnline(true);
      persist();
      return result.conflicts;
    } catch {
      const reachable = await probeApiReachable();
      setOnline(reachable);
      persist();
      return storeRef.current.conflicts.length;
    } finally {
      setSyncing(false);
    }
  }, [api, persist]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      engineRef.current = await createNotifeeEngine();
      const deviceId = await loadOrCreateDeviceId();
      storeRef.current.deviceId = deviceId;
      loadPersistedStore(storeRef.current);
      storeRef.current.deviceId = deviceId;
      const tokens = await loadTokens();
      storeRef.current.accessToken = tokens.accessToken;
      storeRef.current.refreshToken = tokens.refreshToken;
      if (!cancelled) {
        setReady(true);
        bump();
      }
      if (tokens.accessToken) {
        try {
          const me = (await api.me()) as AuthUser;
          if (!cancelled) setUser(me);
          await hydrateFromNetwork(storeRef.current, api);
          await ensureTagBlocks(storeRef.current, api);
          await prefetchAllModules(storeRef.current, api);
          void cacheAnimalPhotos(storeRef.current);
          void registerPushDevice();
          persistStore(storeRef.current);
          if (!cancelled) {
            setOnline(true);
            bump();
          }
        } catch {
          if (!cancelled) {
            const reachable = await probeApiReachable();
            if (!cancelled) setOnline(reachable);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, bump, registerPushDevice]);

  useEffect(() => {
    let cancelled = false;
    const applyLink = async (state: { isConnected: boolean | null }) => {
      // Emulators often report isInternetReachable=false even when 10.0.2.2 works.
      // Only trust the link flag; confirm with the farm API health endpoint.
      if (state.isConnected === false) {
        if (!cancelled) {
          setOnline(false);
          wasOffline.current = true;
        }
        return;
      }
      const reachable = await probeApiReachable();
      if (cancelled) return;
      setOnline(reachable);
      if (reachable && wasOffline.current && storeRef.current.accessToken) {
        void syncNow().then(() => hydrate());
      }
      wasOffline.current = !reachable;
    };

    void NetInfo.fetch().then((state) => applyLink(state));
    const unsub = NetInfo.addEventListener((state) => {
      void applyLink(state);
    });
    // Re-probe periodically — emulator NetInfo is flaky and API restarts are common.
    const poll = setInterval(() => {
      void NetInfo.fetch().then((state) => applyLink(state));
    }, 12_000);
    return () => {
      cancelled = true;
      unsub();
      clearInterval(poll);
    };
  }, [hydrate, syncNow]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password, storeRef.current.deviceId);
      storeRef.current.accessToken = res.accessToken;
      storeRef.current.refreshToken = res.refreshToken;
      setUser(res.user);
      try {
        await hydrateFromNetwork(storeRef.current, api);
        await ensureTagBlocks(storeRef.current, api);
        await prefetchAllModules(storeRef.current, api);
        void cacheAnimalPhotos(storeRef.current);
        void registerPushDevice();
        setOnline(true);
      } catch {
        const reachable = await probeApiReachable();
        setOnline(reachable);
      }
      persist();
    },
    [api, persist, registerPushDevice],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    persist();
  }, [api, persist]);

  const value: FarmContextValue = {
    store: storeRef.current,
    api,
    ready,
    user,
    online,
    syncing,
    revision,
    bump,
    persist,
    login,
    logout,
    syncNow,
    hydrate,
    registerPushDevice,
  };

  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

export function useFarm(): FarmContextValue {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarm requires FarmProvider');
  return ctx;
}
