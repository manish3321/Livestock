import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ILLNESS_CONDITION_LABEL,
  ILLNESS_CONDITIONS,
  QUALITY_GRADES_FISH,
  SPECIES,
  SPECIES_LABEL,
  formatNPR,
  type HerdBatchKind,
  type IllnessCondition,
} from '@farm/contracts';
import { useAuth } from '../../auth/auth-context';
import {
  addFeed,
  addHarvest,
  addIllness,
  addMortality,
  addSampling,
  addWaterQuality,
  createBatch,
  getBatch,
  getBatchEconomics,
  listBatches,
  listFeed,
  listHarvest,
  listIllness,
  listMortality,
  listSampling,
  listWaterQuality,
} from '../../api/batches';
import { listInventory } from '../../api/inventory';
import { ErrorState, LoadingState } from '../../components/PageState';
import { QrPrintCard } from '../../components/QrPrintCard';
import { StatusChip } from '../../components/StatusChip';
import { batchScanUrl } from '../../lib/qr';

function ageLabel(from: number | null, to: number | null, t: (k: string) => string): string {
  if (from == null && to == null) return t('batches.anyAge');
  if (from != null && to != null) return `${from}–${to} ${t('batches.months')}`;
  if (from != null) return `${from}+ ${t('batches.months')}`;
  return `≤${to} ${t('batches.months')}`;
}

export function LivestockBatchesPage() {
  return <BatchKindPage kind="LIVESTOCK" titleKey="nav.batches" showBreedingStock />;
}

export function PoultryBatchesPage() {
  return <BatchKindPage kind="POULTRY" titleKey="nav.groups" />;
}

export function FishBatchesPage() {
  return <BatchKindPage kind="FISH" titleKey="nav.fish" />;
}

