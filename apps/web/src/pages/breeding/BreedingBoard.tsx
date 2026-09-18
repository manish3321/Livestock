import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { BoardActionDto, BoardGroupDto, BoardItemDto, BreedingBoardDto } from '@farm/contracts';
import { breedingBoard, completeDryOff, completeSyncTask, enrollSync, recordHeatObservation, resolveDecision, suggestProtocol } from '../../api/breeding';
import { useAuth } from '../../auth/auth-context';
import { readBreedingBoardCache, writeBreedingBoardCache } from '../../lib/breeding-offline';

const COLOUR: Record<BoardGroupDto['colour'], string> = {
  RED: '#b42318',
  YELLOW: '#b54708',
  BLUE: '#175cd3',
  PURPLE: '#6941c6',
  AMBER: '#b54708',
  GREY: '#475467',
};

function formForTask(type: string): string | undefined {
  if (type === 'SERVICE_WINDOW' || type === 'SYNC_AI') return 'service';
  if (type === 'HEAT_WATCH' || type === 'SILENT_HEAT_CHECK') return 'heat';
  if (type === 'PREGNANCY_CHECK') return 'pd';
  if (type === 'CALVING_WATCH') return 'calving';
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
  // Each of these already reports through onToast with its own wording.
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
    <div className="breeding-board">
      <div className="board-head">
        <p className="muted">
          {offline ? t('breeding.board.offline') : t('breeding.board.help')}
          {board && ` · ${board.summary.totalActions}`}
          {board && board.summary.overdue > 0 ? ` · ${board.summary.overdue} ${t('breeding.board.overdue')}` : ''}
        </p>
      </div>

      {!board || board.groups.length === 0 ? (
        <p className="board-empty">{t('breeding.board.empty')}</p>
      ) : (
        board.groups.map((group) => (
          <section key={group.key} className="board-group">
            <h3 style={{ color: COLOUR[group.colour] }}>
              <span className="board-dot" style={{ background: COLOUR[group.colour] }} />
              {np ? group.labelNp : group.labelEn}
              <span className="board-sub">{np ? group.subLabelNp : group.subLabelEn}</span>
            </h3>
            <ul>
              {group.items.map((row) => (
                <li key={row.taskId} className="board-row">
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
                    <span className="board-tag">{row.shortNo}</span>
                    <span className="board-meta">
                      <strong>{row.name ?? t('breeding.board.unnamed')}</strong>
                      <span>{row.penName}</span>
                      <span>{np ? row.contextNp : row.contextEn}</span>
                    </span>
                  </button>
                  <div className="board-actions">
                    {row.actions.slice(0, 2).map((action) => (
                      <button
                        key={action.key}
                        type="button"
                        className={`board-btn ${action.primary ? 'primary' : ''}`}
                        onClick={() => runAction(row, action)}
                      >
                        {np ? action.labelNp : action.labelEn}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
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
              <ul>
                {board.decisionQueue.items.map((row) => (
                  <li key={row.taskId}>
                    <button
                      type="button"
                      className="board-decision"
                      onClick={() =>
                        onOpen({
                          animalId: row.animalId,
                          form: formForTask(row.kind) ?? 'service',
                          taskId: row.taskId,
                        })
                      }
                    >
                      <span className="board-tag">{row.shortNo}</span>
                      <span>{np ? row.titleNp : row.titleEn}</span>
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
