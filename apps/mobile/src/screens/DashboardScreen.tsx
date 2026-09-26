import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatDate, formatDateTime, formatNPR, SPECIES_LABEL, type Species } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { ModuleIcon } from '../components/ModuleIcon';
import {
  Card,
  EarTagBadge,
  ErrorState,
  LoadingState,
  ScreenScroll,
  SectionHead,
  Txt,
} from '../components/ui';
import { useAccess } from '../hooks/useAccess';
import { useCachedResource } from '../hooks/useCachedResource';
import { MODULE_CACHE_PATHS } from '../offline/module-cache';
import { useLocale } from '../locale/LocaleProvider';
import type { RootStackParamList } from '../navigation/types';
import { color, fonts } from '../theme/tokens';
import Svg, { Polyline, Text as SvgText } from 'react-native-svg';

type AlertItem = { id: string; title: string; detail?: string | null; dueAt?: string | null };

type DashboardSummary = {
  animalCount: number;
  revenueTotal?: number | null;
  expenseTotal?: number | null;
  netProfit?: number | null;
  financeTrend?: Array<{ month: string; revenue: number; expenses: number }>;
  yesterdayProduction?: { milkLiters: number; eggCount: number; fishKg: number };
  speciesDistribution: Array<{ species: string; count: number }>;
  alerts: {
    healthOverdue: AlertItem[];
    inventoryCritical: AlertItem[];
    pendingApprovals: AlertItem[];
    inventoryExpiring?: AlertItem[];
    unpaidRevenue?: AlertItem[];
    dueCalving?: AlertItem[];
    vaccineToday?: AlertItem[];
  };
  recentActivity: Array<{ id: string; kind: string; summary: string; createdAt: string }>;
};

