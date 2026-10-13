import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PageResult, TaskDto } from '@farm/contracts';
import { enqueueTaskComplete } from '../core/scan-round';
import { destFromActionPath } from '../lib/action-path';
import { useLocale } from '../locale/LocaleProvider';
import type { RootStackParamList } from '../navigation/types';
import { useFarm } from '../state/FarmProvider';
import { color } from '../theme/tokens';
import { AnimalPhoto } from './AnimalPhoto';
import { ModuleIcon } from './ModuleIcon';
import { Button, Txt } from './ui';

type Bucket = 'overdue' | 'today' | 'tomorrow';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Late work stays short so today's and tomorrow's lists are still on screen. */
const SHOW: Record<Bucket, number> = { overdue: 3, today: 6, tomorrow: 4 };
const SCAN_ONLY = new Set(['APPLY_MARKER', 'REMOVE_MARKER']);

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function effectiveDue(task: TaskDto): number {
  const at = task.status === 'SNOOZED' && task.snoozedUntil ? task.snoozedUntil : task.dueAt;
  return new Date(at).getTime();
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The worker's day at a glance: late, today, tomorrow — so nothing has to be remembered. */
export function TodayTasks() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, store, persist, syncNow, user, revision } = useFarm();
  const { t, locale } = useLocale();
  const [tasks, setTasks] = useState<TaskDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Bucket | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const endOfTomorrow = new Date(startOfLocalDay(new Date()) + 2 * DAY_MS - 1).toISOString();
    try {
      const page = await api.get<PageResult<TaskDto>>(
        `/v1/tasks?page=1&pageSize=200&dueBefore=${encodeURIComponent(endOfTomorrow)}`,
      );
      setTasks(page.items);
    } catch {
      const cached = [...store.tasks.values()] as unknown as TaskDto[];
      setTasks(cached.filter((task) => task.status === 'PENDING' || task.status === 'SNOOZED'));
    } finally {
      setLoading(false);
    }
  }, [api, store]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, revision]),
  );

  const buckets = useMemo(() => {
    const today = startOfLocalDay(new Date());
    const out: Record<Bucket, TaskDto[]> = { overdue: [], today: [], tomorrow: [] };
    for (const task of tasks ?? []) {
      if (task.status !== 'PENDING' && task.status !== 'SNOOZED') continue;
      const due = effectiveDue(task);
      if (due < today) out.overdue.push(task);
      else if (due < today + DAY_MS) out.today.push(task);
      else if (due < today + 2 * DAY_MS) out.tomorrow.push(task);
    }
    const mineFirst = (a: TaskDto, b: TaskDto) =>
      Number(b.assignedToId === user?.id) - Number(a.assignedToId === user?.id) ||
      effectiveDue(a) - effectiveDue(b);
    out.overdue.sort(mineFirst);
    out.today.sort(mineFirst);
    out.tomorrow.sort(mineFirst);
    return out;
  }, [tasks, user?.id]);

  const open = (task: TaskDto) => {
    const dest =
      destFromActionPath(task.actionPath) ??
      (task.animalId ? { name: 'AnimalDetail' as const, params: { id: task.animalId } } : null);
    if (!dest) return;
    (navigation as { navigate: (name: string, params?: object) => void }).navigate(dest.name, dest.params);
  };

  const complete = async (task: TaskDto) => {
    setBusyId(task.id);
    try {
      await api.completeTask(task.id, { byScan: false });
    } catch {
      enqueueTaskComplete(store, task.id, { byScan: false });
      persist();
      void syncNow();
    } finally {
      setTasks((list) => (list ?? []).filter((row) => row.id !== task.id));
      setBusyId(null);
    }
  };

  const leftToday = buckets.overdue.length + buckets.today.length;

  const renderRow = (task: TaskDto, bucket: Bucket) => {
    const mine = Boolean(user?.id && task.assignedToId === user.id);
    const title = locale === 'ne' ? task.titleNp || task.titleEn : task.titleEn;
    const animal = [task.animalHerdNumber, task.animalName].filter(Boolean).join(' · ');
    return (
      <View
        key={task.id}
        style={[
          styles.row,
          bucket === 'overdue' && styles.rowLate,
          bucket === 'tomorrow' && styles.rowTomorrow,
        ]}
      >
        <View
          style={[
            styles.stripe,
            {
              backgroundColor:
                bucket === 'overdue'
                  ? color.danger
                  : task.priority === 'CRITICAL' || task.priority === 'HIGH'
                    ? color.ember
                    : bucket === 'tomorrow'
                      ? color.outline
                      : color.brand,
            },
          ]}
        />
        <Pressable style={styles.rowMain} onPress={() => open(task)} accessibilityRole="button">
          {task.animalId ? (
            <AnimalPhoto
              animalId={task.animalId}
              photoUrl={task.animalPhotoUrl}
              species={task.animalSpecies}
              size={52}
            />
          ) : (
            <View style={styles.iconBox}>
              <ModuleIcon module="inbox" size={26} color={color.brand} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Txt weight="bold" style={styles.rowTitle} numberOfLines={2}>
              {title}
            </Txt>
            <Txt muted style={styles.rowSub} numberOfLines={1}>
              {[animal, clock(effectiveDue(task))].filter(Boolean).join(' · ')}
            </Txt>
            {mine ? (
              <View style={styles.mine}>
                <Txt weight="bold" style={styles.mineText}>
                  {t('today.mine')}
                </Txt>
              </View>
            ) : null}
          </View>
        </Pressable>
        {bucket !== 'tomorrow' ? (
          <View style={styles.rowActions}>
            <Button label={t('today.open')} onPress={() => open(task)} />
            {!SCAN_ONLY.has(task.type) ? (
              <Button
                label={busyId === task.id ? '…' : t('today.done')}
                variant="secondary"
                disabled={busyId === task.id}
                onPress={() => void complete(task)}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const section = (bucket: Bucket, label: string, empty?: string) => {
    const rows = buckets[bucket];
    if (rows.length === 0 && !empty) return null;
    return (
      <View style={{ gap: 8 }}>
        <View style={styles.sectionHead}>
          <Txt
            weight="bold"
            style={[styles.sectionLabel, bucket === 'overdue' && { color: color.danger }]}
          >
            {label}
          </Txt>
          {rows.length > 0 ? (
            <View style={[styles.count, bucket === 'overdue' && styles.countLate]}>
              <Txt weight="bold" style={[styles.countText, bucket === 'overdue' && { color: color.danger }]}>
                {rows.length}
              </Txt>
            </View>
          ) : null}
        </View>
        {rows.length === 0 ? <Txt muted>{empty}</Txt> : null}
        {rows.slice(0, expanded === bucket ? 50 : SHOW[bucket]).map((task) => renderRow(task, bucket))}
        {rows.length > SHOW[bucket] ? (
          <Pressable
            onPress={() => setExpanded((v) => (v === bucket ? null : bucket))}
            style={styles.more}
            accessibilityRole="button"
          >
            <Txt weight="bold" style={{ color: bucket === 'overdue' ? color.danger : color.brand }}>
              {expanded === bucket ? t('today.showLess') : t('today.showMore', { n: rows.length - SHOW[bucket] })}
            </Txt>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Txt weight="display" style={styles.title}>
            {t('today.title')}
          </Txt>
          <Txt muted style={{ fontSize: 12 }}>
            {t('today.subtitle')}
          </Txt>
        </View>
        {loading ? (
          <ActivityIndicator color={color.brand} />
        ) : tasks ? (
          <View style={[styles.count, leftToday > 0 ? styles.countLate : styles.countOk]}>
            <Txt
              weight="bold"
              style={[styles.countText, { color: leftToday > 0 ? color.danger : color.success }]}
            >
              {t('today.countLeft', { n: leftToday })}
            </Txt>
          </View>
        ) : null}
      </View>

      {tasks ? (
        <View style={{ gap: 14 }}>
          {section('overdue', t('today.overdue'))}
          {section('today', t('today.today'), buckets.overdue.length === 0 ? t('today.nothingToday') : undefined)}
          {section('tomorrow', t('today.tomorrow'), t('today.nothingTomorrow'))}
          <Button label={t('today.seeAll')} variant="ghost" onPress={() => navigation.navigate('Inbox')} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 20, color: color.brandStrong },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: { fontSize: 14, color: color.brandStrong, textTransform: 'uppercase', letterSpacing: 0.4 },
  count: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: color.mint },
  countLate: { backgroundColor: color.dangerSubtle },
  countOk: { backgroundColor: color.successSubtle },
  countText: { fontSize: 12, color: color.brand },
  row: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 8,
    backgroundColor: color.surface,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    gap: 8,
    overflow: 'hidden',
  },
  rowLate: { backgroundColor: color.dangerSubtle, borderColor: '#F5C6C6' },
  rowTomorrow: { backgroundColor: color.surfaceSubtle },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 9,
    backgroundColor: color.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, color: color.textPrimary },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mine: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: color.brand,
  },
  mineText: { color: '#FFFDF9', fontSize: 10 },
  more: { alignSelf: 'flex-start', paddingVertical: 6 },
});
