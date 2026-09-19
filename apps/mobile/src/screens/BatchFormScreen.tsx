import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HERD_BATCH_KINDS, type HerdBatchCreate } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { ChipSelect, Field, FormActions } from '../components/forms';
import { ErrorText, PageHeader, PrimaryButton, SecondaryButton } from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import type { RootStackParamList } from '../navigation/types';
import { space } from '../theme/tokens';

type Kind = (typeof HERD_BATCH_KINDS)[number];

export function BatchFormScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BatchNew'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const initialKind = (route.params?.kind as Kind | undefined) ?? 'LIVESTOCK';

  const [kind, setKind] = useState<Kind>(initialKind);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(
    initialKind === 'FISH' ? 'FISH' : initialKind === 'POULTRY' ? 'CHICKEN' : 'BUFFALO',
  );
  const [initialCount, setInitialCount] = useState('10');
  const [ageFrom, setAgeFrom] = useState('');
  const [ageTo, setAgeTo] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const module =
    kind === 'POULTRY' ? 'groups' : kind === 'FISH' ? 'fish' : 'batches';

  const save = async () => {
    if (!can('animals:write') && !can('groups:write') && !can('fish:write')) {
      setError('No write permission');
      return;
    }
    setBusy(true);
    setError(null);
    const body: HerdBatchCreate = {
      kind,
      name: name.trim(),
      category: category.trim(),
      initialCount: Number(initialCount),
      ageFromMonths: ageFrom ? Number(ageFrom) : undefined,
      ageToMonths: ageTo ? Number(ageTo) : undefined,
      notes: notes.trim() || undefined,
    };
    try {
      const created = await api.post<{ id: string }>('/v1/batches', body);
      navigation.replace('BatchDetail', { id: created.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell module={module}>
      <PageHeader
        title={t('batches.add')}
        backLabel={t(`nav.${module}`)}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        {error ? <ErrorText message={error} /> : null}
        <ChipSelect label={t('reports.kind')} options={[...HERD_BATCH_KINDS]} value={kind} onChange={setKind} />
        <Field label={t('batches.name')} value={name} onChangeText={setName} placeholder={t('batches.nameHint')} />
        <Field label={t('batches.category')} value={category} onChangeText={setCategory} />
        <Field
          label={t('batches.count')}
          value={initialCount}
          onChangeText={setInitialCount}
          keyboardType="number-pad"
        />
        <Field
          label={t('batches.ageFrom')}
          value={ageFrom}
          onChangeText={setAgeFrom}
          keyboardType="number-pad"
        />
        <Field
          label={t('batches.ageTo')}
          value={ageTo}
          onChangeText={setAgeTo}
          keyboardType="number-pad"
        />
        <Field label={t('common.notes')} value={notes} onChangeText={setNotes} multiline />
        <FormActions>
          <PrimaryButton label={t('common.save')} onPress={() => void save()} disabled={busy} />
          <SecondaryButton label={t('common.cancel')} onPress={() => navigation.goBack()} />
        </FormActions>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.md, paddingBottom: 40 },
});
