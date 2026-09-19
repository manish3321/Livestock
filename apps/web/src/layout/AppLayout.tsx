import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { modulesForRole, type ModuleKey } from '@farm/contracts';
import { useAuth } from '../auth/auth-context';
import { ModuleIcon } from '../components/ModuleIcon';
import {
  ScanAnywhere,
  ScanOverlayProvider,
  TopbarScanButton,
} from '../components/ScanAnywhere';
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

function MoreGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M5 7h14M5 12h14M5 17h10"
      />
    </svg>
  );
}

function FarmMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect width="28" height="28" rx="8" fill="rgba(255,255,255,0.18)" />
        <path
          d="M8 18.5c2.2-4.2 4.6-6.5 6-6.5s3.8 2.3 6 6.5"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="14" cy="10" r="2.2" fill="#fff" />
      </svg>
    </span>
  );
}

/** Role-aware shell: moss sidebar + cream top bar + mobile tabs. */
export function AppLayout() {
  return (
    <ScanOverlayProvider>
      <AppLayoutInner />
    </ScanOverlayProvider>
  );
}

function AppLayoutInner() {
  const { user, signOut, can } = useAuth();
  const { household, livestockTrackingMode } = useFarmMode();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

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
    <div className={`app-shell${moreOpen ? ' more-open' : ''}`}>
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label={t('common.close')}
        onClick={() => setMoreOpen(false)}
      />
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
              {group.labelKey === 'nav.group.home' && allowed.has('shed') && (
                <>
                  <NavLink to="/shed/cohort">{t('nav.cohort')}</NavLink>
                  <NavLink to="/shed/sheet">{t('nav.dailySheet')}</NavLink>
                </>
              )}
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
            <TopbarScanButton />
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
      <ScanAnywhere />
      {/* Mobile: Home / Shed / Inbox / More + ember Scan FAB (from ScanAnywhere) */}
      <nav className="tab-bar no-print" aria-label={t('appName')}>
        {allowed.has('dashboard') && (
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
            <ModuleIcon module="dashboard" size={20} />
            {t('nav.dashboard')}
          </NavLink>
        )}
        {allowed.has('shed') && (
          <NavLink to="/shed" className={({ isActive }) => (isActive ? 'active' : '')}>
            <ModuleIcon module="shed" size={20} />
            {t('nav.shed')}
          </NavLink>
        )}
        {allowed.has('inbox') && (
          <NavLink to="/inbox" className={({ isActive }) => (isActive ? 'active' : '')}>
            <ModuleIcon module="inbox" size={20} />
            {t('nav.inbox')}
          </NavLink>
        )}
        <button
          type="button"
          className={moreOpen ? 'active' : ''}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <MoreGlyph />
          {t('nav.more')}
        </button>
      </nav>
    </div>
  );
}
