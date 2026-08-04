import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ILLNESS_CONDITION_LABEL,
  ILLNESS_CONDITIONS,
  SPECIES,
  SPECIES_LABEL,
  type HerdBatchKind,
  type IllnessCondition,
} from '@farm/contracts';
import { useAuth } from '../../auth/auth-context';
import {
  addIllness,
  addMortality,
  createBatch,
  getBatch,
  listBatches,
  listIllness,
  listMortality,
} from '../../api/batches';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';

function ageLabel(from: number | null, to: number | null, t: (k: string) => string): string {
  if (from == null && to == null) return t('batches.anyAge');
  if (from != null && to != null) return `${from}–${to} ${t('batches.months')}`;
  if (from != null) return `${from}+ ${t('batches.months')}`;
  return `≤${to} ${t('batches.months')}`;
}

export function LivestockBatchesPage() {
  return <BatchKindPage kind="LIVESTOCK" titleKey="nav.animals" showBreedingStock />;
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
            <Link className="btn secondary" to="/animals/stock">
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

  const batchQ = useQuery({
    queryKey: ['batch', id],
    queryFn: () => getBatch(id!),
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

  const illnessMut = useMutation({
    mutationFn: () =>
      addIllness(id!, { condition, count: Number(sickCount), occurredAt: new Date() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['batch', id] });
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
      void qc.invalidateQueries({ queryKey: ['batch', id] });
      setDeadCount('1');
      setDeadReason('');
    },
  });

  if (batchQ.isLoading) return <LoadingState />;
  if (batchQ.isError || !batchQ.data) {
    return <ErrorState onRetry={() => void batchQ.refetch()} />;
  }

  const b = batchQ.data;
  const back =
    b.kind === 'POULTRY' ? '/groups' : b.kind === 'FISH' ? '/fish' : '/animals';

  return (
    <div>
      <Link to={back} className="back-link">
        ←{' '}
        {t(
          `nav.${b.kind === 'POULTRY' ? 'groups' : b.kind === 'FISH' ? 'fish' : 'animals'}`,
        )}
      </Link>
      <div className="animal-hero">
        <div style={{ width: '100%' }}>
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
              <Link className="link-strong" to="/animals/stock">
                {t('batches.breedingStockLink')}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
