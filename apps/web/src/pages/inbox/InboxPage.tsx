import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TaskDismissReason, TaskDto } from '@farm/contracts';
import { completeTask, dismissTask, listTasks, muteTaskType, snoozeTask } from '../../api/tasks';
import { ErrorState, LoadingState } from '../../components/PageState';
import { cacheTasksForOffline, enqueueReminderOp, readCachedTasks } from '../../lib/reminder-offline';

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
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [muteOffer, setMuteOffer] = useState<TaskDto | null>(null);

  const query = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const page = await listTasks();
      cacheTasksForOffline(page.items);
      return page;
    },
  });

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

  const cached = readCachedTasks();
  if (query.isLoading && cached.length === 0) return <LoadingState />;
  if (query.isError && cached.length === 0) return <ErrorState onRetry={() => query.refetch()} />;

  const items = query.data?.items ?? cached;

  const openForm = (task: TaskDto) => {
    navigate(task.actionPath);
  };

  return (
    <div>
      <h1>{t('inbox.title')}</h1>
      <p className="muted">{t('inbox.subtitle')}</p>
      {muteOffer && (
        <div className="inbox-mute">
          <p>{t('inbox.muteOffer', { label: muteOffer.type.replace(/_/g, '-').toLowerCase() })}</p>
          <div className="inbox-mute-actions">
            <button type="button" className="btn" onClick={() => mute.mutate(muteOffer.type)}>
              {t('inbox.mute')}
            </button>
            <button type="button" onClick={() => setMuteOffer(null)}>
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
              <strong>{i18n.language === 'ne' ? task.titleNp : task.titleEn}</strong>
              <span>
                {task.animalHerdNumber ? `${task.animalHerdNumber} · ` : ''}
                {new Date(task.dueAt).toLocaleString()}
              </span>
            </button>
            <div className="inbox-actions">
              <button type="button" className="btn" onClick={() => openForm(task)}>
                {t('inbox.do')}
              </button>
              {task.type === 'APPLY_MARKER' || task.type === 'REMOVE_MARKER' ? (
                <span className="muted">{t('inbox.scanRequired')}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!navigator.onLine) {
                      enqueueReminderOp({ kind: 'complete', taskId: task.id });
                      cacheTasksForOffline(readCachedTasks().filter((row) => row.id !== task.id));
                      return;
                    }
                    complete.mutate(task.id);
                  }}
                >
                  {t('inbox.done')}
                </button>
              )}
              <button type="button" onClick={() => snooze.mutate({ id: task.id, preset: '1h' })}>
                +1h
              </button>
              <button type="button" onClick={() => snooze.mutate({ id: task.id, preset: '1d' })}>
                +1d
              </button>
              <button type="button" onClick={() => snooze.mutate({ id: task.id, preset: '1w' })}>
                +1w
              </button>
              <button type="button" onClick={() => setDismissId(task.id)}>
                {t('inbox.dismiss')}
              </button>
            </div>
            {dismissId === task.id && (
              <div className="inbox-dismiss">
                {DISMISS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => {
                      if (!navigator.onLine) {
                        enqueueReminderOp({ kind: 'dismiss', taskId: task.id, reason });
                        setDismissId(null);
                        cacheTasksForOffline(readCachedTasks().filter((row) => row.id !== task.id));
                        return;
                      }
                      dismiss.mutate({ id: task.id, reason });
                    }}
                  >
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
