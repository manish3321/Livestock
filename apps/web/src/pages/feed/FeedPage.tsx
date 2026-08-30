import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate, formatNPR, type FeedCreate } from '@farm/contracts';
import { listAnimals } from '../../api/animals';
import { listBatches } from '../../api/batches';
import { createFeed, getFeedFcr, listFeed, type FeedLogDto } from '../../api/feed';
import { listInventory } from '../../api/inventory';
import { useAuth } from '../../auth/auth-context';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';
import { useFarmMode } from '../../hooks/useFarmMode';

const CONDITIONS = ['FRESH', 'FERMENTED', 'DRY'] as const;

export function FeedPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { commercial } = useFarmMode();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<FeedCreate>>({
    feedType: '',
    accepted: true,
    occurredAt: new Date(),
  });
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['feed'],
    queryFn: () => listFeed({ pageSize: 100 }),
  });
  const fcrQ = useQuery({ queryKey: ['feed', 'fcr'], queryFn: getFeedFcr });
  const animalsQ = useQuery({
    queryKey: ['animals', 'feed-select'],
    queryFn: () => listAnimals({ pageSize: 200 }),
    enabled: showForm,
  });
  const batchesQ = useQuery({
    queryKey: ['batches', 'feed-select'],
    queryFn: () => listBatches({ pageSize: 200 }),
    enabled: showForm,
  });
  const inventoryQ = useQuery({
    queryKey: ['inventory', 'feed-select'],
    queryFn: () => listInventory({ pageSize: 200 }),
    enabled: showForm,
  });

  const save = useMutation({
    mutationFn: () =>
      createFeed({
        feedType: form.feedType!,
        quantityKg: Number(form.quantityKg),
        costPerKg: form.costPerKg,
        condition: form.condition,
        accepted: form.accepted ?? true,
        animalId: form.animalId || undefined,
        herdBatchId: form.herdBatchId || undefined,
        inventoryItemId: form.inventoryItemId || undefined,
        occurredAt: form.occurredAt ?? new Date(),
        notes: form.notes,
      }),
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setForm({ feedType: '', accepted: true, occurredAt: new Date() });
      void qc.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const columns = useMemo<Column<FeedLogDto>[]>(
    () => [
      {
        key: 'when',
        header: t('common.date'),
        render: (row) => formatDate(row.occurredAt),
      },
      { key: 'type', header: t('feed.feedType'), render: (row) => row.feedType },
      {
        key: 'target',
        header: t('feed.target'),
        render: (row) => row.animalTag ?? row.herdBatchName ?? '—',
      },
      {
        key: 'qty',
        header: t('feed.quantityKg'),
        render: (row) => `${row.quantityKg} kg`,
      },
      {
        key: 'cost',
        header: t('feed.cost'),
        render: (row) => (row.totalCost != null ? formatNPR(row.totalCost) : '—'),
      },
      {
        key: 'accepted',
        header: t('feed.accepted'),
        render: (row) => (
          <StatusChip
            status={row.accepted ? 'ACTIVE' : 'SICK'}
            label={row.accepted ? t('common.yes') : t('common.no')}
          />
        ),
      },
    ],
    [t],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.feedType?.trim() || !form.quantityKg || Number(form.quantityKg) <= 0) {
      setError(t('feed.requiredFields'));
      return;
    }
    if (!form.animalId && !form.herdBatchId) {
      setError(t('feed.targetRequired'));
      return;
    }
    save.mutate();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.feed')}</h1>
          <p className="page-subtitle">{t('feed.subtitle')}</p>
        </div>
        {can('feed:write') && (
          <div className="page-actions">
            <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? t('common.cancel') : t('feed.add')}
            </button>
          </div>
        )}
      </div>

      {commercial && fcrQ.data && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <span className="stat-label">{t('feed.feedCostPerLiter')}</span>
            <span className="stat-value">
              {fcrQ.data.feedCostPerLiter != null
                ? formatNPR(fcrQ.data.feedCostPerLiter)
                : '—'}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t('feed.feedCostPerDozen')}</span>
            <span className="stat-value">
              {fcrQ.data.feedCostPerDozen != null
                ? formatNPR(fcrQ.data.feedCostPerDozen)
                : '—'}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t('feed.feedCostPerKgFish')}</span>
            <span className="stat-value">
              {fcrQ.data.feedCostPerKgFish != null
                ? formatNPR(fcrQ.data.feedCostPerKgFish)
                : '—'}
            </span>
          </div>
        </div>
      )}
      {fcrQ.data?.season.warning && (
        <p className="urgent-banner" style={{ marginBottom: 24 }}>
          {t(`enum.season.${fcrQ.data.season.key}`, { defaultValue: fcrQ.data.season.label })}
          {' — '}
          {t(`feed.season.${fcrQ.data.season.key}`, { defaultValue: fcrQ.data.season.warning })}
        </p>
      )}

      {showForm && (
        <form className="card form-card" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="feed-type">{t('feed.feedType')}</label>
              <input
                id="feed-type"
                required
                value={form.feedType ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, feedType: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="feed-qty">{t('feed.quantityKg')}</label>
              <input
                id="feed-qty"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.quantityKg ?? ''}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    quantityKg: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="feed-cost">{t('feed.costPerKg')}</label>
              <input
                id="feed-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.costPerKg ?? ''}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    costPerKg: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="feed-animal">{t('feed.animal')}</label>
              <select
                id="feed-animal"
                value={form.animalId ?? ''}
                onChange={(e) =>
                  setForm((p) => ({ ...p, animalId: e.target.value || undefined }))
                }
              >
                <option value="">{t('feed.selectAnimal')}</option>
                {(animalsQ.data?.items ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag}
                    {a.name ? ` · ${a.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="feed-batch">{t('feed.herdBatch')}</label>
              <select
                id="feed-batch"
                value={form.herdBatchId ?? ''}
                onChange={(e) =>
                  setForm((p) => ({ ...p, herdBatchId: e.target.value || undefined }))
                }
              >
                <option value="">{t('feed.selectBatch')}</option>
                {(batchesQ.data?.items ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.kind})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="feed-inv">{t('feed.inventory')}</label>
              <select
                id="feed-inv"
                value={form.inventoryItemId ?? ''}
                onChange={(e) =>
                  setForm((p) => ({ ...p, inventoryItemId: e.target.value || undefined }))
                }
              >
                <option value="">{t('feed.noInventoryItem')}</option>
                {(inventoryQ.data?.items ?? [])
                  .filter((i) => i.category === 'FEED')
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="feed-cond">{t('feed.condition')}</label>
              <select
                id="feed-cond"
                value={form.condition ?? ''}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    condition: (e.target.value || undefined) as FeedCreate['condition'],
                  }))
                }
              >
                <option value="">—</option>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {t(`enum.feedCondition.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="feed-acc">{t('feed.accepted')}</label>
              <select
                id="feed-acc"
                value={form.accepted === false ? 'no' : 'yes'}
                onChange={(e) => setForm((p) => ({ ...p, accepted: e.target.value === 'yes' }))}
              >
                <option value="yes">{t('common.yes')}</option>
                <option value="no">{t('common.no')}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="feed-date">{t('common.date')}</label>
              <input
                id="feed-date"
                type="date"
                required
                value={toDateInput(form.occurredAt)}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    occurredAt: e.target.value ? new Date(e.target.value) : new Date(),
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
