import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  APPROVAL_STATUSES,
  EXPENSE_CATEGORIES,
  formatDate,
  formatNPR,
  type ApprovalStatus,
  type ExpenseCreate,
} from '@farm/contracts';
import {
  createExpense,
  listExpenses,
  reviewExpense,
  type ExpenseDto,
} from '../../api/expenses';
import { useAuth } from '../../auth/auth-context';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';

export function ExpensesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<ApprovalStatus | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<ExpenseCreate>>({
    category: 'FEED',
    expenseDate: new Date(),
  });
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['expenses', status],
    queryFn: () =>
      listExpenses({ pageSize: 100, status: status || undefined }),
  });

  const save = useMutation({
    mutationFn: () =>
      createExpense({
        category: form.category!,
        amount: Number(form.amount),
        expenseDate: form.expenseDate ?? new Date(),
        description: form.description!,
        receiptNumber: form.receiptNumber,
      }),
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setForm({ category: 'FEED', expenseDate: new Date() });
      void qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVE' | 'REJECT' }) =>
      reviewExpense(id, { decision }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const canReview = (row: ExpenseDto) => {
    if (row.status === 'PENDING' && can('expenses:approve')) return true;
    if (row.status === 'ESCALATED' && can('expenses:approve-escalated')) return true;
    return false;
  };

  const columns = useMemo<Column<ExpenseDto>[]>(
    () => [
      {
        key: 'date',
        header: t('common.date'),
        render: (row) => formatDate(row.expenseDate),
      },
      { key: 'category', header: t('expenses.category'), render: (row) => row.category },
      {
        key: 'amount',
        header: t('expenses.amount'),
        render: (row) => formatNPR(row.amount),
      },
      {
        key: 'description',
        header: t('expenses.description'),
        render: (row) => row.description,
      },
      {
        key: 'status',
        header: t('expenses.status'),
        render: (row) => <StatusChip status={row.status} />,
      },
      {
        key: 'actions',
        header: t('common.actions'),
        render: (row) =>
          canReview(row) ? (
            <div className="page-actions">
              <button
                className="btn"
                type="button"
                disabled={review.isPending}
                onClick={() => review.mutate({ id: row.id, decision: 'APPROVE' })}
              >
                {t('expenses.approve')}
              </button>
              <button
                className="btn secondary danger"
                type="button"
                disabled={review.isPending}
                onClick={() => review.mutate({ id: row.id, decision: 'REJECT' })}
              >
                {t('expenses.reject')}
              </button>
            </div>
          ) : (
            '—'
          ),
      },
    ],
    [t, review.isPending, can],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.description?.trim() || !form.amount || Number(form.amount) <= 0) {
      setError(t('expenses.requiredFields'));
      return;
    }
    save.mutate();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.expenses')}</h1>
          <p className="page-subtitle">{t('expenses.subtitle')}</p>
        </div>
        {can('expenses:submit') && (
          <div className="page-actions">
            <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? t('common.cancel') : t('expenses.submit')}
            </button>
          </div>
        )}
      </div>

      <div className="toolbar">
        <div className="chip-row">
          <button
            type="button"
            className={`filter-chip ${status === '' ? 'active' : ''}`}
            onClick={() => setStatus('')}
          >
            {t('common.filterAll')}
          </button>
          {APPROVAL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`filter-chip ${status === s ? 'active' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="exp-cat">{t('expenses.category')}</label>
              <select
                id="exp-cat"
                value={form.category}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    category: e.target.value as ExpenseCreate['category'],
                  }))
                }
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="exp-amount">{t('expenses.amount')}</label>
              <input
                id="exp-amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.amount ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    amount: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="exp-date">{t('common.date')}</label>
              <input
                id="exp-date"
                type="date"
                required
                value={toDateInput(form.expenseDate)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    expenseDate: e.target.value ? new Date(e.target.value) : new Date(),
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="exp-receipt">{t('expenses.receiptNumber')}</label>
              <input
                id="exp-receipt"
                value={form.receiptNumber ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    receiptNumber: e.target.value || undefined,
                  }))
                }
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="exp-desc">{t('expenses.description')}</label>
            <textarea
              id="exp-desc"
              required
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="page-actions">
            <button className="btn" type="submit" disabled={save.isPending}>
              {t('common.save')}
            </button>
          </div>
        </form>
      )}

      {query.isLoading && <LoadingState />}
      {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
      {query.data && (
        <>
          <p className="result-count">
            {t('common.resultCount', { count: query.data.total })}
          </p>
          <DataTable columns={columns} rows={query.data.items} rowKey={(r) => r.id} />
        </>
      )}
    </div>
  );
}

function toDateInput(value: Date | string | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}