function BatchKindPage({
  kind,
  titleKey,
  showBreedingStock = false,
}: {
  kind: HerdBatchKind;
  titleKey: string;
  showBreedingStock?: boolean;
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [category, setCategory] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [cat, setCat] = useState(kind === 'LIVESTOCK' ? 'BUFFALO' : kind === 'POULTRY' ? 'LAYER' : 'ROHU');
  const [ageFrom, setAgeFrom] = useState('0');
  const [ageTo, setAgeTo] = useState('12');
  const [count, setCount] = useState('10');
  const [error, setError] = useState(false);

  const categories =
    kind === 'LIVESTOCK'
      ? SPECIES.map((s) => ({ value: s, label: SPECIES_LABEL[s] }))
      : kind === 'POULTRY'
        ? [
            { value: 'LAYER', label: t('batches.poultry.LAYER') },
            { value: 'BROILER', label: t('batches.poultry.BROILER') },
            { value: 'DUCK', label: t('batches.poultry.DUCK') },
          ]
        : [
            { value: 'ROHU', label: 'Rohu' },
            { value: 'CATLA', label: 'Catla' },
            { value: 'OTHER', label: t('batches.other') },
          ];

  const query = useQuery({
    queryKey: ['batches', kind, category],
    queryFn: () =>
      listBatches({
        kind,
        category: category || undefined,
        pageSize: 100,
      }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createBatch({
        kind,
        category: cat,
        name,
        ageFromMonths: ageFrom === '' ? null : Number(ageFrom),
        ageToMonths: ageTo === '' ? null : Number(ageTo),
        initialCount: Number(count),
      }),
    onSuccess: (batch) => {
      void qc.invalidateQueries({ queryKey: ['batches'] });
      setShowForm(false);
      setName('');
      navigate(`/batches/${batch.id}`);
    },
    onError: () => setError(true),
  });

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    setError(false);
    if (!name.trim() || !Number(count)) {
      setError(true);
      return;
    }
    createMut.mutate();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t(titleKey)}</h1>
          <p className="page-subtitle">{t('batches.subtitle')}</p>
        </div>
        {showBreedingStock && (
          <div className="page-actions">
            <Link className="btn secondary" to="/animals">
              {t('batches.openBreedingStock')}
            </Link>
          </div>
        )}
      </div>

      <div className="toolbar">
        <div className="chip-row">
          <button
            type="button"
            className={`filter-chip ${category === '' ? 'active' : ''}`}
            onClick={() => setCategory('')}
          >
            {t('common.filterAll')}
          </button>
          {categories.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`filter-chip ${category === c.value ? 'active' : ''}`}
              onClick={() => setCategory(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading && <LoadingState />}
      {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
      {query.data && (
        <>
          <p className="result-count">
            {t('common.resultCount', { count: query.data.total })}
          </p>
          <div className="animal-grid">
            {query.data.items.map((b) => (
              <Link key={b.id} to={`/batches/${b.id}`} className="animal-card">
                <div className="animal-card-media" data-species={b.category}>
                  <span className="animal-card-glyph">{b.category.slice(0, 3)}</span>
                  {b.sickCount > 0 && (
                    <div className="animal-card-status">
                      <StatusChip status="SICK" label={`${b.sickCount} ${t('batches.sick')}`} />
                    </div>
                  )}
                </div>
                <div className="animal-card-body">
                  <p className="animal-card-title">{b.name}</p>
                  <div className="animal-card-tag">{b.category}</div>
                  <div className="animal-card-meta">
                    <span>{ageLabel(b.ageFromMonths, b.ageToMonths, t)}</span>
                    <span>
                      {b.currentCount} {t('batches.head')}
                    </span>
                  </div>
                  <div className="animal-card-meta">
                    <span>
                      {t('batches.dead')}: {b.deadCount}
                    </span>
                    <span>
                      {t('batches.sick')}: {b.sickCount}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {query.data.items.length === 0 && <p className="muted">{t('common.empty')}</p>}
        </>
      )}

      {can('animals:write') && !showForm && (
        <button className="btn fab" type="button" onClick={() => setShowForm(true)}>
          + {t('batches.add')}
        </button>
      )}

      {showForm && (
        <form className="card form-card" style={{ marginTop: 24 }} onSubmit={onCreate}>
          <h2>{t('batches.add')}</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="batch-name">{t('batches.name')}</label>
              <p className="field-hint">{t('batches.nameHint')}</p>
              <input
                id="batch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="batch-cat">{t('batches.category')}</label>
              <select id="batch-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="age-from">{t('batches.ageFrom')}</label>
              <input
                id="age-from"
                type="number"
                min={0}
                value={ageFrom}
                onChange={(e) => setAgeFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="age-to">{t('batches.ageTo')}</label>
              <input
                id="age-to"
                type="number"
                min={0}
                value={ageTo}
                onChange={(e) => setAgeTo(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="batch-count">{t('batches.count')}</label>
              <input
                id="batch-count"
                type="number"
                min={1}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                required
              />
            </div>
          </div>
          {error && <p className="error-text">{t('batches.requiredFields')}</p>}
          <div className="page-actions">
            <button className="btn" type="submit" disabled={createMut.isPending}>
              {t('common.save')}
            </button>
            <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [condition, setCondition] = useState<IllnessCondition>('OTHER');
  const [sickCount, setSickCount] = useState('1');
  const [deadCount, setDeadCount] = useState('1');
  const [deadReason, setDeadReason] = useState('');
  const [feedQty, setFeedQty] = useState('1');
  const [feedType, setFeedType] = useState('');
  const [feedInventoryId, setFeedInventoryId] = useState('');
  const [tempC, setTempC] = useState('');
  const [ph, setPh] = useState('');
  const [dissolvedO2, setDissolvedO2] = useState('');
  const [sampleCount, setSampleCount] = useState('10');
  const [totalWeightGrams, setTotalWeightGrams] = useState('');
  const [estimatedCount, setEstimatedCount] = useState('');
  const [harvestKg, setHarvestKg] = useState('');
  const [harvestFishCount, setHarvestFishCount] = useState('');
  const [harvestQuality, setHarvestQuality] = useState<(typeof QUALITY_GRADES_FISH)[number]>('STANDARD');

  const batchQ = useQuery({
    queryKey: ['batch', id],
    queryFn: () => getBatch(id!),
    enabled: Boolean(id),
  });
  const economicsQ = useQuery({
    queryKey: ['batch', id, 'economics'],
    queryFn: () => getBatchEconomics(id!),
    enabled: Boolean(id),
  });
  const illnessQ = useQuery({
    queryKey: ['batch', id, 'illness'],
    queryFn: () => listIllness(id!),
    enabled: Boolean(id),
  });
  const mortalityQ = useQuery({
    queryKey: ['batch', id, 'mortality'],
    queryFn: () => listMortality(id!),
    enabled: Boolean(id),
  });
  const feedQ = useQuery({
    queryKey: ['batch', id, 'feed'],
    queryFn: () => listFeed(id!),
    enabled: Boolean(id),
  });
  const feedItemsQ = useQuery({
    queryKey: ['inventory', 'FEED'],
    queryFn: () => listInventory({ pageSize: 100 }),
    enabled: Boolean(id) && can('inventory:read'),
  });
  const isFish = batchQ.data?.kind === 'FISH';
  const waterQ = useQuery({
    queryKey: ['batch', id, 'water-quality'],
    queryFn: () => listWaterQuality(id!),
    enabled: Boolean(id) && isFish,
  });
  const samplingQ = useQuery({
    queryKey: ['batch', id, 'sampling'],
    queryFn: () => listSampling(id!),
    enabled: Boolean(id) && isFish,
  });
  const harvestQ = useQuery({
    queryKey: ['batch', id, 'harvest'],
    queryFn: () => listHarvest(id!),
    enabled: Boolean(id) && isFish,
  });

  const invalidateBatch = () => {
    void qc.invalidateQueries({ queryKey: ['batch', id] });
  };

  const illnessMut = useMutation({
    mutationFn: () =>
      addIllness(id!, { condition, count: Number(sickCount), occurredAt: new Date() }),
    onSuccess: () => {
      invalidateBatch();
      setSickCount('1');
    },
  });

  const mortalityMut = useMutation({
    mutationFn: () =>
      addMortality(id!, {
        count: Number(deadCount),
        reason: deadReason || undefined,
        occurredAt: new Date(),
      }),
    onSuccess: () => {
      invalidateBatch();
      setDeadCount('1');
      setDeadReason('');
    },
  });

  const feedMut = useMutation({
    mutationFn: () =>
      addFeed(id!, {
        quantityKg: Number(feedQty),
        feedType: feedType || undefined,
        inventoryItemId: feedInventoryId || undefined,
        occurredAt: new Date(),
      }),
    onSuccess: () => {
      invalidateBatch();
      setFeedQty('1');
      setFeedType('');
      setFeedInventoryId('');
    },
  });

  const waterMut = useMutation({
    mutationFn: () =>
      addWaterQuality(id!, {
        recordedAt: new Date(),
        temperatureC: tempC ? Number(tempC) : undefined,
        ph: ph ? Number(ph) : undefined,
        dissolvedO2: dissolvedO2 ? Number(dissolvedO2) : undefined,
      }),
    onSuccess: () => {
      invalidateBatch();
      setTempC('');
      setPh('');
      setDissolvedO2('');
    },
  });

  const samplingMut = useMutation({
    mutationFn: () =>
      addSampling(id!, {
        sampledAt: new Date(),
        sampleCount: Number(sampleCount),
        totalWeightGrams: Number(totalWeightGrams),
        estimatedCount: estimatedCount ? Number(estimatedCount) : undefined,
      }),
    onSuccess: () => {
      invalidateBatch();
      setSampleCount('10');
      setTotalWeightGrams('');
      setEstimatedCount('');
    },
  });

  const harvestMut = useMutation({
    mutationFn: () =>
      addHarvest(id!, {
        quantityKg: Number(harvestKg),
        fishCount: harvestFishCount ? Number(harvestFishCount) : undefined,
        quality: harvestQuality,
        occurredAt: new Date(),
      }),
    onSuccess: () => {
      invalidateBatch();
      setHarvestKg('');
      setHarvestFishCount('');
    },
  });

  if (batchQ.isLoading) return <LoadingState />;
  if (batchQ.isError || !batchQ.data) {
    return <ErrorState onRetry={() => void batchQ.refetch()} />;
  }

  const b = batchQ.data;
  const back =
    b.kind === 'POULTRY' ? '/groups' : b.kind === 'FISH' ? '/fish' : '/batches';
  const feedItems = (feedItemsQ.data?.items ?? []).filter((i) => i.category === 'FEED');

  return (
    <div>
      <Link to={back} className="back-link">
        ←{' '}
        {t(
          `nav.${b.kind === 'POULTRY' ? 'groups' : b.kind === 'FISH' ? 'fish' : 'batches'}`,
        )}
      </Link>
      <div className="animal-hero">
        <div style={{ width: '100%' }}>
          <div className="page-header" style={{ marginBottom: 0, alignItems: 'flex-end' }}>
            <div>
              <h1>{b.name}</h1>
              <div className="chip-row">
                <span
                  className="meta-pill"
                  style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
                >
                  {b.category}
                </span>
                <span
                  className="meta-pill"
                  style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
                >
                  {ageLabel(b.ageFromMonths, b.ageToMonths, t)}
                </span>
              </div>
            </div>
            <div className="page-actions">
              <Link className="btn secondary" to={`/scan/b/${b.id}`}>
                {t('qr.openScan')}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <span className="stat-label">{t('batches.current')}</span>
          <span className="stat-value">{b.currentCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t('batches.sick')}</span>
          <span className="stat-value">{b.sickCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t('batches.dead')}</span>
          <span className="stat-value">{b.deadCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t('batches.initial')}</span>
          <span className="stat-value">{b.initialCount}</span>
        </div>
        {economicsQ.data && (
          <>
            <div className="stat-card">
              <span className="stat-label">{t('qr.invested')}</span>
              <span className="stat-value">{formatNPR(economicsQ.data.investedTotal)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t('qr.earned')}</span>
              <span className="stat-value">{formatNPR(economicsQ.data.earnedTotal)}</span>
            </div>
          </>
        )}
      </div>

      <div className="detail-grid">
        <div className="card">
          <h2>{t('batches.sickByCondition')}</h2>
          {Object.keys(b.sickByCondition).length === 0 ? (
            <p className="muted">{t('common.empty')}</p>
          ) : (
            <ul className="bar-list">
              {Object.entries(b.sickByCondition).map(([cond, n]) => (
                <li key={cond}>
                  <div className="bar-meta">
                    <span>
                      {ILLNESS_CONDITION_LABEL[cond as IllnessCondition] ?? cond}
                    </span>
                    <span>{n}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {can('animals:write') && (
            <form
              className="inline-form"
              style={{ flexWrap: 'wrap', marginTop: 16 }}
              onSubmit={(e) => {
                e.preventDefault();
                illnessMut.mutate();
              }}
            >
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as IllnessCondition)}
              >
                {ILLNESS_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {ILLNESS_CONDITION_LABEL[c]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={sickCount}
                onChange={(e) => setSickCount(e.target.value)}
                aria-label={t('batches.howManySick')}
              />
              <button className="btn" type="submit">
                {t('batches.logSick')}
              </button>
            </form>
          )}

          <h3 style={{ marginTop: 24 }}>{t('batches.illnessHistory')}</h3>
          {illnessQ.data && illnessQ.data.length > 0 ? (
            <ul className="activity-list">
              {illnessQ.data.map((e) => (
                <li key={e.id}>
                  <div>
                    <strong>
                      {ILLNESS_CONDITION_LABEL[e.condition as IllnessCondition] ??
                        e.condition}
                    </strong>
                    <span className="muted"> · {e.count}</span>
                  </div>
                  <span className="muted">
                    {new Date(e.occurredAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('common.empty')}</p>
          )}
        </div>

        <QrPrintCard
          title={b.name}
          subtitle={`${b.kind} · ${b.category}`}
          url={batchScanUrl(b.id)}
        />

        <div className="card">
          <h2>{t('batches.deaths')}</h2>
          {can('animals:write') && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mortalityMut.mutate();
              }}
            >
              <div className="field">
                <label htmlFor="dead-count">{t('batches.howManyDied')}</label>
                <input
                  id="dead-count"
                  type="number"
                  min={1}
                  value={deadCount}
                  onChange={(e) => setDeadCount(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="dead-reason">{t('batches.reason')}</label>
                <input
                  id="dead-reason"
                  value={deadReason}
                  onChange={(e) => setDeadReason(e.target.value)}
                />
              </div>
              <button className="btn" type="submit">
                {t('batches.logDeath')}
              </button>
            </form>
          )}
          <h3 style={{ marginTop: 24 }}>{t('batches.mortalityHistory')}</h3>
          {mortalityQ.data && mortalityQ.data.length > 0 ? (
            <ul className="activity-list">
              {mortalityQ.data.map((e) => (
                <li key={e.id}>
                  <div>
                    <strong>{e.count}</strong>
                    <span className="muted"> · {e.reason ?? '—'}</span>
                  </div>
                  <span className="muted">
                    {new Date(e.occurredAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('common.empty')}</p>
          )}

          {b.kind === 'LIVESTOCK' && (
            <p style={{ marginTop: 24 }}>
              <Link className="link-strong" to="/animals">
                {t('batches.breedingStockLink')}
              </Link>
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>{t('batches.feed')}</h2>
        {can('animals:write') && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              feedMut.mutate();
            }}
          >
            <div className="form-grid">
              <div className="field">
                <label htmlFor="feed-qty">{t('batches.quantityKg')}</label>
                <input
                  id="feed-qty"
                  type="number"
                  min={0.01}
                  step={0.01}
                  required
                  value={feedQty}
                  onChange={(e) => setFeedQty(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="feed-type">{t('batches.feedType')}</label>
                <input
                  id="feed-type"
                  value={feedType}
                  onChange={(e) => setFeedType(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="feed-inv">{t('batches.feedInventory')}</label>
                <select
                  id="feed-inv"
                  value={feedInventoryId}
                  onChange={(e) => setFeedInventoryId(e.target.value)}
                >
                  <option value="">{t('batches.noInventoryItem')}</option>
                  {feedItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.currentStock} {item.unit})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button className="btn" type="submit" disabled={feedMut.isPending}>
              {t('batches.logFeed')}
            </button>
          </form>
        )}
        <h3 style={{ marginTop: 24 }}>{t('batches.feedHistory')}</h3>
        {feedQ.data && feedQ.data.length > 0 ? (
          <ul className="activity-list">
            {feedQ.data.map((e) => (
              <li key={e.id}>
                <div>
                  <strong>
                    {e.quantityKg} kg
                  </strong>
                  <span className="muted"> · {e.feedType ?? '—'}</span>
                </div>
                <span className="muted">
                  {new Date(e.occurredAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('common.empty')}</p>
        )}
      </div>

      {b.kind === 'FISH' && (
        <div className="detail-grid" style={{ marginTop: 24 }}>
          <div className="card">
            <h2>{t('batches.waterQuality')}</h2>
            {can('animals:write') && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  waterMut.mutate();
                }}
              >
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="wq-temp">{t('batches.temperature')}</label>
                    <input
                      id="wq-temp"
                      type="number"
                      step={0.1}
                      value={tempC}
                      onChange={(e) => setTempC(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="wq-ph">{t('batches.ph')}</label>
                    <input
                      id="wq-ph"
                      type="number"
                      step={0.1}
                      value={ph}
                      onChange={(e) => setPh(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="wq-do">{t('batches.dissolvedO2')}</label>
                    <input
                      id="wq-do"
                      type="number"
                      step={0.1}
                      value={dissolvedO2}
                      onChange={(e) => setDissolvedO2(e.target.value)}
                    />
                  </div>
                </div>
                <button className="btn" type="submit" disabled={waterMut.isPending}>
                  {t('batches.logWaterQuality')}
                </button>
              </form>
            )}
            <h3 style={{ marginTop: 24 }}>{t('batches.waterQualityHistory')}</h3>
            {waterQ.data && waterQ.data.length > 0 ? (
              <ul className="activity-list">
                {waterQ.data.map((e) => (
                  <li key={e.id}>
                    <div>
                      <strong>
                        {e.temperatureC ?? '—'}°C · pH {e.ph ?? '—'} · DO{' '}
                        {e.dissolvedO2 ?? '—'}
                      </strong>
                    </div>
                    <span className="muted">
                      {new Date(e.recordedAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('common.empty')}</p>
            )}
          </div>

          <div className="card">
            <h2>{t('batches.sampling')}</h2>
            {can('animals:write') && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  samplingMut.mutate();
                }}
              >
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="sample-count">{t('batches.sampleCount')}</label>
                    <input
                      id="sample-count"
                      type="number"
                      min={1}
                      required
                      value={sampleCount}
                      onChange={(e) => setSampleCount(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="sample-weight">{t('batches.totalWeightGrams')}</label>
                    <input
                      id="sample-weight"
                      type="number"
                      min={0.01}
                      step={0.01}
                      required
                      value={totalWeightGrams}
                      onChange={(e) => setTotalWeightGrams(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="sample-est">{t('batches.estimatedCount')}</label>
                    <input
                      id="sample-est"
                      type="number"
                      min={1}
                      value={estimatedCount}
                      onChange={(e) => setEstimatedCount(e.target.value)}
                    />
                  </div>
                </div>
                <button className="btn" type="submit" disabled={samplingMut.isPending}>
                  {t('batches.logSampling')}
                </button>
              </form>
            )}
            <h3 style={{ marginTop: 24 }}>{t('batches.samplingHistory')}</h3>
            {samplingQ.data && samplingQ.data.length > 0 ? (
              <ul className="activity-list">
                {samplingQ.data.map((e) => (
                  <li key={e.id}>
                    <div>
                      <strong>
                        {e.sampleCount} · {e.totalWeightGrams}g · avg{' '}
                        {e.avgWeightGrams}g
                      </strong>
                    </div>
                    <span className="muted">
                      {new Date(e.sampledAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('common.empty')}</p>
            )}
          </div>

          <div className="card">
            <h2>{t('batches.harvest')}</h2>
            {can('animals:write') && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  harvestMut.mutate();
                }}
              >
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="harvest-kg">{t('batches.quantityKg')}</label>
                    <input
                      id="harvest-kg"
                      type="number"
                      min={0.01}
                      step={0.01}
                      required
                      value={harvestKg}
                      onChange={(e) => setHarvestKg(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="harvest-count">{t('batches.fishCount')}</label>
                    <input
                      id="harvest-count"
                      type="number"
                      min={1}
                      value={harvestFishCount}
                      onChange={(e) => setHarvestFishCount(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="harvest-quality">{t('batches.quality')}</label>
                    <select
                      id="harvest-quality"
                      value={harvestQuality}
                      onChange={(e) =>
                        setHarvestQuality(
                          e.target.value as (typeof QUALITY_GRADES_FISH)[number],
                        )
                      }
                    >
                      {QUALITY_GRADES_FISH.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button className="btn" type="submit" disabled={harvestMut.isPending}>
                  {t('batches.logHarvest')}
                </button>
              </form>
            )}
            <h3 style={{ marginTop: 24 }}>{t('batches.harvestHistory')}</h3>
            {harvestQ.data && harvestQ.data.length > 0 ? (
              <ul className="activity-list">
                {harvestQ.data.map((e) => (
                  <li key={e.id}>
                    <div>
                      <strong>
                        {e.quantityKg} kg
                      </strong>
                      <span className="muted">
                        {' '}
                        · {e.fishCount ?? '—'} · {e.quality ?? '—'}
                      </span>
                    </div>
                    <span className="muted">
                      {new Date(e.occurredAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('common.empty')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
