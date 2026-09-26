import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  formatDate,
  formatNPR,
  type AnimalDto,
  type BreedingCreate,
  type BreedingMetricsDto,
  type PageResult,
  type SpeciesConfigDto,
  type TaskDto,
} from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { ChipSelect, Field, FormActions } from '../components/forms';
import {
  Card,
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
  Txt,
} from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { toQuery } from '../api/query';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import {
  buildWalkRows,
  buildWatchRows,
  groupWalkByKind,
  groupWatchByKind,
  type BreedingRecordLite,
  type WalkKind,
  type WatchKind,
  type WatchRow,
} from '../lib/breeding-groups';
import type { RootStackParamList } from '../navigation/types';
import { color, radius, tap } from '../theme/tokens';

type Heat = {
  id: string;
  animalId?: string;
  animalTag?: string | null;
  observedAt?: string;
  intensity?: string;
  signs?: string | null;
};

type MainTab = 'watch' | 'walk' | 'herd';
type FormMode = 'heat' | 'service' | 'pd' | 'calving' | 'colostrum' | null;

const MAIN_TABS: MainTab[] = ['watch', 'walk', 'herd'];
const FORM_MODES = new Set<string>(['heat', 'service', 'pd', 'calving', 'colostrum']);

const HEAT_SIGNS = [
  'STANDING_HEAT',
  'MOUNTING_OTHERS',
  'MUCUS_DISCHARGE',
  'VULVA_SWELLING',
  'BELLOWING',
  'RESTLESSNESS',
  'REDUCED_MILK',
  'TAIL_RAISED',
  'OFF_FEED',
] as const;

const INTENSITIES = ['STRONG', 'MEDIUM', 'WEAK'] as const;

