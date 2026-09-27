import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  HEALTH_RECORD_TYPES,
  MILK_APPEARANCES,
  SYMPTOMS,
  UDDER_SIGNS,
  formatDate,
  formatNPR,
  type HealthCreate,
  type HealthListQuery,
} from '@farm/contracts';
import { ApiRequestError } from '../../api/client';
import { listAnimals } from '../../api/animals';
import { listBatches } from '../../api/batches';
import { NEPAL_VACCINE_PROTOCOLS } from '@farm/contracts';
import { listInventory } from '../../api/inventory';
import { listSpeciesConfig } from '../../api/config';
import {
  batchVaccinate,
  createHealthRecord,
  createUdderCheck,
  listHealthCalendar,
  listHealthRecords,
  recordMortality,
  type HealthRecordDto,
} from '../../api/health';
import { listActiveWithholds } from '../../api/withholds';
import { WithholdBanner } from '../../components/WithholdBanner';
import { useAuth } from '../../auth/auth-context';
import { DataTable, type Column } from '../../components/DataTable';
import { FieldError } from '../../components/FieldError';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';
import { useFarmMode } from '../../hooks/useFarmMode';
import { notFuture, required, useFieldErrors } from '../../lib/form-errors';

type DueFilter = HealthListQuery['due'];

