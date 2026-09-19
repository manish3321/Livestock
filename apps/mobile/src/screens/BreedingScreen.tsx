import { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import {
  MATING_TYPES,
  PREGNANCY_STATUSES,
  type BreedingCreate,
  type BreedingMetricsDto,
  type PageResult,
} from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { AnimalIdSearch } from '../components/AnimalIdSearch';
import { ChipSelect, Field, FormActions } from '../components/forms';
import {
  ChipRow,
  EmptyState,
  ErrorText,
  FilterChip,
  ListRow,
  LoadingBlock,
  Muted,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  Stat,
} from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { toQuery } from '../api/query';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';

type Breeding = {
  id: string;
  motherTag?: string | null;
  matingType?: string;
  pregnancyStatus?: string;
  dueDate?: string;
  motherId?: string;
  birthDate?: string | null;
};

type Heat = {
  id: string;
  animalTag?: string | null;
  observedAt?: string;
  intensity?: string;
};

type Tab = 'records' | 'heat' | 'service' | 'pd' | 'calving' | 'colostrum';

const TABS: Tab[] = ['records', 'heat', 'service', 'pd', 'calving', 'colostrum'];

export function BreedingScreen() {
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const canWrite = can('breeding:write');
  const [tab, setTab] = useState<Tab>('records');
  const [items, setItems] = useState<Breeding[]>([]);
  const [heats, setHeats] = useState<Heat[]>([]);
  const [metrics, setMetrics] = useState<BreedingMetricsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // service form
  const [motherId, setMotherId] = useState('');
  const [fatherTagOrAi, setFatherTagOrAi] = useState('');
  const [status, setStatus] = useState<(typeof PREGNANCY_STATUSES)[number]>('PREGNANT');
  const [notes, setNotes] = useState('');
  const [matingType, setMatingType] = useState<(typeof MATING_TYPES)[number]>('AI');
  const [sireId, setSireId] = useState('');
  const [techName, setTechName] = useState('');
  const [techPhone, setTechPhone] = useState('');
  const [costNpr, setCostNpr] = useState('');
  const [birthWeight, setBirthWeight] = useState('');
  const [twins, setTwins] = useState(false);
  const [coloQuality, setColoQuality] = useState('');
  const [coloHours, setColoHours] = useState('');
  const [heatNotes, setHeatNotes] = useState('');

  // heat form
  const [heatAnimalId, setHeatAnimalId] = useState('');
  const [heatIntensity, setHeatIntensity] = useState<'WEAK' | 'MEDIUM' | 'STRONG' | 'SILENT_SUSPECTED'>(
    'MEDIUM',
  );

  // pd form
  const [pdId, setPdId] = useState('');
  const [pdResult, setPdResult] = useState<'PREGNANT' | 'OPEN' | 'RECHECK'>('PREGNANT');

  // calving
  const [calvingId, setCalvingId] = useState('');
  const [calfSex, setCalfSex] = useState<'FEMALE' | 'MALE'>('FEMALE');

  // colostrum
  const [coloId, setColoId] = useState('');
  const [coloLiters, setColoLiters] = useState('2');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [page, m] = await Promise.all([
        api.get<PageResult<Breeding>>(`/v1/breeding${toQuery({ page: 1, pageSize: 100 })}`),
        api.get<BreedingMetricsDto>('/v1/breeding/metrics').catch(() => null),
      ]);
      setItems(page.items);
      setMetrics(m);
      setModuleCache(store, 'breeding', page);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const cached = getModuleCache<PageResult<Breeding>>(store, 'breeding');
      if (cached?.items) {
        setItems(cached.items);
        setFromCache(true);
      } else setError('Could not load breeding');
    } finally {
      setLoading(false);
    }
  }, [api, persist, store]);

  const loadHeat = useCallback(async () => {
    try {
      const page = await api.get<PageResult<Heat> | Heat[]>(
        `/v1/breeding/heat${toQuery({ page: 1, pageSize: 50 })}`,
      );
      setHeats(Array.isArray(page) ? page : page.items ?? []);
    } catch {
      setHeats([]);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === 'heat') void loadHeat();
  }, [loadHeat, tab]);

  const createService = async () => {
    setBusy(true);
    setError(null);
    const body: BreedingCreate = {
      motherId: motherId.trim(),
      fatherTagOrAi: fatherTagOrAi.trim() || undefined,
      matingType,
      sireId: sireId.trim() || undefined,
      technicianName: techName.trim() || undefined,
      technicianPhone: techPhone.trim() || undefined,
      costNpr: costNpr.trim() ? Number(costNpr) : undefined,
      matingDate: new Date(),
      pregnancyStatus: status,
      notes: notes.trim() || undefined,
    };
    try {
      await api.post('/v1/breeding', body);
      setTab('records');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const createHeat = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/v1/breeding/heat', {
        animalId: heatAnimalId.trim(),
        intensity: heatIntensity,
        observedAt: new Date(),
        notes: heatNotes.trim() || undefined,
      });
      await loadHeat();
      setTab('heat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Heat log failed');
    } finally {
      setBusy(false);
    }
  };

  const submitPd = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/breeding/${pdId.trim()}/pd`, {
        result: pdResult,
        checkedAt: new Date(),
      });
      await load();
      setTab('records');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PD failed');
    } finally {
      setBusy(false);
    }
  };

  const submitCalving = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/breeding/${calvingId.trim()}/calving`, {
        birthDate: new Date(),
        calves: [
          {
            sex: calfSex,
            birthWeightKg: birthWeight.trim() ? Number(birthWeight) : undefined,
          },
          ...(twins
            ? [{ sex: calfSex, birthWeightKg: birthWeight.trim() ? Number(birthWeight) : undefined }]
            : []),
        ],
      });
      await load();
      setTab('records');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calving failed');
    } finally {
      setBusy(false);
    }
  };

  const submitColostrum = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/breeding/${coloId.trim()}/colostrum`, {
        fedAt: new Date(),
        liters: Number(coloLiters),
        quality: coloQuality.trim() || undefined,
        hoursAfterBirth: coloHours.trim() ? Number(coloHours) : undefined,
      });
      await load();
      setTab('records');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Colostrum failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell module="breeding">
      <PageHeader title={t('nav.breeding')} subtitle={t('breeding.subtitle')} />
      {fromCache ? (
        <View style={styles.pad}>
          <Muted>{t('native.cached')}</Muted>
        </View>
      ) : null}
      {error ? <ErrorText message={error} /> : null}

      {metrics ? (
        <View style={styles.metrics}>
          <Stat
            label={t('breeding.kpi.conception')}
            value={
              metrics.conceptionRatePct != null ? String(Math.round(metrics.conceptionRatePct)) : '—'
            }
          />
          <Stat
            label={t('breeding.kpi.daysOpen')}
            value={metrics.daysOpen != null ? String(metrics.daysOpen) : '—'}
          />
          <Stat
            label={t('breeding.kpi.heatDetection')}
            value={
              metrics.heatDetectionRatePct != null
                ? String(Math.round(metrics.heatDetectionRatePct))
                : '—'
            }
          />
        </View>
      ) : null}

      <View style={styles.pad}>
        <ChipRow>
          {TABS.map((tabKey) => (
            <FilterChip
              key={tabKey}
              label={t(`breeding.tab.${tabKey}`)}
              active={tab === tabKey}
              onPress={() => setTab(tabKey)}
            />
          ))}
        </ChipRow>
      </View>

      {tab === 'records' ? (
        <>
          {loading && items.length === 0 ? <LoadingBlock /> : null}
          <FlatList
            data={items}
            keyExtractor={(b) => b.id}
            ListEmptyComponent={!loading ? <EmptyState /> : null}
            renderItem={({ item }) => (
              <ListRow
                title={item.motherTag ?? item.motherId?.slice(0, 8) ?? item.id.slice(0, 8)}
                subtitle={[item.matingType, item.pregnancyStatus].filter(Boolean).join(' · ')}
                meta={item.dueDate?.slice(0, 10)}
                onPress={() => {
                  setPdId(item.id);
                  setCalvingId(item.id);
                  setColoId(item.id);
                }}
              />
            )}
          />
        </>
      ) : null}

      {tab === 'heat' ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          {canWrite ? (
            <>
              <SectionTitle>{t('breeding.logHeat')}</SectionTitle>
              <AnimalIdSearch value={heatAnimalId} onChange={(id) => setHeatAnimalId(id)} />
              <ChipSelect
                label={t('breeding.intensity')}
                options={['WEAK', 'MEDIUM', 'STRONG', 'SILENT_SUSPECTED']}
                value={heatIntensity}
                onChange={setHeatIntensity}
              />
              <Field label={t('common.notes')} value={heatNotes} onChangeText={setHeatNotes} />
              <PrimaryButton
                label={t('common.save')}
                disabled={busy || !canWrite}
                onPress={() => void createHeat()}
              />
            </>
          ) : null}
          <SectionTitle>{t('breeding.heatLog')}</SectionTitle>
          {heats.map((h) => (
            <ListRow
              key={h.id}
              title={h.animalTag ?? h.id.slice(0, 8)}
              subtitle={h.intensity}
              meta={h.observedAt?.slice(0, 10)}
            />
          ))}
        </ScrollView>
      ) : null}

      {tab === 'service' && canWrite ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <SectionTitle>{t('breeding.add')}</SectionTitle>
          <AnimalIdSearch label={t('breeding.mother')} value={motherId} onChange={(id) => setMotherId(id)} />
          <ChipSelect label="Mating type" options={[...MATING_TYPES]} value={matingType} onChange={setMatingType} />
          <Field label={t('breeding.fatherTagOrAi')} value={fatherTagOrAi} onChangeText={setFatherTagOrAi} />
          <Field label="Sire ID" value={sireId} onChangeText={setSireId} autoCapitalize="none" />
          <Field label={t('breeding.technicianPhone') !== 'breeding.technicianPhone' ? 'Technician' : t('breeding.technicianPhone')} value={techName} onChangeText={setTechName} />
          <Field label="Tech phone" value={techPhone} onChangeText={setTechPhone} keyboardType="phone-pad" />
          <Field label="Cost NPR" value={costNpr} onChangeText={setCostNpr} keyboardType="decimal-pad" />
          <ChipSelect label={t('breeding.status')} options={[...PREGNANCY_STATUSES]} value={status} onChange={setStatus} />
          <Field label={t('common.notes')} value={notes} onChangeText={setNotes} />
          <FormActions>
            <PrimaryButton label={t('common.save')} onPress={() => void createService()} disabled={busy} />
            <SecondaryButton label={t('common.cancel')} onPress={() => setTab('records')} />
          </FormActions>
        </ScrollView>
      ) : null}

      {tab === 'pd' && canWrite ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <SectionTitle>{t('breeding.tab.pd')}</SectionTitle>
          <ChipSelect
            label={t('breeding.status')}
            options={['PREGNANT', 'OPEN', 'RECHECK']}
            value={pdResult}
            onChange={setPdResult}
          />
          <PrimaryButton label={t('common.save')} disabled={busy || !pdId} onPress={() => void submitPd()} />
        </ScrollView>
      ) : null}

      {tab === 'calving' && canWrite ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <SectionTitle>{t('breeding.updateDelivery')}</SectionTitle>
          <ChipSelect
            label={t('animals.gender')}
            options={['FEMALE', 'MALE']}
            value={calfSex}
            onChange={setCalfSex}
            labels={{ FEMALE: t('animals.female'), MALE: t('animals.male') }}
          />
          <Field label="Birth weight kg" value={birthWeight} onChangeText={setBirthWeight} keyboardType="decimal-pad" />
          <ChipSelect
            label="Twins"
            options={['NO', 'YES'] as const}
            value={twins ? 'YES' : 'NO'}
            onChange={(v) => setTwins(v === 'YES')}
          />
          <PrimaryButton
            label={t('common.save')}
            disabled={busy || !calvingId}
            onPress={() => void submitCalving()}
          />
        </ScrollView>
      ) : null}

      {tab === 'colostrum' && canWrite ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <SectionTitle>{t('breeding.tab.colostrum')}</SectionTitle>
          <Field
            label={t('breeding.colostrumLiters')}
            value={coloLiters}
            onChangeText={setColoLiters}
            keyboardType="decimal-pad"
          />
          <Field label="Quality" value={coloQuality} onChangeText={setColoQuality} />
          <Field
            label="Hours after birth"
            value={coloHours}
            onChangeText={setColoHours}
            keyboardType="decimal-pad"
          />
          <PrimaryButton
            label={t('breeding.saveColostrum')}
            disabled={busy || !coloId}
            onPress={() => void submitColostrum()}
          />
        </ScrollView>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 40 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
});
