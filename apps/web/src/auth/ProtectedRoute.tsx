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

/** Blocks module routes the user's role cannot access. */
export function RequireModule({ module }: { module: ModuleKey }) {
  const { user } = useAuth();
  if (!user || !MODULE_ACCESS[module].includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }
  return <Outlet />;
}
