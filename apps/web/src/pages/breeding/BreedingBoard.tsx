import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { BoardActionDto, BoardGroupDto, BoardItemDto, BreedingBoardDto } from '@farm/contracts';
import { breedingBoard, completeDryOff, completeSyncTask, enrollSync, recordHeatObservation, resolveDecision, suggestProtocol } from '../../api/breeding';
import { useAuth } from '../../auth/auth-context';
import { readBreedingBoardCache, writeBreedingBoardCache } from '../../lib/breeding-offline';

/** Group signal colours — moss / amber / red from farm tokens, not generic SaaS. */
const COLOUR: Record<BoardGroupDto['colour'], string> = {
  RED: '#C62828',
  YELLOW: '#E65100',
  BLUE: '#2A6A4A',
  PURPLE: '#1F4D38',
  AMBER: '#E65100',
  GREY: '#6B6F68',
  GREEN: '#2A6A4A',
};

const URGENCY: Record<string, string> = {
  GREEN: '#2A6A4A',
  AMBER: '#E65100',
  RED: '#C62828',
  NORMAL: '#6B6F68',
};

const URGENCY_WASH: Record<string, string> = {
  GREEN: 'rgba(42, 106, 74, 0.08)',
  AMBER: 'rgba(230, 81, 0, 0.1)',
  RED: 'rgba(198, 40, 40, 0.1)',
  NORMAL: 'transparent',
};

function formForTask(type: string): string | undefined {
  if (type === 'SERVICE_WINDOW' || type === 'SYNC_AI') return 'service';
  if (type === 'HEAT_WATCH' || type === 'SILENT_HEAT_CHECK') return 'heat';
  if (type === 'PREGNANCY_CHECK') return 'pd';
  if (type === 'CALVING_WATCH') return 'calving';
  if (type === 'COLOSTRUM_FEED') return 'colostrum';
  return undefined;
}

