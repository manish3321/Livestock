import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate, formatNPR, type FeedCreate } from '@farm/contracts';
import { listAnimals, searchAnimals } from '../../api/animals';
import { listBatches } from '../../api/batches';
import { createFeed, getFeedFcr, listFeed, type FeedLogDto } from '../../api/feed';
import { listInventory } from '../../api/inventory';
import { useAuth } from '../../auth/auth-context';
import { DataTable, type Column } from '../../components/DataTable';
import { FieldError } from '../../components/FieldError';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';
import { SuggestInput, type SuggestOption } from '../../components/SuggestInput';
import { useFarmMode } from '../../hooks/useFarmMode';
import { inRange, notFuture, required, useFieldErrors } from '../../lib/form-errors';

const CONDITIONS = ['FRESH', 'FERMENTED', 'DRY'] as const;

export function FeedPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { commercial } = useFarmMode();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<FeedCreate>>({
    feedType: '',
    accepted: true,
    occurredAt: new Date(),
  });
  const [animalLabel, setAnimalLabel] = useState('');
  const [batchLabel, setBatchLabel] = useState('');
  const [inventoryLabel, setInventoryLabel] = useState('');
  const [animalQuery, setAnimalQuery] = useState('');
  const { errors: fieldErrors, validate, clearField, fieldProps } = useFieldErrors('feed');

  useEffect(() => {
    const animalId = searchParams.get('animalId') ?? undefined;
    if (!animalId) return;
    setShowForm(true);
    setForm((prev) => ({ ...prev, animalId }));
  }, [searchParams]);

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
  const animalSearchQ = useQuery({
    queryKey: ['animals', 'feed-search', animalQuery],
    queryFn: () => searchAnimals(animalQuery.trim()),
    enabled: showForm && animalQuery.trim().length >= 1,
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

  const feedTypeOptions = useMemo<SuggestOption[]>(() => {
    const fromLogs = (query.data?.items ?? []).map((row) => row.feedType).filter(Boolean);
    const fromInv = (inventoryQ.data?.items ?? [])
      .filter((i) => i.category === 'FEED')
      .map((i) => i.name);
    const seen = new Set<string>();
    const out: SuggestOption[] = [];
    for (const name of [...fromInv, ...fromLogs]) {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ value: name, label: name });
    }
    return out;
  }, [inventoryQ.data?.items, query.data?.items]);

  const animalOptions = useMemo<SuggestOption[]>(() => {
    const remote = animalSearchQ.data ?? [];
    const local = animalsQ.data?.items ?? [];
    const source = remote.length > 0 ? remote : local;
    return source.map((a) => ({
      value: a.id,
      label: a.tag + (a.name ? ` · ${a.name}` : ''),
      hint: 'shortNo' in a && a.shortNo ? `#${a.shortNo}` : undefined,
    }));
  }, [animalSearchQ.data, animalsQ.data?.items]);

  const batchOptions = useMemo<SuggestOption[]>(
    () =>
      (batchesQ.data?.items ?? []).map((b) => ({
        value: b.id,
        label: b.name,
        hint: b.kind,
      })),
    [batchesQ.data?.items],
  );

  const inventoryOptions = useMemo<SuggestOption[]>(
    () =>
      (inventoryQ.data?.items ?? [])
        .filter((i) => i.category === 'FEED')
        .map((i) => ({
          value: i.id,
          label: i.name,
          hint: `${i.currentStock} ${i.unit}`,
        })),
    [inventoryQ.data?.items],
  );

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
      setForm({ feedType: '', accepted: true, occurredAt: new Date() });
      setAnimalLabel('');
      setBatchLabel('');
      setInventoryLabel('');
      setAnimalQuery('');
      void qc.invalidateQueries({ queryKey: ['feed'] });
    },
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
    const ok = validate({
      feedType: required(form.feedType, t('common.requiredField')),
      quantityKg:
        required(form.quantityKg == null ? '' : String(form.quantityKg), t('common.requiredField')) ||
        inRange(String(form.quantityKg ?? ''), 0.01, 100_000, t('common.numberRange', { min: 0.01, max: 100000 })),
      occurredAt: notFuture(form.occurredAt ?? null, t('common.futureDate')),
    });
    if (ok) save.mutate();
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
              <label htmlFor="feed-feedType">{t('feed.feedType')}</label>
              <SuggestInput
                id="feed-feedType"
                value={form.feedType ?? ''}
                displayValue={form.feedType ?? ''}
                options={feedTypeOptions}
                allowCustom
                placeholder={t('feed.feedType')}
                aria-invalid={Boolean(fieldErrors.feedType)}
                aria-describedby={fieldErrors.feedType ? 'feed-feedType-error' : undefined}
                onChange={({ value }) => {
                  clearField('feedType');
                  setForm((p) => ({ ...p, feedType: value }));
                }}
              />
              <FieldError id="feed-feedType-error" message={fieldErrors.feedType} />
            </div>
            <div className="field">
              <label htmlFor="feed-quantityKg">{t('feed.quantityKg')}</label>
              <input
                {...fieldProps('quantityKg')}
                type="number"
                min="0.01"
                step="0.01"
                value={form.quantityKg ?? ''}
                onChange={(e) => {
                  clearField('quantityKg');
                  setForm((p) => ({
                    ...p,
                    quantityKg: e.target.value ? Number(e.target.value) : undefined,
                  }));
                }}
              />
              <FieldError id="feed-quantityKg-error" message={fieldErrors.quantityKg} />
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
              <SuggestInput
                id="feed-animal"
                value={form.animalId ?? ''}
                displayValue={animalLabel}
                options={animalOptions}
                allowCustom={false}
                placeholder={t('feed.selectAnimal')}
                onInputChange={setAnimalQuery}
                onChange={({ value, label, option }) => {
                  setAnimalLabel(label);
                  setForm((p) => ({ ...p, animalId: value || undefined }));
                  if (option) setAnimalQuery(label);
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="feed-batch">{t('feed.herdBatch')}</label>
              <SuggestInput
                id="feed-batch"
                value={form.herdBatchId ?? ''}
                displayValue={batchLabel}
                options={batchOptions}
                allowCustom={false}
                placeholder={t('feed.selectBatch')}
                onChange={({ value, label }) => {
                  setBatchLabel(label);
                  setForm((p) => ({ ...p, herdBatchId: value || undefined }));
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="feed-inv">{t('feed.inventory')}</label>
              <SuggestInput
                id="feed-inv"
                value={form.inventoryItemId ?? ''}
                displayValue={inventoryLabel}
                options={inventoryOptions}
                allowCustom={false}
                placeholder={t('feed.noInventoryItem')}
                onChange={({ value, label, option }) => {
                  setInventoryLabel(label);
                  const inv = (inventoryQ.data?.items ?? []).find((i) => i.id === value);
                  setForm((p) => ({
                    ...p,
                    inventoryItemId: value || undefined,
                    feedType: p.feedType?.trim() ? p.feedType : option?.label || p.feedType,
                    costPerKg:
                      p.costPerKg ??
                      (inv?.unitCost != null ? Number(inv.unitCost) : p.costPerKg),
                  }));
                }}
              />
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
              <label htmlFor="feed-occurredAt">{t('common.date')}</label>
              <input
                {...fieldProps('occurredAt')}
                type="date"
                value={toDateInput(form.occurredAt)}
                onChange={(e) => {
                  clearField('occurredAt');
                  setForm((p) => ({
                    ...p,
                    occurredAt: e.target.value ? new Date(e.target.value) : new Date(),
                  }));
                }}
              />
              <FieldError id="feed-occurredAt-error" message={fieldErrors.occurredAt} />
            </div>
          </div>
          {Object.keys(fieldErrors).length > 0 && <p className="form-summary-error">{t('common.fixErrors')}</p>}
          <div className="page-actions">
            <button className="btn" type="submit" disabled={save.isPending} aria-busy={save.isPending}>
              {save.isPending ? t('common.saving') : t('common.save')}
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
