import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RECORDING_MODES, type MilkSession, type RecordingMode } from '@farm/contracts';
import { remainingAnimals, startLocalRound } from '../core/scan-round';
import { refreshMeansFromRound } from '../core/sync-engine';
import { AppShell } from '../components/AppShell';
import { Button, Card, ScreenScroll, Txt } from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useFarm } from '../state/FarmProvider';
import type { RootStackParamList } from '../navigation/types';
import { color } from '../theme/tokens';

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
  void revision;

  const remaining = useMemo(() => remainingAnimals(store), [store, revision]);
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
      if (!round) return;
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

  const startMode = async (next: RecordingMode) => {
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
      navigation.navigate('Round');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.serverUnreachable'));
    } finally {
      setStarting(false);
    }
  };

  const canResume = Boolean(localActive || serverActiveId);
  const bannerBg = modeBannerColor(mode, session);

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
      </ScreenScroll>
    </AppShell>
  );
}

export const HomeScreen = ShedScreen;

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
});
