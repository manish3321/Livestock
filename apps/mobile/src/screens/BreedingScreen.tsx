import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Linking,
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
  type BoardItemDto,
  type BreedingBoardDto,
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
  EmptyState,
  ErrorText,
  ListRow,
  LoadingBlock,
  Muted,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
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

const GROUP_COLOUR: Record<string, string> = {
  RED: '#C62828',
  YELLOW: '#E65100',
  BLUE: '#2A6A4A',
  PURPLE: '#1F4D38',
  AMBER: '#E65100',
  GREY: '#6B6F68',
  GREEN: '#2A6A4A',
};

const WATCH_GROUP_COLOUR: Record<string, string> = {
  calvingSoon: '#C62828',
  fresh: '#2A6A4A',
  watchingHeat: '#E65100',
  pdWait: '#2A6A4A',
  tooSoon: '#6B6F68',
  carrying: '#1F4D38',
  heifers: '#6B6F68',
};

const URGENCY: Record<string, { fg: string; bg: string }> = {
  GREEN: { fg: '#2A6A4A', bg: 'rgba(42, 106, 74, 0.08)' },
  AMBER: { fg: '#E65100', bg: 'rgba(230, 81, 0, 0.1)' },
  RED: { fg: '#C62828', bg: 'rgba(198, 40, 40, 0.1)' },
  NORMAL: { fg: '#6B6F68', bg: color.surface },
};

const CALVING_DIFFICULTY = ['EASY', 'ASSISTED', 'EMERGENCY', 'STILLBIRTH'] as const;

function splitAnimalLabel(label: string): { shortNo: string; name: string } {
  const parts = label.split(' · ');
  if (parts.length >= 2) return { shortNo: parts[0]!, name: parts.slice(1).join(' · ') };
  return { shortNo: label, name: '' };
}

function SheetStep({
  n,
  title,
  children,
}: {
  n: number | string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.sheetStep}>
      <View style={styles.sheetStepTitleRow}>
        <View style={styles.sheetStepNum}>
          <Txt weight="bold" style={styles.sheetStepNumText}>
            {String(n)}
          </Txt>
        </View>
        <Txt weight="semibold" style={styles.sheetStepTitle}>
          {title}
        </Txt>
      </View>
      {children}
    </View>
  );
}

function DamHero({ shortNo, name }: { shortNo: string; name?: string | null }) {
  return (
    <View style={styles.damHero}>
      <Txt weight="bold" style={styles.damHeroTag}>
        {shortNo || '—'}
      </Txt>
      {name ? <Muted>{name}</Muted> : null}
    </View>
  );
}

