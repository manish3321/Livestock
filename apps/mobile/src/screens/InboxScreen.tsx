import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TaskDismissReason, TaskDto } from '@farm/contracts';
import { formatDateTime } from '@farm/contracts';
import { enqueueTaskComplete } from '../core/scan-round';
import { AppShell } from '../components/AppShell';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorText,
  LoadingState,
  Muted,
  PageHeader,
  Txt,
} from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useFarm } from '../state/FarmProvider';
import { ApiError } from '../api/http-farm-api';
import type { RootStackParamList } from '../navigation/types';
import { color, radius, space } from '../theme/tokens';

const DISMISS: TaskDismissReason[] = [
  'NOT_NEEDED',
  'ALREADY_DONE_OFFLINE',
  'ANIMAL_SOLD',
  'WRONG_ANIMAL',
  'OTHER',
];

function routeFromActionPath(
  path: string | undefined,
): { name: keyof RootStackParamList; params?: object } | null {
  if (!path) return null;
  const animal = path.match(/\/animals\/([a-f0-9-]{36})/i);
  if (animal?.[1]) return { name: 'AnimalDetail', params: { id: animal[1] } };
  const batch = path.match(/\/batches\/([a-f0-9-]{36})/i);
  if (batch?.[1]) return { name: 'BatchDetail', params: { id: batch[1] } };
  if (path.includes('/shed')) return { name: 'Shed' };
  if (path.includes('/health')) return { name: 'Health' };
  if (path.includes('/breeding')) return { name: 'Breeding' };
  if (path.includes('/inbox')) return null;
  if (path.includes('/scan')) return { name: 'Scan' };
  if (path.includes('/expenses')) return { name: 'Expenses' };
  if (path.includes('/inventory')) return { name: 'Inventory' };
  return null;
}

export function InboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, store, persist, syncNow, revision } = useFarm();
  const { t, locale } = useLocale();
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [muteOffer, setMuteOffer] = useState<TaskDto | null>(null);
  void revision;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.listOpenTasks();
      setTasks(page.items.filter((task) => task.status === 'PENDING' || task.status === 'SNOOZED'));
      setError(null);
    } catch {
      setTasks(
        [...store.tasks.values()].filter(
          (task) => task.status === 'PENDING' || task.status === 'SNOOZED',
        ) as TaskDto[],
      );
    } finally {
      setLoading(false);
    }
  }, [api, store.tasks]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const openTask = (task: TaskDto) => {
    const dest =
      routeFromActionPath(task.actionPath) ??
      (task.animalId
        ? { name: 'AnimalDetail' as const, params: { id: task.animalId } }
        : task.batchId
          ? { name: 'BatchDetail' as const, params: { id: task.batchId } }
          : null);
    if (!dest) return;
    const nav = navigation as { navigate: (name: string, params?: object) => void };
    nav.navigate(dest.name, dest.params);
  };

  const complete = async (task: TaskDto) => {
    try {
      await api.completeTask(task.id, { byScan: false });
      await load();
    } catch (err) {
      enqueueTaskComplete(store, task.id, { byScan: false });
      persist();
      if (err instanceof ApiError && err.status === 0) setError(t('native.offline'));
      else setError(err instanceof Error ? err.message : t('login.serverUnreachable'));
      void syncNow();
      await load();
    }
  };

  const snooze = async (task: TaskDto, preset: '1h' | '1d' | '1w') => {
    try {
      await api.patch(`/v1/tasks/${task.id}/snooze`, { preset });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  const dismissWith = async (task: TaskDto, reason: TaskDismissReason) => {
    try {
      const row = await api.patch<TaskDto>(`/v1/tasks/${task.id}/dismiss`, { reason });
      setDismissId(null);
      if (row.offerMute) setMuteOffer(row);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  const mute = async (task: TaskDto) => {
    try {
      await api.post('/v1/notifications/preferences', { taskType: task.type, muted: true });
      setMuteOffer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  const scanRequired = (task: TaskDto) =>
    task.type === 'APPLY_MARKER' || task.type === 'REMOVE_MARKER';

  return (
    <AppShell module="inbox">
      <PageHeader title={t('inbox.title')} subtitle={t('inbox.subtitle')} />
      {error ? <ErrorText message={error} /> : null}
      {muteOffer ? (
        <Card style={styles.mute}>
          <Txt>{t('inbox.muteOffer')}</Txt>
          <ChipRow>
            <Button label={t('inbox.mute')} onPress={() => void mute(muteOffer)} />
            <Button label={t('inbox.keep')} variant="ghost" onPress={() => setMuteOffer(null)} />
          </ChipRow>
        </Card>
      ) : null}
      {loading && tasks.length === 0 ? <LoadingState /> : null}
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={!loading ? <EmptyState message={t('inbox.empty')} /> : null}
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              item.priority === 'CRITICAL' && styles.urgent,
              item.priority === 'HIGH' && styles.high,
            ]}
          >
            <Pressable onPress={() => openTask(item)}>
              <Txt weight="semibold" style={styles.title}>
                {locale === 'ne' ? item.titleNp || item.titleEn : item.titleEn}
              </Txt>
              <Muted>
                {item.animalHerdNumber ? `${item.animalHerdNumber} · ` : ''}
                {formatDateTime(item.dueAt, locale)}
              </Muted>
            </Pressable>
            <ChipRow>
              <Button label={t('inbox.do')} onPress={() => openTask(item)} />
              {scanRequired(item) ? (
                <Muted>{t('inbox.scanRequired')}</Muted>
              ) : (
                <Button label={t('inbox.done')} variant="ghost" onPress={() => void complete(item)} />
              )}
              <Button label="+1h" variant="ghost" onPress={() => void snooze(item, '1h')} />
              <Button label="+1d" variant="ghost" onPress={() => void snooze(item, '1d')} />
              <Button label="+1w" variant="ghost" onPress={() => void snooze(item, '1w')} />
              <Button
                label={t('inbox.dismiss')}
                variant="ghost"
                onPress={() => setDismissId(dismissId === item.id ? null : item.id)}
              />
            </ChipRow>
            {dismissId === item.id ? (
              <View style={styles.dismiss}>
                {DISMISS.map((reason) => (
                  <Button
                    key={reason}
                    variant="secondary"
                    label={t(`inbox.reason.${reason}`)}
                    onPress={() => void dismissWith(item, reason)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 48 },
  mute: { marginHorizontal: 16, marginBottom: 12 },
  card: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.md,
    padding: space.lg,
    marginBottom: space.sm,
    gap: space.sm,
    overflow: 'hidden',
  },
  urgent: { borderLeftWidth: 4, borderLeftColor: color.danger },
  high: { borderLeftWidth: 4, borderLeftColor: color.warning },
  title: { fontSize: 16 },
  dismiss: { gap: 8 },
});
