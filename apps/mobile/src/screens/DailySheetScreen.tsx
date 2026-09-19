import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { DailySheetRow } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Muted,
  PageHeader,
  SectionHead,
  Txt,
} from '../components/ui';
import { useCachedResource } from '../hooks/useCachedResource';
import { useLocale } from '../locale/LocaleProvider';
import { printHtml, tableHtml } from '../lib/printHtml';
import type { RootStackParamList } from '../navigation/types';
import { color, space } from '../theme/tokens';

export function DailySheetScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useLocale();
  const { data, loading, error, fromCache, reload } = useCachedResource<DailySheetRow[]>(
    'dailysheet',
    '/v1/milk/daily-sheet',
  );

  const rows = data ?? [];
  const milking = rows.filter((r) => r.milk && !r.withhold && !r.dry);
  const excluded = rows.filter((r) => !r.milk || r.withhold || r.dry);
  const treatments = rows.filter((r) => r.treatment);
  const withholds = rows.filter((r) => r.withhold);

  const sharePdf = async () => {
    const html = tableHtml(
      ['No', 'Shed', 'Name', 'Flags'],
      rows.map((r) => [
        r.herdNumber ?? '',
        r.shed ?? '',
        r.name ?? '',
        [r.dry ? 'dry' : '', r.withhold ? 'hold' : '', r.band ?? ''].filter(Boolean).join(' '),
      ]),
    );
    await printHtml(t('sheet.title'), html);
  };

  return (
    <AppShell module="shed">
      <PageHeader
        title={t('sheet.title')}
        subtitle={t('sheet.subtitle')}
        backLabel={t('nav.shed')}
        onBack={() => navigation.navigate('Shed')}
        actions={<Button label="Print / Share" variant="secondary" onPress={() => void sharePdf()} />}
      />
      {loading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState onRetry={() => void reload()} /> : null}
      {data ? (
        <ScrollView contentContainerStyle={styles.pad}>
          {fromCache ? <Muted>{t('native.cached')}</Muted> : null}
          <Txt weight="display" style={styles.date}>
            {new Date().toLocaleDateString()}
          </Txt>

          <SectionHead title={t('sheet.milk')} />
          <SheetRows rows={milking} empty={t('sheet.emptyMilk')} />

          <SectionHead title={t('sheet.exclude')} />
          <SheetRows
            rows={excluded}
            empty={t('sheet.emptyExclude')}
            dryLabel={t('sheet.dry')}
            holdLabel={t('sheet.hold')}
          />

          <SectionHead title={t('sheet.treatments')} />
          {treatments.length === 0 ? (
            <Muted>{t('sheet.emptyTreatments')}</Muted>
          ) : (
            treatments.map((r) => (
              <View key={`${r.herdNumber}-rx`} style={styles.row}>
                <Txt weight="semibold" style={styles.no}>
                  {r.herdNumber ?? '—'}
                </Txt>
                <Txt style={styles.cell}>{r.name ?? ''}</Txt>
                <Txt style={styles.cell}>{r.treatment}</Txt>
              </View>
            ))
          )}

          <SectionHead title={t('sheet.withhold')} />
          {withholds.length === 0 ? (
            <Muted>{t('sheet.emptyWithhold')}</Muted>
          ) : (
            withholds.map((r) => (
              <View key={`${r.herdNumber}-hold`} style={styles.row}>
                <Txt weight="semibold" style={styles.no}>
                  {r.herdNumber ?? '—'}
                </Txt>
                <Txt style={styles.cell}>{r.name ?? ''}</Txt>
                <Txt style={styles.cell}>{r.band ?? t('sheet.hold')}</Txt>
              </View>
            ))
          )}
        </ScrollView>
      ) : !loading && !error ? (
        <EmptyState />
      ) : null}
    </AppShell>
  );
}

function SheetRows({
  rows,
  empty,
  dryLabel,
  holdLabel,
}: {
  rows: DailySheetRow[];
  empty: string;
  dryLabel?: string;
  holdLabel?: string;
}) {
  if (rows.length === 0) return <Muted>{empty}</Muted>;
  return (
    <View>
      {rows.map((r) => (
        <View key={`${r.herdNumber}-${r.shed}`} style={styles.row}>
          <Txt weight="semibold" style={styles.no}>
            {r.herdNumber ?? '—'}
          </Txt>
          <Txt style={styles.cell}>{r.shed ?? ''}</Txt>
          <Txt style={styles.cell}>{r.name ?? ''}</Txt>
          {dryLabel || holdLabel ? (
            <Txt muted style={styles.cell}>
              {r.dry ? dryLabel : ''}
              {r.withhold ? ` ${holdLabel}` : ''}
              {r.band ? ` ${r.band}` : ''}
            </Txt>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 48, gap: space.sm },
  date: { fontSize: 18, marginBottom: 8, color: color.textPrimary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  no: { width: 48 },
  cell: { flex: 1, fontSize: 14 },
});
