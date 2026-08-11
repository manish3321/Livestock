import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { modulesForRole, type ModuleKey } from '@farm/contracts';
import { useAuth } from '../auth/auth-context';
import { ModuleIcon } from '../components/ModuleIcon';
import { setLocale } from '../i18n';

const NAV_GROUPS: { labelKey: string; modules: ModuleKey[] }[] = [
  {
    labelKey: 'nav.group.home',
    modules: ['dashboard'],
  },
  {
    labelKey: 'nav.group.farm',
    modules: ['animals', 'groups', 'fish', 'health', 'breeding', 'production', 'inventory'],
  },
  {
    labelKey: 'nav.group.money',
    modules: ['expenses', 'revenue', 'pnl'],
  },
  {
    labelKey: 'nav.group.insights',
    modules: ['reports'],
  },
];

/** Role-aware shell: grouped menu for clearer adult scanning + modern look. */
export function AppLayout() {
  const { user, signOut, can } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  if (!user) return null;
  const allowed = new Set(modulesForRole(user.role));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <nav className="sidebar" aria-label={t('appName')}>
        <div className="sidebar-brand">
          {t('appName')}
          <span>{user.farmName}</span>
        </div>

        {NAV_GROUPS.map((group) => {
          const items = group.modules.filter((m) => allowed.has(m));
          if (items.length === 0) return null;
          return (
            <div key={group.labelKey} className="nav-group">
              <div className="nav-group-label">{t(group.labelKey)}</div>
              {items.map((m) => (
                <NavLink
                  key={m}
                  to={`/${m}`}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  <ModuleIcon module={m} />
                  {t(`nav.${m}`)}
                </NavLink>
              ))}
            </div>
          );
        })}

        {(can('users:manage') || can('audit:read')) && (
          <div className="nav-group">
            <div className="nav-group-label">{t('nav.group.admin')}</div>
            {can('users:manage') && (
              <NavLink to="/admin/members">{t('nav.members')}</NavLink>
            )}
            {can('audit:read') && (
              <NavLink to="/admin/audit">{t('nav.audit')}</NavLink>
            )}
          </div>
        )}

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong>{user.name}</strong>
            {t(`common.role.${user.role}`)}
          </div>
          <button
            className="btn secondary"
            type="button"
            onClick={() => setLocale(i18n.language === 'en' ? 'ne' : 'en')}
            aria-label="Switch language"
          >
            {i18n.language === 'en' ? 'नेपाली' : 'English'}
          </button>
          <button className="btn secondary" type="button" onClick={() => void handleSignOut()}>
            {t('nav.logout')}
          </button>
        </div>
      </nav>
      <div className="main">
        <main className="content rise-in" style={{ paddingTop: 'var(--space-xl)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
