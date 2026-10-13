import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  RECORDING_MODES,
  type MilkSession,
  type RecordingMode,
  type RoundRemainingAnimalDto,
  type RoundTodayDto,
} from '@farm/contracts';
import { startLocalRound } from '../core/scan-round';
import type { FarmStore } from '../core/store';
import { refreshMeansFromRound } from '../core/sync-engine';
import { toQuery } from '../api/query';
import { AppShell } from '../components/AppShell';
import { AnimalPhoto } from '../components/AnimalPhoto';
import { Button, Card, ScreenScroll, Txt } from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useFarm } from '../state/FarmProvider';
import type { RootStackParamList } from '../navigation/types';
import { color } from '../theme/tokens';

type TodayProgress = Pick<RoundTodayDto, 'expected' | 'recorded' | 'remaining'> & { offline: boolean };

/** Same expected-animal rules as the API, from the phone's copy of the herd. */
function localProgress(store: FarmStore, mode: RecordingMode): TodayProgress {
  const recorded = new Set(store.round?.mode === mode ? store.round.recordedIds : []);
  const expected = [...store.animals.values()].filter((a) => {
    if (a.deletedAt) return false;
    if (mode === 'MILKING') {
      return a.gender === 'FEMALE' && !['SOLD', 'DEAD', 'CULLED', 'DRY'].includes(a.status);
    }
    return !['SOLD', 'DEAD', 'CULLED'].includes(a.status);
  });
  const withheld = new Set(
    [...store.withholds.values()]
      .filter((w) => new Date(w.endDate).getTime() >= Date.now())
      .map((w) => w.animalId),
  );
  return {
    offline: true,
    expected: expected.length,
    recorded: expected.filter((a) => recorded.has(a.id)).length,
    remaining: expected
      .filter((a) => !recorded.has(a.id))
      .map((a) => ({
        id: a.id,
        shortNo: a.shortNo,
        tag: a.tag,
        name: a.name,
        species: a.species,
        penName: a.penName,
        photoUrl: a.photoUrl,
        status: a.status,
        isPregnant: a.isPregnant,
        withholdActive: withheld.has(a.id),
        usualLitres: a.rolling7Mean,
      })),
  };
}

const SESSIONS: MilkSession[] = ['MORNING', 'EVENING', 'MIDDAY'];

function modeBannerColor(mode: RecordingMode, session: MilkSession): string {
  if (mode === 'MILKING') {
    if (session === 'EVENING') return '#3d2b1f';
    if (session === 'MIDDAY') return '#2a3d4d';
    return color.brandStrong;
  }
  if (mode === 'VACCINATION') return '#1d3557';
  if (mode === 'TREATMENT') return '#4a1942';
  if (mode === 'WEIGHING') return '#3d3a1f';
  if (mode === 'HEALTH_CHECK') return '#1f3d4d';
  if (mode === 'MARKER_PLACEMENT') return '#6b2d12';
  return '#333';
}