export function HealthPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { commercial } = useFarmMode();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [due, setDue] = useState<DueFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [protocolKey, setProtocolKey] = useState('FMD');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [groupItemId, setGroupItemId] = useState('');
  const [expiredLotReason, setExpiredLotReason] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [appearance, setAppearance] = useState('NORMAL');
  const [quarters, setQuarters] = useState({ LF: 0, RF: 0, LR: 0, RR: 0 });
  const [udderSigns, setUdderSigns] = useState<string[]>([]);
  const [mortalityCause, setMortalityCause] = useState('DISEASE');
  const [form, setForm] = useState<Partial<HealthCreate>>({
    type: (searchParams.get('type') as HealthCreate['type']) || 'VACCINATION',
    performedAt: new Date(),
    frequencyPerDay: 2,
  });
  const [error, setError] = useState<string | null>(null);
  const { errors: fieldErrors, validate, clearField, fieldProps } = useFieldErrors('health');

  useEffect(() => {
    const animalId = searchParams.get('animalId') ?? undefined;
    const herdBatchId = searchParams.get('herdBatchId') ?? undefined;
    const type = searchParams.get('type') as HealthCreate['type'] | null;
    if (animalId || herdBatchId || type) {
      setShowForm(true);
      setForm((prev) => ({
        ...prev,
        type: type || prev.type,
        animalId: animalId || undefined,
        herdBatchId: herdBatchId || undefined,
      }));
    }
  }, [searchParams]);

  const calendarQ = useQuery({
    queryKey: ['health-records', 'calendar'],
    queryFn: () => listHealthCalendar(),
  });

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

  const inventoryQ = useQuery({
    queryKey: ['inventory', 'health-vax'],
    queryFn: () => listInventory({ pageSize: 100 }),
    enabled: showGroup,
  });

  const configQ = useQuery({ queryKey: ['species-config'], queryFn: listSpeciesConfig });

  const animalById = useMemo(() => {
    const map = new Map<string, { tag: string; name: string | null; species?: string }>();
    for (const a of animalsQ.data?.items ?? []) {
      map.set(a.id, { tag: a.tag, name: a.name, species: a.species });
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
        medicine: form.medicine,
        dosage: form.dosage,
        method: form.method,
        vetName: form.vetName,
        outcome: form.outcome,
        followUpAt: form.followUpAt,
        cmtResult: form.cmtResult,
        milkWithholdUntil: form.milkWithholdUntil,
        meatWithholdUntil: form.meatWithholdUntil,
        batchNumber: form.batchNumber,
        inventoryItemId: form.inventoryItemId,
        durationDays: form.durationDays,
        frequencyPerDay: form.frequencyPerDay,
        doseAmount: form.doseAmount,
        route: form.route,
        symptoms: symptoms as HealthCreate['symptoms'],
        temperatureC: form.temperatureC,
        severity: form.severity,
        provisionalDiagnosis: form.provisionalDiagnosis,
        diagnosedBy: form.diagnosedBy,
        doseCount: form.doseCount,
        doseIntervalHours: form.doseIntervalHours,
        performedAt: form.performedAt ?? new Date(),
        nextDueAt: form.nextDueAt,
        notes: form.notes,
      }),
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setForm({ type: 'VACCINATION', performedAt: new Date(), frequencyPerDay: 2 });
      void qc.invalidateQueries({ queryKey: ['health-records'] });
    },
  });

  const udderSave = useMutation({
    mutationFn: () =>
      createUdderCheck({
        animalId: form.animalId!,
        method: 'CMT',
        quarterScores: quarters,
        appearance: appearance as 'NORMAL' | 'WATERY' | 'CLOTS' | 'BLOOD' | 'PUS' | 'DISCOLORED',
        signs: udderSigns as Array<'HEAT' | 'SWELLING' | 'PAIN' | 'HARDNESS' | 'ASYMMETRY' | 'NONE'>,
      }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['health-records'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deathSave = useMutation({
    mutationFn: () =>
      recordMortality({
        animalId: form.animalId!,
        deathAt: new Date(),
        causeCategory: mortalityCause as 'DISEASE' | 'INJURY' | 'CALVING_COMPLICATION' | 'PREDATION' | 'POISONING' | 'UNKNOWN',
      }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['animals'] });
    },
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
    const ok = validate({
      title: required(form.title, t('common.requiredField')),
      performedAt:
        required(form.performedAt ? 'set' : '', t('common.requiredField')) ||
        notFuture(form.performedAt ?? null, t('common.futureDate')),
    });
    if (ok) save.mutate();
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
            <button className="btn secondary" type="button" onClick={() => setShowGroup((v) => !v)}>
              {t('health.groupVax')}
            </button>
          </div>
        )}
      </div>

      <ActiveWithholdBrief />

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>{t('health.protocols')}</h2>
        <p className="muted">{t('health.protocolsHelp')}</p>
        <ul className="activity-list">
          {NEPAL_VACCINE_PROTOCOLS.map((p) => (
            <li key={p.key}>
              <div>
                <strong>{p.titleNp}</strong>
                <span className="muted">
                  {' · '}
                  {p.titleEn}
                  {p.blockPregnant ? ` · ${t('health.blockPregnant')}` : ''}
                </span>
              </div>
              <span className="muted">
                {p.firstDoseMonths}m
                {p.boosterDays ? ` +${p.boosterDays}d` : ''}
                {p.intervalDays ? ` / ${p.intervalDays}d` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {showGroup && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>{t('health.groupVax')}</h2>
          <p className="muted">{t('health.groupVaxHelp')}</p>
          {error && <p className="error-text">{error}</p>}
          <label>
            {t('health.protocol')}
            <select value={protocolKey} onChange={(e) => setProtocolKey(e.target.value)}>
              {NEPAL_VACCINE_PROTOCOLS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.titleEn}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('health.inventoryItem')}
            <select value={groupItemId} onChange={(e) => setGroupItemId(e.target.value)}>
              <option value="">—</option>
              {(inventoryQ.data?.items ?? [])
                .filter((i) => i.category === 'MEDICINE' || i.category === 'VACCINE')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t('health.expiredLotReason')}
            <input
              value={expiredLotReason}
              onChange={(e) => setExpiredLotReason(e.target.value)}
              placeholder={t('health.expiredLotReasonHelp')}
            />
          </label>
          <div className="chip-row" style={{ margin: '12px 0' }}>
            {(animalsQ.data?.items ?? []).map((a) => (
              <button
                key={a.id}
                type="button"
                className={`filter-chip ${groupIds.includes(a.id) ? 'active' : ''}`}
                onClick={() =>
                  setGroupIds((ids) => (ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id]))
                }
              >
                {a.herdNumber ?? a.tag}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn"
            disabled={groupIds.length === 0}
            onClick={() => {
              void batchVaccinate({
                animalIds: groupIds,
                itemId: groupItemId || undefined,
                administeredAt: new Date(),
                doseAmount: 2,
                route: 'SUBCUTANEOUS',
                disease: protocolKey,
                expiredLotReason: expiredLotReason || undefined,
              })
                .then((res) => {
                  setShowGroup(false);
                  setGroupIds([]);
                  setExpiredLotReason('');
                  if (res.skipped.length) {
                    setError(t('health.skippedPregnant', { n: res.skipped.length }));
                  } else {
                    setError(null);
                  }
                  void qc.invalidateQueries({ queryKey: ['health-records'] });
                  void qc.invalidateQueries({ queryKey: ['inventory'] });
                })
                .catch((err) => {
                  setError(err instanceof ApiRequestError ? err.error.message : t('health.batchFailed'));
                });
            }}
          >
            {t('health.vaccinateN', { n: groupIds.length })}
          </button>
        </div>
      )}

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

      {calendarQ.data && calendarQ.data.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2>{t('health.calendar')}</h2>
          <ul className="activity-list">
            {calendarQ.data.slice(0, 12).map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.title}</strong>
                  <span className="muted">
                    {' · '}
                    {t(`enum.healthType.${row.type}`, { defaultValue: row.type })}
                    {row.animalTag ? ` · ${row.animalTag}` : ''}
                  </span>
                </div>
                <span className="muted">
                  {row.nextDueAt ? formatDate(row.nextDueAt) : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                {...fieldProps('title')}
                value={form.title ?? ''}
                onChange={(e) => {
                  clearField('title');
                  setForm((prev) => ({ ...prev, title: e.target.value }));
                }}
              />
              <FieldError id="health-title-error" message={fieldErrors.title} />
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
              <label htmlFor="health-performedAt">{t('health.performedAt')}</label>
              <input
                {...fieldProps('performedAt')}
                type="date"
                value={toDateInput(form.performedAt)}
                onChange={(e) => {
                  clearField('performedAt');
                  setForm((prev) => ({
                    ...prev,
                    performedAt: e.target.value ? new Date(e.target.value) : new Date(),
                  }));
                }}
              />
              <FieldError id="health-performedAt-error" message={fieldErrors.performedAt} />
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
            <div className="field">
              <label htmlFor="health-batchno">{t('health.batchNumber')}</label>
              <input
                id="health-batchno"
                value={form.batchNumber ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, batchNumber: e.target.value || undefined }))}
              />
            </div>
            <div className="field">
              <label htmlFor="health-doses">{t('health.doseCount')}</label>
              <input
                id="health-doses"
                type="number"
                min="1"
                max="60"
                value={form.doseCount ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    doseCount: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="health-meat">{t('health.meatWithholdUntil')}</label>
              <input
                id="health-meat"
                type="date"
                value={toDateInput(form.meatWithholdUntil)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    meatWithholdUntil: e.target.value ? new Date(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="health-med">{t('health.medicine')}</label>
              <input
                id="health-med"
                value={form.medicine ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, medicine: e.target.value || undefined }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="health-dose">{t('health.dosage')}</label>
              <input
                id="health-dose"
                value={form.dosage ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, dosage: e.target.value || undefined }))
                }
              />
            </div>
            <InventoryWithholdFields form={form} setForm={setForm} />
            <div className="field">
              <label htmlFor="health-method">{t('health.method')}</label>
              <input
                id="health-method"
                value={form.method ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, method: e.target.value || undefined }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="health-vet">{t('health.vetName')}</label>
              <input
                id="health-vet"
                value={form.vetName ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, vetName: e.target.value || undefined }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="health-out">{t('health.outcome')}</label>
              <select
                id="health-out"
                value={form.outcome ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    outcome: (e.target.value || undefined) as HealthCreate['outcome'],
                  }))
                }
              >
                <option value="">—</option>
                {(['RECOVERED', 'ONGOING', 'FAILED', 'CULLED'] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`enum.healthOutcome.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="health-temp">{t('health.temperatureC')}</label>
              <input
                id="health-temp"
                type="number"
                step="0.1"
                value={form.temperatureC ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    temperatureC: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
              {form.animalId &&
                (() => {
                  const species = animalById.get(form.animalId)?.species;
                  const band = configQ.data?.find((c) => c.species === species);
                  if (!band || form.temperatureC == null) return band ? (
                    <span className="muted">
                      {t('health.tempRange', { min: band.tempMinC, max: band.tempMaxC })}
                    </span>
                  ) : null;
                  const out = form.temperatureC < band.tempMinC || form.temperatureC > band.tempMaxC;
                  return (
                    <span className={out ? 'shed-hold' : 'muted'}>
                      {out
                        ? t('health.tempOut', { min: band.tempMinC, max: band.tempMaxC })
                        : t('health.tempRange', { min: band.tempMinC, max: band.tempMaxC })}
                    </span>
                  );
                })()}
            </div>
            <div className="field">
              <label htmlFor="health-sev">{t('health.severity')}</label>
              <select
                id="health-sev"
                value={form.severity ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    severity: (e.target.value || undefined) as HealthCreate['severity'],
                  }))
                }
              >
                <option value="">—</option>
                {(['MILD', 'MODERATE', 'SEVERE'] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`enum.severity.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="health-dx">{t('health.diagnosis')}</label>
              <input
                id="health-dx"
                value={form.provisionalDiagnosis ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    provisionalDiagnosis: e.target.value || undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="health-freq">{t('health.frequencyPerDay')}</label>
              <input
                id="health-freq"
                type="number"
                min="1"
                max="6"
                value={form.frequencyPerDay ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    frequencyPerDay: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <fieldset className="chip-fieldset">
              <legend>{t('health.symptoms')}</legend>
              {SYMPTOMS.map(
                (s) => (
                  <label key={s} className={`filter-chip ${symptoms.includes(s) ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={symptoms.includes(s)}
                      onChange={() =>
                        setSymptoms((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
                      }
                    />
                    {t(`enum.symptom.${s}`)}
                  </label>
                ),
              )}
            </fieldset>
            {commercial && (
              <>
                <div className="field">
                  <label htmlFor="health-app">{t('health.milkAppearance')}</label>
                  <select
                    id="health-app"
                    value={appearance}
                    onChange={(e) => setAppearance(e.target.value)}
                  >
                    {MILK_APPEARANCES.map((v) => (
                      <option key={v} value={v}>
                        {t(`enum.milkAppearance.${v}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>{t('health.mastitisClass')}</label>
                  <input
                    readOnly
                    value={t(`enum.mastitis.${classifyMastitis(form.cmtResult, appearance)}`)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="health-cmt">{t('health.cmtResult')}</label>
                  <select
                    id="health-cmt"
                    value={form.cmtResult ?? ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        cmtResult: (e.target.value || undefined) as HealthCreate['cmtResult'],
                      }))
                    }
                  >
                    <option value="">—</option>
                    {(['NEGATIVE', 'TRACE', 'ONE', 'TWO', 'THREE'] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`enum.cmt.${v}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="health-withhold">{t('health.milkWithholdUntil')}</label>
                  <input
                    id="health-withhold"
                    type="date"
                    value={toDateInput(form.milkWithholdUntil)}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        milkWithholdUntil: e.target.value
                          ? new Date(e.target.value)
                          : undefined,
                      }))
                    }
                  />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="health-follow">{t('health.followUpAt')}</label>
              <input
                id="health-follow"
                type="date"
                value={toDateInput(form.followUpAt)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    followUpAt: e.target.value ? new Date(e.target.value) : undefined,
                  }))
                }
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="health-notes">{t('common.notes')}</label>
            <textarea
              id="health-notes"
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value || undefined }))
              }
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          {Object.keys(fieldErrors).length > 0 && <p className="form-summary-error">{t('common.fixErrors')}</p>}
          <div className="page-actions">
            <button className="btn" type="submit" disabled={save.isPending} aria-busy={save.isPending}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      )}

      {form.animalId && (
        <div className="card">
          <h2>{t('health.udderTitle')}</h2>
          <p className="muted">{t('health.udderHelp')}</p>
          <div className="field">
            <label htmlFor="udder-app">{t('health.milkAppearance')}</label>
            <select
              id="udder-app"
              value={appearance}
              onChange={(e) => setAppearance(e.target.value)}
            >
              {MILK_APPEARANCES.map((v) => (
                <option key={v} value={v}>
                  {t(`enum.milkAppearance.${v}`)}
                </option>
              ))}
            </select>
          </div>
          <p>
            {t(`enum.mastitis.${classifyQuarterMastitis(quarters, appearance, udderSigns)}`)}
          </p>
          <div className="form-grid">
            {(['LF', 'RF', 'LR', 'RR'] as const).map((q) => (
              <div className="field" key={q}>
                <label htmlFor={`cmt-${q}`}>{q}</label>
                <input
                  id={`cmt-${q}`}
                  type="number"
                  min="0"
                  max="3"
                  value={quarters[q]}
                  onChange={(e) =>
                    setQuarters((prev) => ({ ...prev, [q]: Number(e.target.value) }))
                  }
                />
              </div>
            ))}
          </div>
          <fieldset className="chip-fieldset">
            <legend>{t('health.udderSigns')}</legend>
            {UDDER_SIGNS.filter((s) => s !== 'NONE').map((s) => (
              <label key={s} className={`filter-chip ${udderSigns.includes(s) ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={udderSigns.includes(s)}
                  onChange={() =>
                    setUdderSigns((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
                  }
                />
                {t(`enum.udderSign.${s}`)}
              </label>
            ))}
          </fieldset>
          <div className="page-actions">
            <button
              className="btn"
              type="button"
              disabled={udderSave.isPending}
              onClick={() => udderSave.mutate()}
            >
              {t('health.saveUdder')}
            </button>
            {udderSave.data && (
              <span>
                {t(`enum.mastitis.${udderSave.data.classification}`)}
                {udderSave.data.discardMilk ? ` · ${t('health.discardMilk')}` : ''}
                {udderSave.data.chronicFlag ? ` · ${t('health.chronicMastitis')}` : ''}
              </span>
            )}
          </div>
          <h2>{t('health.mortalityTitle')}</h2>
          <p className="muted">{t('health.mortalityHelp')}</p>
          <div className="field">
            <label htmlFor="death-cause">{t('health.cause')}</label>
            <select
              id="death-cause"
              value={mortalityCause}
              onChange={(e) => setMortalityCause(e.target.value)}
            >
              {['DISEASE', 'INJURY', 'CALVING_COMPLICATION', 'PREDATION', 'POISONING', 'UNKNOWN'].map(
                (c) => (
                  <option key={c} value={c}>
                    {t(`enum.cause.${c}`)}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="page-actions">
            <button
              className="btn secondary"
              type="button"
              disabled={deathSave.isPending}
              onClick={() => deathSave.mutate()}
            >
              {t('health.recordDeath')}
            </button>
            {deathSave.data && (
              <span>
                {t('health.loss', { n: Math.round(deathSave.data.estimatedLossNpr ?? 0) })}
              </span>
            )}
          </div>
        </div>
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

function ActiveWithholdBrief() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['withholds-active'], queryFn: listActiveWithholds });
  const holds = q.data ?? [];
  if (holds.length === 0) return null;
  return (
    <>
      {holds.slice(0, 4).map((h) => (
        <WithholdBanner key={h.id} messageNp={`${h.messageNp} · ${h.shortNo ?? h.name ?? ''}`} endDate={h.endDate} />
      ))}
      {holds.length > 4 && (
        <p className="muted">{t('health.withholdBanner', { n: holds.length })}</p>
      )}
    </>
  );
}

function InventoryWithholdFields({
  form,
  setForm,
}: {
  form: Partial<HealthCreate>;
  setForm: (fn: (prev: Partial<HealthCreate>) => Partial<HealthCreate>) => void;
}) {
  const { t } = useTranslation();
  const invQ = useQuery({
    queryKey: ['inventory'],
    queryFn: () => listInventory({ pageSize: 100 }),
  });
  const items = (invQ.data?.items ?? []).filter(
    (i) => i.category === 'MEDICINE' || i.category === 'VACCINE',
  );
  const selected = items.find((i) => i.id === form.inventoryItemId);
  return (
    <>
      <div className="field">
        <label htmlFor="health-item">{t('health.inventoryItem')}</label>
        <select
          id="health-item"
          value={form.inventoryItemId ?? ''}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, inventoryItemId: e.target.value || undefined }))
          }
        >
          <option value="">{t('health.noInventoryItem')}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
              {i.withdrawalDaysMilk ? ` · ${i.withdrawalDaysMilk}d milk` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="health-duration">{t('health.durationDays')}</label>
        <input
          id="health-duration"
          type="number"
          min={0}
          max={60}
          value={form.durationDays ?? ''}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              durationDays: e.target.value === '' ? undefined : Number(e.target.value),
            }))
          }
        />
        {selected && (selected.withdrawalDaysMilk ?? 0) > 0 && (
          <p className="muted">
            {t('health.computedWithhold', {
              n: (form.durationDays ?? 0) + (selected.withdrawalDaysMilk ?? 0),
            })}
          </p>
        )}
      </div>
    </>
  );
}

function classifyMastitis(cmt: HealthCreate['cmtResult'], appearance: string): 'CLINICAL' | 'SUBCLINICAL' | 'HEALTHY' {
  if (appearance !== 'NORMAL') return 'CLINICAL';
  if (cmt === 'TWO' || cmt === 'THREE') return 'SUBCLINICAL';
  return 'HEALTHY';
}

function classifyQuarterMastitis(
  scores: { LF: number; RF: number; LR: number; RR: number },
  appearance: string,
  signs: string[],
): 'CLINICAL' | 'SUBCLINICAL' | 'HEALTHY' {
  if (appearance !== 'NORMAL' || signs.some((s) => s !== 'NONE')) return 'CLINICAL';
  if (Math.max(scores.LF, scores.RF, scores.LR, scores.RR) >= 2) return 'SUBCLINICAL';
  return 'HEALTHY';
}

function toDateInput(value: Date | string | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
