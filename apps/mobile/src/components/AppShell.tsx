import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ModuleKey } from '@farm/contracts';
import { OfflineBanner } from './OfflineBanner';
import { TopBar } from './shell/TopBar';
import { BottomTabBar, type TabKey } from './shell/BottomTabBar';
import { MoreDrawer, type DrawerDest } from './shell/MoreDrawer';
import { Txt } from './ui';
import { RequireCommercial, RequireModule } from '../navigation/RequireModule';
import { useFarm } from '../state/FarmProvider';
import { useAccess } from '../hooks/useAccess';
import { useLocale } from '../locale/LocaleProvider';
import { livestockModuleOrder, navGroups, navigableModules, MODULE_ROUTE } from '../navigation/modules';
import type { RootStackParamList } from '../navigation/types';
import { apiPlatformHint } from '../api/config';
import { color } from '../theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const COMMERCIAL_ONLY: ReadonlySet<ModuleKey> = new Set(['pnl', 'reports']);

function tabForModule(module?: ModuleKey): TabKey | null {
  if (!module) return null;
  if (module === 'dashboard') return 'dashboard';
  if (module === 'shed') return 'shed';
  if (module === 'inbox') return 'inbox';
  return 'more';
}

export function AppShell({
  module,
  children,
  hideTabs,
  title,
  showBack,
}: {
  title?: string;
  module?: ModuleKey;
  children: ReactNode;
  right?: ReactNode;
  showBack?: boolean;
  hideTabs?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, logout, online, syncing } = useFarm();
  const { can, household, commercial } = useAccess();
  const { locale, t, toggleLocale } = useLocale();
  const [moreOpen, setMoreOpen] = useState(false);

  const allowed = useMemo(() => {
    if (!user) return new Set<ModuleKey>();
    return new Set(
      navigableModules(user.role, {
        household: user.farmMode === 'HOUSEHOLD',
        trackingMode: user.livestockTrackingMode,
      }),
    );
  }, [user]);

  const groups = useMemo(
    () => navGroups(livestockModuleOrder(user?.livestockTrackingMode ?? 'INDIVIDUAL')),
    [user?.livestockTrackingMode],
  );
  const heading = title;

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'ne' ? 'ne-NP' : 'en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(new Date()),
    [locale],
  );

  const goModule = (key: ModuleKey) => {
    setMoreOpen(false);
    navigation.navigate(MODULE_ROUTE[key] as never);
  };

  const onDrawerNav = (dest: DrawerDest) => {
    setMoreOpen(false);
    if (dest.type === 'module') goModule(dest.module);
    else {
      const nav = navigation as { navigate: (name: string, params?: object) => void };
      nav.navigate(dest.route, dest.params);
    }
  };

  const onTab = (key: TabKey) => {
    if (key === 'more') {
      setMoreOpen((v) => !v);
      return;
    }
    setMoreOpen(false);
    if (key === 'dashboard') goModule('dashboard');
    else if (key === 'shed') goModule('shed');
    else if (key === 'inbox') goModule('inbox');
  };

  const activeTab = moreOpen ? 'more' : tabForModule(module);
  const showTabs = !hideTabs;

  const body = (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TopBar
        farmName={user?.farmName ?? t('appName')}
        todayLabel={todayLabel}
        onLocale={toggleLocale}
        localeLabel={locale === 'en' ? 'नेपाली' : 'English'}
        onSignOut={() => void logout()}
        signOutLabel={t('nav.logout')}
        userInitial={user?.name?.slice(0, 1).toUpperCase()}
      />
      <OfflineBanner
        mode={syncing ? 'syncing' : online ? 'online' : 'offline'}
        label={
          syncing
            ? t('native.syncing')
            : online
              ? t('native.onlineBanner')
              : `${t('native.offlineBanner')} · ${apiPlatformHint()}`
        }
      />
      <View style={styles.body}>
        {showBack || heading ? (
          <View style={styles.shellTitle}>
            {showBack ? (
              <Pressable
                onPress={() => {
                  if (navigation.canGoBack()) navigation.goBack();
                  else navigation.navigate('Dashboard');
                }}
                hitSlop={8}
              >
                <Txt style={styles.backLink}>← {t('common.back', { defaultValue: 'Back' })}</Txt>
              </Pressable>
            ) : null}
            {heading ? (
              <Txt weight="display" style={styles.shellTitleText}>
                {heading}
              </Txt>
            ) : null}
          </View>
        ) : null}
        {children}
      </View>
      {showTabs ? (
        <BottomTabBar
          active={activeTab}
          allowed={allowed}
          onPress={onTab}
          onScan={() => {
            setMoreOpen(false);
            navigation.navigate('Scan');
          }}
        />
      ) : null}
      {user ? (
        <MoreDrawer
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          farmName={user.farmName}
          household={household}
          groups={groups}
          activeModule={module}
          allowed={allowed}
          showProfit={Boolean(can('finance:read') && commercial && !household)}
          showAdminMembers={can('users:manage')}
          showAdminAudit={can('audit:read')}
          onNavigate={onDrawerNav}
        />
      ) : null}
    </View>
  );

  if (!module) return body;
  let gated = <RequireModule module={module}>{body}</RequireModule>;
  if (COMMERCIAL_ONLY.has(module)) {
    gated = <RequireCommercial>{gated}</RequireCommercial>;
  }
  return gated;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surfaceSubtle },
  body: { flex: 1, minHeight: 0 },
  shellTitle: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 4 },
  shellTitleText: { fontSize: 24, letterSpacing: -0.3 },
  backLink: { fontSize: 14, color: color.brand, marginBottom: 2 },
});