export function ShedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Shed'>>();
  const { store, api, revision, persist } = useFarm();
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [serverActiveId, setServerActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<RecordingMode>(
    (route.params?.mode as RecordingMode) || 'MILKING',
  );
  const [session, setSession] = useState<MilkSession>(
    new Date().getHours() < 14 ? 'MORNING' : 'EVENING',
  );
  const [today, setToday] = useState<TodayProgress | null>(null);
  const [loadingToday, setLoadingToday] = useState(false);
  const deepLinked = useRef<string | null>(null);
  void revision;

  const loadToday = useCallback(async () => {
    setLoadingToday(true);
    try {
      const dto = await api.get<RoundTodayDto>(
        `/v1/rounds/today${toQuery({ mode, session: mode === 'MILKING' ? session : undefined })}`,
      );
      setToday({ offline: false, expected: dto.expected, recorded: dto.recorded, remaining: dto.remaining });
    } catch {
      setToday(localProgress(store, mode));
    } finally {
      setLoadingToday(false);
    }
  }, [api, mode, session, store]);

  useFocusEffect(
    useCallback(() => {
      void loadToday();
    }, [loadToday, revision]),
  );

  const remaining = today?.remaining ?? [];
  const pending = store.outbox.filter((o) => o.state === 'pending').length;
  const localActive = store.round?.status === 'ACTIVE' ? store.round : null;
  const conflicts = store.conflicts?.length ?? 0;

  useEffect(() => {
    if (!store.accessToken) return;
    void api
      .activeRound()
      .then((round) => {
        setServerActiveId(round?.id ?? null);
        if (round?.mode) setMode(round.mode as RecordingMode);
        if (round?.session) setSession(round.session as MilkSession);
      })
      .catch(() => setServerActiveId(null));
  }, [api, store.accessToken, revision]);

  const resume = async () => {
    if (localActive) {
      navigation.navigate('Round');
      return;
    }
    if (!serverActiveId) return;
    setStarting(true);
    try {
      const round = await api.activeRound();
      if (!round) {
        setServerActiveId(null);
        setError(t('shed.roundGone', { defaultValue: 'That round is no longer active' }));
        return;
      }
      startLocalRound(store, {
        id: round.id,
        mode: round.mode as RecordingMode,
        session: round.session,
        offlineOnly: false,
      });
      try {
        await refreshMeansFromRound(store, api, round.id);
      } catch {
        /* optional */
      }
      persist();
      navigation.navigate('Round');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.serverUnreachable'));
    } finally {
      setStarting(false);
    }
  };

  const startMode = async (next: RecordingMode, animalId?: string) => {
    const roundParams = animalId ? { animalId } : undefined;
    const sameLocal =
      localActive &&
      localActive.mode === next &&
      (next !== 'MILKING' || localActive.session === session);
    if (sameLocal) {
      navigation.navigate('Round', roundParams);
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const milkSession = next === 'MILKING' ? session : undefined;
      try {
        const round = await api.createRound({
          mode: next,
          session: milkSession,
          deviceId: store.deviceId,
        });
        startLocalRound(store, {
          id: round.id,
          mode: next,
          session: milkSession,
          offlineOnly: false,
        });
        try {
          await refreshMeansFromRound(store, api, round.id);
        } catch {
          /* optional */
        }
      } catch {
        startLocalRound(store, {
          id: `local-${Date.now()}`,
          mode: next,
          session: milkSession,
          offlineOnly: true,
        });
      }
      persist();
      navigation.navigate('Round', roundParams);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.serverUnreachable'));
    } finally {
      setStarting(false);
    }
  };

  /** Scan → Milk opens the shed with the animal already chosen; go straight to her pad. */
  useEffect(() => {
    const animalId = route.params?.animalId;
    if (!animalId || deepLinked.current === animalId) return;
    deepLinked.current = animalId;
    const next = (route.params?.mode as RecordingMode) || 'MILKING';
    setMode(next);
    void startMode(next, animalId);
    navigation.setParams({ animalId: undefined });
  }, [route.params?.animalId]);

  const canResume = Boolean(localActive || serverActiveId);
  const bannerBg = modeBannerColor(mode, session);
  const expected = today?.expected ?? 0;
  const done = Math.min(today?.recorded ?? 0, expected);
  const progressPct = expected > 0 ? Math.round((done / expected) * 100) : 0;

  return (
    <AppShell module="shed" title={undefined}>
      <ScreenScroll>
        <View style={[styles.modeBanner, { backgroundColor: bannerBg }]}>
          <Txt weight="bold" style={styles.modeBannerText}>
            {t(`shed.mode.${mode}`)}
            {mode === 'MILKING' ? ` — ${t(`shed.session.${session}`)}` : ''}
          </Txt>
          <Txt weight="bold" style={styles.modeBannerText}>
            {remaining.length} {t('shed.stillToDo')}
          </Txt>
        </View>

        <Card style={styles.startCard}>
          <Txt weight="display" style={styles.title}>
            {t('shed.title')}
          </Txt>
          <Txt muted style={styles.subtitle}>
            {t('shed.subtitle')}
          </Txt>
          <View style={styles.links}>
            <Pressable onPress={() => navigation.navigate('Cohort')}>
              <Txt weight="semibold" style={styles.link}>
                {t('nav.cohort')}
              </Txt>
            </Pressable>
            <Txt muted> · </Txt>
            <Pressable onPress={() => navigation.navigate('DailySheet')}>
              <Txt weight="semibold" style={styles.link}>
                {t('nav.dailySheet')}
              </Txt>
            </Pressable>
          </View>

          <View style={styles.chipRow}>
            {RECORDING_MODES.map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[styles.chip, mode === m && styles.chipOn]}
              >
                <Txt
                  weight="semibold"
                  style={[styles.chipText, mode === m && styles.chipTextOn]}
                >
                  {t(`shed.mode.${m}`)}
                </Txt>
              </Pressable>
            ))}
          </View>

          {mode === 'MILKING' ? (
            <View style={styles.chipRow}>
              {SESSIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSession(s)}
                  style={[styles.chip, session === s && styles.chipOn]}
                >
                  <Txt
                    weight="semibold"
                    style={[styles.chipText, session === s && styles.chipTextOn]}
                  >
                    {t(`shed.session.${s}`)}
                  </Txt>
                </Pressable>
              ))}
            </View>
          ) : null}

          {pending > 0 ? (
            <Txt muted style={{ marginBottom: 8 }}>
              {t('native.pendingOutbox')}: {pending}
            </Txt>
          ) : null}
          {error ? <Txt style={{ color: color.danger, marginBottom: 8 }}>{error}</Txt> : null}

          {store.round?.status === 'FINISHED' && store.round.milkRoundId ? (
            <Button
              label={`${t('shed.tank')} / ${t('shed.delivery')}`}
              variant="secondary"
              block
              onPress={() =>
                navigation.navigate('TankDelivery', { milkRoundId: store.round!.milkRoundId! })
              }
            />
          ) : null}

          {canResume ? (
            <Button
              label={starting ? t('common.loading') : t('native.resumeRound')}
              disabled={starting}
              block
              onPress={() => void resume()}
            />
          ) : (
            <Button
              label={starting ? t('common.loading') : t('shed.start')}
              disabled={starting}
              block
              onPress={() => void startMode(mode)}
            />
          )}
          {starting ? <ActivityIndicator color={color.brand} style={{ marginTop: 12 }} /> : null}

          {conflicts > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Button
                label={`${t('native.conflicts')} (${conflicts})`}
                variant="secondary"
                block
                onPress={() => navigation.navigate('Conflicts')}
              />
            </View>
          ) : null}
        </Card>

        <View style={styles.todoCard}>
          <View style={styles.todoHead}>
            <Txt weight="display" style={styles.todoTitle}>
              {t('shed.notDoneTitle')}
            </Txt>
            {loadingToday ? <ActivityIndicator color={color.brand} /> : null}
          </View>
          <Txt muted style={styles.todoHint}>
            {t(`shed.mode.${mode}`)}
            {mode === 'MILKING' ? ` · ${t(`shed.session.${session}`)}` : ''}
            {' · '}
            {t('shed.progress', { done, total: expected })}
          </Txt>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progressPct}%` }]} />
          </View>
          <View style={styles.countRow}>
            <View style={[styles.countChip, styles.countDone]}>
              <Txt weight="bold" style={styles.countDoneText}>
                {t('shed.doneCount', { n: done })}
              </Txt>
            </View>
            <View style={[styles.countChip, remaining.length > 0 ? styles.countLeft : styles.countDone]}>
              <Txt weight="bold" style={remaining.length > 0 ? styles.countLeftText : styles.countDoneText}>
                {t('shed.leftCount', { n: remaining.length })}
              </Txt>
            </View>
          </View>
          {today?.offline ? <Txt muted style={styles.todoHint}>{t('shed.offlineList')}</Txt> : null}

          {today && expected === 0 ? (
            <Txt muted>{t('shed.nothingExpected')}</Txt>
          ) : today && remaining.length === 0 ? (
            <View style={styles.allDone}>
              <Txt weight="bold" style={styles.allDoneText}>
                ✓ {t('shed.allDone')}
              </Txt>
            </View>
          ) : (
            <>
              {remaining.length > 0 ? <Txt muted style={styles.todoHint}>{t('shed.notDoneHint')}</Txt> : null}
              {remaining.map((a) => (
                <NotDoneRow
                  key={a.id}
                  animal={a}
                  withholdLabel={t('shed.withhold')}
                  disabled={starting}
                  onPress={() => void startMode(mode, a.id)}
                />
              ))}
            </>
          )}
        </View>
      </ScreenScroll>
    </AppShell>
  );
}

export const HomeScreen = ShedScreen;

function NotDoneRow({
  animal,
  withholdLabel,
  disabled,
  onPress,
}: {
  animal: RoundRemainingAnimalDto;
  withholdLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
    >
      <View style={styles.rowStripe} />
      <AnimalPhoto animalId={animal.id} photoUrl={animal.photoUrl} species={animal.species} size={52} />
      <View style={{ flex: 1 }}>
        <Txt weight="bold" style={styles.rowNo}>
          {animal.shortNo ?? animal.tag}
        </Txt>
        <Txt muted numberOfLines={1}>
          {[animal.name, animal.penName].filter(Boolean).join(' · ') || animal.species}
        </Txt>
      </View>
      {animal.withholdActive ? (
        <View style={styles.holdChip}>
          <Txt weight="bold" style={styles.holdText}>
            {withholdLabel}
          </Txt>
        </View>
      ) : null}
      <Txt weight="bold" style={styles.rowArrow}>
        ›
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modeBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,253,249,0.2)',
  },
  modeBannerText: { color: '#FFFDF9', letterSpacing: 0.3, fontSize: 14 },
  startCard: { padding: 16, gap: 4 },
  title: { fontSize: 28, marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 8 },
  links: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  link: { color: color.brand, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#C8BFA8',
  },
  chipOn: {
    backgroundColor: color.brand,
    borderColor: color.brand,
    borderBottomColor: color.brandStrong,
  },
  chipText: { fontSize: 14, color: color.textPrimary },
  chipTextOn: { color: '#fff' },
  todoCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
    gap: 8,
  },
  todoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todoTitle: { fontSize: 22, color: color.brandStrong },
  todoHint: { fontSize: 13 },
  track: { height: 10, borderRadius: 5, backgroundColor: color.dangerSubtle, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.success },
  countRow: { flexDirection: 'row', gap: 8 },
  countChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  countDone: { backgroundColor: color.successSubtle },
  countDoneText: { color: color.success, fontSize: 13 },
  countLeft: { backgroundColor: color.dangerSubtle },
  countLeftText: { color: color.danger, fontSize: 13 },
  allDone: { padding: 14, borderRadius: 8, backgroundColor: color.successSubtle },
  allDoneText: { color: color.success, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F5C6C6',
    backgroundColor: color.dangerSubtle,
    overflow: 'hidden',
  },
  rowPressed: { backgroundColor: '#FFDCDC' },
  rowStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: color.danger },
  rowNo: { fontSize: 18, color: color.textPrimary },
  rowArrow: { fontSize: 26, color: color.danger, marginLeft: 4 },
  holdChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: color.danger },
  holdText: { color: '#fff', fontSize: 11 },
});
