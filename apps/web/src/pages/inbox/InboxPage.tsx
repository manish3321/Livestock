import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TaskDismissReason, TaskDto } from '@farm/contracts';
import { completeTask, dismissTask, listTasks, muteTaskType, snoozeTask } from '../../api/tasks';
import { ErrorState, LoadingState } from '../../components/PageState';

const DISMISS: TaskDismissReason[] = [
  'NOT_NEEDED',
  'ALREADY_DONE_OFFLINE',
  'ANIMAL_SOLD',
  'WRONG_ANIMAL',
  'OTHER',
];

export function InboxPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [mineOnly, setMineOnly] = useState(false);
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [muteOffer, setMuteOffer] = useState<TaskDto | null>(null);

  const query = useQuery({ queryKey: ['tasks'], queryFn: listTasks });

  const complete = useMutation({
    mutationFn: (id: string) => completeTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const snooze = useMutation({
    mutationFn: ({ id, preset }: { id: string; preset: '1h' | '1d' | '1w' }) =>
      snoozeTask(id, { preset }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const dismiss = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: TaskDismissReason }) =>
      dismissTask(id, { reason }),
    onSuccess: (row) => {
      setDismissId(null);
      if (row.offerMute) setMuteOffer(row);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const mute = useMutation({
    mutationFn: (taskType: TaskDto['type']) => muteTaskType(taskType),
    onSuccess: () => setMuteOffer(null),
  });

  const items = useMemo(() => {
    const all = query.data?.items ?? [];
    const filtered = mineOnly
      ? all.filter((task) => Boolean(task.assignedToId))
      : all;
    if (tab === 'done') {
      return filtered.filter((task) => task.status === 'DONE' || task.status === 'DISMISSED');
    }
    return filtered.filter((task) => task.status === 'PENDING' || task.status === 'SNOOZED');
  }, [mineOnly, query.data?.items, tab]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;

  const openForm = (task: TaskDto) => {
    navigate(task.actionPath);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('inbox.title')}</h1>
          <p className="page-subtitle">{t('inbox.subtitle')}</p>
        </div>
      </div>

      <div className="inbox-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          className={tab === 'active' ? 'active' : ''}
          onClick={() => setTab('active')}
        >
          {t('inbox.tabActive')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'done'}
          className={tab === 'done' ? 'active' : ''}
          onClick={() => setTab('done')}
        >
          {t('inbox.tabCompleted')}
        </button>
      </div>

      <label className="inbox-filter">
        <input
          type="checkbox"
          checked={mineOnly}
          onChange={(e) => setMineOnly(e.target.checked)}
        />
        {t('inbox.mineOnly')}
      </label>

      {muteOffer && (
        <div className="inbox-mute">
          <p>{t('inbox.muteOffer')}</p>
          <div className="inbox-mute-actions">
            <button type="button" className="btn" onClick={() => mute.mutate(muteOffer.type)}>
              {t('inbox.mute')}
            </button>
            <button type="button" className="btn ghost" onClick={() => setMuteOffer(null)}>
              {t('inbox.keep')}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && <p className="muted">{t('inbox.empty')}</p>}
      <ul className="inbox-list">
        {items.map((task) => (
          <li key={task.id} className={`inbox-item inbox-${task.priority.toLowerCase()}`}>
            <button type="button" className="inbox-main" onClick={() => openForm(task)}>
              <span className="inbox-due">
                {t('inbox.due')} {new Date(task.dueAt).toLocaleString()}
              </span>
              <strong>{i18n.language === 'ne' ? task.titleNp : task.titleEn}</strong>
              {task.animalHerdNumber ? (
                <span className="ear-tag">{task.animalHerdNumber}</span>
              ) : null}
            </button>
            {tab === 'active' ? (
              <div className="inbox-actions">
                <button type="button" className="btn" onClick={() => openForm(task)}>
                  {t('inbox.do')}
                </button>
                {task.type === 'APPLY_MARKER' || task.type === 'REMOVE_MARKER' ? (
                  <span className="muted">{t('inbox.scanRequired')}</span>
                ) : (
                  <button type="button" className="btn secondary" onClick={() => complete.mutate(task.id)}>
                    {t('inbox.done')}
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={() => snooze.mutate({ id: task.id, preset: '1h' })}>
                  +1h
                </button>
                <button type="button" className="btn ghost" onClick={() => snooze.mutate({ id: task.id, preset: '1d' })}>
                  +1d
                </button>
                <button type="button" className="btn ghost" onClick={() => snooze.mutate({ id: task.id, preset: '1w' })}>
                  +1w
                </button>
                <button type="button" className="btn ghost" onClick={() => setDismissId(task.id)}>
                  {t('inbox.dismiss')}
                </button>
              </div>
            ) : null}
            {dismissId === task.id && (
              <div className="inbox-dismiss">
                {DISMISS.map((reason) => (
                  <button key={reason} type="button" onClick={() => dismiss.mutate({ id: task.id, reason })}>
                    {t(`inbox.reason.${reason}`)}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
