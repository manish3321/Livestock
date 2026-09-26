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
import {
  apiBaseUrlCandidates,
  noteApiSuccess,
  noteWorkingOrigin,
  recentApiSuccess,
} from '../api/config';
import { createHttpFarmApi, type HttpFarmApi } from '../api/http-farm-api';
import { clearTokens, loadOrCreateDeviceId, loadTokens, loginPlatform } from '../api/secure-session';
import { loadPersistedStore, persistStore } from '../persistence/sqlite';
import { cacheAnimalPhotos } from '../photos/cache';
import { flushModuleOutbox, prefetchAllModules } from '../offline/module-cache';

async function probeOneOrigin(origin: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${origin}/health/live?_=${Date.now()}`, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    // Any real HTTP status means the API host is reachable (even 5xx).
    return typeof res.status === 'number' && res.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Reachability for the Nest API (LAN/emulator), not "public internet". */
async function probeApiReachable(): Promise<boolean> {
  // Recent successful API traffic means we are online even if a probe times out.
  if (recentApiSuccess(20_000)) return true;
  for (const origin of apiBaseUrlCandidates()) {
    if (await probeOneOrigin(origin)) {
      noteWorkingOrigin(origin);
      noteApiSuccess();
      return true;
    }
  }
  return false;
}

/** Require three failed probes before flipping offline (stops NetInfo/emulator flap). */
function createReachabilityTracker(onChange: (online: boolean) => void) {
  let online = true;
  let fails = 0;
  let inFlight: Promise<boolean> | null = null;

  const probe = async (): Promise<boolean> => {
    if (inFlight) return inFlight;
    inFlight = probeApiReachable().finally(() => {
      inFlight = null;
    });
    const ok = await inFlight;
    if (ok) {
      fails = 0;
      if (!online) {
        online = true;
        onChange(true);
      }
      return true;
    }
    fails += 1;
    if (fails >= 3 && online) {
      online = false;
      onChange(false);
    }
    return false;
  };

  return { probe, get online() { return online; } };
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

/** Push tokens need notification permission; works in Expo Go (Expo token) and EAS (FCM/APNs). */
async function tryGetFcmToken(): Promise<string | undefined> {
  try {
    const { getPushToken } = await import('../native/push-token');
    return await getPushToken();
  } catch {
    return undefined;
  }
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
  const reachabilityRef = useRef(
    createReachabilityTracker((next) => {
      setOnline(next);
    }),
  );

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
      // Data errors ≠ offline; only mark offline after stable probe failures.
      await reachabilityRef.current.probe();
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
      await reachabilityRef.current.probe();
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
            await reachabilityRef.current.probe();
            await reachabilityRef.current.probe();
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
    const check = async () => {
      // Always probe the farm API. NetInfo isConnected flickers on emulators and
      // must not force Offline by itself.
      const reachable = await reachabilityRef.current.probe();
      if (cancelled) return;
      if (reachable && wasOffline.current && storeRef.current.accessToken) {
        void syncNow().then(() => hydrate());
      }
      wasOffline.current = !reachabilityRef.current.online;
    };

    void check();
    const unsub = NetInfo.addEventListener(() => {
      void check();
    });
    const poll = setInterval(() => {
      void check();
    }, 30_000);
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
        await reachabilityRef.current.probe();
        await reachabilityRef.current.probe();
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
