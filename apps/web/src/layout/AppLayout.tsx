import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { modulesForRole, type ModuleKey } from '@farm/contracts';
import { useAuth } from '../auth/auth-context';
import { ModuleIcon } from '../components/ModuleIcon';
import { useFarmMode } from '../hooks/useFarmMode';
import { setLocale } from '../i18n';
import {
  HOUSEHOLD_HIDDEN,
  NON_NAV_MODULES,
  livestockModuleOrder,
} from '../lib/navigation';

/**
 * Sidebar groups. The livestock entries are spliced in from the farm's
 * tracking mode so the primary surface leads.
 */
function navGroups(livestock: ModuleKey[]): { labelKey: string; modules: ModuleKey[] }[] {
  return [
    {
      labelKey: 'nav.group.home',
      modules: ['dashboard', 'shed', 'inbox'],
    },
    {
      labelKey: 'nav.group.farm',
      modules: [
        ...livestock,
        'groups',
        'fish',
        'scan',
        'health',
        'breeding',
        'production',
        'feed',
        'inventory',
      ],
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
}

function FarmMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect width="28" height="28" rx="8" fill="currentColor" />
        <path
          d="M8 18.5c2.2-4.2 4.6-6.5 6-6.5s3.8 2.3 6 6.5"
          stroke="#F4F1EA"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="14" cy="10" r="2.2" fill="#F4F1EA" />
      </svg>
    </span>
  );
}

/** Role-aware shell: light pasture sidebar + top bar. */
export function AppLayout() {
  const { user, signOut, can } = useAuth();
  const { household, livestockTrackingMode } = useFarmMode();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  if (!user) return null;
  const allowed = new Set(modulesForRole(user.role));
  const groups = navGroups(livestockModuleOrder(livestockTrackingMode));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const today = new Intl.DateTimeFormat(i18n.language === 'ne' ? 'ne-NP' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  return (
    <div className="app-shell">
      <nav className="sidebar" aria-label={t('appName')}>
        <div className="sidebar-brand">
          <FarmMark />
          <div>
            {t('appName')}
            <span>
              {user.farmName}
              {household ? ` · ${t('admin.modeHousehold')}` : ''}
            </span>
          </div>
        </div>

        {groups.map((group) => {
          const items = group.modules.filter(
            (m) =>
              allowed.has(m) &&
              !NON_NAV_MODULES.has(m) &&
              !(household && HOUSEHOLD_HIDDEN.has(m)),
          );
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
              {group.labelKey === 'nav.group.money' && can('finance:read') && !household && (
                <NavLink to="/profit">{t('nav.profit')}</NavLink>
              )}
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
      </nav>
      <div className="main">
        <header className="topbar">
          <div className="topbar-meta">
            <strong>{user.farmName}</strong>
            <span>{today}</span>
          </div>
          <div className="topbar-actions">
            <div className="topbar-user">
              <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{user.name}</strong>
                {t(`common.role.${user.role}`)}
              </span>
            </div>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setLocale(i18n.language === 'en' ? 'ne' : 'en')}
              aria-label="Switch language"
            >
              {i18n.language === 'en' ? 'नेपाली' : 'English'}
            </button>
            <button className="btn ghost" type="button" onClick={() => void handleSignOut()}>
              {t('nav.logout')}
            </button>
          </div>
        </header>
        <main className="content rise-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
