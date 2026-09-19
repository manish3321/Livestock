import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type {
  AnimalDetailDto,
  AnimalEconomicsDto,
  AnimalProductionStatsDto,
  PageResult,
} from '@farm/contracts';
import { ANIMAL_STATUS_LABEL, SPECIES_LABEL } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { Field, FormActions } from '../components/forms';
import {
  Button,
  Chip,
  ErrorText,
  ListRow,
  LoadingBlock,
  Muted,
  NotFoundState,
  PrimaryButton,
  SectionTitle,
  StatTile,
  Txt,
} from '../components/ui';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import { toQuery } from '../api/query';
import { apiBaseUrl } from '../api/config';
import { useLocale } from '../locale/LocaleProvider';
import type { RootStackParamList } from '../navigation/types';
import { color, space, tap } from '../theme/tokens';

type Tab = 'overview' | 'milk' | 'vaccine' | 'treatment' | 'heat' | 'weight';

const TABS: Tab[] = ['overview', 'milk', 'vaccine', 'treatment', 'heat', 'weight'];

export function AnimalDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'AnimalDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, store, persist } = useFarm();
  const { can, commercial } = useAccess();
  const { t } = useLocale();
  const id = route.params?.id ?? '';
  const cacheKey = `animal:${id}`;

  const [tab, setTab] = useState<Tab>('overview');
  const [mode, setMode] = useState<'records' | 'add'>('records');
  const [data, setData] = useState<AnimalDetailDto | null>(() => getModuleCache(store, cacheKey));
  const [economics, setEconomics] = useState<AnimalEconomicsDto | null>(null);
  const [milkStats, setMilkStats] = useState<AnimalProductionStatsDto | null>(null);
  const [healthRows, setHealthRows] = useState<Array<Record<string, unknown>>>([]);
  const [heatRows, setHeatRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add form fields
  const [litres, setLitres] = useState('');
  const [healthTitle, setHealthTitle] = useState('');
  const [medicine, setMedicine] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [heatNotes, setHeatNotes] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const photoUri = data?.photoUrl
    ? data.photoUrl.startsWith('http')
      ? data.photoUrl
      : `${apiBaseUrl()}${data.photoUrl}`
    : null;

  const uploadPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('errors.generic'), 'Photo permission required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploadingPhoto(true);
    try {
      const uri = result.assets[0].uri;
      const name = uri.split('/').pop() ?? 'animal.jpg';
      await api.uploadFile(`/v1/animals/${id}/photo`, 'file', {
        uri,
        name,
        type: 'image/jpeg',
      });
      await load();
    } catch (err) {
      Alert.alert(t('errors.generic'), err instanceof Error ? err.message : undefined);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await api.get<AnimalDetailDto>(`/v1/animals/${id}`);
      setData(row);
      setModuleCache(store, cacheKey, row);
      persist();
      setError(null);
      void api.get<AnimalEconomicsDto>(`/v1/animals/${id}/economics`).then(setEconomics).catch(() => null);
    } catch {
      if (!data) setError('Could not load animal');
    } finally {
      setLoading(false);
    }
  }, [api, cacheKey, data, id, persist, store]);

  useEffect(() => {
    void load();
    // load once when id changes
  }, [id]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      try {
        if (tab === 'milk') {
          const stats = await api.get<AnimalProductionStatsDto>(`/v1/animals/${id}/production-stats`);
          if (!cancelled) setMilkStats(stats);
        } else if (tab === 'vaccine' || tab === 'treatment') {
          const type = tab === 'vaccine' ? 'VACCINATION' : 'TREATMENT';
          const page = await api.get<PageResult<Record<string, unknown>>>(
            `/v1/health-records${toQuery({ page: 1, pageSize: 50, animalId: id, type })}`,
          );
          if (!cancelled) setHealthRows(page.items);
        } else if (tab === 'heat') {
          const page = await api.get<PageResult<Record<string, unknown>> | Record<string, unknown>[]>(
            `/v1/breeding/heat${toQuery({ animalId: id, page: 1, pageSize: 50 })}`,
          );
          const items = Array.isArray(page) ? page : (page.items ?? []);
          if (!cancelled) setHeatRows(items);
        }
      } catch {
        /* keep previous */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, data, id, tab]);

  const onDelete = () => {
    if (!can('animals:delete')) return;
    Alert.alert('Delete animal', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await api.del(`/v1/animals/${id}`);
              navigation.navigate('Animals');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Delete failed');
            }
          })();
        },
      },
    ]);
  };

  const submitAdd = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      if (tab === 'milk') {
        await api.post('/v1/production', {
          type: 'MILK',
          entryDate: new Date(),
          quantity: Number(litres),
          unit: 'L',
          animalId: id,
        });
        setLitres('');
      } else if (tab === 'vaccine' || tab === 'treatment') {
        await api.post('/v1/health-records', {
          type: tab === 'vaccine' ? 'VACCINATION' : 'TREATMENT',
          title: healthTitle.trim() || (tab === 'vaccine' ? 'Vaccination' : 'Treatment'),
          animalId: id,
          medicine: medicine.trim() || undefined,
          performedAt: new Date(),
        });
        setHealthTitle('');
        setMedicine('');
      } else if (tab === 'heat') {
        await api.post('/v1/breeding/heat', {
          animalId: id,
          observedAt: new Date(),
          notes: heatNotes.trim() || undefined,
        });
        setHeatNotes('');
      } else if (tab === 'weight') {
        await api.post(`/v1/animals/${id}/weights`, {
          weightKg: Number(weightKg),
          recordedAt: new Date(),
        });
        setWeightKg('');
      }
      setMode('records');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const canAdd =
    (tab === 'milk' && can('production:write')) ||
    ((tab === 'vaccine' || tab === 'treatment') && can('health:write')) ||
    (tab === 'heat' && can('breeding:write')) ||
    (tab === 'weight' && can('animals:write'));

  return (
    <AppShell module="animals" showBack>
      {loading && !data ? <LoadingBlock /> : null}
      {!loading && !data ? <NotFoundState /> : null}
      {error && data ? <ErrorText message={error} /> : null}
      {data ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          {data.activeWithhold ? (
            <View style={styles.warn}>
              <Text style={styles.warnText}>
                Withhold active · {data.activeWithhold.drugName ?? 'drug'} until{' '}
                {String(data.activeWithhold.endDate ?? '').slice(0, 10)}
              </Text>
            </View>
          ) : null}
          {data.isPregnant ? (
            <View style={styles.info}>
              <Text style={styles.infoText}>{t('animals.pregnantBanner')}</Text>
            </View>
          ) : null}

          <View style={styles.heroCard}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : null}
            <Txt weight="display" style={styles.hero}>
              {data.herdNumber ?? data.tag}
              {data.name?.trim() ? `  ${data.name}` : ''}
            </Txt>
            <Txt style={styles.heroMeta}>
              {t('animals.tag')}: {data.tag}
            </Txt>
            <View style={styles.chipRow}>
              <Chip
                status={data.status}
                label={t(`enum.animalStatus.${data.status}`, {
                  defaultValue: ANIMAL_STATUS_LABEL[data.status],
                })}
              />
              <Chip label={SPECIES_LABEL[data.species] ?? data.species} />
              <Chip label={data.breed} />
            </View>
            <View style={styles.actions}>
              {can('animals:write') ? (
                <Button
                  label={uploadingPhoto ? t('common.loading') : 'Photo'}
                  variant="secondary"
                  disabled={uploadingPhoto}
                  onPress={() => void uploadPhoto()}
                />
              ) : null}
              {can('animals:write') ? (
                <Button
                  label={t('common.edit')}
                  variant="secondary"
                  onPress={() => navigation.navigate('AnimalEdit', { id })}
                />
              ) : null}
              <Button
                label={t('qr.openScan')}
                variant="secondary"
                onPress={() => navigation.navigate('Scan')}
              />
              {can('animals:delete') ? (
                <Button label={t('common.delete')} variant="danger" onPress={onDelete} />
              ) : null}
            </View>
          </View>

          <Muted>
            {data.species} · {data.status} · {data.breed}
          </Muted>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
            {TABS.map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  setTab(t);
                  setMode('records');
                }}
                style={[styles.tab, tab === t && styles.tabOn]}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {tab !== 'overview' && canAdd ? (
            <View style={styles.modeRow}>
              <Pressable
                style={[styles.modeBtn, mode === 'records' && styles.modeOn]}
                onPress={() => setMode('records')}
              >
                <Text style={styles.modeText}>Records</Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, mode === 'add' && styles.modeOn]}
                onPress={() => setMode('add')}
              >
                <Text style={styles.modeText}>Add</Text>
              </Pressable>
            </View>
          ) : null}

          {tab === 'overview' ? (
            <>
              {economics ? (
                <>
                  <SectionTitle>Economics</SectionTitle>
                  <View style={styles.stats}>
                    <StatTile label="Invested" value={String(economics.investedTotal)} />
                    <StatTile label="Earned" value={String(economics.earnedTotal)} />
                    <StatTile label="Net" value={String(economics.net)} />
                  </View>
                </>
              ) : null}
              <SectionTitle>Profile</SectionTitle>
              <Row label="Gender" value={data.gender} />
              <Row label="Shed" value={data.shed ?? '—'} />
              <Row label="Source" value={String(data.source ?? '—')} />
              <Row label="Breeding stock" value={data.breedingStock ? 'Yes' : 'No'} />
              <Row label="Notes" value={data.notes ?? '—'} />
              <SectionTitle>Status history</SectionTitle>
              {(data.statusHistory ?? []).length === 0 ? <Muted>None</Muted> : null}
              {(data.statusHistory ?? []).map((h) => (
                <ListRow
                  key={h.id}
                  title={`${h.fromStatus ?? '—'} → ${h.toStatus}`}
                  subtitle={h.reason ?? undefined}
                  meta={h.changedAt?.slice(0, 10)}
                />
              ))}
            </>
          ) : null}

          {tab === 'milk' && mode === 'records' ? (
            <>
              <SectionTitle>Milk</SectionTitle>
              {milkStats ? (
                <View style={styles.stats}>
                  <StatTile label="Avg" value={String(milkStats.milkAverage)} />
                  <StatTile label="Herd avg" value={String(milkStats.herdAverage)} />
                  <StatTile label="Total L" value={String(milkStats.milkTotalLiters)} />
                </View>
              ) : (
                <Muted>No stats</Muted>
              )}
              {(milkStats?.last30Days ?? []).map((d, i) => (
                <ListRow key={i} title={`${d.quantity} L`} meta={d.date?.slice(0, 10)} />
              ))}
            </>
          ) : null}
          {tab === 'milk' && mode === 'add' ? (
            <>
              <Field label="Litres" value={litres} onChangeText={setLitres} keyboardType="decimal-pad" />
              <FormActions>
                <PrimaryButton label={busy ? '…' : 'Save milk'} onPress={() => void submitAdd()} disabled={busy} />
              </FormActions>
            </>
          ) : null}

          {(tab === 'vaccine' || tab === 'treatment') && mode === 'records' ? (
            <>
              <SectionTitle>{tab === 'vaccine' ? 'Vaccinations' : 'Treatments'}</SectionTitle>
              {healthRows.length === 0 ? <Muted>No records</Muted> : null}
              {healthRows.map((r) => (
                <ListRow
                  key={String(r.id)}
                  title={String(r.title ?? r.type)}
                  subtitle={String(r.medicine ?? '')}
                  meta={String(r.performedAt ?? '').slice(0, 10)}
                />
              ))}
            </>
          ) : null}
          {(tab === 'vaccine' || tab === 'treatment') && mode === 'add' ? (
            <>
              <Field label="Title" value={healthTitle} onChangeText={setHealthTitle} />
              {tab === 'treatment' ? (
                <Field label="Medicine" value={medicine} onChangeText={setMedicine} />
              ) : null}
              <FormActions>
                <PrimaryButton label={busy ? '…' : 'Save'} onPress={() => void submitAdd()} disabled={busy} />
              </FormActions>
            </>
          ) : null}

          {tab === 'heat' && mode === 'records' ? (
            <>
              <SectionTitle>Heat logs</SectionTitle>
              {heatRows.length === 0 ? <Muted>No heat records</Muted> : null}
              {heatRows.map((r, i) => (
                <ListRow
                  key={String(r.id ?? i)}
                  title={String(r.observedAt ?? r.createdAt ?? 'Heat').slice(0, 19)}
                  subtitle={String(r.notes ?? r.intensity ?? '')}
                />
              ))}
            </>
          ) : null}
          {tab === 'heat' && mode === 'add' ? (
            <>
              <Field label="Notes" value={heatNotes} onChangeText={setHeatNotes} />
              <FormActions>
                <PrimaryButton label={busy ? '…' : 'Log heat'} onPress={() => void submitAdd()} disabled={busy} />
              </FormActions>
            </>
          ) : null}

          {tab === 'weight' && mode === 'records' ? (
            <>
              <SectionTitle>Weights</SectionTitle>
              {(data.weights ?? []).length === 0 ? <Muted>No weights</Muted> : null}
              {(data.weights ?? []).map((w) => (
                <ListRow
                  key={w.id}
                  title={`${w.weightKg} kg`}
                  subtitle={
                    commercial && w.bcs != null ? `BCS ${w.bcs}` : w.notes ?? undefined
                  }
                  meta={w.recordedAt?.slice(0, 10)}
                />
              ))}
            </>
          ) : null}
          {tab === 'weight' && mode === 'add' ? (
            <>
              <Field label="Weight kg" value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" />
              <FormActions>
                <PrimaryButton label={busy ? '…' : 'Save weight'} onPress={() => void submitAdd()} disabled={busy} />
              </FormActions>
            </>
          ) : null}
        </ScrollView>
      ) : null}
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.md, paddingBottom: 48, gap: space.sm },
  heroCard: {
    backgroundColor: '#1b6b45',
    borderRadius: 14,
    padding: 20,
    minHeight: 180,
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  photo: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  hero: { fontSize: 26, fontWeight: '600', color: '#fff' },
  heroMeta: { color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  warn: {
    backgroundColor: '#fef3c7',
    borderColor: color.warning,
    borderWidth: 1,
    padding: space.md,
    borderRadius: 6,
  },
  warnText: { color: color.warning, fontWeight: '700' },
  info: {
    backgroundColor: color.brandSubtle,
    padding: space.md,
    borderRadius: 6,
  },
  infoText: { color: color.accent, fontWeight: '700' },
  actions: { gap: space.sm, marginVertical: space.sm },
  tabs: { marginVertical: space.sm },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    minHeight: 40,
  },
  tabOn: { backgroundColor: color.accent, borderColor: color.accent },
  tabText: { fontWeight: '700', color: color.textPrimary, fontSize: 13 },
  tabTextOn: { color: '#fff' },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1,
    minHeight: tap - 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 6,
  },
  modeOn: { backgroundColor: color.brandSubtle, borderColor: color.accent },
  modeText: { fontWeight: '700', color: color.textPrimary },
  stats: { flexDirection: 'row', flexWrap: 'wrap' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  label: { color: color.textMuted, fontWeight: '600' },
  value: { color: color.textPrimary, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
});
