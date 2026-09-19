import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { ErrorText, ListRow, LoadingBlock, Muted, PageHeader, PrimaryButton } from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useFarm } from '../state/FarmProvider';
import { printHtml, tableHtml } from '../lib/printHtml';
import { space } from '../theme/tokens';

type TagRow = {
  id: string;
  herdNumber: string | null;
  tag: string;
  name: string | null;
  qrPath: string;
};

export function AnimalsTagsScreen() {
  const { api } = useFarm();
  const { t } = useLocale();
  const [rows, setRows] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<TagRow[]>('/v1/animals/tags/print');
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tags');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const printSheet = async () => {
    const html = `
      <div style="display:flex;flex-wrap:wrap;gap:12px;">
        ${rows
          .map(
            (r) => `<div style="border:1px solid #E5DEC9;padding:10px;width:160px;text-align:center;">
              <div style="font-size:18px;font-weight:800;">${r.tag}</div>
              <div style="font-size:12px;">${r.herdNumber ?? ''}</div>
              <div style="font-size:11px;">${r.name ?? ''}</div>
              <div style="font-size:9px;margin-top:6px;word-break:break-all;">${r.qrPath ?? ''}</div>
            </div>`,
          )
          .join('')}
      </div>
      ${tableHtml(
        ['Tag', 'Herd #', 'Name', 'QR'],
        rows.map((r) => [r.tag, r.herdNumber ?? '', r.name ?? '', r.qrPath ?? '']),
      )}
    `;
    await printHtml(t('animals.printTags'), html);
  };

  return (
    <AppShell module="animals">
      <PageHeader title={t('animals.printTags')} subtitle={t('animals.printHelp')} />
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorText message={error} /> : null}
      <View style={styles.pad}>
        <PrimaryButton label={t('animals.print')} onPress={() => void printSheet()} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <ListRow
            title={item.tag}
            subtitle={[item.herdNumber, item.name].filter(Boolean).join(' · ')}
            meta={item.qrPath ? 'QR' : undefined}
          />
        )}
        ListEmptyComponent={!loading ? <Muted>{t('common.empty')}</Muted> : null}
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.md, gap: space.sm },
});
