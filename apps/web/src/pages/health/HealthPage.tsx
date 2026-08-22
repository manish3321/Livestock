import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  HEALTH_RECORD_TYPES,
  formatDate,
  formatNPR,
  type HealthCreate,
  type HealthListQuery,
} from '@farm/contracts';
import { listAnimals } from '../../api/animals';
import { listBatches } from '../../api/batches';
import { createHealthRecord, listHealthRecords, type HealthRecordDto } from '../../api/health';
import { useAuth } from '../../auth/auth-context';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';

type DueFilter = HealthListQuery['due'];

export function HealthPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [due, setDue] = useState<DueFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<HealthCreate>>({
    type: 'VACCINATION',
    performedAt: new Date(),
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

  const query = useQuery({
    queryKey: ['health-records', due],
    queryFn: () => listHealthRecords({ pageSize: 100, due }),
  });

  const animalsQ = useQuery({
    queryKey: ['animals', 'health-select'],
    queryFn: () => listAnimals({ pageSize: 200 }),
  });

  const batchesQ = useQuery({
    queryKey: ['batches', 'health-select'],
    queryFn: () => listBatches({ pageSize: 200 }),
  });

  const animalById = useMemo(() => {
    const map = new Map<string, { tag: string; name: string | null }>();
    for (const a of animalsQ.data?.items ?? []) {
      map.set(a.id, { tag: a.tag, name: a.name });
    }
    return map;
  }, [animalsQ.data?.items]);

  const batchById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of batchesQ.data?.items ?? []) {
      map.set(b.id, b.name);
    }
    return map;
  }, [batchesQ.data?.items]);

  const resolveSource = (row: HealthRecordDto): string => {
    const animalLabel =
      row.animalTag ||
      row.animalName ||
      (row.animalId
        ? (() => {
            const a = animalById.get(row.animalId);
            if (!a) return null;
            return a.name ? `${a.tag} · ${a.name}` : a.tag;
          })()
        : null);
    const batchLabel =
      row.herdBatchName ||
      (row.herdBatchId ? batchById.get(row.herdBatchId) : null);
    if (animalLabel && batchLabel) return `${animalLabel} / ${batchLabel}`;
    return animalLabel || batchLabel || '—';
  };

  const save = useMutation({
    mutationFn: () =>
      createHealthRecord({
        type: form.type!,
        title: form.title!,
        animalId: form.animalId || undefined,
        herdBatchId: form.herdBatchId || undefined,
        cost: form.cost,
        performedAt: form.performedAt ?? new Date(),
        nextDueAt: form.nextDueAt,
        notes: form.notes,
      }),
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setForm({ type: 'VACCINATION', performedAt: new Date() });
      void qc.invalidateQueries({ queryKey: ['health-records'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const columns = useMemo<Column<HealthRecordDto>[]>(
    () => [
      {
        key: 'type',
        header: t('health.type'),
        render: (row) => <StatusChip status="ACTIVE" label={row.type} />,
      },
      { key: 'title', header: t('health.title'), render: (row) => row.title },
      {
        key: 'performed',
        header: t('health.performedAt'),
        render: (row) => formatDate(row.performedAt),
      },
      {
        key: 'due',
        header: t('health.nextDueAt'),
        render: (row) => (row.nextDueAt ? formatDate(row.nextDueAt) : '—'),
      },
      {
        key: 'source',
        header: t('health.source'),
        render: (row) => resolveSource(row),
      },
      {
        key: 'cost',
        header: t('health.cost'),
        render: (row) => (row.cost != null ? formatNPR(row.cost) : '—'),
      },
    ],
    [t, animalById, batchById],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title?.trim()) {
      setError(t('health.requiredFields'));
      return;
    }
    save.mutate();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.health')}</h1>
          <p className="page-subtitle">{t('health.subtitle')}</p>
        </div>
        {can('health:write') && (
          <div className="page-actions">
            <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? t('common.cancel') : t('health.add')}
            </button>
          </div>
        )}
      </div>

      <div className="toolbar">
        <div className="chip-row">
          {(['all', 'overdue', 'due_soon'] as DueFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`filter-chip ${due === value ? 'active' : ''}`}
              onClick={() => setDue(value)}
            >
              {t(`health.due.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="health-type">{t('health.type')}</label>
              <select
                id="health-type"
                value={form.type}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    type: e.target.value as HealthCreate['type'],
                  }))
                }
              >
                {HEALTH_RECORD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="health-title">{t('health.title')}</label>
              <input
                id="health-title"
                required
                value={form.title ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="health-animal">{t('health.animal')}</label>
              <select
                id="health-animal"
                value={form.animalId ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, animalId: e.target.value || undefined }))
                }
              >
                <option value="">{t('health.selectAnimal')}</option>
                {(animalsQ.data?.items ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag}
                    {a.name ? ` · ${a.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="health-batch">{t('health.herdBatch')}</label>
              <select
                id="health-batch"
                value={form.herdBatchId ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    herdBatchId: e.target.value || undefined,
                  }))
                }
              >
                <option value="">{t('health.selectBatch')}</option>
                {(batchesQ.data?.items ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.kind})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="health-performed">{t('health.performedAt')}</label>
              <input
                id="health-performed"
                type="date"
                required
                value={toDateInput(form.performedAt)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    performedAt: e.target.value ? new Date(e.target.value) : new Date(),
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="health-due">{t('health.nextDueAt')}</label>
              <input
                id="health-due"
                type="date"
                value={toDateInput(form.nextDueAt)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    nextDueAt: e.target.value ? new Date(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="health-cost">{t('health.cost')}</label>
              <input
                id="health-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.cost ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    cost: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
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
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
