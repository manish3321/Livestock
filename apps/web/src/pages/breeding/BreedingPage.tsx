import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  MATING_TYPES,
  PREGNANCY_STATUSES,
  formatDate,
  type BreedingCreate,
  type BreedingUpdate,
  type HeatCreate,
} from '@farm/contracts';
import { listAnimals } from '../../api/animals';
import {
  createBreeding,
  createHeat,
  listBreeding,
  listHeat,
  updateBreeding,
  type BreedingDto,
} from '../../api/breeding';
import { useAuth } from '../../auth/auth-context';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';
import { useFarmMode } from '../../hooks/useFarmMode';

export function BreedingPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { commercial } = useFarmMode();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [deliveryId, setDeliveryId] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [offspringTag, setOffspringTag] = useState('');
  const [calvingDifficulty, setCalvingDifficulty] = useState('');
  const [colostrumFed, setColostrumFed] = useState(true);
  const [colostrumWithin4h, setColostrumWithin4h] = useState(true);
  const [colostrumLiters, setColostrumLiters] = useState('');
  const [showHeat, setShowHeat] = useState(false);
  const [heatForm, setHeatForm] = useState<Partial<HeatCreate>>({
    intensity: 'MEDIUM',
    observedAt: new Date(),
  });
  const [form, setForm] = useState<Partial<BreedingCreate>>({
    matingType: 'NATURAL',
    pregnancyStatus: 'PREGNANT',
    matingDate: new Date(),
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const animalId = searchParams.get('animalId') ?? undefined;
    if (animalId) {
      setShowForm(true);
      setForm((prev) => ({ ...prev, motherId: animalId }));
      setHeatForm((prev) => ({ ...prev, animalId }));
    }
  }, [searchParams]);

  const query = useQuery({
    queryKey: ['breeding', searchParams.get('animalId')],
    queryFn: () =>
      listBreeding({
        pageSize: 100,
        motherId: searchParams.get('animalId') || undefined,
      }),
  });

  const heatQ = useQuery({
    queryKey: ['breeding', 'heat', searchParams.get('animalId')],
    queryFn: () => listHeat(searchParams.get('animalId') || undefined),
  });

  const heatSave = useMutation({
    mutationFn: () =>
      createHeat({
        animalId: heatForm.animalId!,
        observedAt: heatForm.observedAt ?? new Date(),
        intensity: heatForm.intensity ?? 'MEDIUM',
        observerName: heatForm.observerName,
        signs: heatForm.signs,
        notes: heatForm.notes,
      }),
    onSuccess: () => {
      setShowHeat(false);
      setHeatForm({ intensity: 'MEDIUM', observedAt: new Date() });
      void qc.invalidateQueries({ queryKey: ['breeding', 'heat'] });
    },
  });

  const mothers = useQuery({
    queryKey: ['animals', 'females'],
    queryFn: () => listAnimals({ gender: 'FEMALE', pageSize: 200 }),
    enabled: showForm || showHeat,
  });

  const save = useMutation({
    mutationFn: () =>
      createBreeding({
        motherId: form.motherId!,
        matingType: form.matingType!,
        fatherTagOrAi: form.fatherTagOrAi,
        matingDate: form.matingDate ?? new Date(),
        pregnancyStatus: form.pregnancyStatus ?? 'PREGNANT',
        notes: form.notes,
      }),
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setForm({
        matingType: 'NATURAL',
        pregnancyStatus: 'PREGNANT',
        matingDate: new Date(),
      });
      void qc.invalidateQueries({ queryKey: ['breeding'] });
      void qc.invalidateQueries({ queryKey: ['breeding', 'mother'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const delivery = useMutation({
    mutationFn: ({ id, body }: { id: string; body: BreedingUpdate }) =>
      updateBreeding(id, body),
    onSuccess: () => {
      setDeliveryId(null);
      setBirthDate('');
      setOffspringTag('');
      void qc.invalidateQueries({ queryKey: ['breeding'] });
      void qc.invalidateQueries({ queryKey: ['breeding', 'mother'] });
    },
  });

  const columns = useMemo<Column<BreedingDto>[]>(
    () => [
      {
        key: 'mother',
        header: t('breeding.mother'),
        render: (row) => row.motherTag ?? row.motherId,
      },
      {
        key: 'mating',
        header: t('breeding.matingType'),
        render: (row) => row.matingType,
      },
      {
        key: 'mated',
        header: t('breeding.matingDate'),
        render: (row) => formatDate(row.matingDate),
      },
      {
        key: 'due',
        header: t('breeding.dueDate'),
        render: (row) => formatDate(row.dueDate),
      },
      {
        key: 'days',
        header: t('breeding.daysRemaining'),
        render: (row) => {
          const days =
            row.daysRemaining ??
            Math.ceil(
              (new Date(row.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            );
          return days;
        },
      },
      ...(commercial
        ? ([
            {
              key: 'open',
              header: t('breeding.daysOpen'),
              render: (row: BreedingDto) => row.daysOpen ?? '—',
            },
            {
              key: 'interval',
              header: t('breeding.calvingInterval'),
              render: (row: BreedingDto) => row.calvingIntervalDays ?? '—',
            },
            {
              key: 'repeat',
              header: t('breeding.repeatBreeder'),
              render: (row: BreedingDto) =>
                row.repeatBreeder ? t('common.yes') : t('common.no'),
            },
          ] as Column<BreedingDto>[])
        : []),
      {
        key: 'status',
        header: t('breeding.status'),
        render: (row) => (
          <StatusChip
            status={row.pregnancyStatus === 'FAILED' ? 'SICK' : 'PREGNANT'}
            label={row.pregnancyStatus}
          />
        ),
      },
      {
        key: 'actions',
        header: t('common.actions'),
        render: (row) =>
          can('breeding:write') &&
          row.pregnancyStatus !== 'DELIVERED' &&
          row.pregnancyStatus !== 'FAILED' ? (
            deliveryId === row.id ? (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  delivery.mutate({
                    id: row.id,
                    body: {
                      pregnancyStatus: 'DELIVERED',
                      birthDate: birthDate ? new Date(birthDate) : new Date(),
                      offspringTag: offspringTag || undefined,
                      calvingDifficulty: (calvingDifficulty ||
                        undefined) as BreedingUpdate['calvingDifficulty'],
                      ...(commercial
                        ? {
                            colostrumFed,
                            colostrumWithin4h,
                            colostrumLiters: colostrumLiters
                              ? Number(colostrumLiters)
                              : undefined,
                          }
                        : {}),
                    },
                  });
                }}
              >
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                />
                <input
                  placeholder={t('breeding.offspringTag')}
                  value={offspringTag}
                  onChange={(e) => setOffspringTag(e.target.value)}
                />
                <select
                  value={calvingDifficulty}
                  onChange={(e) => setCalvingDifficulty(e.target.value)}
                  aria-label={t('breeding.calvingDifficulty')}
                >
                  <option value="">{t('breeding.calvingDifficulty')}</option>
                  {(['EASY', 'ASSISTED', 'EMERGENCY', 'STILLBIRTH'] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`enum.calvingDifficulty.${v}`)}
                    </option>
                  ))}
                </select>
                {commercial && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={colostrumFed}
                        onChange={(e) => setColostrumFed(e.target.checked)}
                      />
                      {t('breeding.colostrumFed')}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={colostrumWithin4h}
                        onChange={(e) => setColostrumWithin4h(e.target.checked)}
                      />
                      {t('breeding.colostrumWithin4h')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder={t('breeding.colostrumLiters')}
                      value={colostrumLiters}
                      onChange={(e) => setColostrumLiters(e.target.value)}
                    />
                  </>
                )}
                <button className="btn" type="submit" disabled={delivery.isPending}>
                  {t('common.save')}
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => setDeliveryId(null)}
                >
                  {t('common.cancel')}
                </button>
              </form>
            ) : (
              <button className="btn secondary" type="button" onClick={() => setDeliveryId(row.id)}>
                {t('breeding.updateDelivery')}
              </button>
            )
          ) : (
            '—'
          ),
      },
    ],
    [
      t,
      can,
      commercial,
      deliveryId,
      birthDate,
      offspringTag,
      calvingDifficulty,
      colostrumFed,
      colostrumWithin4h,
      colostrumLiters,
      delivery.isPending,
    ],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.motherId) {
      setError(t('breeding.requiredFields'));
      return;
    }
    save.mutate();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.breeding')}</h1>
          <p className="page-subtitle">{t('breeding.subtitle')}</p>
          <p className="muted" style={{ marginTop: 8 }}>
            {t('breeding.parentsOnly')}{' '}
            <Link className="link-strong" to="/animals/stock">
              {t('breeding.manageStock')}
            </Link>
          </p>
        </div>
        {can('breeding:write') && (
          <div className="page-actions">
            <button className="btn secondary" type="button" onClick={() => setShowHeat((v) => !v)}>
              {showHeat ? t('common.cancel') : t('breeding.logHeat')}
            </button>
            <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? t('common.cancel') : t('breeding.add')}
            </button>
          </div>
        )}
      </div>

      {showHeat && (
        <form
          className="card form-card"
          style={{ marginBottom: 24 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!heatForm.animalId) return;
            heatSave.mutate();
          }}
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="heat-animal">{t('breeding.mother')}</label>
              <select
                id="heat-animal"
                required
                value={heatForm.animalId ?? ''}
                onChange={(e) =>
                  setHeatForm((p) => ({ ...p, animalId: e.target.value || undefined }))
                }
              >
                <option value="">{t('breeding.selectMother')}</option>
                {(mothers.data?.items ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag}
                    {a.name ? ` · ${a.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {commercial && (
              <>
                <div className="field">
                  <label htmlFor="heat-int">{t('breeding.intensity')}</label>
                  <select
                    id="heat-int"
                    value={heatForm.intensity ?? 'MEDIUM'}
                    onChange={(e) =>
                      setHeatForm((p) => ({
                        ...p,
                        intensity: e.target.value as HeatCreate['intensity'],
                      }))
                    }
                  >
                    {(['WEAK', 'MEDIUM', 'STRONG'] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`enum.heatIntensity.${v}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="heat-obs">{t('breeding.observerName')}</label>
                  <input
                    id="heat-obs"
                    value={heatForm.observerName ?? ''}
                    onChange={(e) =>
                      setHeatForm((p) => ({
                        ...p,
                        observerName: e.target.value || undefined,
                      }))
                    }
                  />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="heat-date">{t('common.date')}</label>
              <input
                id="heat-date"
                type="date"
                value={toDateInput(heatForm.observedAt)}
                onChange={(e) =>
                  setHeatForm((p) => ({
                    ...p,
                    observedAt: e.target.value ? new Date(e.target.value) : new Date(),
                  }))
                }
              />
            </div>
          </div>
          <div className="page-actions">
            <button className="btn" type="submit" disabled={heatSave.isPending}>
              {t('common.save')}
            </button>
          </div>
        </form>
      )}

      {showForm && (
        <form className="card form-card" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="br-mother">{t('breeding.mother')}</label>
              <select
                id="br-mother"
                required
                value={form.motherId ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, motherId: e.target.value || undefined }))
                }
              >
                <option value="">{t('breeding.selectMother')}</option>
                {(mothers.data?.items ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag}
                    {a.name ? ` · ${a.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="br-type">{t('breeding.matingType')}</label>
              <select
                id="br-type"
                value={form.matingType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    matingType: e.target.value as BreedingCreate['matingType'],
                  }))
                }
              >
                {MATING_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="br-father">{t('breeding.fatherTagOrAi')}</label>
              <input
                id="br-father"
                value={form.fatherTagOrAi ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    fatherTagOrAi: e.target.value || undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="br-date">{t('breeding.matingDate')}</label>
              <input
                id="br-date"
                type="date"
                required
                value={toDateInput(form.matingDate)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    matingDate: e.target.value ? new Date(e.target.value) : new Date(),
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="br-status">{t('breeding.status')}</label>
              <select
                id="br-status"
                value={form.pregnancyStatus ?? 'PREGNANT'}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    pregnancyStatus: e.target.value as BreedingCreate['pregnancyStatus'],
                  }))
                }
              >
                {PREGNANCY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
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
          {(() => {
            const items = query.data.items;
            const delivered = items.filter((r) => r.pregnancyStatus === 'DELIVERED').length;
            const failed = items.filter((r) => r.pregnancyStatus === 'FAILED').length;
            const denom = delivered + failed;
            const rate = denom > 0 ? Math.round((delivered / denom) * 100) : null;
            return (
              <p className="result-count">
                {t('common.resultCount', { count: query.data.total })}
                {rate != null && (
                  <>
                    {' · '}
                    {t('breeding.successRate')}: {rate}% ({delivered}/{denom})
                  </>
                )}
              </p>
            );
          })()}
          <DataTable columns={columns} rows={query.data.items} rowKey={(r) => r.id} />
          {heatQ.data && heatQ.data.items.length > 0 && (
            <div className="card" style={{ marginTop: 24 }}>
              <h2>{t('breeding.heatLog')}</h2>
              <ul className="activity-list">
                {heatQ.data.items.map((row) => (
                  <li key={row.id}>
                    <div>
                      <strong>{row.animalTag ?? row.animalId}</strong>
                      <span className="muted">
                        {' · '}
                        {t(`enum.heatIntensity.${row.intensity}`)}
                      </span>
                    </div>
                    <span className="muted">{formatDate(row.observedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
