import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ROLE_PERMISSIONS, type AuthUser, type Permission } from '@farm/contracts';
import * as apiClient from '../api/client';

const USER_KEY = 'farm.user';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  patchUser: (partial: Partial<AuthUser>) => void;
  can: (permission: Permission) => boolean;
}

function normalizeUser(me: AuthUser): AuthUser {
  return {
    ...me,
    platformAdmin: Boolean(me.platformAdmin),
    farmId: me.farmId ?? null,
    farmName: me.farmName ?? null,
    farmMode: me.farmMode === 'COMMERCIAL' ? 'COMMERCIAL' : me.farmMode === 'HOUSEHOLD' ? 'HOUSEHOLD' : null,
    livestockTrackingMode:
      me.livestockTrackingMode === 'BATCH'
        ? 'BATCH'
        : me.livestockTrackingMode === 'INDIVIDUAL'
          ? 'INDIVIDUAL'
          : null,
    role: me.role ?? null,
    permissions: me.permissions ?? [],
  };
}

const AuthContext = createContext<AuthContextValue | null>(null);

function persistUser(next: AuthUser | null) {
  if (next) localStorage.setItem(USER_KEY, JSON.stringify(next));
  else localStorage.removeItem(USER_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applyUser = useCallback((next: AuthUser | null) => {
    setUser(next);
    persistUser(next);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!apiClient.getAccessToken()) return;
    try {
      const me = await apiClient.api<AuthUser>('/v1/auth/me');
      applyUser(normalizeUser(me));
    } catch {
      /* keep cached user if refresh fails */
    }
  }, [applyUser]);

  useEffect(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (stored && apiClient.getAccessToken()) {
      try {
        const parsed = JSON.parse(stored) as AuthUser;
        setUser(normalizeUser(parsed));
      } catch {
        localStorage.removeItem(USER_KEY);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    apiClient.setAuthClearedListener(() => applyUser(null));
    return () => apiClient.setAuthClearedListener(null);
  }, [applyUser]);

  useEffect(() => {
    if (!loading && apiClient.getAccessToken()) {
      void refreshUser();
    }
  }, [loading, refreshUser]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await apiClient.login(email, password);
      const next = normalizeUser(response.user);
      applyUser(next);
      return next;
    },
    [applyUser],
  );

  const signOut = useCallback(async () => {
    await apiClient.logout();
    applyUser(null);
  }, [applyUser]);

  const patchUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      persistUser(next);
      return next;
    });
  }, []);

  const can = useCallback(
    (permission: Permission) =>
      user !== null &&
      user.role !== null &&
      !user.platformAdmin &&
      ROLE_PERMISSIONS[user.role].includes(permission),
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, refreshUser, patchUser, can }),
    [user, loading, signIn, signOut, refreshUser, patchUser, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
