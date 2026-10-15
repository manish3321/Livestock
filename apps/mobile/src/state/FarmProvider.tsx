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
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useLocale } from '../locale/LocaleProvider';
import type { AuthUser, TokenPair } from '@farm/contracts';
import { createStore, type FarmStore } from '../core/store';
import { pendingMutations } from '../core/scan-round';
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
  patchUser: (partial: Partial<AuthUser>) => void;
};

const FarmContext = createContext<FarmContextValue | null>(null);

const MODULE_REFRESH_MS = 5 * 60_000;

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
  const syncInFlightRef = useRef<Promise<number> | null>(null);
  const syncAgainRef = useRef<Promise<number> | null>(null);
  const syncNowRef = useRef<() => Promise<number>>(() => Promise.resolve(0));
  const moduleRefreshRef = useRef<Promise<void> | null>(null);
  const lastModuleRefreshRef = useRef(0);
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

  const { t } = useLocale();
  const tRef = useRef(t);
  tRef.current = t;
  const api = useMemo(
    () =>
      createHttpFarmApi({
        getAccessToken: () => storeRef.current.accessToken,
        getRefreshToken: () => storeRef.current.refreshToken,
        onTokens,
        onAuthFailure,
        onPendingApproval: () =>
          Alert.alert(tRef.current('approvals.sentTitle'), tRef.current('approvals.sent')),
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

  // Offline copies of every module screen (~18 requests). Refreshed in the background so
  // "Syncing…" only covers sending and receiving changes; screens fetch live data when online.
  const refreshModules = useCallback(
    (force = false): Promise<void> => {
      if (moduleRefreshRef.current) return moduleRefreshRef.current;
      if (!force && Date.now() - lastModuleRefreshRef.current < MODULE_REFRESH_MS) {
        return Promise.resolve();
      }
      lastModuleRefreshRef.current = Date.now();
      const run = prefetchAllModules(storeRef.current, api)
        .then(() => persist())
        .finally(() => {
          moduleRefreshRef.current = null;
        });
      moduleRefreshRef.current = run;
      return run;
    },
    [api, persist],
  );

  const hydrate = useCallback(async () => {
    if (!storeRef.current.accessToken) return;
    try {
      await hydrateFromNetwork(storeRef.current, api);
      await ensureTagBlocks(storeRef.current, api);
      void refreshModules();
      void cacheAnimalPhotos(storeRef.current).then(() => persist());
      setOnline(true);
      persist();
    } catch {
      // Data errors ≠ offline; only mark offline after stable probe failures.
      await reachabilityRef.current.probe();
    }
  }, [api, persist, refreshModules]);

  const syncNow = useCallback((): Promise<number> => {
    if (!storeRef.current.accessToken) return Promise.resolve(0);
    if (syncInFlightRef.current) {
      // Work queued during this run (e.g. the next shed save) must not wait for a later trigger.
      const current = syncInFlightRef.current;
      if (!syncAgainRef.current) {
        syncAgainRef.current = current.then(() => {
          syncAgainRef.current = null;
          return syncNowRef.current();
        });
      }
      return syncAgainRef.current;
    }
    const run = (async () => {
      setSyncing(true);
      try {
        const hadLocalChanges = pendingMutations(storeRef.current).length > 0;
        const flushed = await flushModuleOutbox(storeRef.current, api);
        const result = await runSync(storeRef.current, api, engineRef.current);
        setOnline(true);
        persist();
        void refreshModules(hadLocalChanges || flushed > 0);
        return result.conflicts;
      } catch {
        await reachabilityRef.current.probe();
        persist();
        return storeRef.current.conflicts.length;
      } finally {
        setSyncing(false);
        syncInFlightRef.current = null;
      }
    })();
    syncInFlightRef.current = run;
    return run;
  }, [api, persist, refreshModules]);
  syncNowRef.current = syncNow;

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
          void refreshModules(true);
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
  }, [api, bump, refreshModules, registerPushDevice]);

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
        void refreshModules(true);
        void cacheAnimalPhotos(storeRef.current);
        void registerPushDevice();
        setOnline(true);
      } catch {
        await reachabilityRef.current.probe();
        await reachabilityRef.current.probe();
      }
      persist();
    },
    [api, persist, refreshModules, registerPushDevice],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    persist();
  }, [api, persist]);

  const patchUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

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
    patchUser,
  };

  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

export function useFarm(): FarmContextValue {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarm requires FarmProvider');
  return ctx;
}