function toDateTimeLocal(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function toDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function fmtPct(n: number | null | undefined): string {
  return n == null ? '—' : `${Math.round(n)}%`;
}

function fmtNum(n: number | null | undefined): string {
  return n == null ? '—' : String(n);
}

function animalPickLabel(a: Pick<AnimalDto, 'herdNumber' | 'tag' | 'name'>): string {
  const id = a.herdNumber ?? a.tag;
  return a.name?.trim() ? `${id} · ${a.name}` : id;
}

export function BreedingScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Breeding'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const canWrite = can('breeding:write');

  const [mainTab, setMainTab] = useState<MainTab>('watch');
  const [form, setForm] = useState<FormMode>(() => {
    const f = route.params?.form;
    return f && FORM_MODES.has(f) ? (f as FormMode) : null;
  });

  const [records, setRecords] = useState<BreedingRecordLite[]>([]);
  const [heats, setHeats] = useState<Heat[]>([]);
  const [females, setFemales] = useState<AnimalDto[]>([]);
  const [males, setMales] = useState<AnimalDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [config, setConfig] = useState<SpeciesConfigDto[]>([]);
  const [metrics, setMetrics] = useState<BreedingMetricsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Heat form
  const [heatAnimalId, setHeatAnimalId] = useState(route.params?.animalId ?? '');
  const [observedAt, setObservedAt] = useState(toDateTimeLocal(new Date()));
  const [heatIntensity, setHeatIntensity] = useState<(typeof INTENSITIES)[number]>('MEDIUM');
  const [silent, setSilent] = useState(false);
  const [signs, setSigns] = useState<string[]>([]);

  // Service form
  const [motherId, setMotherId] = useState(route.params?.animalId ?? '');
  const [matingType, setMatingType] = useState<'AI' | 'NATURAL'>('AI');
  const [fatherTagOrAi, setFatherTagOrAi] = useState('');
  const [sireId, setSireId] = useState('');
  const [matingDate, setMatingDate] = useState(toDateInput(new Date()));

  // PD / calving / colostrum (deep-link + walk)
  const [pdId, setPdId] = useState(route.params?.breedingId ?? '');
  const [pdResult, setPdResult] = useState<'CONFIRMED' | 'OPEN' | 'INCONCLUSIVE'>('CONFIRMED');
  const [calvingId, setCalvingId] = useState(route.params?.breedingId ?? '');
  const [calfSex, setCalfSex] = useState<'FEMALE' | 'MALE'>('FEMALE');
  const [coloId, setColoId] = useState(route.params?.breedingId ?? '');
  const [coloLiters, setColoLiters] = useState('2');

  useEffect(() => {
    const f = route.params?.form;
    if (f && FORM_MODES.has(f)) setForm(f as FormMode);
    if (route.params?.animalId) {
      setHeatAnimalId(route.params.animalId);
      setMotherId(route.params.animalId);
    }
    if (route.params?.breedingId) {
      setPdId(route.params.breedingId);
      setCalvingId(route.params.breedingId);
      setColoId(route.params.breedingId);
    }
  }, [route.params?.animalId, route.params?.breedingId, route.params?.form]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [page, m, heatPage, femalePage, malePage, taskPage, cfg] = await Promise.all([
        api.get<PageResult<BreedingRecordLite>>(`/v1/breeding${toQuery({ page: 1, pageSize: 200 })}`),
        api.get<BreedingMetricsDto>('/v1/breeding/metrics').catch(() => null),
        api.get<PageResult<Heat>>(`/v1/breeding/heat${toQuery({ page: 1, pageSize: 50 })}`).catch(() => null),
        api.get<PageResult<AnimalDto>>(`/v1/animals${toQuery({ gender: 'FEMALE', pageSize: 200 })}`).catch(() => null),
        api.get<PageResult<AnimalDto>>(`/v1/animals${toQuery({ gender: 'MALE', pageSize: 200 })}`).catch(() => null),
        api.get<PageResult<TaskDto>>('/v1/tasks?page=1&pageSize=100').catch(() => null),
        api.get<SpeciesConfigDto[]>('/v1/species-config').catch(() => null),
      ]);
      setRecords(page.items);
      setMetrics(m);
      setHeats(heatPage?.items ?? []);
      setFemales(femalePage?.items ?? []);
      setMales(malePage?.items ?? []);
      setTasks(
        (taskPage?.items ?? []).filter((x) => x.status === 'PENDING' || x.status === 'SNOOZED'),
      );
      setConfig(cfg ?? []);
      setModuleCache(store, 'breeding', page);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const cached = getModuleCache<PageResult<BreedingRecordLite>>(store, 'breeding');
      if (cached?.items) {
        setRecords(cached.items);
        setFromCache(true);
      } else setError(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [api, persist, store, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const configBySpecies = useMemo(() => {
    const map = new Map<string, SpeciesConfigDto>();
    for (const row of config) map.set(row.species, row);
    return map;
  }, [config]);

  const watchRows = useMemo(
    () => buildWatchRows(females, records, configBySpecies),
    [females, records, configBySpecies],
  );
  const watchGroups = useMemo(() => groupWatchByKind(watchRows), [watchRows]);
  const walkRows = useMemo(() => buildWalkRows(tasks), [tasks]);
  const walkGroups = useMemo(() => groupWalkByKind(walkRows), [walkRows]);

  const openForm = (mode: FormMode, animalId?: string | null, breedingId?: string) => {
    if (animalId) {
      setHeatAnimalId(animalId);
      setMotherId(animalId);
    }
    if (breedingId) {
      setPdId(breedingId);
      setCalvingId(breedingId);
      setColoId(breedingId);
    }
    setForm(mode);
  };

  const closeForm = () => setForm(null);

  const openAnimal = (id: string) => {
    navigation.navigate('AnimalDetail', { id });
  };

  const onWatchRecord = (row: WatchRow) => {
    if (row.recordAction === 'animal') {
      openAnimal(row.animalId);
      return;
    }
    openForm(row.recordAction, row.animalId, row.breedingId);
  };

  const dismissTask = async (task: TaskDto) => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/v1/tasks/${task.id}/dismiss`, { reason: 'NOT_NEEDED' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const createHeat = async () => {
    if (!heatAnimalId.trim()) {
      setError(t('breeding.requiredFields'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/v1/breeding/heat', {
        animalId: heatAnimalId.trim(),
        intensity: silent ? 'WEAK' : heatIntensity,
        observedAt: new Date(observedAt),
        signs: [...(silent ? ['SILENT_SUSPECTED'] : []), ...signs].join(',') || undefined,
        signList: signs,
      });
      setSigns([]);
      setSilent(false);
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const createService = async () => {
    if (!motherId.trim()) {
      setError(t('breeding.requiredFields'));
      return;
    }
    setBusy(true);
    setError(null);
    const body: BreedingCreate = {
      motherId: motherId.trim(),
      matingType,
      fatherTagOrAi: fatherTagOrAi.trim() || undefined,
      sireId: sireId.trim() || undefined,
      matingDate: new Date(matingDate),
      pregnancyStatus: 'PREGNANT',
    };
    try {
      await api.post('/v1/breeding', body);
      setFatherTagOrAi('');
      setSireId('');
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const submitPd = async () => {
    if (!pdId.trim()) {
      setError(t('breeding.noOpenServices'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/breeding/${pdId.trim()}/pd`, {
        result: pdResult,
        checkedAt: new Date(),
      });
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const submitCalving = async () => {
    if (!calvingId.trim()) {
      setError(t('breeding.noPendingCalving'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/breeding/${calvingId.trim()}/calving`, {
        birthDate: new Date(),
        calves: [{ sex: calfSex }],
      });
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const submitColostrum = async () => {
    if (!coloId.trim()) {
      setError(t('breeding.noRecentCalving'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/breeding/${coloId.trim()}/colostrum`, {
        fedAt: new Date(),
        liters: Number(coloLiters),
      });
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const watchTitle = (kind: WatchKind) => t(`breeding.watch.${kind}`);
  const walkTitle = (kind: WalkKind) => t(`breeding.walk.${kind}`);

  return (
    <AppShell module="breeding">
      <View style={styles.screen}>
        <View style={styles.stickyTop}>
          <PageHeader title={t('nav.breeding')} subtitle={t('breeding.subtitle')} />
          {fromCache ? <Muted>{t('native.cached')}</Muted> : null}
          {error && !form ? <ErrorText message={error} /> : null}
          <ChipRow>
            {MAIN_TABS.map((tabKey) => (
              <FilterChip
                key={tabKey}
                label={t(`breeding.mainTab.${tabKey}`)}
                active={mainTab === tabKey}
                onPress={() => setMainTab(tabKey)}
              />
            ))}
          </ChipRow>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.pageContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {loading && females.length === 0 && records.length === 0 ? <LoadingBlock /> : null}

          {mainTab === 'watch' ? (
            <View>
              {watchGroups.length === 0 && !loading ? <EmptyState /> : null}
              {watchGroups.map((group) => (
                <View key={group.kind} style={styles.section}>
                  <SectionTitle>
                    {watchTitle(group.kind)} ({group.items.length})
                  </SectionTitle>
                  {group.items.map((row) => (
                    <Card key={row.key} style={styles.rowCard}>
                      <Pressable onPress={() => openAnimal(row.animalId)}>
                        <Txt weight="semibold" style={styles.rowTitle}>
                          {row.label}
                        </Txt>
                        <Muted>{row.subtitle}</Muted>
                      </Pressable>
                      {row.progress != null ? (
                        <View style={styles.progressWrap}>
                          <View style={styles.progressTrack}>
                            <View
                              style={[
                                styles.progressFill,
                                { width: `${Math.round(row.progress * 100)}%` },
                              ]}
                            />
                          </View>
                          {row.progressLabel ? <Muted>{row.progressLabel}</Muted> : null}
                        </View>
                      ) : row.progressLabel ? (
                        <Muted>{row.progressLabel}</Muted>
                      ) : null}
                      {canWrite ? (
                        <View style={styles.rowActions}>
                          <PrimaryButton
                            label={t('breeding.recordAction')}
                            onPress={() => onWatchRecord(row)}
                          />
                        </View>
                      ) : null}
                    </Card>
                  ))}
                </View>
              ))}
            </View>
          ) : null}

          {mainTab === 'walk' ? (
            <View>
              {walkGroups.length === 0 && !loading ? (
                <EmptyState message={t('breeding.walkEmpty')} />
              ) : null}
              {walkGroups.map((group) => (
                <View key={group.kind} style={styles.section}>
                  <SectionTitle>
                    {walkTitle(group.kind)} ({group.items.length})
                  </SectionTitle>
                  {group.items.map((row) => (
                    <Card key={row.key} style={styles.rowCard}>
                      <Pressable
                        onPress={() => (row.animalId ? openAnimal(row.animalId) : undefined)}
                      >
                        <Txt weight="semibold" style={styles.rowTitle}>
                          {row.label}
                        </Txt>
                        <Muted>{row.subtitle}</Muted>
                      </Pressable>
                      {canWrite ? (
                        <View style={styles.rowActions}>
                          {group.kind === 'checkHeat' ? (
                            <>
                              <PrimaryButton
                                label={t('breeding.sawHeat')}
                                onPress={() => openForm('heat', row.animalId)}
                              />
                              <SecondaryButton
                                label={t('breeding.nothing')}
                                onPress={() => void dismissTask(row.task)}
                              />
                            </>
                          ) : null}
                          {group.kind === 'breedToday' ? (
                            <PrimaryButton
                              label={t('breeding.add')}
                              onPress={() => openForm('service', row.animalId)}
                            />
                          ) : null}
                          {group.kind === 'pd' ? (
                            <PrimaryButton
                              label={t('breeding.savePd')}
                              onPress={() => openForm('pd', row.animalId, row.breedingId)}
                            />
                          ) : null}
                          {group.kind === 'dryOff' ? (
                            <PrimaryButton
                              label={t('breeding.walk.dryOff')}
                              onPress={() => (row.animalId ? openAnimal(row.animalId) : undefined)}
                            />
                          ) : null}
                          {group.kind === 'postCalving' ? (
                            <PrimaryButton
                              label={
                                row.task.type === 'COLOSTRUM_FEED'
                                  ? t('breeding.tab.colostrum')
                                  : row.task.type === 'CALVING_WATCH'
                                    ? t('breeding.tab.calving')
                                    : t('breeding.recordAction')
                              }
                              onPress={() => {
                                if (row.task.type === 'COLOSTRUM_FEED') {
                                  openForm('colostrum', row.animalId, row.breedingId);
                                } else if (row.task.type === 'CALVING_WATCH') {
                                  openForm('calving', row.animalId, row.breedingId);
                                } else if (row.animalId) {
                                  openAnimal(row.animalId);
                                }
                              }}
                            />
                          ) : null}
                        </View>
                      ) : null}
                    </Card>
                  ))}
                </View>
              ))}
            </View>
          ) : null}

          {mainTab === 'herd' ? (
            <View>
              {metrics ? (
                <View style={styles.metrics}>
                  <Stat label={t('breeding.kpi.conception')} value={fmtPct(metrics.conceptionRatePct)} />
                  <Stat
                    label={t('breeding.kpi.firstService')}
                    value={fmtPct(metrics.firstServiceRatePct)}
                  />
                  <Stat label={t('breeding.kpi.daysOpen')} value={fmtNum(metrics.daysOpen)} />
                  <Stat label={t('breeding.kpi.interval')} value={fmtNum(metrics.calvingIntervalDays)} />
                  <Stat
                    label={t('breeding.kpi.services')}
                    value={
                      metrics.servicesPerConception == null
                        ? '—'
                        : metrics.servicesPerConception.toFixed(1)
                    }
                  />
                  <Stat
                    label={t('breeding.kpi.heatDetection')}
                    value={fmtPct(metrics.heatDetectionRatePct)}
                  />
                  <Stat
                    label={t('breeding.kpi.firstCalving')}
                    value={
                      metrics.ageAtFirstCalvingMonths == null
                        ? '—'
                        : t('breeding.kpi.months', { n: metrics.ageAtFirstCalvingMonths })
                    }
                  />
                  <Stat
                    label={t('breeding.kpi.openCost')}
                    value={
                      metrics.costOfOpenDaysNpr == null
                        ? '—'
                        : formatNPR(metrics.costOfOpenDaysNpr)
                    }
                  />
                </View>
              ) : null}

              {metrics && metrics.observers.length > 0 ? (
                <View style={styles.section}>
                  <SectionTitle>{t('breeding.observersTitle')}</SectionTitle>
                  <Muted>{t('breeding.observersHelp')}</Muted>
                  {metrics.observers.map((o) => (
                    <ListRow
                      key={o.observerId}
                      title={o.observerName ?? o.observerId.slice(0, 8)}
                      subtitle={`${t('breeding.heatsSeen')}: ${o.heatsObserved} · ${t('breeding.standingHeat')}: ${o.standingHeatCount}`}
                      meta={fmtPct(o.heatDetectionRatePct)}
                    />
                  ))}
                </View>
              ) : null}

              <View style={styles.section}>
                <SectionTitle>{t('breeding.tab.records')}</SectionTitle>
                {records.length === 0 && !loading ? <EmptyState /> : null}
                {records.map((item) => (
                  <Card key={item.id} style={styles.rowCard}>
                    <Pressable
                      onPress={() => (item.motherId ? openAnimal(item.motherId) : undefined)}
                    >
                      <Txt weight="semibold" style={styles.rowTitle}>
                        {item.motherTag ?? item.motherId?.slice(0, 8) ?? item.id.slice(0, 8)}
                      </Txt>
                      <Muted>
                        {[
                          item.matingType,
                          item.pregnancyStatus,
                          item.matingDate ? formatDate(item.matingDate) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Muted>
                      {item.dueDate ? (
                        <Muted>
                          {t('breeding.dueDate')}: {formatDate(item.dueDate)}
                          {item.daysRemaining != null ? ` · ${item.daysRemaining}d` : ''}
                        </Muted>
                      ) : null}
                    </Pressable>
                    {canWrite &&
                    item.pregnancyStatus !== 'DELIVERED' &&
                    item.pregnancyStatus !== 'FAILED' ? (
                      <View style={styles.rowActions}>
                        <SecondaryButton
                          label={t('breeding.tab.pd')}
                          onPress={() => openForm('pd', item.motherId, item.id)}
                        />
                        <SecondaryButton
                          label={t('breeding.tab.calving')}
                          onPress={() => openForm('calving', item.motherId, item.id)}
                        />
                      </View>
                    ) : null}
                    {canWrite && item.pregnancyStatus === 'DELIVERED' && !item.colostrumFed ? (
                      <View style={styles.rowActions}>
                        <PrimaryButton
                          label={t('breeding.tab.colostrum')}
                          onPress={() => openForm('colostrum', item.motherId, item.id)}
                        />
                      </View>
                    ) : null}
                  </Card>
                ))}
              </View>

              <View style={styles.section}>
                <SectionTitle>{t('breeding.heatLog')}</SectionTitle>
                {heats.length === 0 ? <Muted>{t('common.empty')}</Muted> : null}
                {heats.slice(0, 20).map((h) => (
                  <ListRow
                    key={h.id}
                    title={h.animalTag ?? h.animalId?.slice(0, 8) ?? h.id.slice(0, 8)}
                    subtitle={
                      h.intensity ? t(`enum.heatIntensity.${h.intensity}`) : undefined
                    }
                    meta={h.observedAt ? formatDate(h.observedAt) : undefined}
                    onPress={h.animalId ? () => openAnimal(h.animalId!) : undefined}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        {canWrite ? (
          <View style={styles.fabStack} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('breeding.logHeat')}
              onPress={() => openForm('heat')}
              style={({ pressed }) => [styles.fabSecondary, pressed && styles.fabPressed]}
            >
              <Txt weight="semibold" style={styles.fabSecondaryText}>
                {t('breeding.logHeat')}
              </Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('breeding.add')}
              onPress={() => openForm('service')}
              style={({ pressed }) => [styles.fabPrimary, pressed && styles.fabPressed]}
            >
              <Txt weight="semibold" style={styles.fabPrimaryText}>
                {t('breeding.add')}
              </Txt>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Modal visible={form != null} animationType="slide" onRequestClose={closeForm}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Txt weight="semibold" style={styles.eyebrow}>
                {form === 'heat'
                  ? t('breeding.formEyebrow.heat')
                  : form === 'service'
                    ? t('breeding.formEyebrow.service')
                    : form === 'pd'
                      ? t('breeding.formEyebrow.pd')
                      : form === 'calving'
                        ? t('breeding.formEyebrow.calving')
                        : form === 'colostrum'
                          ? t('breeding.formEyebrow.colostrum')
                          : ''}
              </Txt>
              <Txt weight="display" style={styles.modalTitle}>
                {t('nav.breeding')}
              </Txt>
            </View>
            <SecondaryButton label={t('common.close')} onPress={closeForm} />
          </View>

          {error ? <ErrorText message={error} /> : null}

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {form === 'heat' ? (
              <>
                <MotherPicker
                  label={t('breeding.mother')}
                  females={females}
                  value={heatAnimalId}
                  onChange={setHeatAnimalId}
                  placeholder={t('breeding.selectMother')}
                />
                <Field
                  label={t('breeding.observedAt')}
                  value={observedAt}
                  onChangeText={setObservedAt}
                  placeholder="YYYY-MM-DDTHH:mm"
                  autoCapitalize="none"
                />
                <ChipSelect
                  label={t('breeding.intensity')}
                  options={[...INTENSITIES]}
                  value={heatIntensity}
                  onChange={setHeatIntensity}
                  labels={{
                    STRONG: t('enum.heatIntensity.STRONG'),
                    MEDIUM: t('enum.heatIntensity.MEDIUM'),
                    WEAK: t('enum.heatIntensity.WEAK'),
                  }}
                />
                <Txt weight="medium" style={styles.signsLabel}>
                  {t('breeding.signs')}
                </Txt>
                <View style={styles.signWrap}>
                  <Pressable
                    onPress={() => setSilent((v) => !v)}
                    style={[styles.signChip, silent && styles.signChipOn]}
                  >
                    <Txt weight="semibold" style={silent ? styles.signTextOn : styles.signText}>
                      {t('breeding.silentSuspected')}
                    </Txt>
                  </Pressable>
                  {HEAT_SIGNS.map((sign) => {
                    const on = signs.includes(sign);
                    return (
                      <Pressable
                        key={sign}
                        onPress={() =>
                          setSigns((cur) =>
                            cur.includes(sign) ? cur.filter((s) => s !== sign) : [...cur, sign],
                          )
                        }
                        style={[styles.signChip, on && styles.signChipOn]}
                      >
                        <Txt weight="semibold" style={on ? styles.signTextOn : styles.signText}>
                          {t(`enum.heatSign.${sign}`)}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </View>
                {canWrite ? (
                  <FormActions>
                    <PrimaryButton
                      label={t('breeding.saveHeat')}
                      disabled={busy || !heatAnimalId}
                      onPress={() => void createHeat()}
                    />
                  </FormActions>
                ) : null}
              </>
            ) : null}

            {form === 'service' ? (
              <>
                <MotherPicker
                  label={t('breeding.mother')}
                  females={females}
                  value={motherId}
                  onChange={setMotherId}
                  placeholder={t('breeding.selectMother')}
                />
                <ChipSelect
                  label={t('breeding.matingType')}
                  options={['AI', 'NATURAL']}
                  value={matingType}
                  onChange={setMatingType}
                  labels={{ AI: t('breeding.ai'), NATURAL: t('breeding.natural') }}
                />
                <Field
                  label={matingType === 'AI' ? t('breeding.straw') : t('breeding.bull')}
                  value={fatherTagOrAi}
                  onChangeText={setFatherTagOrAi}
                />
                <Txt weight="medium" style={styles.signsLabel}>
                  {t('breeding.sire')}
                </Txt>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sireRow}>
                  <Pressable
                    onPress={() => setSireId('')}
                    style={[styles.signChip, !sireId && styles.signChipOn]}
                  >
                    <Txt weight="semibold" style={!sireId ? styles.signTextOn : styles.signText}>
                      {t('breeding.noSire')}
                    </Txt>
                  </Pressable>
                  {males.map((m) => {
                    const on = sireId === m.id;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => setSireId(m.id)}
                        style={[styles.signChip, on && styles.signChipOn]}
                      >
                        <Txt weight="semibold" style={on ? styles.signTextOn : styles.signText}>
                          {animalPickLabel(m)}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Field
                  label={t('breeding.matingDate')}
                  value={matingDate}
                  onChangeText={setMatingDate}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                />
                {canWrite ? (
                  <FormActions>
                    <PrimaryButton
                      label={t('breeding.saveService')}
                      disabled={busy || !motherId}
                      onPress={() => void createService()}
                    />
                  </FormActions>
                ) : null}
              </>
            ) : null}

            {form === 'pd' ? (
              <>
                <Txt weight="medium" style={styles.signsLabel}>
                  {t('breeding.record')}
                </Txt>
                <MotherPicker
                  label={t('breeding.mother')}
                  females={females}
                  value={motherId}
                  onChange={(id) => {
                    setMotherId(id);
                    const rec = records.find(
                      (r) =>
                        r.motherId === id &&
                        r.pregnancyStatus !== 'DELIVERED' &&
                        r.pregnancyStatus !== 'FAILED',
                    );
                    if (rec) setPdId(rec.id);
                  }}
                  placeholder={t('breeding.selectMother')}
                />
                {pdId ? <Muted>{pdId.slice(0, 8)}…</Muted> : <Muted>{t('breeding.noOpenServices')}</Muted>}
                <ChipSelect
                  label={t('breeding.pdResult')}
                  options={['CONFIRMED', 'OPEN', 'INCONCLUSIVE']}
                  value={pdResult}
                  onChange={setPdResult}
                  labels={{
                    CONFIRMED: t('breeding.pdConfirmed'),
                    OPEN: t('breeding.pdOpen'),
                    INCONCLUSIVE: t('breeding.pdInconclusive'),
                  }}
                />
                {canWrite ? (
                  <PrimaryButton
                    label={t('breeding.savePd')}
                    disabled={busy || !pdId}
                    onPress={() => void submitPd()}
                  />
                ) : null}
              </>
            ) : null}

            {form === 'calving' ? (
              <>
                {calvingId ? <Muted>{calvingId.slice(0, 8)}…</Muted> : <Muted>{t('breeding.noPendingCalving')}</Muted>}
                <ChipSelect
                  label={t('animals.gender')}
                  options={['FEMALE', 'MALE']}
                  value={calfSex}
                  onChange={setCalfSex}
                  labels={{ FEMALE: t('animals.female'), MALE: t('animals.male') }}
                />
                {canWrite ? (
                  <PrimaryButton
                    label={t('breeding.saveCalving')}
                    disabled={busy || !calvingId}
                    onPress={() => void submitCalving()}
                  />
                ) : null}
              </>
            ) : null}

            {form === 'colostrum' ? (
              <>
                {coloId ? <Muted>{coloId.slice(0, 8)}…</Muted> : <Muted>{t('breeding.noRecentCalving')}</Muted>}
                <Field
                  label={t('breeding.colostrumLiters')}
                  value={coloLiters}
                  onChangeText={setColoLiters}
                  keyboardType="decimal-pad"
                />
                {canWrite ? (
                  <PrimaryButton
                    label={t('breeding.saveColostrum')}
                    disabled={busy || !coloId}
                    onPress={() => void submitColostrum()}
                  />
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </AppShell>
  );
}

function MotherPicker({
  label,
  females,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  females: AnimalDto[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState('');
  const selected = females.find((a) => a.id === value);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return females.slice(0, 40);
    return females
      .filter((a) => {
        const hay = `${a.herdNumber ?? ''} ${a.tag} ${a.name ?? ''}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 40);
  }, [females, q]);

  return (
    <View style={styles.picker}>
      <Txt weight="medium" style={styles.signsLabel}>
        {label}
      </Txt>
      {selected ? (
        <Txt weight="semibold" style={styles.selectedMother}>
          {animalPickLabel(selected)}
        </Txt>
      ) : (
        <Muted>{placeholder}</Muted>
      )}
      <TextInput
        style={styles.search}
        value={q}
        onChangeText={setQ}
        placeholder={placeholder}
        placeholderTextColor={color.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <View style={styles.pickList}>
        {filtered.map((a) => {
          const on = a.id === value;
          return (
            <Pressable
              key={a.id}
              onPress={() => onChange(a.id)}
              style={[styles.pickRow, on && styles.pickRowOn]}
            >
              <Txt weight={on ? 'semibold' : 'regular'}>{animalPickLabel(a)}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  stickyTop: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: color.surfaceSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
    zIndex: 2,
  },
  scroll: { flex: 1 },
  pageContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 160,
    gap: 8,
  },
  fabStack: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    gap: 10,
    alignItems: 'flex-end',
    zIndex: 5,
  },
  fabPrimary: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: color.brand,
    borderBottomWidth: 3,
    borderBottomColor: color.brandStrong,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabSecondary: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  fabPressed: { opacity: 0.9, transform: [{ translateY: 1 }] },
  fabPrimaryText: { color: color.surface, fontSize: 14 },
  fabSecondaryText: { color: color.textPrimary, fontSize: 14 },
  section: { marginTop: 12, gap: 8 },
  rowCard: { gap: 8, marginBottom: 8 },
  rowTitle: { fontSize: 16 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  progressWrap: { gap: 4 },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: color.brand,
    borderRadius: radius.pill,
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  modal: { flex: 1, backgroundColor: color.surface, paddingTop: 48 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.brand,
    marginBottom: 2,
  },
  modalTitle: { fontSize: 28 },
  modalBody: { padding: 16, paddingBottom: 60 },
  signsLabel: { fontSize: 13, color: color.textSecondary, marginBottom: 8, marginTop: 4 },
  signWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  signChip: {
    minHeight: tap,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceMuted,
    borderWidth: 1.5,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signChipOn: { backgroundColor: color.brand, borderColor: color.brand },
  signText: { fontSize: 13, color: color.textSecondary },
  signTextOn: { fontSize: 13, color: color.surface },
  sireRow: { marginBottom: 16, maxHeight: 56 },
  picker: { marginBottom: 16, gap: 6 },
  selectedMother: { fontSize: 16 },
  search: {
    minHeight: tap,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    color: color.textPrimary,
    backgroundColor: color.surface,
  },
  pickList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  pickRow: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  pickRowOn: { backgroundColor: color.brandSubtle },
});
