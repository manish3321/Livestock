import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatNPR } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import {
  Button,
  ChipRow,
  ErrorState,
  FilterChip,
  ListRow,
  LoadingState,
  Muted,
  PageHeader,
  SectionHead,
  Stat,
  StatusChip,
} from '../components/ui';
import { toQuery } from '../api/query';
import { useFarm } from '../state/FarmProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import { useLocale } from '../locale/LocaleProvider';
import type { RootStackParamList } from '../navigation/types';
import { space } from '../theme/tokens';

type Period = 'monthly' | 'quarterly' | 'yearly';

type PnlPayload = {
  streams?: Array<{ name: string; revenue: number; expense: number; margin: number; lossMaking?: boolean }>;
  totals?: { revenue: number; expense: number; margin: number };
  ratios?: Record<string, number | null>;
  priorPeriod?: { revenue: number; expense: number; margin: number };
  breakEven?: { units?: number; revenue?: number } | number | null;
};

export function PnlScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, store, persist } = useFarm();
  const { t } = useLocale();
  const yearNow = new Date().getFullYear();
  const [period, setPeriod] = useState<Period>('monthly');
  const [year, setYear] = useState(String(yearNow));
  const [data, setData] = useState<PnlPayload | null>(() => getModuleCache(store, 'pnl'));
  const [loading, setLoading] = useState(!data);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const path = `/v1/pnl${toQuery({
      period,
      year: Number(year) || yearNow,
    })}`;
    try {
      const row = await api.get<PnlPayload>(path);
      setData(row);
      setModuleCache(store, 'pnl', row);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const cached = getModuleCache<PnlPayload>(store, 'pnl');
      if (cached) {
        setData(cached);
        setFromCache(true);
      } else setError(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [api, period, persist, store, t, year, yearNow]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell module="pnl">
      <PageHeader title={t('nav.pnl')} subtitle={t('pnl.subtitle')} />
      {loading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState onRetry={() => void load()} /> : null}
      <ScrollView contentContainerStyle={styles.pad}>
        <ChipRow>
          {(['monthly', 'quarterly', 'yearly'] as const).map((value) => (
            <FilterChip
              key={value}
              label={t(`pnl.period.${value}`)}
              active={period === value}
              onPress={() => setPeriod(value)}
            />
          ))}
        </ChipRow>
        <ChipRow>
          {[yearNow, yearNow - 1, yearNow - 2].map((y) => (
            <FilterChip
              key={y}
              label={String(y)}
              active={year === String(y)}
              onPress={() => setYear(String(y))}
            />
          ))}
        </ChipRow>
        {fromCache ? <Muted>{t('native.cached')}</Muted> : null}
        {data ? (
          <>
            <View style={styles.stats}>
              <Stat label={t('pnl.revenue')} value={formatNPR(data.totals?.revenue ?? 0)} />
              <Stat label={t('pnl.expense')} value={formatNPR(data.totals?.expense ?? 0)} />
              <Stat label={t('pnl.margin')} value={formatNPR(data.totals?.margin ?? 0)} />
            </View>
            <Button label={t('nav.profit')} variant="secondary" onPress={() => navigation.navigate('Profit')} />
            <SectionHead title={t('pnl.stream')} />
            {(data.streams ?? []).map((s) => (
              <View key={s.name} style={styles.stream}>
                <ListRow
                  title={s.name}
                  subtitle={`${t('pnl.revenue')} ${formatNPR(s.revenue)} · ${t('pnl.expense')} ${formatNPR(s.expense)}`}
                  meta={formatNPR(s.margin)}
                />
                <StatusChip
                  status={s.lossMaking ? 'SICK' : 'ACTIVE'}
                  label={s.lossMaking ? t('pnl.lossMaking') : t('pnl.profitable')}
                />
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 48, gap: space.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stream: { marginBottom: 8, gap: 6 },
});
