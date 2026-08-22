import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  PAYMENT_STATUSES,
  REVENUE_SOURCES,
  formatDate,
  formatNPR,
  type RevenueCreate,
} from '@farm/contracts';
import { listAnimals } from '../../api/animals';
import { listBatches } from '../../api/batches';
import { createRevenue, listRevenue, type RevenueDto } from '../../api/revenue';
import { useAuth } from '../../auth/auth-context';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';
import { downloadInvoicePdf } from '../../lib/pdf';

const DEFAULT_UNIT: Record<(typeof REVENUE_SOURCES)[number], string> = {
  MILK: 'L',
  EGGS: 'pcs',
  FISH: 'kg',
  MEAT: 'kg',
};

export function RevenuePage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<RevenueCreate>>({
    source: 'MILK',
    unit: 'L',
    paymentStatus: 'PENDING',
    revenueDate: new Date(),
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
    queryKey: ['animals', 'revenue-select'],
    queryFn: () => listAnimals({ pageSize: 200 }),
  });
  const batchesQ = useQuery({
    queryKey: ['batches', 'revenue-select'],
    queryFn: () => listBatches({ pageSize: 200 }),
  });

  const query = useQuery({
    queryKey: ['revenue'],
    queryFn: () => listRevenue({ pageSize: 100 }),
  });

  const save = useMutation({
    mutationFn: () =>
      createRevenue({
        source: form.source!,
        quantity: Number(form.quantity),
        unit: form.unit || DEFAULT_UNIT[form.source!],
        rate: Number(form.rate),
        revenueDate: form.revenueDate ?? new Date(),
        buyerName: form.buyerName,
        buyerContact: form.buyerContact,
        paymentStatus: form.paymentStatus ?? 'PENDING',
        notes: form.notes,
        animalId: form.animalId || undefined,
        herdBatchId: form.herdBatchId || undefined,
      }),
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setForm({
        source: 'MILK',
        unit: 'L',
        paymentStatus: 'PENDING',
        revenueDate: new Date(),
      });
      void qc.invalidateQueries({ queryKey: ['revenue'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const columns = useMemo<Column<RevenueDto>[]>(
    () => [
      {
        key: 'date',
        header: t('common.date'),
        render: (row) => formatDate(row.revenueDate),
      },
      { key: 'source', header: t('revenue.source'), render: (row) => row.source },
      {
        key: 'qty',
        header: t('revenue.quantity'),
        render: (row) => `${row.quantity} ${row.unit}`,
      },
      {
        key: 'rate',
        header: t('revenue.rate'),
        render: (row) => formatNPR(row.rate),
      },
      {
        key: 'amount',
        header: t('revenue.amount'),
        render: (row) => formatNPR(row.amount),
      },
      {
        key: 'buyer',
        header: t('revenue.buyer'),
        render: (row) => row.buyerName ?? '—',
      },
      {
        key: 'payment',
        header: t('revenue.paymentStatus'),
        render: (row) => <StatusChip status={row.paymentStatus} />,
      },
      {
        key: 'invoice',
        header: t('common.actions'),
        render: (row) => (
          <button
            className="btn secondary"
            type="button"
            onClick={() =>
              downloadInvoicePdf({
                invoiceNumber: row.invoiceNumber,
                date: formatDate(row.revenueDate),
                buyerName: row.buyerName,
                buyerContact: row.buyerContact,
                source: row.source,
                quantity: row.quantity,
                unit: row.unit,
                rate: row.rate,
                amount: row.amount,
                paymentStatus: row.paymentStatus,
              })
            }
          >
            {t('revenue.invoicePdf')}
          </button>
        ),
      },
    ],
    [t],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.quantity || !form.rate || Number(form.quantity) <= 0) {
      setError(t('revenue.requiredFields'));
      return;
    }
    save.mutate();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.revenue')}</h1>
          <p className="page-subtitle">{t('revenue.subtitle')}</p>
        </div>
        {can('revenue:write') && (
          <div className="page-actions">
            <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? t('common.cancel') : t('revenue.add')}
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="rev-source">{t('revenue.source')}</label>
              <select
                id="rev-source"
                value={form.source}
                onChange={(e) => {
                  const source = e.target.value as RevenueCreate['source'];
                  setForm((prev) => ({
                    ...prev,
                    source,
                    unit: DEFAULT_UNIT[source],
                  }));
                }}
              >
                {REVENUE_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rev-qty">{t('revenue.quantity')}</label>
              <input
                id="rev-qty"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.quantity ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    quantity: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="rev-rate">{t('revenue.rate')}</label>
              <input
                id="rev-rate"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.rate ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    rate: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="rev-buyer">{t('revenue.buyer')}</label>
              <input
                id="rev-buyer"
                value={form.buyerName ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, buyerName: e.target.value || undefined }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="rev-pay">{t('revenue.paymentStatus')}</label>
              <select
                id="rev-pay"
                value={form.paymentStatus ?? 'PENDING'}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    paymentStatus: e.target.value as RevenueCreate['paymentStatus'],
                  }))
                }
              >
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rev-date">{t('common.date')}</label>
              <input
                id="rev-date"
                type="date"
                required
                value={toDateInput(form.revenueDate)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    revenueDate: e.target.value ? new Date(e.target.value) : new Date(),
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="rev-animal">{t('revenue.animal')}</label>
              <select
                id="rev-animal"
                value={form.animalId ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    animalId: e.target.value || undefined,
                  }))
                }
              >
                <option value="">{t('revenue.selectAnimal')}</option>
                {(animalsQ.data?.items ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag}
                    {a.name ? ` · ${a.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rev-batch">{t('revenue.herdBatch')}</label>
              <select
                id="rev-batch"
                value={form.herdBatchId ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    herdBatchId: e.target.value || undefined,
                  }))
                }
              >
                <option value="">{t('revenue.selectBatch')}</option>
                {(batchesQ.data?.items ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.kind})
                  </option>
                ))}
              </select>
            </div>
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
