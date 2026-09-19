import { ScrollView, StyleSheet, View } from 'react-native';
import { formatNPR } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import {
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  Muted,
  PageHeader,
  Txt,
} from '../components/ui';
import { useCachedResource } from '../hooks/useCachedResource';
import { useAccess } from '../hooks/useAccess';
import { useLocale } from '../locale/LocaleProvider';
import { space } from '../theme/tokens';

type ProfitPayload = {
  price?: number;
  headlineRate?: number | null;
  priceSource?: string;
  items: Array<{
    animalId: string;
    tag?: string;
    name?: string | null;
    shortNo?: string | null;
    herdNumber?: string | null;
    litres?: number;
    litres30d?: number;
    feedCostPerLitre?: number | null;
    costPerLitre?: number | null;
    profit?: number;
    net?: number;
    trend?: 'up' | 'down' | 'flat';
    rank?: number;
    bottomDecile?: boolean;
  }>;
};

export function ProfitScreen() {
  const { t } = useLocale();
  const { can } = useAccess();
  const { data, loading, error, fromCache, reload } = useCachedResource<ProfitPayload>(
    'profit',
    '/v1/animals/profitability?sort=profit_desc',
  );

  if (!can('finance:read')) {
    return (
      <AppShell module="pnl">
        <PageHeader title={t('profit.title')} subtitle={t('profit.workersHidden')} />
      </AppShell>
    );
  }

  const items = data?.items ?? [];
  const priceLabel =
    data?.priceSource === 'payments' ? t('profit.priceFromPayments') : t('profit.priceFallback');

  return (
    <AppShell module="pnl">
      <PageHeader title={t('profit.title')} subtitle={t('profit.subtitle')} />
      {loading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState onRetry={() => void reload()} /> : null}
      {data ? (
        <ScrollView contentContainerStyle={styles.pad}>
          {fromCache ? <Muted>{t('native.cached')}</Muted> : null}
          <Muted>
            {t('profit.effective')}: {data.price != null ? formatNPR(data.price) : '—'}
            {data.headlineRate != null ? ` · ${t('profit.headline')} ${data.headlineRate.toFixed(2)}` : ''}
            {' · '}
            {priceLabel}
          </Muted>
          {items.length === 0 ? <EmptyState /> : null}
          {items.map((item) => (
            <View key={item.animalId} style={styles.row}>
              <ListRow
                title={`${item.rank ?? ''}  ${item.shortNo ?? item.herdNumber ?? item.tag ?? item.animalId.slice(0, 8)} ${item.name ?? ''}`}
                subtitle={`${t('profit.litres')} ${(item.litres ?? item.litres30d ?? 0).toFixed(1)} · ${t('profit.feedPerL')} ${item.feedCostPerLitre != null ? item.feedCostPerLitre.toFixed(1) : '—'} · ${t('profit.costPerL')} ${item.costPerLitre != null ? item.costPerLitre.toFixed(1) : '—'}`}
                meta={formatNPR(item.profit ?? item.net ?? 0)}
              />
              <Txt muted>
                {item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : '→'}
              </Txt>
            </View>
          ))}
          <Muted>{t('profit.noCull')}</Muted>
        </ScrollView>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 48, gap: space.sm },
  row: { marginBottom: 4 },
});
