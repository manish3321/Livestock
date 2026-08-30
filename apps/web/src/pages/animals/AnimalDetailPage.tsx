import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ANIMAL_SOURCES,
  ANIMAL_STATUS_LABEL,
  ANIMAL_STATUSES,
  GENDERS,
  SPECIES,
  SPECIES_LABEL,
  SPECIES_TAG_PREFIX,
  formatDate,
  formatNPR,
  type AnimalCreate,
  type AnimalSource,
  type AnimalStatus,
  type Gender,
  type Species,
} from '@farm/contracts';
import { useAuth } from '../../auth/auth-context';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';
import { useFarmMode } from '../../hooks/useFarmMode';
import {
  addWeight,
  createAnimal,
  deleteAnimal,
  getAnimal,
  getAnimalEconomics,
  getAnimalProductionStats,
  listAnimals,
  updateAnimal,
  uploadAnimalPhoto,
} from '../../api/animals';
import { listBreeding } from '../../api/breeding';
import { QrPrintCard } from '../../components/QrPrintCard';
import { animalScanUrl } from '../../lib/qr';

export function AnimalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { can } = useAuth();
  const { commercial } = useFarmMode();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [weightKg, setWeightKg] = useState('');
  const [bcs, setBcs] = useState('');
  const [weightError, setWeightError] = useState(false);

  const query = useQuery({
    queryKey: ['animal', id],
    queryFn: () => getAnimal(id!),
    enabled: Boolean(id),
  });

  const economicsQ = useQuery({
    queryKey: ['animal', id, 'economics'],
    queryFn: () => getAnimalEconomics(id!),
    enabled: Boolean(id),
  });

  const breedingQ = useQuery({
    queryKey: ['breeding', 'mother', id],
    queryFn: () => listBreeding({ motherId: id!, pageSize: 50 }),
    enabled: Boolean(id) && can('breeding:read'),
  });

  const statsQ = useQuery({
    queryKey: ['animal', id, 'production-stats'],
    queryFn: () => getAnimalProductionStats(id!),
    enabled: Boolean(id),
  });

  const photoMut = useMutation({
    mutationFn: (file: File) => uploadAnimalPhoto(id!, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['animal', id] });
    },
  });

  const weightMutation = useMutation({
    mutationFn: () =>
      addWeight(id!, {
        weightKg: Number(weightKg),
        recordedAt: new Date(),
        bcs: bcs ? Number(bcs) : undefined,
      }),
    onSuccess: () => {
      setWeightKg('');
      setBcs('');
      setWeightError(false);
      void qc.invalidateQueries({ queryKey: ['animal', id] });
      void qc.invalidateQueries({ queryKey: ['animals'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAnimal(id!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['animals'] });
      navigate('/animals/stock');
    },
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) {
    return <ErrorState onRetry={() => void query.refetch()} />;
  }

  const animal = query.data;

  return (
    <div>
      <Link to="/animals/stock" className="back-link">
        ← {t('batches.breedingStock')}
      </Link>
      <div className="animal-hero" data-species={animal.species}>
        <div style={{ width: '100%' }}>
          <div className="page-header" style={{ marginBottom: 0, alignItems: 'flex-end' }}>
            <div>
              <h1>
                {animal.name?.trim() || SPECIES_LABEL[animal.species]}{' '}
                <span style={{ opacity: 0.9 }}>#{animal.tag}</span>
              </h1>
              <div className="chip-row">
                <StatusChip
                  status={animal.status}
                  label={t(`enum.animalStatus.${animal.status}`, {
                    defaultValue: ANIMAL_STATUS_LABEL[animal.status],
                  })}
                />
                <span className="meta-pill" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
                  {SPECIES_LABEL[animal.species]}
                </span>
                <span className="meta-pill" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
                  {animal.breed}
                </span>
              </div>
            </div>
            <div className="page-actions">
              <Link className="btn secondary" to={`/scan/a/${animal.id}`}>
                {t('qr.openScan')}
              </Link>
              {can('animals:write') && (
                <Link className="btn secondary" to={`/animals/stock/${animal.id}/edit`}>
                  {t('common.edit')}
                </Link>
              )}
              {can('animals:delete') && (
                <button
                  className="btn secondary danger"
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('animals.confirmDelete'))) {
                      deleteMutation.mutate();
                    }
                  }}
                >
                  {t('common.delete')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {economicsQ.data && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <span className="stat-label">{t('qr.invested')}</span>
            <span className="stat-value">{formatNPR(economicsQ.data.investedTotal)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t('qr.earned')}</span>
            <span className="stat-value">{formatNPR(economicsQ.data.earnedTotal)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t('qr.net')}</span>
            <span className="stat-value">{formatNPR(economicsQ.data.net)}</span>
          </div>
        </div>
      )}

      {statsQ.data && statsQ.data.milkEntryCount > 0 && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <span className="stat-label">{t('animals.milkAverage')}</span>
            <span className="stat-value">{statsQ.data.milkAverage.toFixed(1)} L</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t('animals.herdAverage')}</span>
            <span className="stat-value">{statsQ.data.herdAverage.toFixed(1)} L</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t('animals.milkTotal')}</span>
            <span className="stat-value">{statsQ.data.milkTotalLiters.toFixed(1)} L</span>
          </div>
        </div>
      )}

      <div className="detail-grid">
        <div className="card">
          <h2>{t('animals.basicInfo')}</h2>
          <AnimalPhoto animalId={animal.id} photoUrl={animal.photoUrl} />
          {can('animals:write') && (
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="animal-photo">{t('animals.photo')}</label>
              <input
                id="animal-photo"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) photoMut.mutate(file);
                }}
              />
            </div>
          )}
          <dl className="info-grid">
            <div>
              <dt>{t('animals.gender')}</dt>
              <dd>{animal.gender}</dd>
            </div>
            <div>
              <dt>{t('animals.color')}</dt>
              <dd>{animal.color ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('animals.source')}</dt>
              <dd>{animal.source ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('animals.motherTag')}</dt>
              <dd>{animal.damTag ?? animal.motherTag ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('animals.sireTag')}</dt>
              <dd>{animal.sireTag ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('animals.shed')}</dt>
              <dd>{animal.shed ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('animals.dateOfBirth')}</dt>
              <dd>{animal.dateOfBirth ? formatDate(animal.dateOfBirth) : '—'}</dd>
            </div>
            <div>
              <dt>{t('animals.purchaseDate')}</dt>
              <dd>{animal.purchaseDate ? formatDate(animal.purchaseDate) : '—'}</dd>
            </div>
            <div>
              <dt>{t('animals.purchaseCost')}</dt>
              <dd>
                {animal.purchaseCost != null ? formatNPR(animal.purchaseCost) : '—'}
              </dd>
            </div>
            <div>
              <dt>{t('animals.breedingStock')}</dt>
              <dd>{animal.breedingStock ? t('common.yes') : t('common.no')}</dd>
            </div>
            <div>
              <dt>{t('animals.weight')}</dt>
              <dd>
                {animal.currentWeightKg != null ? `${animal.currentWeightKg} kg` : '—'}
              </dd>
            </div>
          </dl>
          {animal.notes && (
            <>
              <h3>{t('animals.notes')}</h3>
              <p className="notes">{animal.notes}</p>
            </>
          )}
        </div>

        <QrPrintCard
          title={`${animal.tag}${animal.name ? ` · ${animal.name}` : ''}`}
          subtitle={SPECIES_LABEL[animal.species]}
          url={animalScanUrl(animal.id)}
        />

        <div className="card">
          <h2>{t('animals.weightHistory')}</h2>
          {can('animals:write') && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!weightKg || Number(weightKg) <= 0) {
                  setWeightError(true);
                  return;
                }
                weightMutation.mutate();
              }}
            >
              <input
                type="number"
                step="0.1"
                min="0.1"
                placeholder={t('animals.weightKg')}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
              {commercial && (
                <input
                  type="number"
                  min="1"
                  max="5"
                  placeholder={t('animals.bcs')}
                  value={bcs}
                  onChange={(e) => setBcs(e.target.value)}
                />
              )}
              <button className="btn" type="submit" disabled={weightMutation.isPending}>
                {t('animals.addWeight')}
              </button>
            </form>
          )}
          {weightError && <p className="error-text">{t('animals.weightRequired')}</p>}
          {animal.weights.length === 0 ? (
            <p className="muted">{t('common.empty')}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('animals.date')}</th>
                  <th>{t('animals.weight')}</th>
                  {commercial && <th>{t('animals.bcs')}</th>}
                  <th>{t('animals.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {animal.weights.map((w) => (
                  <tr key={w.id}>
                    <td>{formatDate(w.recordedAt)}</td>
                    <td>{w.weightKg} kg</td>
                    {commercial && <td>{w.bcs ?? '—'}</td>}
                    <td>{w.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {can('breeding:read') && (
          <div className="card">
            <div className="page-header" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>{t('animals.breedingHistory')}</h2>
              {can('breeding:write') && animal.gender === 'FEMALE' && (
                <Link className="btn secondary" to={`/breeding?animalId=${animal.id}`}>
                  {t('breeding.add')}
                </Link>
              )}
            </div>
            {!animal.breedingStock && (
              <p className="muted">{t('animals.notBreedingStock')}</p>
            )}
            {breedingQ.isLoading && <LoadingState />}
            {breedingQ.isError && (
              <ErrorState onRetry={() => void breedingQ.refetch()} />
            )}
            {breedingQ.data && breedingQ.data.items.length === 0 && (
              <p className="muted">{t('animals.noBreedingRecords')}</p>
            )}
            {breedingQ.data && breedingQ.data.items.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('breeding.matingType')}</th>
                    <th>{t('breeding.matingDate')}</th>
                    <th>{t('breeding.dueDate')}</th>
                    <th>{t('breeding.daysRemaining')}</th>
                    <th>{t('breeding.status')}</th>
                    <th>{t('breeding.offspringTag')}</th>
                    <th>{t('breeding.fatherTagOrAi')}</th>
                  </tr>
                </thead>
                <tbody>
                  {breedingQ.data.items.map((row) => {
                    const days =
                      row.daysRemaining ??
                      Math.ceil(
                        (new Date(row.dueDate).getTime() - Date.now()) /
                          (1000 * 60 * 60 * 24),
                      );
                    return (
                      <tr key={row.id}>
                        <td>{row.matingType}</td>
                        <td>{formatDate(row.matingDate)}</td>
                        <td>{formatDate(row.dueDate)}</td>
                        <td>
                          {row.pregnancyStatus === 'DELIVERED' ||
                          row.pregnancyStatus === 'FAILED'
                            ? '—'
                            : days}
                        </td>
                        <td>
                          <StatusChip
                            status={
                              row.pregnancyStatus === 'FAILED' ? 'SICK' : 'PREGNANT'
                            }
                            label={row.pregnancyStatus}
                          />
                        </td>
                        <td>{row.offspringTag ?? '—'}</td>
                        <td>{row.fatherTagOrAi ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p style={{ marginTop: 12 }}>
              <Link to={`/breeding?animalId=${animal.id}`}>{t('animals.openBreeding')}</Link>
            </p>
          </div>
        )}

        {statsQ.data && statsQ.data.last30Days.length > 0 && (
          <div className="card">
            <h2>{t('animals.lactationTrend')}</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('production.quantity')}</th>
                  <th>{t('production.fatPercent')}</th>
                  <th>{t('production.scc')}</th>
                </tr>
              </thead>
              <tbody>
                {statsQ.data.last30Days.map((row) => (
                  <tr key={row.date}>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.quantity}</td>
                    <td>{row.fatPercent ?? '—'}</td>
                    <td>{row.scc ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function AnimalFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { commercial } = useFarmMode();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const existing = useQuery({
    queryKey: ['animal', id],
    queryFn: () => getAnimal(id!),
    enabled: mode === 'edit' && Boolean(id),
  });

  const [form, setForm] = useState<Partial<AnimalCreate>>({
    species: 'BUFFALO',
    gender: 'FEMALE',
    status: 'ACTIVE',
    breedingStock: true,
    tag: 'BUF001',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'edit' && existing.data) {
      const a = existing.data;
      setForm({
        tag: a.tag,
        name: a.name ?? undefined,
        species: a.species,
        breed: a.breed,
        gender: a.gender,
        color: a.color ?? undefined,
        source: a.source ?? undefined,
        motherTag: a.motherTag ?? undefined,
        status: a.status,
        breedingStock: a.breedingStock,
        notes: a.notes ?? undefined,
        purchaseCost: a.purchaseCost ?? undefined,
        dateOfBirth: a.dateOfBirth ? new Date(a.dateOfBirth) : undefined,
        purchaseDate: a.purchaseDate ? new Date(a.purchaseDate) : undefined,
        shed: a.shed ?? undefined,
        damId: a.damId ?? undefined,
        sireId: a.sireId ?? undefined,
      });
    }
  }, [mode, existing.data]);

  const species = (form.species ?? 'BUFFALO') as Species;
  const tagPrefix = SPECIES_TAG_PREFIX[species];

  const parents = useQuery({
    queryKey: ['animals', 'parents'],
    queryFn: () => listAnimals({ pageSize: 200 }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: AnimalCreate = {
        tag: form.tag!,
        name: form.name,
        species: (form.species ?? 'BUFFALO') as Species,
        breed: form.breed!,
        gender: (form.gender ?? 'FEMALE') as Gender,
        color: form.color,
        source: form.source as AnimalSource | undefined,
        motherTag: form.motherTag,
        status: (form.status ?? 'ACTIVE') as AnimalStatus,
        breedingStock: form.breedingStock ?? true,
        notes: form.notes,
        purchaseCost: form.purchaseCost,
        dateOfBirth: form.dateOfBirth,
        purchaseDate: form.purchaseDate,
        initialWeightKg: form.initialWeightKg,
        shed: form.shed,
        damId: form.damId,
        sireId: form.sireId,
      };
      if (mode === 'create') return createAnimal(payload);
      return updateAnimal(id!, payload);
    },
    onSuccess: (animal) => {
      void qc.invalidateQueries({ queryKey: ['animals'] });
      void qc.invalidateQueries({ queryKey: ['animal', animal.id] });
      navigate(`/animals/stock/${animal.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  if (mode === 'edit' && existing.isLoading) return <LoadingState />;
  if (mode === 'edit' && existing.isError) {
    return <ErrorState onRetry={() => void existing.refetch()} />;
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.tag || !form.breed) {
      setError(t('animals.requiredFields'));
      return;
    }
    setError(null);
    save.mutate();
  };

  const set = <K extends keyof AnimalCreate>(key: K, value: AnimalCreate[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/animals/stock" className="back-link">
            ← {t('batches.breedingStock')}
          </Link>
          <h1>{mode === 'create' ? t('animals.add') : t('animals.edit')}</h1>
        </div>
      </div>

      <form className="card form-card" onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="species">{t('animals.species')}</label>
            <select
              id="species"
              value={species}
              onChange={(e) => {
                const next = e.target.value as Species;
                set('species', next);
                if (!form.tag || form.tag.startsWith(tagPrefix)) {
                  set('tag', `${SPECIES_TAG_PREFIX[next]}001`);
                }
              }}
            >
              {SPECIES.map((s) => (
                <option key={s} value={s}>
                  {SPECIES_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tag">{t('animals.tag')}</label>
            <input
              id="tag"
              required
              value={form.tag ?? ''}
              placeholder={`${tagPrefix}001`}
              onChange={(e) => set('tag', e.target.value.toUpperCase())}
            />
          </div>
          <div className="field">
            <label htmlFor="name">{t('animals.name')}</label>
            <input
              id="name"
              value={form.name ?? ''}
              onChange={(e) => set('name', e.target.value || undefined)}
            />
          </div>
          <div className="field">
            <label htmlFor="breed">{t('animals.breed')}</label>
            <input
              id="breed"
              required
              value={form.breed ?? ''}
              onChange={(e) => set('breed', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="gender">{t('animals.gender')}</label>
            <select
              id="gender"
              value={form.gender ?? 'FEMALE'}
              onChange={(e) => set('gender', e.target.value as Gender)}
            >
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">{t('animals.status')}</label>
            <select
              id="status"
              value={form.status ?? 'ACTIVE'}
              onChange={(e) => set('status', e.target.value as AnimalStatus)}
            >
              {ANIMAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`enum.animalStatus.${s}`, { defaultValue: ANIMAL_STATUS_LABEL[s] })}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="color">{t('animals.color')}</label>
            <input
              id="color"
              value={form.color ?? ''}
              onChange={(e) => set('color', e.target.value || undefined)}
            />
          </div>
          <div className="field">
            <label htmlFor="source">{t('animals.source')}</label>
            <select
              id="source"
              value={form.source ?? ''}
              onChange={(e) =>
                set('source', (e.target.value || undefined) as AnimalSource | undefined)
              }
            >
              <option value="">—</option>
              {ANIMAL_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="motherTag">{t('animals.motherTag')}</label>
            <input
              id="motherTag"
              value={form.motherTag ?? ''}
              onChange={(e) => set('motherTag', e.target.value || undefined)}
            />
          </div>
          {commercial && (
            <>
              <div className="field">
                <label htmlFor="damId">{t('animals.dam')}</label>
                <select
                  id="damId"
                  value={form.damId ?? ''}
                  onChange={(e) =>
                    set('damId', (e.target.value || undefined) as AnimalCreate['damId'])
                  }
                >
                  <option value="">—</option>
                  {(parents.data?.items ?? [])
                    .filter((a) => a.gender === 'FEMALE' && a.id !== id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.tag}
                        {a.name ? ` · ${a.name}` : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sireId">{t('animals.sire')}</label>
                <select
                  id="sireId"
                  value={form.sireId ?? ''}
                  onChange={(e) =>
                    set('sireId', (e.target.value || undefined) as AnimalCreate['sireId'])
                  }
                >
                  <option value="">—</option>
                  {(parents.data?.items ?? [])
                    .filter((a) => a.gender === 'MALE' && a.id !== id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.tag}
                        {a.name ? ` · ${a.name}` : ''}
                      </option>
                    ))}
                </select>
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="shed">{t('animals.shed')}</label>
            <input
              id="shed"
              value={form.shed ?? ''}
              onChange={(e) => set('shed', e.target.value || undefined)}
            />
          </div>
          <div className="field">
            <label htmlFor="dateOfBirth">{t('animals.dateOfBirth')}</label>
            <input
              id="dateOfBirth"
              type="date"
              value={toDateInput(form.dateOfBirth)}
              onChange={(e) =>
                set('dateOfBirth', e.target.value ? new Date(e.target.value) : undefined)
              }
            />
          </div>
          <div className="field">
            <label htmlFor="purchaseDate">{t('animals.purchaseDate')}</label>
            <input
              id="purchaseDate"
              type="date"
              value={toDateInput(form.purchaseDate)}
              onChange={(e) =>
                set('purchaseDate', e.target.value ? new Date(e.target.value) : undefined)
              }
            />
          </div>
          {mode === 'create' && (
            <div className="field">
              <label htmlFor="initialWeightKg">{t('animals.weightKg')}</label>
              <input
                id="initialWeightKg"
                type="number"
                step="0.1"
                min="0.1"
                value={form.initialWeightKg ?? ''}
                onChange={(e) =>
                  set(
                    'initialWeightKg',
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="purchaseCost">{t('animals.purchaseCost')}</label>
            <input
              id="purchaseCost"
              type="number"
              min="0"
              value={form.purchaseCost ?? ''}
              onChange={(e) =>
                set('purchaseCost', e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </div>
          <div className="field">
            <label htmlFor="breedingStock">{t('animals.breedingStock')}</label>
            <select
              id="breedingStock"
              value={form.breedingStock === false ? 'no' : 'yes'}
              onChange={(e) => set('breedingStock', e.target.value === 'yes')}
            >
              <option value="yes">{t('common.yes')}</option>
              <option value="no">{t('common.no')}</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="notes">{t('animals.notes')}</label>
          <textarea
            id="notes"
            rows={3}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || undefined)}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="page-actions">
          <button className="btn secondary" type="button" onClick={() => navigate(-1)}>
            {t('common.cancel')}
          </button>
          <button className="btn" type="submit" disabled={save.isPending}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

function toDateInput(value: Date | string | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function AnimalPhoto({ animalId, photoUrl }: { animalId: string; photoUrl: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!photoUrl) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    const token = localStorage.getItem('farm.accessToken');
    void fetch(`/v1/animals/${animalId}/photo`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [animalId, photoUrl]);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 12, marginBottom: 12 }}
    />
  );
}
