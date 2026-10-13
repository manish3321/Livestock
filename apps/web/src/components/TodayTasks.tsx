import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TaskDto } from '@farm/contracts';
import { completeTask, listTasksDueBefore } from '../api/tasks';
import { useAuth } from '../auth/auth-context';
import { AnimalPhoto } from './AnimalPhoto';
import { ModuleIcon } from './ModuleIcon';

type Bucket = 'overdue' | 'today' | 'tomorrow';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Late work stays short so today's and tomorrow's lists are still on screen. */
const SHOW: Record<Bucket, number> = { overdue: 3, today: 6, tomorrow: 4 };
const SCAN_ONLY = new Set<TaskDto['type']>(['APPLY_MARKER', 'REMOVE_MARKER']);

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

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_EN[d.getMonth()]}`;
}

/** The worker's day at a glance: late, today, tomorrow — so nothing has to be remembered. */
export function TodayTasks() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Bucket | null>(null);

  const today = startOfLocalDay(new Date());
  const query = useQuery({
    queryKey: ['tasks', 'today', today],
    queryFn: () => listTasksDueBefore(new Date(today + 2 * DAY_MS - 1)),
  });

  const done = useMutation({
    mutationFn: (task: TaskDto) => completeTask(task.id, { byScan: false }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const buckets = useMemo(() => {
    const out: Record<Bucket, TaskDto[]> = { overdue: [], today: [], tomorrow: [] };
    for (const task of query.data?.items ?? []) {
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
  }, [query.data, today, user?.id]);

  const leftToday = buckets.overdue.length + buckets.today.length;

  const open = (task: TaskDto) => {
    navigate(task.actionPath || (task.animalId ? `/animals/${task.animalId}` : '/inbox'));
  };

  const renderRow = (task: TaskDto, bucket: Bucket) => {
    const mine = Boolean(user?.id && task.assignedToId === user.id);
    const kind = t(`today.kind.${task.type}`, { defaultValue: t('today.other') });
    const detail = i18n.language === 'ne' ? task.titleNp || task.titleEn : task.titleEn;
    const animal = task.animalId ? task.animalHerdNumber || task.animalName : null;
    const urgent = task.priority === 'CRITICAL' || task.priority === 'HIGH';
    const busy = done.isPending && done.variables?.id === task.id;
    return (
      <li
        key={task.id}
        className={`today-row today-row-${bucket}${urgent && bucket === 'today' ? ' today-row-urgent' : ''}`}
      >
        <button type="button" className="today-row-main" onClick={() => open(task)}>
          {task.animalId ? (
            <AnimalPhoto photoUrl={task.animalPhotoUrl} species={task.animalSpecies} size={68} />
          ) : (
            <span className="today-row-icon" aria-hidden="true">
              <ModuleIcon module="inbox" size={32} />
            </span>
          )}
          <span className="today-row-body">
            <span className="today-row-top">
              <strong className="today-row-number">{animal || kind}</strong>
              <span className="today-row-time">
                {bucket === 'overdue'
                  ? shortDate(effectiveDue(task))
                  : clock(effectiveDue(task))}
              </span>
            </span>
            <span className="today-row-kind" title={detail}>
              {animal ? kind : detail}
            </span>
            {mine && <em className="today-mine">{t('today.mine')}</em>}
          </span>
        </button>
        {bucket !== 'tomorrow' && (
          <div className="today-row-actions">
            <button type="button" className="btn" onClick={() => open(task)}>
              {t('today.open')}
            </button>
            {!SCAN_ONLY.has(task.type) && (
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => done.mutate(task)}
              >
                {busy ? '…' : t('today.done')}
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  const section = (bucket: Bucket, label: string, empty?: string) => {
    const rows = buckets[bucket];
    if (rows.length === 0 && !empty) return null;
    return (
      <div className={`today-section today-section-${bucket}`}>
        <div className="today-section-head">
          <span>{label}</span>
          {rows.length > 0 && <span className="today-count">{rows.length}</span>}
        </div>
        {rows.length === 0 ? (
          <p className="muted">{empty}</p>
        ) : (
          <ul className="today-list">
            {rows.slice(0, expanded === bucket ? 50 : SHOW[bucket]).map((task) => renderRow(task, bucket))}
          </ul>
        )}
        {rows.length > SHOW[bucket] && (
          <button
            type="button"
            className="today-more"
            onClick={() => setExpanded((v) => (v === bucket ? null : bucket))}
          >
            {expanded === bucket
              ? t('today.showLess')
              : t('today.showMore', { n: rows.length - SHOW[bucket] })}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="card section-block today-card rise-in">
      <div className="section-head">
        <div>
          <h2 className="section-title">{t('today.title')}</h2>
          <p className="section-hint">{t('today.subtitle')}</p>
        </div>
        {query.data && (
          <span className={`today-count ${leftToday > 0 ? 'today-count-late' : 'today-count-ok'}`}>
            {t('today.countLeft', { n: leftToday })}
          </span>
        )}
      </div>

      {query.isLoading && <p className="muted">{t('common.loading')}</p>}
      {query.isError && (
        <p className="muted">
          {t('today.loadFailed')}{' '}
          <button type="button" className="today-more" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </button>
        </p>
      )}

      {query.data && (
        <>
          {section('overdue', t('today.overdue'))}
          {section(
            'today',
            t('today.today'),
            buckets.overdue.length === 0 ? t('today.nothingToday') : undefined,
          )}
          {section('tomorrow', t('today.tomorrow'), t('today.nothingTomorrow'))}
          <Link to="/inbox" className="today-see-all">
            {t('today.seeAll')} →
          </Link>
        </>
      )}
    </div>
  );
}
