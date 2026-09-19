import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { Field } from '../components/forms';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  FilterChip,
  LoadingState,
  Muted,
  PageHeader,
  SectionHead,
  Stat,
  Txt,
} from '../components/ui';
import { toQuery } from '../api/query';
import { useFarm } from '../state/FarmProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import { useLocale } from '../locale/LocaleProvider';
import { shareCsv } from '../lib/shareCsv';
import { printHtml, tableHtml } from '../lib/printHtml';
import { color, space } from '../theme/tokens';

type ReportKind =
  | 'farm-overview'
  | 'animal-inventory'
  | 'health-summary'
  | 'period'
  | 'daily'
  | 'monthly'
  | 'cooperative'
  | 'vaccination-proof'
  | 'insurance-claim';

export function ReportsScreen() {
  const { api, store, persist } = useFarm();
  const { t } = useLocale();
  const now = new Date();
  const [active, setActive] = useState<ReportKind | null>(null);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [from, setFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [showMonthly, setShowMonthly] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [monthly, setMonthly] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pathFor = useCallback(
    (kind: ReportKind) => {
      if (kind === 'farm-overview') return '/v1/reports/farm-overview';
      if (kind === 'animal-inventory') return '/v1/reports/animal-inventory';
      if (kind === 'health-summary') return '/v1/reports/health-summary';
      if (kind === 'period') return `/v1/reports/period${toQuery({ from, to })}`;
      if (kind === 'daily') return `/v1/reports/daily${toQuery({ date: to })}`;
      if (kind === 'monthly') return `/v1/reports/monthly${toQuery({ year: Number(year), month: Number(month) })}`;
      if (kind === 'cooperative') return `/v1/reports/cooperative${toQuery({ from, to })}`;
      if (kind === 'vaccination-proof') return `/v1/reports/vaccination-proof${toQuery({ from, to })}`;
      return `/v1/reports/insurance-claim${toQuery({ from, to })}`;
    },
    [from, month, to, year],
  );

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    const path = pathFor(active);
    try {
      const row = await api.get<Record<string, unknown>>(path);
      setData(row);
      setModuleCache(store, `reports:${active}`, row);
      persist();
      setError(null);
    } catch {
      const cached = getModuleCache<Record<string, unknown>>(store, `reports:${active}`);
      if (cached) setData(cached);
      else {
        setData(null);
        setError(t('errors.generic'));
      }
    } finally {
      setLoading(false);
    }
  }, [active, api, pathFor, persist, store, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMonthly = useCallback(async () => {
    setShowMonthly(true);
    try {
      const row = await api.get<Record<string, unknown>>(
        `/v1/reports/herd-monthly${toQuery({ year: Number(year), month: Number(month) })}`,
      );
      setMonthly(row);
    } catch {
      setMonthly(null);
    }
  }, [api, month, year]);

  const exportCsv = async (path: string, filename: string) => {
    try {
      await shareCsv(path, filename, () => store.accessToken);
    } catch (err) {
      Alert.alert(t('errors.generic'), err instanceof Error ? err.message : undefined);
    }
  };

  const exportPdf = async () => {
    if (!data || !active) return;
    const entries = Object.entries(data).filter(([, v]) => v !== null && typeof v !== 'object');
    const html = tableHtml(
      ['Field', 'Value'],
      entries.map(([k, v]) => [k, String(v)]),
    );
    try {
      await printHtml(t(`reports.${active}`) !== `reports.${active}` ? String(active) : active, html);
    } catch (err) {
      Alert.alert(t('errors.generic'), err instanceof Error ? err.message : undefined);
    }
  };

  const cards: { kind: ReportKind; title: string; body: string }[] = [
    { kind: 'farm-overview', title: t('reports.farmOverview'), body: t('reports.farmOverviewBody') },
    {
      kind: 'animal-inventory',
      title: t('reports.animalInventory'),
      body: t('reports.animalInventoryBody'),
    },
    { kind: 'health-summary', title: t('reports.healthSummary'), body: t('reports.healthSummaryBody') },
    { kind: 'period', title: t('reports.period') !== 'reports.period' ? t('reports.period') : 'Period pack', body: `${from} → ${to}` },
  ];

  return (
    <AppShell module="reports">
      <PageHeader title={t('nav.reports')} subtitle={t('reports.subtitle')} />
      <ScrollView contentContainerStyle={styles.pad}>
        <Card>
          <SectionHead title="Period range" />
          <Field label="From" value={from} onChangeText={setFrom} autoCapitalize="none" />
          <Field label="To" value={to} onChangeText={setTo} autoCapitalize="none" />
        </Card>

        {cards.map((card) => (
          <Pressable
            key={card.kind}
            onPress={() => setActive(card.kind)}
            style={[styles.pick, active === card.kind && styles.pickOn]}
          >
            <Card>
              <Txt weight="semibold">{card.title}</Txt>
              <Muted>{card.body}</Muted>
            </Card>
          </Pressable>
        ))}

        {loading && active ? <LoadingState /> : null}
        {error && !data ? <ErrorState onRetry={() => void load()} /> : null}
        {data && active ? (
          <>
            <JsonCards data={data} />
            <ChipRow>
              <Button label="Share PDF" variant="secondary" onPress={() => void exportPdf()} />
              {active === 'animal-inventory' ? (
                <Button
                  label="CSV"
                  variant="secondary"
                  onPress={() =>
                    void exportCsv('/v1/reports/animal-inventory.csv', 'animal-inventory.csv')
                  }
                />
              ) : null}
              {active === 'period' ? (
                <Button
                  label="CSV"
                  variant="secondary"
                  onPress={() =>
                    void exportCsv(
                      `/v1/reports/period.csv${toQuery({ from, to })}`,
                      'period.csv',
                    )
                  }
                />
              ) : null}
            </ChipRow>
          </>
        ) : null}

        <Card style={{ marginTop: 8 }}>
          <SectionHead title={t('reports.monthlyHerd')} hint={t('reports.monthlyHerdBody')} />
          <ChipRow>
            {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
              <FilterChip
                key={y}
                label={String(y)}
                active={year === String(y)}
                onPress={() => setYear(String(y))}
              />
            ))}
          </ChipRow>
          <ChipRow>
            {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
              <FilterChip key={m} label={m} active={month === m} onPress={() => setMonth(m)} />
            ))}
          </ChipRow>
          <Pressable onPress={() => void loadMonthly()} style={styles.link}>
            <Txt weight="medium" style={{ color: color.brand }}>
              {t('reports.viewMonthly')}
            </Txt>
          </Pressable>
          <Button
            label="Herd monthly CSV"
            variant="secondary"
            onPress={() =>
              void exportCsv(
                `/v1/reports/herd-monthly.csv${toQuery({ year: Number(year), month: Number(month) })}`,
                'herd-monthly.csv',
              )
            }
          />
          {showMonthly && monthly ? <JsonCards data={monthly} /> : null}
        </Card>

        <Card>
          <SectionHead title={t('reports.dairyPacks')} hint={t('reports.dairyPacksBody')} />
          <ChipRow>
            {(
              [
                ['daily', 'daily'],
                ['monthly', 'monthly'],
                ['cooperative', 'cooperative'],
                ['vaccination', 'vaccination-proof'],
                ['insurance', 'insurance-claim'],
              ] as const
            ).map(([labelKey, kind]) => (
              <FilterChip
                key={kind}
                label={t(`reports.dairy.${labelKey}`)}
                active={active === kind}
                onPress={() => setActive(kind)}
              />
            ))}
          </ChipRow>
        </Card>
      </ScrollView>
    </AppShell>
  );
}

function JsonCards({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && typeof v !== 'object');
  if (entries.length === 0) return <EmptyState />;
  return (
    <View style={styles.stats}>
      {entries.slice(0, 12).map(([k, v]) => (
        <Stat key={k} label={k} value={String(v)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 48, gap: space.sm },
  pick: { marginBottom: 8 },
  pickOn: { opacity: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  link: { paddingVertical: 8 },
});
