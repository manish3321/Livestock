import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AnimalImportPreviewRow, AnimalImportRow } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { ErrorText, ListRow, Muted, PageHeader, PrimaryButton, SecondaryButton } from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import type { RootStackParamList } from '../navigation/types';
import { colors, space } from '../theme/tokens';

export function AnimalsImportScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const [csv, setCsv] = useState('tag,species,breed,gender\nBUF100,BUFFALO,Local,FEMALE\n');
  const [preview, setPreview] = useState<AnimalImportPreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runPreview = async () => {
    if (!can('animals:write')) {
      setError('No write permission');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const rows = await api.post<AnimalImportPreviewRow[]>('/v1/animals/import/preview', { csv });
      setPreview(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      const rows: AnimalImportRow[] = preview
        .filter((r) => r.data && r.errors.length === 0)
        .map((r) => r.data!) ;
      const res = await api.post<{ created: number; errors: AnimalImportPreviewRow[] }>(
        '/v1/animals/import',
        { rows },
      );
      setResult(`Created ${res.created}. Errors: ${res.errors?.length ?? 0}`);
      if (res.created > 0) navigation.navigate('Animals');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell module="animals">
      <PageHeader
        title={t('animals.importTitle')}
        subtitle={t('animals.importHelp')}
        backLabel={t('nav.animals')}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        {error ? <ErrorText message={error} /> : null}
        {result ? <Muted>{result}</Muted> : null}
        <TextInput
          style={styles.csv}
          value={csv}
          onChangeText={setCsv}
          multiline
          autoCapitalize="none"
          textAlignVertical="top"
        />
        <PrimaryButton label={t('animals.preview')} onPress={() => void runPreview()} disabled={busy} />
        <View style={{ height: space.sm }} />
        {preview.length > 0 ? (
          <>
            <SecondaryButton
              label={t('animals.commit', { n: preview.filter((r) => r.data && r.errors.length === 0).length })}
              onPress={() => void commit()}
            />
            {preview.map((row) => (
              <ListRow
                key={row.row}
                title={row.data?.tag ?? `${t('animals.row')} ${row.row}`}
                subtitle={row.errors.length ? row.errors.join('; ') : t('animals.ready')}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.md, paddingBottom: 40, gap: space.sm },
  csv: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: space.md,
    fontSize: 13,
    fontFamily: 'monospace',
    color: colors.text,
    backgroundColor: colors.surface,
    marginVertical: space.sm,
  },
});
