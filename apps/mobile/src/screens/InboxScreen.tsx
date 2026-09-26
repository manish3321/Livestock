import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PageResult, TaskDismissReason, TaskDto } from '@farm/contracts';
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
import { destFromActionPath } from '../lib/action-path';
import type { RootStackParamList } from '../navigation/types';
import { color, radius, space } from '../theme/tokens';

const DISMISS: TaskDismissReason[] = [
  'NOT_NEEDED',
  'ALREADY_DONE_OFFLINE',
  'ANIMAL_SOLD',
  'WRONG_ANIMAL',
  'OTHER',
];

type Tab = 'active' | 'done';

function priorityStyle(priority: TaskDto['priority']) {
  switch (priority) {
    case 'CRITICAL':
      return styles.prioCritical;
    case 'HIGH':
      return styles.prioHigh;
    case 'LOW':
      return styles.prioLow;
    default:
      return styles.prioNormal;
  }
}

export function InboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, store, persist, syncNow, revision, user } = useFarm();
  const { t, locale } = useLocale();
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('active');
  const [mineOnly, setMineOnly] = useState(false);
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [muteOffer, setMuteOffer] = useState<TaskDto | null>(null);
  void revision;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'active') {
        const page = await api.listOpenTasks();
        setTasks(page.items.filter((task) => task.status === 'PENDING' || task.status === 'SNOOZED'));
      } else {
        const [done, dismissed] = await Promise.all([
          api.get<PageResult<TaskDto>>('/v1/tasks?page=1&pageSize=80&status=DONE'),
          api.get<PageResult<TaskDto>>('/v1/tasks?page=1&pageSize=80&status=DISMISSED'),
        ]);
        setTasks([...done.items, ...dismissed.items]);
      }
      setError(null);
    } catch {
      const cached = [...store.tasks.values()] as TaskDto[];
      if (tab === 'active') {
        setTasks(cached.filter((task) => task.status === 'PENDING' || task.status === 'SNOOZED'));
      } else {
        setTasks(cached.filter((task) => task.status === 'DONE' || task.status === 'DISMISSED'));
      }
      setError(t('native.offline'));
    } finally {
      setLoading(false);
    }
  }, [api, store.tasks, t, tab]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const items = useMemo(() => {
    if (!mineOnly || !user?.id) return tasks;
    return tasks.filter((task) => task.assignedToId === user.id);
  }, [mineOnly, tasks, user?.id]);

  const openTask = (task: TaskDto) => {
    const dest =
      destFromActionPath(task.actionPath) ??
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

      <View style={styles.tabs} accessibilityRole="tablist">
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'active' }}
          onPress={() => setTab('active')}
          style={[styles.tab, tab === 'active' && styles.tabOn]}
        >
          <Txt weight="semibold" style={tab === 'active' ? styles.tabTextOn : styles.tabText}>
            {t('inbox.tabActive')}
          </Txt>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'done' }}
          onPress={() => setTab('done')}
          style={[styles.tab, tab === 'done' && styles.tabOn]}
        >
          <Txt weight="semibold" style={tab === 'done' ? styles.tabTextOn : styles.tabText}>
            {t('inbox.tabCompleted')}
          </Txt>
        </Pressable>
      </View>

      <Pressable
        onPress={() => setMineOnly((v) => !v)}
        style={styles.filter}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: mineOnly }}
      >
        <View style={[styles.check, mineOnly && styles.checkOn]}>
          {mineOnly ? <Txt style={styles.checkMark}>✓</Txt> : null}
        </View>
        <Txt style={styles.filterLabel}>{t('inbox.mineOnly')}</Txt>
      </Pressable>

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
      {loading && items.length === 0 ? <LoadingState /> : null}
      <FlatList
        style={styles.listFlex}
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={!loading ? <EmptyState message={t('inbox.empty')} /> : null}
        initialNumToRender={10}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        renderItem={({ item }) => (
          <View style={[styles.card, priorityStyle(item.priority)]}>
            <Pressable onPress={() => openTask(item)} style={styles.main}>
              <Txt weight="semibold" style={styles.title}>
                {locale === 'ne' ? item.titleNp || item.titleEn : item.titleEn}
              </Txt>
              <Muted>
                {item.animalHerdNumber ? `${item.animalHerdNumber} · ` : ''}
                {formatDateTime(item.dueAt, locale)}
              </Muted>
            </Pressable>
            {tab === 'active' ? (
              <>
                <View style={styles.actions}>
                  <Button label={t('inbox.do')} variant="secondary" onPress={() => openTask(item)} />
                  {scanRequired(item) ? (
                    <Muted>{t('inbox.scanRequired')}</Muted>
                  ) : (
                    <Button
                      label={t('inbox.done')}
                      variant="secondary"
                      onPress={() => void complete(item)}
                    />
                  )}
                  <Button label="+1h" variant="secondary" onPress={() => void snooze(item, '1h')} />
                  <Button label="+1d" variant="secondary" onPress={() => void snooze(item, '1d')} />
                  <Button label="+1w" variant="secondary" onPress={() => void snooze(item, '1w')} />
                  <Button
                    label={t('inbox.dismiss')}
                    variant="secondary"
                    onPress={() => setDismissId(dismissId === item.id ? null : item.id)}
                  />
                </View>
                {dismissId === item.id ? (
                  <View style={styles.dismiss}>
                    {DISMISS.map((reason) => (
                      <Button
                        key={reason}
                        variant="ghost"
                        label={t(`inbox.reason.${reason}`)}
                        onPress={() => void dismissWith(item, reason)}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        )}
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  listFlex: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 48, flexGrow: 1 },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 4,
    borderRadius: 12,
    backgroundColor: color.surfaceMuted,
    gap: 4,
  },
  tab: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: {
    backgroundColor: color.surface,
  },
  tabText: { color: color.textMuted, fontSize: 14 },
  tabTextOn: { color: color.textPrimary, fontSize: 14 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: color.brand,
    borderColor: color.brandStrong,
  },
  checkMark: { color: color.surface, fontSize: 13, fontWeight: '700' },
  filterLabel: { fontSize: 14, color: color.textPrimary, flex: 1 },
  mute: { marginHorizontal: 16, marginBottom: 12 },
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    gap: space.sm,
    overflow: 'hidden',
    borderLeftWidth: 5,
  },
  prioCritical: { borderLeftColor: color.danger },
  prioHigh: { borderLeftColor: color.ember },
  prioNormal: { borderLeftColor: color.brandStrong },
  prioLow: { borderLeftColor: color.textMuted },
  main: { gap: 6 },
  title: { fontSize: 16, color: color.textPrimary },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  dismiss: { gap: 8, marginTop: 4 },
});