function KpiTile({
  label,
  value,
  miss,
}: {
  label: string;
  value: string;
  miss?: boolean;
}) {
  return (
    <View style={[styles.kpiTile, miss && styles.kpiTileMiss]}>
      <Txt muted style={styles.kpiLabel}>
        {label}
      </Txt>
      <Txt weight="bold" style={[styles.kpiValue, miss && styles.kpiValueMiss]}>
        {value}
      </Txt>
    </View>
  );
}

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
  const [board, setBoard] = useState<BreedingBoardDto | null>(null);
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
  const [calvingOutcome, setCalvingOutcome] = useState<'LIVE' | 'ABORTED'>('LIVE');
  const [calvingDifficulty, setCalvingDifficulty] =
    useState<(typeof CALVING_DIFFICULTY)[number]>('EASY');
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
      const [page, m, heatPage, femalePage, malePage, taskPage, cfg, boardDto] = await Promise.all([
        api.get<PageResult<BreedingRecordLite>>(`/v1/breeding${toQuery({ page: 1, pageSize: 200 })}`),
        api.get<BreedingMetricsDto>('/v1/breeding/metrics').catch(() => null),
        api.get<PageResult<Heat>>(`/v1/breeding/heat${toQuery({ page: 1, pageSize: 50 })}`).catch(() => null),
        api.get<PageResult<AnimalDto>>(`/v1/animals${toQuery({ gender: 'FEMALE', pageSize: 200 })}`).catch(() => null),
        api.get<PageResult<AnimalDto>>(`/v1/animals${toQuery({ gender: 'MALE', pageSize: 200 })}`).catch(() => null),
        api.get<PageResult<TaskDto>>('/v1/tasks?page=1&pageSize=100').catch(() => null),
        api.get<SpeciesConfigDto[]>('/v1/species-config').catch(() => null),
        api.get<BreedingBoardDto>('/v1/breeding/board').catch(() => null),
      ]);
      setRecords(page.items);
      setMetrics(m);
      setHeats(heatPage?.items ?? []);
      setFemales(femalePage?.items ?? []);
      setMales(malePage?.items ?? []);
      setTasks(
        (taskPage?.items ?? []).filter((x) => x.status === 'PENDING' || x.status === 'SNOOZED'),
      );
      setBoard(boardDto);
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
    const damId = motherId.trim() || heatAnimalId.trim();
    if (!calvingId.trim() && !damId) {
      setError(t('breeding.noPendingCalving'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        birthDate: new Date(),
        difficulty: calvingDifficulty,
        outcome: calvingOutcome === 'ABORTED' ? ('ABORTED' as const) : undefined,
        calves: calvingOutcome === 'ABORTED' ? [] : [{ sex: calfSex }],
      };
      if (calvingId.trim()) {
        await api.post(`/v1/breeding/${calvingId.trim()}/calving`, body);
      } else {
        // Walk CALVING_WATCH often has no breeding row — farm calving by dam.
        await api.post('/v1/breeding/calving', { ...body, damId });
      }
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
  const runBoardAction = (item: BoardItemDto, actionKey: string) => {
    const action = item.actions.find((a) => a.key === actionKey);
    if (!action) return;
    if (action.phone) {
      void Linking.openURL(`tel:${action.phone}`);
      return;
    }
    if (action.key === 'NOTHING') {
      void dismissTask({ id: item.taskId } as TaskDto);
      return;
    }
    if (action.key === 'SAW_HEAT' || action.to?.includes('form=heat')) {
      openForm('heat', item.animalId);
      return;
    }
    if (action.to?.includes('form=service')) {
      openForm('service', item.animalId);
      return;
    }
    if (action.to?.includes('form=pd')) {
      openForm('pd', item.animalId);
      return;
    }
    if (action.to?.includes('form=calving')) {
      openForm('calving', item.animalId);
      return;
    }
    if (action.to?.includes('form=colostrum')) {
      openForm('colostrum', item.animalId);
      return;
    }
    if (action.key === 'RECORD_CHECK' && item.animalId) {
      openAnimal(item.animalId);
    }
  };

  return (
    <AppShell module="breeding">
      <View style={styles.screen}>
        <View style={styles.stickyTop}>
          <PageHeader title={t('nav.breeding')} subtitle={t('breeding.subtitle')} />
          {fromCache ? <Muted>{t('native.cached')}</Muted> : null}
          {error && !form ? <ErrorText message={error} /> : null}
          <View style={styles.segmentTrack}>
            {MAIN_TABS.map((tabKey) => {
              const active = mainTab === tabKey;
              return (
                <Pressable
                  key={tabKey}
                  onPress={() => setMainTab(tabKey)}
                  style={[styles.segmentBtn, active && styles.segmentBtnOn]}
                >
                  <Txt weight="semibold" style={[styles.segmentText, active && styles.segmentTextOn]}>
                    {t(`breeding.mainTab.${tabKey}`)}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
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
              {watchGroups.map((group) => {
                const tint = WATCH_GROUP_COLOUR[group.kind] ?? color.brandStrong;
                return (
                  <View
                    key={group.kind}
                    style={[
                      styles.walkGroup,
                      { borderColor: `${tint}44`, backgroundColor: `${tint}12` },
                    ]}
                  >
                    <Txt weight="semibold" style={[styles.walkGroupTitle, { color: tint }]}>
                      {watchTitle(group.kind)}
                    </Txt>
                    <Muted>{group.items.length}</Muted>
                    {group.items.map((row) => {
                      const { shortNo, name } = splitAnimalLabel(row.label);
                      const hot =
                        row.kind === 'calvingSoon' ||
                        (row.progress != null && row.progress >= 0.85);
                      const urg = hot ? URGENCY.RED! : URGENCY.NORMAL!;
                      return (
                        <View
                          key={row.key}
                          style={[
                            styles.walkRowCard,
                            {
                              borderColor: `${urg.fg}33`,
                              backgroundColor: urg.bg,
                              borderWidth: 1,
                              borderRadius: 14,
                              marginBottom: 8,
                              overflow: 'hidden',
                            },
                          ]}
                        >
                          <View style={styles.walkRowInner}>
                            <View style={[styles.urgencyRail, { backgroundColor: urg.fg }]} />
                            <Pressable
                              style={styles.walkRowBody}
                              onPress={() => openAnimal(row.animalId)}
                            >
                              <Txt weight="bold" style={styles.walkShortNo}>
                                {shortNo}
                              </Txt>
                              {name ? (
                                <Txt weight="semibold" style={styles.walkName}>
                                  {name}
                                </Txt>
                              ) : null}
                              <Muted>{row.subtitle}</Muted>
                              {row.progressLabel ? (
                                <Txt weight="semibold" style={{ color: urg.fg, marginTop: 4 }}>
                                  {row.progressLabel}
                                </Txt>
                              ) : null}
                            </Pressable>
                          </View>
                          {row.progress != null ? (
                            <View style={[styles.progressWrap, { paddingHorizontal: 12 }]}>
                              <View style={styles.progressTrack}>
                                <View
                                  style={[
                                    styles.progressFill,
                                    {
                                      width: `${Math.round(row.progress * 100)}%`,
                                      backgroundColor: urg.fg,
                                    },
                                  ]}
                                />
                              </View>
                            </View>
                          ) : null}
                          {canWrite ? (
                            <View style={styles.rowActions}>
                              <PrimaryButton
                                label={t('breeding.recordAction')}
                                onPress={() => onWatchRecord(row)}
                              />
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          ) : null}

          {mainTab === 'walk' ? (
            <View>
              {board ? (
                <>
                  <Muted>
                    {board.summary.totalActions} · {board.summary.overdue} late
                  </Muted>
                  {board.groups.length === 0 && !loading ? (
                    <EmptyState message={t('breeding.walkEmpty')} />
                  ) : null}
                  {board.groups.map((group) => {
                    const groupTint = GROUP_COLOUR[group.colour] ?? color.brandStrong;
                    return (
                    <View
                      key={group.key}
                      style={[
                        styles.walkGroup,
                        { borderColor: `${groupTint}44`, backgroundColor: `${groupTint}12` },
                      ]}
                    >
                      <Txt weight="semibold" style={[styles.walkGroupTitle, { color: groupTint }]}>
                        {group.labelEn}
                      </Txt>
                      {group.subLabelEn ? <Muted>{group.subLabelEn}</Muted> : null}
                      {group.items.map((row) => {
                        const urg = URGENCY[row.urgency] ?? URGENCY.NORMAL!;
                        const primary = row.actions.find((a) => a.primary) ?? row.actions[0];
                        const secondary = row.actions.filter((a) => a !== primary).slice(0, 1);
                        return (
                        <View
                          key={row.taskId}
                          style={[
                            styles.walkRowCard,
                            {
                              borderColor: `${urg.fg}33`,
                              backgroundColor: urg.bg,
                              borderWidth: 1,
                              borderRadius: 14,
                              marginBottom: 8,
                              overflow: 'hidden',
                            },
                          ]}
                        >
                          <View style={styles.walkRowInner}>
                            <View style={[styles.urgencyRail, { backgroundColor: urg.fg }]} />
                            <Pressable style={styles.walkRowBody} onPress={() => openAnimal(row.animalId)}>
                              <Txt weight="bold" style={styles.walkShortNo}>
                                {row.shortNo}
                              </Txt>
                              <Txt weight="semibold" style={styles.walkName}>
                                {row.name ?? '—'}
                              </Txt>
                              {row.penName ? <Muted>{row.penName}</Muted> : null}
                              <Muted>
                                Do by: {row.doByEn}
                              </Muted>
                              {row.whyEn ? <Muted>Why: {row.whyEn}</Muted> : null}
                              {row.lateEn ? (
                                <Txt weight="semibold" style={styles.walkLate}>
                                  {row.lateEn}
                                </Txt>
                              ) : null}
                            </Pressable>
                          </View>
                          {canWrite ? (
                            <View style={styles.rowActions}>
                              {primary ? (
                                <PrimaryButton
                                  key={primary.key}
                                  label={primary.labelEn}
                                  onPress={() => runBoardAction(row, primary.key)}
                                />
                              ) : null}
                              {secondary.map((action) => (
                                <SecondaryButton
                                  key={action.key}
                                  label={action.labelEn}
                                  onPress={() => runBoardAction(row, action.key)}
                                />
                              ))}
                            </View>
                          ) : null}
                        </View>
                        );
                      })}
                    </View>
                    );
                  })}
                  {board.decisionQueue.count > 0 ? (
                    <View style={styles.section}>
                      <SectionTitle>
                        Needs a decision ({board.decisionQueue.count})
                      </SectionTitle>
                      {board.decisionQueue.items.map((row) => (
                        <Card key={row.taskId} style={styles.rowCard}>
                          <Txt weight="semibold" style={styles.rowTitle}>
                            {row.shortNo} · {row.titleEn}
                          </Txt>
                          {canWrite ? (
                            <View style={styles.rowActions}>
                              {(row.actions ?? []).slice(0, 2).map((action) => (
                                <PrimaryButton
                                  key={action.key}
                                  label={action.labelEn}
                                  onPress={() =>
                                    runBoardAction(
                                      {
                                        taskId: row.taskId,
                                        taskType: row.kind,
                                        animalId: row.animalId,
                                        shortNo: row.shortNo,
                                        name: row.name,
                                        species: 'BUFFALO',
                                        penName: '',
                                        penSortOrder: 0,
                                        seqNo: 0,
                                        photoUrl: null,
                                        contextEn: '',
                                        contextNp: '',
                                        doByEn: '',
                                        doByNp: '',
                                        whyEn: '',
                                        whyNp: '',
                                        lateEn: null,
                                        lateNp: null,
                                        urgency: 'NORMAL',
                                        deadline: null,
                                        actions: row.actions ?? [],
                                      },
                                      action.key,
                                    )
                                  }
                                />
                              ))}
                            </View>
                          ) : null}
                        </Card>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <>
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
                              {group.kind === 'colostrum' ? (
                                <PrimaryButton
                                  label={t('breeding.tab.colostrum')}
                                  onPress={() => openForm('colostrum', row.animalId, row.breedingId)}
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
                                  onPress={() =>
                                    row.animalId ? openAnimal(row.animalId) : undefined
                                  }
                                />
                              ) : null}
                              {group.kind === 'postCalving' ? (
                                <PrimaryButton
                                  label={
                                    row.task.type === 'CALVING_WATCH'
                                      ? t('breeding.tab.calving')
                                      : t('breeding.recordAction')
                                  }
                                  onPress={() => {
                                    if (row.task.type === 'CALVING_WATCH') {
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
                </>
              )}
            </View>
          ) : null}

          {mainTab === 'herd' ? (
            <View>
              {metrics ? (
                <View style={styles.metrics}>
                  <KpiTile
                    label={t('breeding.kpi.conception')}
                    value={fmtPct(metrics.conceptionRatePct)}
                    miss={
                      metrics.conceptionRatePct != null &&
                      metrics.targets.conceptionRateMinPct != null &&
                      metrics.conceptionRatePct < metrics.targets.conceptionRateMinPct
                    }
                  />
                  <KpiTile
                    label={t('breeding.kpi.firstService')}
                    value={fmtPct(metrics.firstServiceRatePct)}
                  />
                  <KpiTile
                    label={t('breeding.kpi.daysOpen')}
                    value={fmtNum(metrics.daysOpen)}
                    miss={
                      metrics.daysOpen != null &&
                      metrics.targets.daysOpenMax != null &&
                      metrics.daysOpen > metrics.targets.daysOpenMax
                    }
                  />
                  <KpiTile
                    label={t('breeding.kpi.interval')}
                    value={fmtNum(metrics.calvingIntervalDays)}
                    miss={
                      metrics.calvingIntervalDays != null &&
                      metrics.targets.calvingIntervalMaxDays != null &&
                      metrics.calvingIntervalDays > metrics.targets.calvingIntervalMaxDays
                    }
                  />
                  <KpiTile
                    label={t('breeding.kpi.services')}
                    value={
                      metrics.servicesPerConception == null
                        ? '—'
                        : metrics.servicesPerConception.toFixed(1)
                    }
                  />
                  <KpiTile
                    label={t('breeding.kpi.heatDetection')}
                    value={fmtPct(metrics.heatDetectionRatePct)}
                  />
                  <KpiTile
                    label={t('breeding.kpi.firstCalving')}
                    value={
                      metrics.ageAtFirstCalvingMonths == null
                        ? '—'
                        : t('breeding.kpi.months', { n: metrics.ageAtFirstCalvingMonths })
                    }
                  />
                  <KpiTile
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
                {heatAnimalId ? (
                  <DamHero
                    shortNo={
                      females.find((a) => a.id === heatAnimalId)?.herdNumber ??
                      females.find((a) => a.id === heatAnimalId)?.tag ??
                      '—'
                    }
                    name={females.find((a) => a.id === heatAnimalId)?.name}
                  />
                ) : (
                  <MotherPicker
                    label={t('breeding.mother')}
                    females={females}
                    value={heatAnimalId}
                    onChange={setHeatAnimalId}
                    placeholder={t('breeding.selectMother')}
                  />
                )}
                <SheetStep n={1} title={t('breeding.observedAt')}>
                  <Field
                    label={t('breeding.observedAt')}
                    value={observedAt}
                    onChangeText={setObservedAt}
                    placeholder="YYYY-MM-DDTHH:mm"
                    autoCapitalize="none"
                  />
                </SheetStep>
                <SheetStep n={2} title={t('breeding.intensity')}>
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
                </SheetStep>
                <SheetStep n={3} title={t('breeding.signs')}>
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
                </SheetStep>
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
                {motherId ? (
                  <DamHero
                    shortNo={
                      females.find((a) => a.id === motherId)?.herdNumber ??
                      females.find((a) => a.id === motherId)?.tag ??
                      '—'
                    }
                    name={females.find((a) => a.id === motherId)?.name}
                  />
                ) : (
                  <MotherPicker
                    label={t('breeding.mother')}
                    females={females}
                    value={motherId}
                    onChange={setMotherId}
                    placeholder={t('breeding.selectMother')}
                  />
                )}
                <SheetStep n={1} title={t('breeding.ai')}>
                  <ChipSelect
                    label={t('breeding.matingType')}
                    options={['AI', 'NATURAL']}
                    value={matingType}
                    onChange={setMatingType}
                    labels={{ AI: t('breeding.ai'), NATURAL: t('breeding.natural') }}
                  />
                </SheetStep>
                <SheetStep n={2} title={matingType === 'AI' ? t('breeding.straw') : t('breeding.bull')}>
                  <Field
                    label={matingType === 'AI' ? t('breeding.straw') : t('breeding.bull')}
                    value={fatherTagOrAi}
                    onChangeText={setFatherTagOrAi}
                  />
                </SheetStep>
                <SheetStep n={3} title={t('breeding.sire')}>
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
                </SheetStep>
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
                {motherId ? (
                  <DamHero
                    shortNo={
                      females.find((a) => a.id === motherId)?.herdNumber ??
                      females.find((a) => a.id === motherId)?.tag ??
                      records.find((r) => r.id === pdId)?.motherTag ??
                      '—'
                    }
                    name={females.find((a) => a.id === motherId)?.name}
                  />
                ) : (
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
                )}
                {pdId ? <Muted>{pdId.slice(0, 8)}…</Muted> : <Muted>{t('breeding.noOpenServices')}</Muted>}
                <SheetStep n={1} title={t('breeding.pdResult')}>
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
                </SheetStep>
                {canWrite ? (
                  <FormActions>
                    <PrimaryButton
                      label={t('breeding.savePd')}
                      disabled={busy || !pdId}
                      onPress={() => void submitPd()}
                    />
                  </FormActions>
                ) : null}
              </>
            ) : null}

            {form === 'calving' ? (
              <>
                {(motherId || heatAnimalId) && (
                  <DamHero
                    shortNo={
                      females.find((a) => a.id === (motherId || heatAnimalId))?.herdNumber ??
                      females.find((a) => a.id === (motherId || heatAnimalId))?.tag ??
                      '—'
                    }
                    name={females.find((a) => a.id === (motherId || heatAnimalId))?.name}
                  />
                )}
                {calvingId ? (
                  <Muted>{calvingId.slice(0, 8)}…</Muted>
                ) : motherId || heatAnimalId ? (
                  <Muted>{t('breeding.calvingWithoutRecord')}</Muted>
                ) : (
                  <Muted>{t('breeding.noPendingCalving')}</Muted>
                )}
                <SheetStep n={1} title={t('breeding.outcomeLive')}>
                  <ChipSelect
                    label={t('breeding.outcomeLive')}
                    options={['LIVE', 'ABORTED']}
                    value={calvingOutcome}
                    onChange={setCalvingOutcome}
                    labels={{
                      LIVE: t('breeding.outcomeLive'),
                      ABORTED: t('breeding.outcomeAborted'),
                    }}
                  />
                </SheetStep>
                <SheetStep n={2} title={t('breeding.calvingDifficulty')}>
                  <ChipSelect
                    label={t('breeding.calvingDifficulty')}
                    options={[...CALVING_DIFFICULTY]}
                    value={calvingDifficulty}
                    onChange={setCalvingDifficulty}
                    labels={{
                      EASY: t('enum.calvingDifficulty.EASY'),
                      ASSISTED: t('enum.calvingDifficulty.ASSISTED'),
                      EMERGENCY: t('enum.calvingDifficulty.EMERGENCY'),
                      STILLBIRTH: t('enum.calvingDifficulty.STILLBIRTH'),
                    }}
                  />
                </SheetStep>
                {calvingOutcome !== 'ABORTED' ? (
                  <SheetStep n={3} title={t('animals.gender')}>
                    <ChipSelect
                      label={t('animals.gender')}
                      options={['FEMALE', 'MALE']}
                      value={calfSex}
                      onChange={setCalfSex}
                      labels={{ FEMALE: t('animals.female'), MALE: t('animals.male') }}
                    />
                  </SheetStep>
                ) : null}
                {canWrite ? (
                  <FormActions>
                    <PrimaryButton
                      label={t('breeding.saveCalving')}
                      disabled={busy || (!calvingId && !motherId && !heatAnimalId)}
                      onPress={() => void submitCalving()}
                    />
                  </FormActions>
                ) : null}
              </>
            ) : null}

            {form === 'colostrum' ? (
              <>
                <SheetStep n={1} title={t('breeding.colostrumLiters')}>
                  {coloId ? <Muted>{coloId.slice(0, 8)}…</Muted> : <Muted>{t('breeding.noRecentCalving')}</Muted>}
                  <Field
                    label={t('breeding.colostrumLiters')}
                    value={coloLiters}
                    onChangeText={setColoLiters}
                    keyboardType="decimal-pad"
                  />
                </SheetStep>
                {canWrite ? (
                  <FormActions>
                    <PrimaryButton
                      label={t('breeding.saveColostrum')}
                      disabled={busy || !coloId}
                      onPress={() => void submitColostrum()}
                    />
                  </FormActions>
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
  segmentTrack: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(31, 77, 56, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(31, 77, 56, 0.12)',
  },
  segmentBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentBtnOn: { backgroundColor: color.brandStrong },
  segmentText: { fontSize: 15, color: color.textSecondary },
  segmentTextOn: { color: color.surface },
  section: { marginTop: 12, gap: 8 },
  walkGroup: {
    marginTop: 12,
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  walkGroupTitle: { fontSize: 18, marginBottom: 2 },
  walkRowCard: { gap: 0 },
  walkRowInner: { flexDirection: 'row', alignItems: 'stretch' },
  urgencyRail: { width: 7 },
  walkRowBody: { flex: 1, padding: 12, gap: 2 },
  walkShortNo: { fontSize: 26, letterSpacing: -0.5, color: color.brandStrong },
  walkName: { fontSize: 16, color: color.textPrimary },
  walkLate: { fontSize: 14, color: '#C62828', marginTop: 2 },
  damHero: {
    gap: 2,
    padding: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(31, 77, 56, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(31, 77, 56, 0.14)',
  },
  damHeroTag: {
    fontSize: 26,
    letterSpacing: -0.5,
    color: color.brandStrong,
  },
  sheetStep: {
    gap: 10,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  sheetStepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetStepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.brandStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetStepNumText: { color: color.surface, fontSize: 13 },
  sheetStepTitle: { fontSize: 16, color: color.brandStrong, flex: 1 },
  kpiTile: {
    width: '46%',
    minWidth: 140,
    flexGrow: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    gap: 4,
  },
  kpiTileMiss: {
    borderColor: 'rgba(198, 40, 40, 0.35)',
    backgroundColor: '#FFEBEE',
  },
  kpiLabel: { fontSize: 12 },
  kpiValue: { fontSize: 28, letterSpacing: -0.5, color: color.brandStrong },
  kpiValueMiss: { color: '#C62828' },
  rowCard: { gap: 8, marginBottom: 8 },
  rowTitle: { fontSize: 16 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
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