export function BreedingBoard({
  onOpen,
  onToast,
}: {
  onOpen: (opts: { animalId: string; form?: string; taskId?: string }) => void;
  onToast?: (message: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const np = i18n.language === 'ne';
  const [openDecisions, setOpenDecisions] = useState(false);
  const cached = readBreedingBoardCache();

  const boardQ = useQuery({
    queryKey: ['breeding', 'board'],
    queryFn: async () => {
      const board = await breedingBoard();
      writeBreedingBoardCache(board);
      return board;
    },
    placeholderData: cached ?? undefined,
  });

  const ping = () => void qc.invalidateQueries({ queryKey: ['breeding'] });
  const observe = useMutation({
    meta: { silent: true },
    mutationFn: recordHeatObservation,
    onSuccess: (result) => {
      ping();
      if (result.next) {
        onOpen({ animalId: result.next.animalId, form: result.next.form, taskId: result.next.taskId ?? undefined });
        return;
      }
      onToast?.(t('breeding.toast.nothing'));
    },
  });
  const dryOff = useMutation({
    meta: { silent: true },
    mutationFn: completeDryOff,
    onSuccess: (result) => {
      ping();
      onToast?.(result.driedOff ? t('breeding.toast.driedOff') : t('breeding.toast.emptyAtDryOff'));
    },
  });
  const syncGiven = useMutation({
    meta: { silent: true },
    mutationFn: completeSyncTask,
    onSuccess: () => {
      ping();
      onToast?.(t('breeding.toast.given'));
    },
  });
  const decide = useMutation({
    meta: { silent: true },
    mutationFn: ({ taskId, action }: { taskId: string; action: 'MINERAL_STARTED' | 'STOP' | 'ENROLLED' }) =>
      resolveDecision(taskId, action),
    onSuccess: (_row, vars) => {
      ping();
      onToast?.(
        vars.action === 'MINERAL_STARTED' ? t('breeding.toast.mineral') : t('breeding.toast.decided'),
      );
    },
  });
  const startProtocol = useMutation({
    meta: { silent: true },
    mutationFn: async ({ animalId, taskId }: { animalId: string; taskId: string }) => {
      const suggested = await suggestProtocol(animalId);
      await enrollSync({ animalId, protocolId: suggested.protocolId, startDate: new Date() });
      await resolveDecision(taskId, 'ENROLLED');
    },
    onSuccess: () => {
      ping();
      onToast?.(t('breeding.toast.protocol'));
    },
  });

  const board: BreedingBoardDto | undefined = boardQ.data ?? cached ?? undefined;
  const offline = boardQ.isError && Boolean(cached);

  const runAction = (item: BoardItemDto, action: BoardActionDto) => {
    if (action.phone) {
      window.location.href = `tel:${action.phone}`;
      return;
    }
    if (action.key === 'NOTHING') {
      observe.mutate({ animalId: item.animalId, observed: false, taskId: item.taskId });
      return;
    }
    if (action.key === 'SAW_HEAT') {
      onOpen({ animalId: item.animalId, form: 'heat', taskId: item.taskId });
      return;
    }
    if (action.key === 'MINERAL_STARTED' || action.key === 'STOP') {
      decide.mutate({ taskId: item.taskId, action: action.key });
      return;
    }
    if (action.key === 'START_PROTOCOL') {
      startProtocol.mutate({ animalId: item.animalId, taskId: item.taskId });
      return;
    }
    if (action.key === 'DRIED_OFF') {
      dryOff.mutate({ animalId: item.animalId, taskId: item.taskId, stillPregnant: true });
      return;
    }
    if (action.key === 'EMPTY_AT_DRY_OFF') {
      dryOff.mutate({ animalId: item.animalId, taskId: item.taskId, stillPregnant: false });
      return;
    }
    if (action.key === 'GIVEN') {
      syncGiven.mutate(item.taskId);
      return;
    }
    if (action.to) {
      if (!action.to.startsWith('/breeding')) {
        void navigate(action.to);
        return;
      }
      const params = new URLSearchParams(action.to.split('?')[1] ?? '');
      onOpen({
        animalId: item.animalId,
        form: params.get('form') ?? undefined,
        taskId: item.taskId,
      });
      return;
    }
    onOpen({ animalId: item.animalId, taskId: item.taskId });
  };

  return (
    <div className="breeding-board breeding-desk-board">
      <div className="board-head">
        <p className="board-head-help">
          {offline ? t('breeding.board.offline') : t('breeding.board.help')}
          {board && (
            <span className="board-head-counts">
              {' '}
              · {board.summary.totalActions}
              {board.summary.overdue > 0
                ? ` · ${board.summary.overdue} ${t('breeding.board.overdue')}`
                : ''}
            </span>
          )}
        </p>
      </div>

      {!board || board.groups.length === 0 ? (
        <p className="board-empty">{t('breeding.board.empty')}</p>
      ) : (
        board.groups.map((group, gi) => (
          <section
            key={group.key}
            className={`board-group board-group-${group.colour.toLowerCase()}`}
            style={{ ['--group-colour' as string]: COLOUR[group.colour], animationDelay: `${gi * 40}ms` }}
          >
            <header className="board-group-head">
              <h3 className="board-group-title">{np ? group.labelNp : group.labelEn}</h3>
              {(np ? group.subLabelNp : group.subLabelEn) ? (
                <p className="board-sub">{np ? group.subLabelNp : group.subLabelEn}</p>
              ) : null}
            </header>
            <ul className="board-list">
              {group.items.map((row) => {
                const urgency = row.urgency in URGENCY ? row.urgency : 'NORMAL';
                const primary = row.actions.find((a) => a.primary) ?? row.actions[0];
                const secondary = row.actions.filter((a) => a !== primary).slice(0, 1);
                return (
                  <li
                    key={row.taskId}
                    className={`board-row board-urgency-${urgency.toLowerCase()}`}
                    style={{
                      ['--urgency' as string]: URGENCY[urgency],
                      ['--urgency-wash' as string]: URGENCY_WASH[urgency],
                    }}
                  >
                    <button
                      type="button"
                      className="board-animal"
                      onClick={() =>
                        onOpen({
                          animalId: row.animalId,
                          form: formForTask(row.taskType),
                          taskId: row.taskId,
                        })
                      }
                    >
                      <span className="board-urgency" aria-hidden="true" />
                      <span className="board-identity">
                        <span className="board-tag">{row.shortNo}</span>
                        <span className="board-name">{row.name ?? t('breeding.board.unnamed')}</span>
                        {row.penName ? <span className="board-pen">{row.penName}</span> : null}
                      </span>
                      <span className="board-timing">
                        <span className="board-doby">
                          <span className="board-label">{t('breeding.board.doBy')}</span>{' '}
                          {(np ? row.doByNp : row.doByEn) || (np ? row.contextNp : row.contextEn) || '—'}
                        </span>
                        {(np ? row.whyNp : row.whyEn) ? (
                          <span className="board-why">
                            <span className="board-label">{t('breeding.board.why')}</span>{' '}
                            {np ? row.whyNp : row.whyEn}
                          </span>
                        ) : null}
                        {(np ? row.lateNp : row.lateEn) ? (
                          <span className="board-late">{np ? row.lateNp : row.lateEn}</span>
                        ) : null}
                      </span>
                    </button>
                    <div className="board-actions">
                      {primary ? (
                        <button
                          type="button"
                          className="board-btn primary"
                          onClick={() => runAction(row, primary)}
                        >
                          {np ? primary.labelNp : primary.labelEn}
                        </button>
                      ) : null}
                      {secondary.map((action) => (
                        <button
                          key={action.key}
                          type="button"
                          className="board-btn"
                          onClick={() => runAction(row, action)}
                        >
                          {np ? action.labelNp : action.labelEn}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {board && board.decisionQueue.count > 0 && (
        <section className="board-decisions">
          <button type="button" className="board-decision-toggle" onClick={() => setOpenDecisions((v) => !v)}>
            {t('breeding.board.needsDecision')} ({board.decisionQueue.count})
          </button>
          {openDecisions &&
            (can('tasks:manage') ? (
              <ul className="board-list">
                {board.decisionQueue.items.map((row) => (
                  <li key={row.taskId} className="board-row board-decision-row">
                    <button
                      type="button"
                      className="board-animal"
                      onClick={() =>
                        onOpen({
                          animalId: row.animalId,
                          form: formForTask(row.kind) ?? 'service',
                          taskId: row.taskId,
                        })
                      }
                    >
                      <span className="board-identity">
                        <span className="board-tag">{row.shortNo}</span>
                        <span className="board-name">{np ? row.titleNp : row.titleEn}</span>
                      </span>
                    </button>
                    <div className="board-actions">
                      {(row.actions ?? []).slice(0, 2).map((action) => (
                        <button
                          key={action.key}
                          type="button"
                          className={`board-btn ${action.primary ? 'primary' : ''}`}
                          onClick={() =>
                            runAction(
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
                              action,
                            )
                          }
                        >
                          {np ? action.labelNp : action.labelEn}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('breeding.board.decisionHidden')}</p>
            ))}
        </section>
      )}
    </div>
  );
}