function batchDistributionLabel(key: string): string {
  const parts = key.split(':');
  const kind = parts.length > 1 ? parts[0]! : '';
  const category = parts.length > 1 ? parts.slice(1).join(':') : key;
  const cat =
    SPECIES_LABEL[category as Species] ?? category.charAt(0) + category.slice(1).toLowerCase();
  if (!kind) return cat;
  const kindLabel =
    kind === 'LIVESTOCK' ? 'Livestock' : kind === 'POULTRY' ? 'Poultry' : kind === 'FISH' ? 'Fish' : kind;
  return `${kindLabel} · ${cat}`;
}

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, can, commercial } = useAccess();
  const { t, locale } = useLocale();
  const showFinance = can('finance:read');
  const { data, loading, error, reload } = useCachedResource<DashboardSummary>(
    'dashboard',
    MODULE_CACHE_PATHS.dashboard,
  );

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.goodMorning');
    if (hour < 17) return t('dashboard.goodAfternoon');
    return t('dashboard.goodEvening');
  }, [t, locale]);

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'ne' ? 'ne-NP' : 'en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    [locale],
  );

  const urgentCount =
    (data?.alerts?.healthOverdue?.length ?? 0) + (data?.alerts?.inventoryCritical?.length ?? 0);
  const vaccineDue = data?.alerts?.vaccineToday?.length ?? 0;
  const hour = new Date().getHours();
  const shiftKey = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const shiftLabel = t(`dashboard.shift${shiftKey}`);
  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <AppShell module="dashboard">
      {loading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {data ? (
        <ScreenScroll>
          <View style={styles.greetCard}>
            <View style={styles.shiftPill}>
              <Txt weight="semibold" style={styles.shiftPillText}>
                {shiftLabel}
              </Txt>
            </View>
            <View style={styles.greetRow}>
              <View style={{ flex: 1 }}>
                <Txt weight="display" style={styles.greetTitle}>
                  {greeting}
                  {firstName ? `, ${firstName}` : ''}
                </Txt>
                <Txt muted style={styles.greetSub}>
                  {todayLabel}
                  {user?.role ? ` · ${user.role}` : ''}
                </Txt>
              </View>
              <View style={styles.greetAvatar}>
                <Txt weight="bold" style={styles.greetAvatarText}>
                  {(firstName || user?.farmName || 'F').slice(0, 2).toUpperCase()}
                </Txt>
              </View>
            </View>
          </View>

          {urgentCount > 0 ? (
            <Pressable
              style={styles.overdueBanner}
              onPress={() => navigation.navigate('Health')}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Txt weight="bold" style={styles.overdueTitle}>
                  {t('dashboard.overdueHealth', { count: urgentCount })}
                </Txt>
                <Txt style={styles.overdueSub}>
                  {vaccineDue > 0
                    ? t('dashboard.tileHealthDue', { count: vaccineDue })
                    : t('dashboard.tileHealth')}
                </Txt>
              </View>
              <View style={styles.fixNowBtn}>
                <Txt weight="bold" style={styles.fixNowText}>
                  {t('dashboard.fixNow')}
                </Txt>
              </View>
            </Pressable>
          ) : null}

          <View style={styles.sectionHeadRow}>
            <Txt weight="display" style={styles.sectionTitle}>
              {t('dashboard.shedShortcuts')}
            </Txt>
            <Txt muted style={styles.sectionHint}>
              {t('dashboard.shedShortcutsHint')}
            </Txt>
          </View>
          <View style={styles.shortcutGrid}>
            <Pressable
              style={[styles.shortcut, styles.shortcutPrimary]}
              onPress={() => navigation.navigate('Shed')}
              accessibilityRole="button"
            >
              <View style={styles.shortcutIconPrimary}>
                <ModuleIcon module="shed" size={24} color="#FFFDF9" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="bold" style={styles.shortcutTitleOn}>
                  {t('dashboard.shortcutShed')}
                </Txt>
                <Txt style={styles.shortcutSubOn}>{t('dashboard.shortcutShedSub')}</Txt>
              </View>
            </Pressable>
            <Pressable
              style={[styles.shortcut, styles.shortcutBreed]}
              onPress={() => navigation.navigate('Breeding')}
              accessibilityRole="button"
            >
              <View style={styles.shortcutIconBreed}>
                <ModuleIcon module="breeding" size={24} color={color.ember} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="bold" style={styles.shortcutTitle}>
                  {t('dashboard.shortcutBreeding')}
                </Txt>
                <Txt style={styles.shortcutSubBreed}>{t('dashboard.shortcutBreedingSub')}</Txt>
              </View>
            </Pressable>
            <Pressable
              style={[styles.shortcut, styles.shortcutHealth]}
              onPress={() => navigation.navigate('Health')}
              accessibilityRole="button"
            >
              <View style={styles.shortcutIconMint}>
                <ModuleIcon module="health" size={24} color={color.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="bold" style={styles.shortcutTitle}>
                  {t('dashboard.shortcutHealth')}
                </Txt>
                <Txt muted style={styles.shortcutSub}>
                  {t('dashboard.shortcutHealthSub')}
                </Txt>
              </View>
            </Pressable>
            {showFinance ? (
              <Pressable
                style={[styles.shortcut, styles.shortcutExpense]}
                onPress={() => navigation.navigate('Expenses')}
                accessibilityRole="button"
              >
                <View style={styles.shortcutIconClay}>
                  <ModuleIcon module="expenses" size={24} color={color.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt weight="bold" style={styles.shortcutTitle}>
                    {t('dashboard.shortcutExpenses')}
                  </Txt>
                  <Txt muted style={styles.shortcutSub}>
                    {t('dashboard.shortcutExpensesSub')}
                  </Txt>
                </View>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.shortcut, styles.shortcutHealth]}
                onPress={() => navigation.navigate('Scan')}
                accessibilityRole="button"
              >
                <View style={styles.shortcutIconMint}>
                  <ModuleIcon module="scan" size={24} color={color.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt weight="bold" style={styles.shortcutTitle}>
                    {t('nav.scan')}
                  </Txt>
                  <Txt muted style={styles.shortcutSub}>
                    {t('dashboard.tileScan')}
                  </Txt>
                </View>
              </Pressable>
            )}
          </View>

          <Pressable
            style={[styles.sectionHeadRow, { marginTop: 8 }]}
            onPress={() => navigation.navigate('Production')}
            accessibilityRole="button"
          >
            <Txt weight="display" style={styles.sectionTitle}>
              {t('dashboard.productionCensus')}
            </Txt>
            <Txt weight="bold" style={styles.yesterdayTag}>
              {t('dashboard.yesterdayTag')}
            </Txt>
          </Pressable>
          {data.yesterdayProduction ? (
            <View style={styles.bento}>
              <Pressable
                style={styles.milkHero}
                onPress={() => navigation.navigate('Production')}
                accessibilityRole="button"
              >
                <View style={styles.milkIcon}>
                  <ModuleIcon module="production" size={28} color={color.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt muted style={styles.milkLabel}>
                    {t('dashboard.dailyMilk')}
                  </Txt>
                  <Txt style={styles.milkValue}>
                    {data.yesterdayProduction.milkLiters}{' '}
                    <Txt style={styles.milkUnit}>L</Txt>
                  </Txt>
                </View>
              </Pressable>
              <View style={styles.bentoRow}>
                <Pressable
                  style={styles.bentoHalf}
                  onPress={() => navigation.navigate('Groups')}
                  accessibilityRole="button"
                >
                  <Txt muted style={styles.bentoLabel}>
                    {t('dashboard.poultry')}
                  </Txt>
                  <Txt style={styles.bentoValue}>
                    {data.yesterdayProduction.eggCount}{' '}
                    <Txt muted style={{ fontSize: 12 }}>
                      eggs
                    </Txt>
                  </Txt>
                </Pressable>
                <Pressable
                  style={styles.bentoHalf}
                  onPress={() => navigation.navigate('Fish')}
                  accessibilityRole="button"
                >
                  <Txt muted style={styles.bentoLabel}>
                    {t('dashboard.pond')}
                  </Txt>
                  <Txt style={styles.bentoValue}>
                    {data.yesterdayProduction.fishKg}{' '}
                    <Txt muted style={{ fontSize: 12 }}>
                      kg
                    </Txt>
                  </Txt>
                </Pressable>
              </View>
            </View>
          ) : null}

          {(data.speciesDistribution ?? []).length > 0 ? (
            <View style={styles.census}>
              {(data.speciesDistribution ?? []).slice(0, 4).map((row, i) => (
                <Pressable
                  key={row.species}
                  style={styles.censusItem}
                  onPress={() => {
                    const kind = row.species.split(':')[0];
                    if (kind === 'FISH') navigation.navigate('Fish');
                    else if (kind === 'POULTRY') navigation.navigate('Groups');
                    else if (kind === 'LIVESTOCK') navigation.navigate('Animals');
                    else navigation.navigate('Batches');
                  }}
                  accessibilityRole="button"
                >
                  {i > 0 ? <View style={styles.censusRule} /> : null}
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Txt weight="bold" style={styles.censusNum}>
                      {row.count}
                    </Txt>
                    <Txt muted style={styles.censusLabel} numberOfLines={1}>
                      {batchDistributionLabel(row.species)}
                    </Txt>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {showFinance ? (
            <View style={styles.financeCard}>
              <Pressable onPress={() => navigation.navigate('Pnl')} accessibilityRole="button">
                <Txt weight="bold" style={styles.financeHead}>
                  {t('dashboard.dailyFinancials')}
                </Txt>
              </Pressable>
              <View style={styles.financeGrid}>
                <Pressable
                  style={styles.financeCell}
                  onPress={() => navigation.navigate('Revenue')}
                  accessibilityRole="button"
                >
                  <Txt muted style={styles.financeLabel}>
                    {t('dashboard.revenue')}
                  </Txt>
                  <Txt style={styles.financeValue}>{formatNPR(data.revenueTotal ?? 0)}</Txt>
                </Pressable>
                <Pressable
                  style={styles.financeCell}
                  onPress={() => navigation.navigate('Expenses')}
                  accessibilityRole="button"
                >
                  <Txt muted style={styles.financeLabel}>
                    {t('dashboard.expenses')}
                  </Txt>
                  <Txt style={[styles.financeValue, { color: color.emberStrong }]}>
                    {formatNPR(data.expenseTotal ?? 0)}
                  </Txt>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Pressable
            style={[styles.sectionHeadRow, { marginTop: 4 }]}
            onPress={() => navigation.navigate('Inbox')}
            accessibilityRole="button"
          >
            <Txt weight="display" style={styles.sectionTitle}>
              {t('dashboard.actionRequired')}
            </Txt>
            {urgentCount > 0 ? (
              <Txt weight="bold" style={{ color: color.ember, fontSize: 11 }}>
                {t('dashboard.urgentCount', { count: urgentCount })}
              </Txt>
            ) : null}
          </Pressable>
          {(data.alerts?.dueCalving ?? []).slice(0, 2).map((item) => (
            <Pressable
              key={item.id}
              style={styles.taskCard}
              onPress={() => navigation.navigate('Breeding')}
              accessibilityRole="button"
            >
              <View style={[styles.taskRail, { backgroundColor: color.terracottaSoft }]} />
              <EarTagBadge code={item.title.slice(0, 10)} size="sm" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Txt weight="semibold" style={{ fontSize: 13 }}>
                  {item.title}
                </Txt>
                <Txt muted style={{ fontSize: 11 }}>
                  {item.detail ?? (item.dueAt ? formatDate(item.dueAt) : '')}
                </Txt>
              </View>
            </Pressable>
          ))}
          {(data.alerts?.healthOverdue ?? []).slice(0, 2).map((item) => (
            <Pressable
              key={item.id}
              style={styles.taskCard}
              onPress={() => navigation.navigate('Health')}
              accessibilityRole="button"
            >
              <View style={[styles.taskRail, { backgroundColor: color.danger }]} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Txt weight="semibold" style={{ fontSize: 13 }}>
                  {item.title}
                </Txt>
                <Txt muted style={{ fontSize: 11 }}>
                  {item.detail ?? (item.dueAt ? formatDate(item.dueAt) : '')}
                </Txt>
              </View>
            </Pressable>
          ))}
          {(data.alerts?.inventoryCritical ?? []).slice(0, 1).map((item) => (
            <Pressable
              key={item.id}
              style={styles.taskCard}
              onPress={() => navigation.navigate('Inventory')}
              accessibilityRole="button"
            >
              <View style={[styles.taskRail, { backgroundColor: color.emberStrong }]} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Txt weight="semibold" style={{ fontSize: 13 }}>
                  {item.title}
                </Txt>
                <Txt muted style={{ fontSize: 11 }}>
                  {item.detail ?? ''}
                </Txt>
              </View>
            </Pressable>
          ))}

          {commercial ? (
            <View style={{ marginTop: 8, marginBottom: 8 }}>
              <Pressable onPress={() => navigation.navigate('DailySheet')} accessibilityRole="button">
                <Txt weight="display" style={styles.sectionTitle}>
                  {t('dashboard.shedLedger')}
                </Txt>
              </Pressable>
              <View style={styles.ledger}>
                {(data.recentActivity ?? []).length === 0 ? (
                  <Txt muted style={{ padding: 12 }}>
                    {t('common.empty')}
                  </Txt>
                ) : (
                  (data.recentActivity ?? []).slice(0, 8).map((item) => (
                    <Pressable
                      key={item.id}
                      style={styles.ledgerRow}
                      onPress={() => navigation.navigate('DailySheet')}
                      accessibilityRole="button"
                    >
                      <View style={styles.ledgerDot}>
                        <ModuleIcon module="dashboard" size={14} color={color.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt weight="semibold" style={{ fontSize: 12 }}>
                          {item.kind}
                          <Txt muted> · {item.summary}</Txt>
                        </Txt>
                        <Txt muted style={{ fontSize: 10 }}>
                          {formatDateTime(item.createdAt)}
                        </Txt>
                      </View>
                    </Pressable>
                  ))
                )}
              </View>
            </View>
          ) : null}

          {commercial && showFinance && (data.financeTrend?.length ?? 0) > 0 ? (
            <Pressable onPress={() => navigation.navigate('Pnl')} accessibilityRole="button">
              <Card style={{ marginTop: 8, marginBottom: 16 }}>
                <SectionHead title={t('dashboard.financeTrend')} hint={t('dashboard.financeTrendHint')} />
                <FinanceTrendChart
                  data={data.financeTrend!}
                  revenue={t('dashboard.revenue')}
                  expenses={t('dashboard.expenses')}
                />
              </Card>
            </Pressable>
          ) : null}
        </ScreenScroll>
      ) : null}
    </AppShell>
  );
}

function FinanceTrendChart({
  data,
  revenue,
  expenses,
}: {
  data: Array<{ month: string; revenue: number; expenses: number }>;
  revenue: string;
  expenses: string;
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.revenue, d.expenses]));
  const w = 560;
  const h = 160;
  const pad = 28;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const step = innerW / Math.max(1, data.length - 1);
  const revPoints = data
    .map((d, i) => `${pad + i * step},${pad + innerH - (d.revenue / max) * innerH}`)
    .join(' ');
  const expPoints = data
    .map((d, i) => `${pad + i * step},${pad + innerH - (d.expenses / max) * innerH}`)
    .join(' ');

  return (
    <View>
      <Svg viewBox={`0 0 ${w} ${h}`} width="100%" height={160}>
        <Polyline fill="none" stroke={color.brand} strokeWidth="3" points={revPoints} />
        <Polyline fill="none" stroke={color.danger} strokeWidth="3" points={expPoints} />
        {data.map((d, i) => (
          <SvgText
            key={d.month}
            x={pad + i * step}
            y={h - 6}
            textAnchor="middle"
            fontSize="10"
            fill={color.textSecondary}
          >
            {d.month.slice(5)}
          </SvgText>
        ))}
      </Svg>
      <View style={styles.legend}>
        <Txt weight="semibold" style={{ color: color.brand, fontSize: 14 }}>
          {revenue}
        </Txt>
        <Txt weight="semibold" style={{ color: color.danger, fontSize: 14 }}>
          {expenses}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  greetCard: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  shiftPill: {
    alignSelf: 'flex-start',
    backgroundColor: color.mint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 8,
  },
  shiftPillText: { fontSize: 11, color: color.brand },
  greetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  greetTitle: { fontSize: 22, color: color.brandStrong, letterSpacing: -0.3, lineHeight: 28 },
  greetSub: { fontSize: 12, marginTop: 4 },
  greetAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.mint,
  },
  greetAvatarText: { color: '#FFFDF9', fontSize: 13 },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.terracottaWash,
    borderWidth: 1.5,
    borderColor: color.terracottaSoft,
    borderLeftWidth: 4,
    borderLeftColor: color.ember,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  overdueTitle: { fontSize: 12, color: color.emberStrong },
  overdueSub: { fontSize: 11, color: color.textSecondary, marginTop: 2 },
  fixNowBtn: {
    backgroundColor: color.ember,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: color.emberStrong,
  },
  fixNowText: { color: '#FFFDF9', fontSize: 12 },
  sectionHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sectionTitle: { fontSize: 14, color: color.brandStrong, flex: 1 },
  sectionHint: { fontSize: 11 },
  yesterdayTag: { fontSize: 11, color: color.brandStrong },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  shortcut: {
    width: '47%',
    flexGrow: 1,
    minHeight: 58,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  shortcutPrimary: {
    backgroundColor: color.brand,
    borderColor: color.brand,
    borderBottomWidth: 4,
    borderBottomColor: color.textPrimary,
  },
  shortcutBreed: { borderBottomWidth: 4, borderBottomColor: color.ember },
  shortcutHealth: { borderBottomWidth: 4, borderBottomColor: color.brand },
  shortcutExpense: { borderBottomWidth: 4, borderBottomColor: color.outline },
  shortcutIconPrimary: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#2A6A4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutIconBreed: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: 'rgba(254,136,79,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutIconMint: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: color.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutIconClay: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#F0EAE1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTitleOn: { fontSize: 13, color: '#FFFDF9', fontFamily: fonts.bodyExtraBold },
  shortcutSubOn: { fontSize: 11, color: color.mossFixed, marginTop: 2 },
  shortcutTitle: { fontSize: 13, color: color.textPrimary },
  shortcutSub: { fontSize: 11, marginTop: 2 },
  shortcutSubBreed: { fontSize: 11, color: color.emberStrong, marginTop: 2, fontWeight: '600' },
  bento: { gap: 8, marginBottom: 10 },
  milkHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    padding: 12,
  },
  milkIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: color.mint,
    borderWidth: 1.5,
    borderColor: '#CADFD0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  milkLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '700' },
  milkValue: {
    fontSize: 24,
    fontFamily: fonts.bodyExtraBold,
    color: color.brandStrong,
    letterSpacing: -0.5,
  },
  milkUnit: { fontSize: 14, fontFamily: fonts.body, color: color.textMuted },
  bentoRow: { flexDirection: 'row', gap: 8 },
  bentoHalf: {
    flex: 1,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    padding: 10,
  },
  bentoLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  bentoValue: { fontSize: 18, fontFamily: fonts.bodyExtraBold, color: color.textPrimary },
  census: {
    flexDirection: 'row',
    backgroundColor: '#F0EAE1',
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  censusItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  censusRule: { width: 1, height: 24, backgroundColor: color.fieldBorder, marginRight: 0 },
  censusNum: { fontSize: 14, color: color.textPrimary },
  censusLabel: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  financeCard: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  financeHead: { fontSize: 12, color: color.brandStrong, marginBottom: 10 },
  financeGrid: { flexDirection: 'row', gap: 10 },
  financeCell: {
    flex: 1,
    backgroundColor: color.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 6,
    padding: 10,
  },
  financeLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '600' },
  financeValue: {
    fontSize: 15,
    fontFamily: fonts.bodyExtraBold,
    color: color.brandStrong,
    marginTop: 4,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    padding: 12,
    paddingLeft: 16,
    marginBottom: 8,
    overflow: 'hidden',
    gap: 4,
  },
  taskRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  ledger: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 8,
  },
  ledgerRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  ledgerDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { flexDirection: 'row', gap: 16, marginTop: 12 },
});
