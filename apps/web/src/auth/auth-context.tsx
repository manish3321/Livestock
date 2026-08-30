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
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  patchUser: (partial: Partial<AuthUser>) => void;
  can: (permission: Permission) => boolean;
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
      applyUser({
        ...me,
        farmMode: me.farmMode === 'COMMERCIAL' ? 'COMMERCIAL' : 'HOUSEHOLD',
      });
    } catch {
      /* keep cached user if refresh fails */
    }
  }, [applyUser]);

  useEffect(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (stored && apiClient.getAccessToken()) {
      try {
        const parsed = JSON.parse(stored) as AuthUser;
        setUser({
          ...parsed,
          farmMode: parsed.farmMode === 'COMMERCIAL' ? 'COMMERCIAL' : 'HOUSEHOLD',
        });
      } catch {
        localStorage.removeItem(USER_KEY);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading && apiClient.getAccessToken()) {
      void refreshUser();
    }
  }, [loading, refreshUser]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await apiClient.login(email, password);
      applyUser({
        ...response.user,
        farmMode: response.user.farmMode === 'COMMERCIAL' ? 'COMMERCIAL' : 'HOUSEHOLD',
      });
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
      user !== null && ROLE_PERMISSIONS[user.role].includes(permission),
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
