import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ANIMAL_SOURCES,
  ANIMAL_STATUSES,
  GENDERS,
  SPECIES,
  SPECIES_TAG_PREFIX,
  type AnimalCreate,
  type AnimalDetailDto,
  type Species,
} from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { ChipSelect, Field, FormActions } from '../components/forms';
import { ErrorText, LoadingBlock, PageHeader, PrimaryButton, SecondaryButton } from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import { enqueueModuleMutation } from '../offline/module-cache';
import type { RootStackParamList } from '../navigation/types';
import { space } from '../theme/tokens';

export function AnimalNewScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'AnimalNew'>>();
  const initial = route.params?.species;
  const species =
    initial && (SPECIES as readonly string[]).includes(initial)
      ? (initial as Species)
      : 'BUFFALO';
  return <AnimalForm mode="create" initialSpecies={species} />;
}

export function AnimalEditScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'AnimalEdit'>>();
  return <AnimalForm mode="edit" id={route.params.id} />;
}

function AnimalForm({
  mode,
  id,
  initialSpecies = 'BUFFALO',
}: {
  mode: 'create' | 'edit';
  id?: string;
  initialSpecies?: Species;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, store, persist, online } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const canWrite = can('animals:write');

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [species, setSpecies] = useState<Species>(initialSpecies);
  const [tag, setTag] = useState(SPECIES_TAG_PREFIX[initialSpecies]);
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('Local');
  const [gender, setGender] = useState<(typeof GENDERS)[number]>('FEMALE');
  const [status, setStatus] = useState<(typeof ANIMAL_STATUSES)[number]>('ACTIVE');
  const [source, setSource] = useState<(typeof ANIMAL_SOURCES)[number]>('BORN');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [shed, setShed] = useState('');
  const [notes, setNotes] = useState('');
  const [initialWeightKg, setInitialWeightKg] = useState('');

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await api.get<AnimalDetailDto>(`/v1/animals/${id}`);
        if (cancelled) return;
        setSpecies(row.species as Species);
        setTag(row.tag);
        setName(row.name ?? '');
        setBreed(row.breed ?? 'Local');
        setGender((row.gender as (typeof GENDERS)[number]) ?? 'FEMALE');
        setStatus((row.status as (typeof ANIMAL_STATUSES)[number]) ?? 'ACTIVE');
        setSource((row.source as (typeof ANIMAL_SOURCES)[number]) ?? 'BORN');
        setShed(row.shed ?? '');
        setNotes(row.notes ?? '');
      } catch {
        if (!cancelled) setError('Could not load animal');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, id, mode]);

  const onSpecies = (s: Species) => {
    setSpecies(s);
    if (mode === 'create') setTag(SPECIES_TAG_PREFIX[s]);
  };

  const save = async () => {
    if (!canWrite) {
      setError('No write permission');
      return;
    }
    setSaving(true);
    setError(null);
    const body: AnimalCreate = {
      tag: tag.trim().toUpperCase(),
      name: name.trim() || undefined,
      species,
      breed: breed.trim() || 'Local',
      gender,
      status,
      source,
      purchaseCost:
        source === 'PURCHASED' && purchaseCost ? Number(purchaseCost) : undefined,
      shed: shed.trim() || undefined,
      notes: notes.trim() || undefined,
      initialWeightKg:
        mode === 'create' && initialWeightKg ? Number(initialWeightKg) : undefined,
    };
    try {
      if (mode === 'create') {
        const created = await api.post<AnimalDetailDto>('/v1/animals', body);
        navigation.replace('AnimalDetail', { id: created.id });
      } else if (id) {
        await api.patch(`/v1/animals/${id}`, body);
        navigation.replace('AnimalDetail', { id });
      }
    } catch (err) {
      if (!online && mode === 'create') {
        enqueueModuleMutation(store, { method: 'POST', path: '/v1/animals', body });
        persist();
        Alert.alert('Saved offline', 'Animal create queued for sync.');
        navigation.navigate('Animals');
      } else {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell module="animals">
      <PageHeader
        title={mode === 'create' ? t('animals.add') : t('animals.edit')}
        backLabel={t('nav.animals')}
        onBack={() => navigation.goBack()}
      />
      {loading ? <LoadingBlock /> : null}
      {!loading ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          {error ? <ErrorText message={error} /> : null}
          <ChipSelect label={t('animals.species')} options={[...SPECIES]} value={species} onChange={onSpecies} />
          <Field
            label={t('animals.tag')}
            value={tag}
            onChangeText={setTag}
            autoCapitalize="characters"
            placeholder="BUF001"
          />
          <Field label={t('animals.name')} value={name} onChangeText={setName} />
          <Field label={t('animals.breed')} value={breed} onChangeText={setBreed} />
          <ChipSelect label={t('animals.gender')} options={[...GENDERS]} value={gender} onChange={setGender} />
          <ChipSelect label={t('animals.status')} options={[...ANIMAL_STATUSES]} value={status} onChange={setStatus} />
          <ChipSelect label={t('animals.source')} options={[...ANIMAL_SOURCES]} value={source} onChange={setSource} />
          {source === 'PURCHASED' ? (
            <Field
              label={t('animals.purchaseCost')}
              value={purchaseCost}
              onChangeText={setPurchaseCost}
              keyboardType="decimal-pad"
            />
          ) : null}
          <Field label={t('animals.shed')} value={shed} onChangeText={setShed} />
          {mode === 'create' ? (
            <Field
              label={t('animals.weightKg')}
              value={initialWeightKg}
              onChangeText={setInitialWeightKg}
              keyboardType="decimal-pad"
            />
          ) : null}
          <Field
            label={t('animals.notes')}
            value={notes}
            onChangeText={setNotes}
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <FormActions>
            <PrimaryButton
              label={t('common.save')}
              onPress={() => void save()}
              disabled={saving || !canWrite}
            />
            <SecondaryButton label={t('common.cancel')} onPress={() => navigation.goBack()} />
          </FormActions>
          {!canWrite ? <ErrorText message={t('errors.forbidden')} /> : null}
        </ScrollView>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.md, paddingBottom: 40 },
});
