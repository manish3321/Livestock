import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { MODULE_ACCESS, type ModuleKey } from '@farm/contracts';
import { useAuth } from './auth-context';
import { LoadingState } from '../components/PageState';

/** Redirects unauthenticated users to /login. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Platform operator only — farm JWTs get forbidden. */
export function RequirePlatform() {
  const { user } = useAuth();
  if (!user?.platformAdmin) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}

/** Farm users only — platform operators stay on /platform. */
export function RequireFarm() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.platformAdmin) return <Navigate to="/platform" replace />;
  if (!user.farmId || !user.role) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}

/** Blocks module routes the user's role cannot access. */
export function RequireModule({ module }: { module: ModuleKey }) {
  const { user } = useAuth();
  if (!user?.role || !MODULE_ACCESS[module].includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }
  return <Outlet />;
}

/** Commercial-only modules (P&L, reports). Household farms redirect home. */
export function RequireCommercial() {
  const { user } = useAuth();
  if (!user || user.farmMode !== 'COMMERCIAL') {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
