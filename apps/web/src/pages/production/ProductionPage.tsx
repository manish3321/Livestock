import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  PRODUCTION_TYPES,
  QUALITY_GRADES_FISH,
  QUALITY_GRADES_MILK_EGGS,
  formatDate,
  type ProductionCreate,
} from '@farm/contracts';
import { listAnimals } from '../../api/animals';
import { listBatches } from '../../api/batches';
import { createProduction, listProduction, type ProductionDto } from '../../api/production';
import { useAuth } from '../../auth/auth-context';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';

const DEFAULT_UNIT: Record<(typeof PRODUCTION_TYPES)[number], string> = {
  MILK: 'L',
  EGGS: 'pcs',
  FISH: 'kg',
};

export function ProductionPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<ProductionCreate>>({
    type: 'MILK',
    unit: 'L',
    entryDate: new Date(),
    quality: 'A',
  });
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['production'],
    queryFn: () => listProduction({ pageSize: 100 }),
  });

  const animalsQ = useQuery({
    queryKey: ['animals', 'production-select'],
    queryFn: () => listAnimals({ pageSize: 200 }),
    enabled: form.type === 'MILK' || showForm,
  });

  const poultryQ = useQuery({
    queryKey: ['batches', 'POULTRY', 'production'],
    queryFn: () => listBatches({ kind: 'POULTRY', pageSize: 200 }),
    enabled: form.type === 'EGGS' || showForm,
  });

  const fishQ = useQuery({
    queryKey: ['batches', 'FISH', 'production'],
    queryFn: () => listBatches({ kind: 'FISH', pageSize: 200 }),
    enabled: form.type === 'FISH' || showForm,
  });

  const save = useMutation({
    mutationFn: () =>
      createProduction({
        type: form.type!,
        entryDate: form.entryDate ?? new Date(),
        quantity: Number(form.quantity),
        unit: form.unit || DEFAULT_UNIT[form.type!],
        quality: form.quality,
        animalId: form.type === 'MILK' ? form.animalId : undefined,
        herdBatchId:
          form.type === 'EGGS' || form.type === 'FISH' ? form.herdBatchId : undefined,
        notes: form.notes,
      }),
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setForm({ type: 'MILK', unit: 'L', entryDate: new Date(), quality: 'A' });
      void qc.invalidateQueries({ queryKey: ['production'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const grades =
    form.type === 'FISH' ? QUALITY_GRADES_FISH : QUALITY_GRADES_MILK_EGGS;

  const sourceLabel = (row: ProductionDto): string => {
    if (row.animalTag || row.animalName) {
      return row.animalName
        ? `${row.animalTag ?? ''}${row.animalTag ? ' · ' : ''}${row.animalName}`
        : (row.animalTag ?? '—');
    }
    if (row.herdBatchName) return row.herdBatchName;
    return '—';
  };

  const columns = useMemo<Column<ProductionDto>[]>(
    () => [
      {
        key: 'date',
        header: t('common.date'),
        render: (row) => formatDate(row.entryDate),
      },
      {
        key: 'type',
        header: t('production.type'),
        render: (row) => <StatusChip status="ACTIVE" label={row.type} />,
      },
      {
        key: 'source',
        header: t('production.source'),
        render: (row) => sourceLabel(row),
      },
      {
        key: 'qty',
        header: t('production.quantity'),
        render: (row) => `${row.quantity} ${row.unit}`,
      },
      {
        key: 'quality',
        header: t('production.quality'),
        render: (row) => row.quality ?? '—',
      },
      {
        key: 'notes',
        header: t('common.notes'),
        render: (row) => row.notes ?? '—',
      },
    ],
    [t],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.quantity || Number(form.quantity) <= 0) {
      setError(t('production.requiredFields'));
      return;
    }
    save.mutate();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.production')}</h1>
          <p className="page-subtitle">{t('production.subtitle')}</p>
        </div>
        {can('production:write') && (
          <div className="page-actions">
            <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? t('common.cancel') : t('production.add')}
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="prod-type">{t('production.type')}</label>
              <select
                id="prod-type"
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value as (typeof PRODUCTION_TYPES)[number];
                  setForm((prev) => ({
                    ...prev,
                    type,
                    unit: DEFAULT_UNIT[type],
                    quality: type === 'FISH' ? 'STANDARD' : 'A',
                    animalId: undefined,
                    herdBatchId: undefined,
                  }));
                }}
              >
                {PRODUCTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            {form.type === 'MILK' && (
              <div className="field">
                <label htmlFor="prod-animal">{t('production.animal')}</label>
                <select
                  id="prod-animal"
                  value={form.animalId ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      animalId: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">{t('production.selectAnimal')}</option>
                  {(animalsQ.data?.items ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.tag}
                      {a.name ? ` · ${a.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {form.type === 'EGGS' && (
              <div className="field">
                <label htmlFor="prod-poultry">{t('production.herdBatch')}</label>
                <select
                  id="prod-poultry"
                  value={form.herdBatchId ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      herdBatchId: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">{t('production.selectBatch')}</option>
                  {(poultryQ.data?.items ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {form.type === 'FISH' && (
              <div className="field">
                <label htmlFor="prod-fish">{t('production.herdBatch')}</label>
                <select
                  id="prod-fish"
                  value={form.herdBatchId ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      herdBatchId: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">{t('production.selectBatch')}</option>
                  {(fishQ.data?.items ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="prod-qty">{t('production.quantity')}</label>
              <input
                id="prod-qty"
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
              <label htmlFor="prod-unit">{t('production.unit')}</label>
              <input
                id="prod-unit"
                required
                value={form.unit ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="prod-quality">{t('production.quality')}</label>
              <select
                id="prod-quality"
                value={form.quality ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    quality: (e.target.value || undefined) as ProductionCreate['quality'],
                  }))
                }
              >
                {grades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="prod-date">{t('common.date')}</label>
              <input
                id="prod-date"
                type="date"
                required
                value={toDateInput(form.entryDate)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    entryDate: e.target.value ? new Date(e.target.value) : new Date(),
                  }))
                }
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="prod-notes">{t('common.notes')}</label>
            <textarea
              id="prod-notes"
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value || undefined }))
              }
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
