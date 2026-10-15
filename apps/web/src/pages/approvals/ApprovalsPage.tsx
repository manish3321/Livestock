import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ChangeRequestDto } from '@farm/contracts';
import { approveChange, cancelChange, listChangeRequests, rejectChange } from '../../api/change-requests';
import { useAuth } from '../../auth/auth-context';
import { ErrorState, LoadingState } from '../../components/PageState';
import { publishToast } from '../../lib/toast-bus';

/** "weightKg" → "Weight kg" */
function fieldLabel(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function showValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const HIDDEN_FIELDS = new Set(['id', 'farmId', 'createdAt', 'updatedAt', 'deletedAt', 'version']);

export function ApprovalsPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const approver = can('changes:approve');
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['change-requests', approver, tab],
    queryFn: () =>
      approver
        ? listChangeRequests({ status: tab === 'pending' ? 'PENDING' : 'ALL' })
        : listChangeRequests({ status: 'ALL' }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['change-requests'] });
    void qc.invalidateQueries({ queryKey: ['change-requests-count'] });
  };
  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      decision === 'approve' ? approveChange(id, notes[id]) : rejectChange(id, notes[id]),
    meta: { silent: true },
    onSuccess: (row) => {
      publishToast({ kind: row.status === 'FAILED' ? 'error' : 'success', key: `approvals.result.${row.status}` });
      refresh();
      // Approved edits change the record itself; refetch whatever shows it.
      if (row.status === 'APPROVED') void qc.invalidateQueries();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelChange(id),
    meta: { silent: true },
    onSuccess: refresh,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  const rows = (query.data ?? []).filter((r) => (approver && tab === 'done' ? r.status !== 'PENDING' : true));
  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'ne' ? 'ne-NP' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('approvals.title')}</h1>
          <p className="page-subtitle">{approver ? t('approvals.subtitleApprover') : t('approvals.subtitleMine')}</p>
        </div>
      </div>

      {approver && (
        <div className="inbox-tabs" role="tablist">
          {(['pending', 'done'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? 'active' : ''}
              onClick={() => setTab(key)}
            >
              {t(`approvals.tab.${key}`)}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 && <p className="muted">{t('approvals.empty')}</p>}
      <ul className="approval-list">
        {rows.map((row) => (
          <ApprovalCard
            key={row.id}
            row={row}
            when={when(row.createdAt)}
            approver={approver}
            note={notes[row.id] ?? ''}
            onNote={(v) => setNotes((n) => ({ ...n, [row.id]: v }))}
            busy={review.isPending || cancel.isPending}
            onApprove={() => review.mutate({ id: row.id, decision: 'approve' })}
            onReject={() => review.mutate({ id: row.id, decision: 'reject' })}
            onCancel={() => cancel.mutate(row.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function ApprovalCard(props: {
  row: ChangeRequestDto;
  when: string;
  approver: boolean;
  note: string;
  onNote: (v: string) => void;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { row } = props;
  const isDelete = row.method === 'DELETE';
  const fields = Object.keys(row.changes).filter((k) => !HIDDEN_FIELDS.has(k));
  const changed = fields.filter((k) => showValue(row.before?.[k]) !== showValue(row.changes[k]));
  const shown = changed.length > 0 ? changed : fields;
  const thing = t(`approvals.entity.${row.entityType}`, { defaultValue: row.entityType });

  return (
    <li className={`approval-card status-${row.status.toLowerCase()}`}>
      <div className="approval-head">
        <strong>
          {isDelete ? t('approvals.delete') : t('approvals.edit')} · {thing}
          {row.entityLabel ? ` ${row.entityLabel}` : ''}
        </strong>
        <span className={`approval-status status-${row.status.toLowerCase()}`}>
          {t(`approvals.status.${row.status}`)}
        </span>
      </div>
      <p className="muted approval-meta">
        {t('approvals.by', { name: row.requestedBy.name })} · {props.when}
      </p>

      {isDelete ? (
        <p className="approval-delete">{t('approvals.deleteWarning')}</p>
      ) : (
        <table className="approval-diff">
          <thead>
            <tr>
              <th>{t('approvals.field')}</th>
              <th>{t('approvals.now')}</th>
              <th>{t('approvals.after')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((k) => (
              <tr key={k}>
                <td>{fieldLabel(k)}</td>
                <td>{showValue(row.before?.[k])}</td>
                <td>
                  <strong>{showValue(row.changes[k])}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {row.reason && <p className="approval-reason">“{row.reason}”</p>}
      {row.reviewedBy && (
        <p className="muted approval-meta">
          {t('approvals.reviewedBy', { name: row.reviewedBy.name })}
          {row.reviewNote ? ` — ${row.reviewNote}` : ''}
        </p>
      )}
      {row.error && <p className="approval-error">{row.error}</p>}

      {row.status === 'PENDING' && props.approver && (
        <div className="approval-actions">
          <input
            className="input"
            value={props.note}
            onChange={(e) => props.onNote(e.target.value)}
            placeholder={t('approvals.notePlaceholder')}
          />
          <button type="button" className="btn" disabled={props.busy} onClick={props.onApprove}>
            {t('approvals.approve')}
          </button>
          <button type="button" className="btn ghost danger" disabled={props.busy} onClick={props.onReject}>
            {t('approvals.reject')}
          </button>
        </div>
      )}
      {row.status === 'PENDING' && !props.approver && (
        <div className="approval-actions">
          <button type="button" className="btn ghost" disabled={props.busy} onClick={props.onCancel}>
            {t('approvals.cancel')}
          </button>
        </div>
      )}
    </li>
  );
}
