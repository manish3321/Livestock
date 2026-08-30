import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  APPROVAL_STATUSES,
  EXPENSE_CATEGORIES,
  formatDate,
  formatNPR,
  type ApprovalStatus,
  type ExpenseCategory,
  type ExpenseCreate,
} from '@farm/contracts';
import { listAnimals } from '../../api/animals';
import { listBatches } from '../../api/batches';
import {
  createExpense,
  createRecurring,
  generateRecurringMonth,
  listBudgets,
  listExpenses,
  listRecurring,
  reviewExpense,
  uploadExpenseReceipt,
  upsertBudget,
  type ExpenseDto,
} from '../../api/expenses';
import { useAuth } from '../../auth/auth-context';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';
import { useFarmMode } from '../../hooks/useFarmMode';

const PAYMENT_OPTIONS = ['UNPAID', 'PAID', 'PARTIAL'] as const;

export function ExpensesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { commercial } = useFarmMode();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const [status, setStatus] = useState<ApprovalStatus | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<ExpenseCreate>>({
    category: 'FEED',
    expenseDate: new Date(),
    paymentStatus: 'UNPAID',
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [budgetCategory, setBudgetCategory] = useState<ExpenseCategory>('FEED');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [splits, setSplits] = useState<Array<{ animalId: string; amount: string }>>([
    { animalId: '', amount: '' },
  ]);
  const [recurringForm, setRecurringForm] = useState({
    category: 'FEED' as ExpenseCategory,
    amount: '',
    description: '',
    dayOfMonth: 1,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const animalId = searchParams.get('animalId') ?? undefined;
    const herdBatchId = searchParams.get('herdBatchId') ?? undefined;
    if (animalId || herdBatchId) {
      setShowForm(true);
      setForm((prev) => ({
        ...prev,
        animalId: animalId || undefined,
        herdBatchId: herdBatchId || undefined,
      }));
    }
  }, [searchParams]);

  const animalsQ = useQuery({
    queryKey: ['animals', 'expense-select'],
    queryFn: () => listAnimals({ pageSize: 200 }),
  });
  const batchesQ = useQuery({
    queryKey: ['batches', 'expense-select'],
    queryFn: () => listBatches({ pageSize: 200 }),
  });

  const query = useQuery({
    queryKey: ['expenses', status],
    queryFn: () =>
      listExpenses({ pageSize: 100, status: status || undefined }),
  });

  const budgetsQ = useQuery({
    queryKey: ['expenses', 'budgets', year, month],
    queryFn: () => listBudgets(year, month),
  });

  const recurringQ = useQuery({
    queryKey: ['expenses', 'recurring'],
    queryFn: listRecurring,
  });

  const approvedByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of query.data?.items ?? []) {
      if (row.status !== 'APPROVED') continue;
      const d = new Date(row.expenseDate);
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
      map.set(row.category, (map.get(row.category) ?? 0) + row.amount);
    }
    return map;
  }, [query.data?.items, year, month]);

  const save = useMutation({
    mutationFn: async () => {
      const created = await createExpense({
        category: form.category!,
        subcategory: form.subcategory,
        amount: Number(form.amount),
        expenseDate: form.expenseDate ?? new Date(),
        description: form.description!,
        receiptNumber: form.receiptNumber,
        gstAmount: form.gstAmount,
        supplier: form.supplier,
        paymentStatus: form.paymentStatus ?? 'UNPAID',
        animalId: form.animalId || undefined,
        herdBatchId: form.herdBatchId || undefined,
        allocations: commercial
          ? splits
              .filter((s) => s.animalId && Number(s.amount) > 0)
              .map((s) => ({ animalId: s.animalId, amount: Number(s.amount) }))
          : undefined,
      });
      if (receiptFile) {
        await uploadExpenseReceipt(created.id, receiptFile);
      }
      return created;
    },
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setReceiptFile(null);
      setSplits([{ animalId: '', amount: '' }]);
      setForm({ category: 'FEED', expenseDate: new Date(), paymentStatus: 'UNPAID' });
      void qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVE' | 'REJECT' }) =>
      reviewExpense(id, { decision }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const budgetMut = useMutation({
    mutationFn: () =>
      upsertBudget({
        category: budgetCategory,
        year,
        month,
        amount: Number(budgetAmount),
      }),
    onSuccess: () => {
      setBudgetAmount('');
      void qc.invalidateQueries({ queryKey: ['expenses', 'budgets'] });
    },
  });

  const recurringMut = useMutation({
    mutationFn: () =>
      createRecurring({
        category: recurringForm.category,
        amount: Number(recurringForm.amount),
        description: recurringForm.description,
        dayOfMonth: recurringForm.dayOfMonth,
      }),
    onSuccess: () => {
      setRecurringForm({ category: 'FEED', amount: '', description: '', dayOfMonth: 1 });
      void qc.invalidateQueries({ queryKey: ['expenses', 'recurring'] });
    },
  });

  const generateMut = useMutation({
    mutationFn: () => generateRecurringMonth(),
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
        key: 'gst',
        header: t('expenses.gst'),
        render: (row) =>
          row.gstAmount != null ? formatNPR(row.gstAmount) : '—',
      },
      {
        key: 'payment',
        header: t('expenses.paymentStatus'),
        render: (row) => row.paymentStatus ?? '—',
      },
      {
        key: 'receipt',
        header: t('expenses.receipt'),
        render: (row) =>
          row.receiptUrl ? (
            <a href={row.receiptUrl} target="_blank" rel="noreferrer">
              {t('expenses.viewReceipt')}
            </a>
          ) : (
            '—'
          ),
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
        <div className="page-actions">
          {can('expenses:submit') && (
            <>
              <button
                className="btn secondary"
                type="button"
                disabled={generateMut.isPending}
                onClick={() => generateMut.mutate()}
              >
                {t('expenses.generateRecurring')}
              </button>
              <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
                {showForm ? t('common.cancel') : t('expenses.submit')}
              </button>
            </>
          )}
        </div>
      </div>

      {commercial && (
      <>
      <div className="card" style={{ marginBottom: 24 }}>
        <h2>{t('expenses.budget')}</h2>
        <p className="muted">
          {year}-{String(month).padStart(2, '0')}
        </p>
        {(budgetsQ.data ?? []).length === 0 && approvedByCategory.size === 0 ? (
          <p className="muted">{t('common.empty')}</p>
        ) : (
          <ul className="bar-list" style={{ marginTop: 12 }}>
            {EXPENSE_CATEGORIES.map((cat) => {
              const budget = budgetsQ.data?.find((b) => b.category === cat)?.amount ?? 0;
              const spent = approvedByCategory.get(cat) ?? 0;
              if (!budget && !spent) return null;
              return (
                <li key={cat}>
                  <div className="bar-meta">
                    <span>{cat}</span>
                    <span>
                      {formatNPR(spent)} / {formatNPR(budget)}
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.min(100, budget > 0 ? (spent / budget) * 100 : 0)}%`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {can('expenses:approve') && (
          <form
            className="inline-form"
            style={{ flexWrap: 'wrap', marginTop: 16 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!budgetAmount || Number(budgetAmount) < 0) return;
              budgetMut.mutate();
            }}
          >
            <select
              value={budgetCategory}
              onChange={(e) => setBudgetCategory(e.target.value as ExpenseCategory)}
              aria-label={t('expenses.category')}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder={t('expenses.budgetAmount')}
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              required
            />
            <button className="btn" type="submit" disabled={budgetMut.isPending}>
              {t('expenses.setBudget')}
            </button>
          </form>
        )}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2>{t('expenses.recurring')}</h2>
        {(recurringQ.data ?? []).length === 0 ? (
          <p className="muted">{t('common.empty')}</p>
        ) : (
          <ul className="activity-list">
            {(recurringQ.data ?? []).map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{t(`enum.expenseCategory.${row.category}`)}</strong>
                  <span className="muted">
                    {' · '}
                    {formatNPR(row.amount)} · {t('expenses.dayOfMonth')} {row.dayOfMonth}
                  </span>
                </div>
                <span className="muted">{row.description}</span>
              </li>
            ))}
          </ul>
        )}
        {can('expenses:submit') && (
          <form
            className="inline-form"
            style={{ flexWrap: 'wrap', marginTop: 16 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!recurringForm.description || !recurringForm.amount) return;
              recurringMut.mutate();
            }}
          >
            <select
              value={recurringForm.category}
              onChange={(e) =>
                setRecurringForm((f) => ({
                  ...f,
                  category: e.target.value as ExpenseCategory,
                }))
              }
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`enum.expenseCategory.${c}`)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0.01}
              step={0.01}
              placeholder={t('expenses.amount')}
              value={recurringForm.amount}
              onChange={(e) => setRecurringForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
            <input
              placeholder={t('expenses.description')}
              value={recurringForm.description}
              onChange={(e) =>
                setRecurringForm((f) => ({ ...f, description: e.target.value }))
              }
              required
            />
            <input
              type="number"
              min={1}
              max={28}
              value={recurringForm.dayOfMonth}
              onChange={(e) =>
                setRecurringForm((f) => ({ ...f, dayOfMonth: Number(e.target.value) }))
              }
              aria-label={t('expenses.dayOfMonth')}
            />
            <button className="btn" type="submit" disabled={recurringMut.isPending}>
              {t('expenses.addRecurring')}
            </button>
          </form>
        )}
      </div>
      </>
      )}

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
                    {t(`enum.expenseCategory.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            {commercial && (
              <div className="field">
                <label htmlFor="exp-sub">{t('expenses.subcategory')}</label>
                <input
                  id="exp-sub"
                  value={form.subcategory ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, subcategory: e.target.value || undefined }))
                  }
                />
              </div>
            )}
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
              <label htmlFor="exp-gst">{t('expenses.gst')}</label>
              <input
                id="exp-gst"
                type="number"
                min="0"
                step="0.01"
                value={form.gstAmount ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    gstAmount: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="exp-supplier">{t('expenses.supplier')}</label>
              <input
                id="exp-supplier"
                value={form.supplier ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    supplier: e.target.value || undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="exp-pay">{t('expenses.paymentStatus')}</label>
              <select
                id="exp-pay"
                value={form.paymentStatus ?? 'UNPAID'}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    paymentStatus: e.target.value as ExpenseCreate['paymentStatus'],
                  }))
                }
              >
                {PAYMENT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
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
            <div className="field">
              <label htmlFor="exp-animal">{t('expenses.animal')}</label>
              <select
                id="exp-animal"
                value={form.animalId ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    animalId: e.target.value || undefined,
                  }))
                }
              >
                <option value="">{t('expenses.selectAnimal')}</option>
                {(animalsQ.data?.items ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag}
                    {a.name ? ` · ${a.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="exp-batch">{t('expenses.herdBatch')}</label>
              <select
                id="exp-batch"
                value={form.herdBatchId ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    herdBatchId: e.target.value || undefined,
                  }))
                }
              >
                <option value="">{t('expenses.selectBatch')}</option>
                {(batchesQ.data?.items ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.kind})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="exp-file">{t('expenses.receiptFile')}</label>
              <input
                id="exp-file"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          {commercial && (
          <div className="field">
            <label>{t('expenses.split')}</label>
            {splits.map((row, idx) => (
              <div key={idx} className="inline-form" style={{ marginBottom: 8 }}>
                <select
                  value={row.animalId}
                  onChange={(e) =>
                    setSplits((prev) =>
                      prev.map((s, i) => (i === idx ? { ...s, animalId: e.target.value } : s)),
                    )
                  }
                >
                  <option value="">{t('expenses.selectAnimal')}</option>
                  {(animalsQ.data?.items ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.tag}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t('expenses.amount')}
                  value={row.amount}
                  onChange={(e) =>
                    setSplits((prev) =>
                      prev.map((s, i) => (i === idx ? { ...s, amount: e.target.value } : s)),
                    )
                  }
                />
              </div>
            ))}
            <button
              className="btn secondary"
              type="button"
              onClick={() => setSplits((prev) => [...prev, { animalId: '', amount: '' }])}
            >
              {t('expenses.addSplit')}
            </button>
          </div>
          )}
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
