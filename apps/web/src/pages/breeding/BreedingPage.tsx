import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate, formatNPR, type PedigreeNodeDto, type SpeciesConfigDto } from '@farm/contracts';
import { listAnimals } from '../../api/animals';
import {
  animalPedigree,
  breedingMetrics,
  createBreeding,
  createHeat,
  listBreeding,
  listHeat,
  pregnancyCheck,
  recordCalving,
  recordColostrum,
  recordFarmCalving,
  recordFarmColostrum,
  type BreedingDto,
  type HeatLogDto,
} from '../../api/breeding';
import { listSpeciesConfig } from '../../api/config';
import { useAuth } from '../../auth/auth-context';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';

const TABS = ['heat', 'service', 'pd', 'calving', 'colostrum', 'records'] as const;
type Tab = (typeof TABS)[number];

const HEAT_SIGNS = [
  'STANDING_HEAT',
  'MOUNTING_OTHERS',
  'MUCUS_DISCHARGE',
  'VULVA_SWELLING',
  'BELLOWING',
  'RESTLESSNESS',
  'REDUCED_MILK',
  'TAIL_RAISED',
  'OFF_FEED',
] as const;

const DIFFICULTY = ['EASY', 'ASSISTED', 'EMERGENCY', 'STILLBIRTH'] as const;
const COMPLICATIONS = ['NONE', 'RETAINED_PLACENTA', 'MILK_FEVER', 'PROLAPSE', 'METRITIS'] as const;
const COLOSTRUM_SOURCES = ['OWN_MOTHER', 'OTHER_DAM', 'FROZEN', 'REPLACER'] as const;
const COLOSTRUM_METHODS = ['SUCKLED', 'BOTTLE', 'TUBE'] as const;
const COLOSTRUM_QUALITY = ['THICK_YELLOW', 'THIN_WATERY', 'BLOODY'] as const;

export function BreedingPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const formParam = searchParams.get('form');
  const tab: Tab = TABS.includes(formParam as Tab) ? (formParam as Tab) : 'records';
  const animalId = searchParams.get('animalId') ?? '';
  const breedingId = searchParams.get('breedingId') ?? '';
  const taskId = searchParams.get('taskId') ?? '';

  const setTab = (next: Tab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'records') nextParams.delete('form');
    else nextParams.set('form', next);
    setSearchParams(nextParams, { replace: true });
  };

  const breedingQ = useQuery({
    queryKey: ['breeding'],
    queryFn: () => listBreeding({ pageSize: 200 }),
  });
  const heatQ = useQuery({
    queryKey: ['breeding', 'heat'],
    queryFn: () => listHeat(),
  });
  const animalsQ = useQuery({
    queryKey: ['animals', 'females'],
    queryFn: () => listAnimals({ gender: 'FEMALE', pageSize: 200 }),
  });
  const malesQ = useQuery({
    queryKey: ['animals', 'males'],
    queryFn: () => listAnimals({ gender: 'MALE', pageSize: 200 }),
  });
  const configQ = useQuery({ queryKey: ['species-config'], queryFn: listSpeciesConfig });
  const metricsQ = useQuery({ queryKey: ['breeding', 'metrics'], queryFn: breedingMetrics });

  const females = animalsQ.data?.items ?? [];
  const males = malesQ.data?.items ?? [];
  const records = breedingQ.data?.items ?? [];
  const heats = heatQ.data?.items ?? [];
  const metrics = metricsQ.data;
  const configBySpecies = useMemo(() => {
    const map = new Map<string, SpeciesConfigDto>();
    for (const row of configQ.data ?? []) map.set(row.species, row);
    return map;
  }, [configQ.data]);

  if (breedingQ.isLoading) return <LoadingState />;
  if (breedingQ.isError) return <ErrorState onRetry={() => void breedingQ.refetch()} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.breeding')}</h1>
          <p className="page-subtitle">{t('breeding.subtitle')}</p>
        </div>
      </div>

      <div className="stats-grid breeding-kpis">
        <Kpi
          label={t('breeding.kpi.conception')}
          value={fmtPct(metrics?.conceptionRatePct)}
          hint={t('breeding.kpi.conceptionHint')}
          miss={isBelow(metrics?.conceptionRatePct, metrics?.targets.conceptionRateMinPct)}
        />
        <Kpi
          label={t('breeding.kpi.firstService')}
          value={fmtPct(metrics?.firstServiceRatePct)}
          hint={t('breeding.kpi.firstServiceHint')}
        />
        <Kpi
          label={t('breeding.kpi.daysOpen')}
          value={fmtNum(metrics?.daysOpen)}
          hint={t('breeding.kpi.daysOpenHint')}
          miss={isAbove(metrics?.daysOpen, metrics?.targets.daysOpenMax)}
        />
        <Kpi
          label={t('breeding.kpi.interval')}
          value={fmtNum(metrics?.calvingIntervalDays)}
          hint={t('breeding.kpi.intervalHint')}
          miss={isAbove(metrics?.calvingIntervalDays, metrics?.targets.calvingIntervalMaxDays)}
        />
        <Kpi
          label={t('breeding.kpi.services')}
          value={metrics?.servicesPerConception == null ? '—' : metrics.servicesPerConception.toFixed(1)}
          hint={t('breeding.kpi.servicesHint')}
        />
        <Kpi
          label={t('breeding.kpi.heatDetection')}
          value={fmtPct(metrics?.heatDetectionRatePct)}
          hint={t('breeding.kpi.heatDetectionHint')}
        />
        <Kpi
          label={t('breeding.kpi.firstCalving')}
          value={metrics?.ageAtFirstCalvingMonths == null ? '—' : t('breeding.kpi.months', { n: metrics.ageAtFirstCalvingMonths })}
          hint={t('breeding.kpi.firstCalvingHint')}
        />
        <Kpi
          label={t('breeding.kpi.openCost')}
          value={metrics?.costOfOpenDaysNpr == null ? '—' : formatNPR(metrics.costOfOpenDaysNpr)}
          hint={t('breeding.kpi.openCostHint')}
        />
      </div>

      {metrics && metrics.observers.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>{t('breeding.observersTitle')}</h2>
          <p className="muted">{t('breeding.observersHelp')}</p>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('breeding.observer')}</th>
                <th>{t('breeding.heatsSeen')}</th>
                <th>{t('breeding.standingHeat')}</th>
                <th>{t('breeding.kpi.heatDetection')}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.observers.map((o) => (
                <tr key={o.observerId}>
                  <td>{o.observerName ?? o.observerId.slice(0, 8)}</td>
                  <td>{o.heatsObserved}</td>
                  <td>{o.standingHeatCount}</td>
                  <td>{fmtPct(o.heatDetectionRatePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="workflow-tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`workflow-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {t(`breeding.tab.${id}`)}
          </button>
        ))}
      </div>

      {tab === 'heat' && (
        <HeatForm
          females={females}
          heats={heats}
          animalId={animalId}
          configBySpecies={configBySpecies}
          canWrite={can('breeding:write')}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['breeding'] })}
        />
      )}
      {tab === 'service' && (
        <ServiceForm
          females={females}
          males={males}
          records={records}
          animalId={animalId}
          configBySpecies={configBySpecies}
          canWrite={can('breeding:write')}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['breeding'] });
          }}
        />
      )}
      {tab === 'pd' && (
        <PdForm
          records={records}
          breedingId={breedingId}
          animalId={animalId}
          canWrite={can('breeding:write')}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['breeding'] })}
        />
      )}
      {tab === 'calving' && (
        <CalvingForm
          records={records}
          females={females}
          breedingId={breedingId}
          animalId={animalId}
          canWrite={can('breeding:write')}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['breeding'] });
            void qc.invalidateQueries({ queryKey: ['animals'] });
          }}
        />
      )}
      {tab === 'colostrum' && (
        <ColostrumForm
          records={records}
          breedingId={breedingId}
          animalId={animalId}
          taskId={taskId}
          canWrite={can('breeding:write')}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['breeding'] })}
        />
      )}
      {tab === 'records' && <RecordsPanel records={records} heats={heats} onOpen={setTab} />}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  miss,
}: {
  label: string;
  value: string | number;
  hint: string;
  miss?: boolean;
}) {
  return (
    <div className={`stat-card ${miss ? 'stat-card-miss' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="muted">{hint}</span>
    </div>
  );
}

function HeatForm({
  females,
  heats,
  animalId,
  configBySpecies,
  canWrite,
  onSaved,
}: {
  females: Female[];
  heats: HeatLogDto[];
  animalId: string;
  configBySpecies: Map<string, SpeciesConfigDto>;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(animalId);
  const [observedAt, setObservedAt] = useState(toDateTimeLocal(new Date()));
  const [intensity, setIntensity] = useState<'WEAK' | 'MEDIUM' | 'STRONG'>('MEDIUM');
  const [silent, setSilent] = useState(false);
  const [signs, setSigns] = useState<string[]>([]);
  const [observerName, setObserverName] = useState('');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<HeatLogDto | null>(null);

  useEffect(() => {
    if (animalId) setSelected(animalId);
  }, [animalId]);

  const animal = females.find((a) => a.id === selected);
  const cfg = animal ? configBySpecies.get(animal.species) : undefined;
  const tooSoon = animal && cfg ? daysUntilReady(animal.lactationStartDate, cfg.voluntaryWaitingDays) : null;

  const save = useMutation({
    mutationFn: () =>
      createHeat({
        animalId: selected,
        observedAt: fromDateTimeLocal(observedAt),
        intensity: silent ? 'WEAK' : intensity,
        observerName: observerName || undefined,
        signs: [...(silent ? ['SILENT_SUSPECTED'] : []), ...signs].join(','),
        notes: notes || undefined,
      }),
    onSuccess: (row) => {
      setSaved(row);
      onSaved();
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    save.mutate();
  };

  return (
    <form className="card form-card" onSubmit={onSubmit}>
      <h2>{t('breeding.tab.heat')}</h2>
      <p className="muted">{t('breeding.heatHelp')}</p>
      {animal?.isPregnant && <div className="hold-banner hold-banner-red">{t('breeding.heatOnPregnant')}</div>}
      {tooSoon != null && <p className="warn-text">{t('breeding.tooSoon', { n: tooSoon })}</p>}
      {animal?.species === 'BUFFALO' && <p className="muted">{t('breeding.silentHeatHelp')}</p>}

      <div className="form-grid">
        <AnimalField females={females} value={selected} onChange={setSelected} />
        <div className="field">
          <label htmlFor="heat-when">{t('breeding.observedAt')}</label>
          <input id="heat-when" type="datetime-local" required value={observedAt} onChange={(e) => setObservedAt(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="heat-int">{t('breeding.intensity')}</label>
          <select
            id="heat-int"
            value={intensity}
            onChange={(e) => setIntensity(e.target.value as typeof intensity)}
            disabled={silent}
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
          <input id="heat-obs" value={observerName} onChange={(e) => setObserverName(e.target.value)} />
        </div>
      </div>

      <fieldset className="chip-fieldset">
        <legend>{t('breeding.signs')}</legend>
        <label className="filter-chip">
          <input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} />
          {t('breeding.silentSuspected')}
        </label>
        {HEAT_SIGNS.map((sign) => (
          <label key={sign} className={`filter-chip ${signs.includes(sign) ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={signs.includes(sign)}
              onChange={() =>
                setSigns((cur) => (cur.includes(sign) ? cur.filter((s) => s !== sign) : [...cur, sign]))
              }
            />
            {t(`enum.heatSign.${sign}`)}
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor="heat-notes">{t('common.notes')}</label>
        <textarea id="heat-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {saved && (
        <div className="card inner-note">
          <p>
            {t('breeding.nextHeat')}: <strong>{formatDate(saved.nextHeatAt ?? '')}</strong>
          </p>
          {saved.serviceWindowStart && saved.serviceWindowEnd && (
            <p>
              {t('breeding.serviceWindow')}: {new Date(saved.serviceWindowStart).toLocaleTimeString()} –{' '}
              {new Date(saved.serviceWindowEnd).toLocaleTimeString()}
            </p>
          )}
          {saved.tooSoonDays ? <p className="warn-text">{t('breeding.tooSoon', { n: saved.tooSoonDays })}</p> : null}
        </div>
      )}

      {canWrite && (
        <div className="page-actions">
          <button className="btn" type="submit" disabled={save.isPending || !selected}>
            {t('breeding.saveHeat')}
          </button>
        </div>
      )}

      {heats.length > 0 && (
        <ul className="activity-list" style={{ marginTop: 24 }}>
          {heats.slice(0, 8).map((row) => (
            <li key={row.id}>
              <div>
                <strong>{row.animalTag ?? row.animalId}</strong>
                <span className="muted">
                  {' · '}
                  {t(`enum.heatIntensity.${row.intensity}`, { defaultValue: row.intensity })}
                  {row.signs ? ` · ${row.signs}` : ''}
                </span>
              </div>
              <span className="muted">{formatDate(row.observedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function ServiceForm({
  females,
  males,
  records,
  animalId,
  configBySpecies,
  canWrite,
  onSaved,
}: {
  females: Female[];
  males: Female[];
  records: BreedingDto[];
  animalId: string;
  configBySpecies: Map<string, SpeciesConfigDto>;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [motherId, setMotherId] = useState(animalId);
  const [matingType, setMatingType] = useState<'NATURAL' | 'AI'>('AI');
  const [fatherTagOrAi, setFather] = useState('');
  const [sireId, setSireId] = useState('');
  const [matingDate, setMatingDate] = useState(toDateInput(new Date()));
  const [tech, setTech] = useState('');
  const [phone, setPhone] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inbreeding, setInbreeding] = useState(false);

  useEffect(() => {
    if (animalId) setMotherId(animalId);
  }, [animalId]);

  const animal = females.find((a) => a.id === motherId);
  const cfg = animal ? configBySpecies.get(animal.species) : undefined;
  const serviceNo =
    1 +
    records.filter(
      (r) =>
        r.motherId === motherId &&
        r.pregnancyStatus !== 'DELIVERED' &&
        (!animal?.lactationStartDate || new Date(r.matingDate) >= new Date(animal.lactationStartDate)),
    ).length;
  const tooSoon = animal && cfg ? daysUntilReady(animal.lactationStartDate, cfg.voluntaryWaitingDays) : null;
  const duePreview =
    animal && cfg && matingDate
      ? formatDate(addDays(new Date(matingDate), cfg.gestationDays).toISOString())
      : null;

  const damTreeQ = useQuery({
    queryKey: ['pedigree', motherId],
    queryFn: () => animalPedigree(motherId),
    enabled: Boolean(motherId),
  });
  const sireTreeQ = useQuery({
    queryKey: ['pedigree', sireId],
    queryFn: () => animalPedigree(sireId),
    enabled: Boolean(sireId),
  });

  const save = useMutation({
    mutationFn: () =>
      createBreeding({
        motherId,
        matingType,
        fatherTagOrAi: fatherTagOrAi || undefined,
        sireId: sireId || undefined,
        matingDate: new Date(matingDate),
        pregnancyStatus: 'PREGNANT',
        technicianName: tech || undefined,
        technicianPhone: phone || undefined,
        costNpr: cost ? Number(cost) : undefined,
      }),
    onSuccess: (row) => {
      setError(null);
      setInbreeding(Boolean(row.inbreedingWarning));
      onSaved();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <form
      className="card form-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!motherId) {
          setError(t('breeding.requiredFields'));
          return;
        }
        save.mutate();
      }}
    >
      <h2>{t('breeding.tab.service')}</h2>
      <p className="muted">{t('breeding.serviceHelp')}</p>
      {animal?.isPregnant && <div className="hold-banner hold-banner-red">{t('breeding.alreadyPregnant')}</div>}
      {tooSoon != null && <p className="warn-text">{t('breeding.tooSoon', { n: tooSoon })}</p>}
      {serviceNo >= 3 && <p className="warn-text">{t('breeding.repeatWarn', { n: serviceNo })}</p>}
      {(inbreeding || relatedPedigree(damTreeQ.data, sireTreeQ.data)) && (
        <p className="warn-text">{t('breeding.inbreedingWarn')}</p>
      )}

      <div className="form-grid">
        <AnimalField females={females} value={motherId} onChange={setMotherId} />
        <div className="field">
          <label htmlFor="svc-type">{t('breeding.matingType')}</label>
          <select id="svc-type" value={matingType} onChange={(e) => setMatingType(e.target.value as 'NATURAL' | 'AI')}>
            <option value="AI">{t('breeding.ai')}</option>
            <option value="NATURAL">{t('breeding.natural')}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="svc-sire-animal">{t('breeding.sire')}</label>
          <select id="svc-sire-animal" value={sireId} onChange={(e) => setSireId(e.target.value)}>
            <option value="">{t('breeding.noSire')}</option>
            {males.map((m) => (
              <option key={m.id} value={m.id}>
                {m.herdNumber ?? m.tag}
                {m.name ? ` · ${m.name}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="svc-sire">{matingType === 'AI' ? t('breeding.straw') : t('breeding.bull')}</label>
          <input id="svc-sire" value={fatherTagOrAi} onChange={(e) => setFather(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="svc-date">{t('breeding.matingDate')}</label>
          <input id="svc-date" type="date" required value={matingDate} onChange={(e) => setMatingDate(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('breeding.serviceNo')}</label>
          <input value={serviceNo} readOnly />
        </div>
        <div className="field">
          <label htmlFor="svc-tech">{t('breeding.technician')}</label>
          <input id="svc-tech" value={tech} onChange={(e) => setTech(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="svc-phone">{t('breeding.technicianPhone')}</label>
          <input id="svc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="svc-cost">{t('breeding.serviceCost')}</label>
          <input id="svc-cost" type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      </div>
      {(damTreeQ.data || sireTreeQ.data) && (
        <div className="pedigree-row">
          {damTreeQ.data && (
            <div>
              <h3>{t('breeding.damPedigree')}</h3>
              <PedigreeTree node={damTreeQ.data} />
            </div>
          )}
          {sireTreeQ.data && (
            <div>
              <h3>{t('breeding.sirePedigree')}</h3>
              <PedigreeTree node={sireTreeQ.data} />
            </div>
          )}
        </div>
      )}
      {duePreview && (
        <p>
          {t('breeding.provisionalDue')}: <strong>{duePreview}</strong>
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
      {canWrite && (
        <div className="page-actions">
          <button className="btn" type="submit" disabled={save.isPending}>
            {t('breeding.saveService')}
          </button>
        </div>
      )}
    </form>
  );
}

function PdForm({
  records,
  breedingId,
  animalId,
  canWrite,
  onSaved,
}: {
  records: BreedingDto[];
  breedingId: string;
  animalId: string;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const open = records.filter((r) => r.pregnancyStatus === 'PREGNANT' || r.pregnancyStatus === 'OPEN');
  const [id, setId] = useState(breedingId || open.find((r) => r.motherId === animalId)?.id || open[0]?.id || '');
  const [result, setResult] = useState<'CONFIRMED' | 'OPEN' | 'INCONCLUSIVE'>('CONFIRMED');
  const [daysPregnant, setDays] = useState('');
  const [examiner, setExaminer] = useState('');
  const [cost, setCost] = useState('');
  const [checkedAt, setCheckedAt] = useState(toDateInput(new Date()));

  useEffect(() => {
    if (breedingId) setId(breedingId);
  }, [breedingId]);

  const save = useMutation({
    mutationFn: () =>
      pregnancyCheck(id, {
        result,
        daysPregnant: daysPregnant ? Number(daysPregnant) : undefined,
        estimatedDaysPregnant: daysPregnant ? Number(daysPregnant) : undefined,
        examiner: examiner || undefined,
        cost: cost ? Number(cost) : undefined,
        checkedAt: checkedAt ? new Date(checkedAt) : undefined,
        checkDate: checkedAt ? new Date(checkedAt) : undefined,
      }),
    onSuccess: onSaved,
  });

  return (
    <form
      className="card form-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!id) return;
        save.mutate();
      }}
    >
      <h2>{t('breeding.tab.pd')}</h2>
      <p className="muted">{t('breeding.pdHelp')}</p>
      <div className="form-grid">
        <RecordField records={open} value={id} onChange={setId} empty={t('breeding.noOpenServices')} />
        <div className="field">
          <label htmlFor="pd-result">{t('breeding.pdResult')}</label>
          <select id="pd-result" value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
            <option value="CONFIRMED">{t('breeding.pdConfirmed')}</option>
            <option value="OPEN">{t('breeding.pdOpen')}</option>
            <option value="INCONCLUSIVE">{t('breeding.pdInconclusive')}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pd-days">{t('breeding.daysPregnant')}</label>
          <input id="pd-days" type="number" min="1" max="400" value={daysPregnant} onChange={(e) => setDays(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pd-when">{t('common.date')}</label>
          <input id="pd-when" type="date" value={checkedAt} onChange={(e) => setCheckedAt(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pd-ex">{t('breeding.examiner')}</label>
          <input id="pd-ex" value={examiner} onChange={(e) => setExaminer(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pd-cost">{t('breeding.serviceCost')}</label>
          <input id="pd-cost" type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      </div>
      {canWrite && (
        <div className="page-actions">
          <button className="btn" type="submit" disabled={save.isPending || !id}>
            {t('breeding.savePd')}
          </button>
        </div>
      )}
    </form>
  );
}

function CalvingForm({
  records,
  females,
  breedingId,
  animalId,
  canWrite,
  onSaved,
}: {
  records: BreedingDto[];
  females: Female[];
  breedingId: string;
  animalId: string;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const pending = records.filter((r) => r.pregnancyStatus !== 'DELIVERED' && r.pregnancyStatus !== 'FAILED');
  const [id, setId] = useState(breedingId || pending.find((r) => r.motherId === animalId)?.id || pending[0]?.id || '');
  const [noService, setNoService] = useState(false);
  const [motherId, setMotherId] = useState(animalId);
  const [birthDate, setBirthDate] = useState(toDateTimeLocal(new Date()));
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTY)[number]>('EASY');
  const [placenta, setPlacenta] = useState(true);
  const [complication, setComplication] = useState('NONE');
  const [outcome, setOutcome] = useState<'LIVE' | 'ABORTED'>('LIVE');
  const [damCondition, setDamCondition] = useState<'NORMAL' | 'WEAK' | 'CRITICAL'>('NORMAL');
  const [calves, setCalves] = useState<Array<{ sex: 'FEMALE' | 'MALE'; weightKg: string; name: string }>>([
    { sex: 'FEMALE', weightKg: '', name: '' },
  ]);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        birthDate: fromDateTimeLocal(birthDate),
        calvingAt: fromDateTimeLocal(birthDate),
        difficulty,
        placentaExpelled: placenta,
        placentaExpelledWithin12h: placenta,
        complications: complication === 'NONE' ? undefined : complication,
        outcome: outcome === 'ABORTED' ? ('ABORTED' as const) : undefined,
        damConditionPost: damCondition,
        calves:
          outcome === 'ABORTED'
            ? []
            : calves.map((c) => ({
                sex: c.sex,
                weightKg: c.weightKg ? Number(c.weightKg) : undefined,
                birthWeightKg: c.weightKg ? Number(c.weightKg) : undefined,
                name: c.name || undefined,
              })),
      };
      if (noService || outcome === 'ABORTED') {
        if (!motherId && !id) throw new Error(t('breeding.requiredFields'));
        return recordFarmCalving({
          ...body,
          damId: motherId || records.find((r) => r.id === id)?.motherId,
        });
      }
      return recordCalving(id, body);
    },
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <form
      className="card form-card"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2>{t('breeding.tab.calving')}</h2>
      <p className="muted">{t('breeding.calvingHelp')}</p>
      <label className="filter-chip">
        <input type="checkbox" checked={noService} onChange={(e) => setNoService(e.target.checked)} />
        {t('breeding.noService')}
      </label>
      <div className="form-grid">
        {noService ? (
          <AnimalField females={females} value={motherId} onChange={setMotherId} />
        ) : (
          <RecordField records={pending} value={id} onChange={setId} empty={t('breeding.noPendingCalving')} />
        )}
        <div className="field">
          <label htmlFor="calve-when">{t('breeding.calvingAt')}</label>
          <input id="calve-when" type="datetime-local" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="calve-diff">{t('breeding.calvingDifficulty')}</label>
          <select id="calve-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
            {DIFFICULTY.map((v) => (
              <option key={v} value={v}>
                {t(`enum.calvingDifficulty.${v}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="calve-comp">{t('breeding.complications')}</label>
          <select id="calve-comp" value={complication} onChange={(e) => setComplication(e.target.value)}>
            {COMPLICATIONS.map((v) => (
              <option key={v} value={v}>
                {t(`enum.complication.${v}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label>
        <input type="checkbox" checked={placenta} onChange={(e) => setPlacenta(e.target.checked)} /> {t('breeding.placenta12h')}
      </label>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="calve-out">{t('breeding.outcome')}</label>
          <select id="calve-out" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
            <option value="LIVE">{t('breeding.outcomeLive')}</option>
            <option value="ABORTED">{t('breeding.outcomeAborted')}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="calve-damc">{t('breeding.damCondition')}</label>
          <select
            id="calve-damc"
            value={damCondition}
            onChange={(e) => setDamCondition(e.target.value as typeof damCondition)}
          >
            <option value="NORMAL">{t('enum.damCondition.NORMAL')}</option>
            <option value="WEAK">{t('enum.damCondition.WEAK')}</option>
            <option value="CRITICAL">{t('enum.damCondition.CRITICAL')}</option>
          </select>
        </div>
      </div>

      <h3>{t('breeding.calves')}</h3>
      {outcome === 'ABORTED' && <p className="warn-text">{t('breeding.abortHelp')}</p>}
      {outcome !== 'ABORTED' && calves.map((calf, i) => (
        <div className="form-grid" key={i}>
          <div className="field">
            <label>{t('animals.gender')}</label>
            <select
              value={calf.sex}
              onChange={(e) =>
                setCalves((rows) => rows.map((r, idx) => (idx === i ? { ...r, sex: e.target.value as 'FEMALE' | 'MALE' } : r)))
              }
            >
              <option value="FEMALE">FEMALE</option>
              <option value="MALE">MALE</option>
            </select>
          </div>
          <div className="field">
            <label>{t('breeding.birthWeight')}</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={calf.weightKg}
              onChange={(e) => setCalves((rows) => rows.map((r, idx) => (idx === i ? { ...r, weightKg: e.target.value } : r)))}
            />
          </div>
          <div className="field">
            <label>{t('animals.name')}</label>
            <input
              value={calf.name}
              onChange={(e) => setCalves((rows) => rows.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r)))}
            />
          </div>
        </div>
      ))}
      {outcome !== 'ABORTED' && (
      <button
        type="button"
        className="btn secondary"
        onClick={() => setCalves((rows) => [...rows, { sex: 'FEMALE', weightKg: '', name: '' }])}
      >
        {t('breeding.addCalf')}
      </button>
      )}
      {error && <p className="error-text">{error}</p>}
      {canWrite && (
        <div className="page-actions">
          <button className="btn" type="submit" disabled={save.isPending || (!noService && !id)}>
            {t('breeding.saveCalving')}
          </button>
        </div>
      )}
    </form>
  );
}

function ColostrumForm({
  records,
  breedingId,
  animalId,
  taskId,
  canWrite,
  onSaved,
}: {
  records: BreedingDto[];
  breedingId: string;
  animalId: string;
  taskId: string;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const recent = records.filter((r) => r.pregnancyStatus === 'DELIVERED');
  const [id, setId] = useState(breedingId || recent.find((r) => r.motherId === animalId)?.id || recent[0]?.id || '');
  const [fedAt, setFedAt] = useState(toDateTimeLocal(new Date()));
  const [liters, setLiters] = useState('1');
  const [source, setSource] = useState<(typeof COLOSTRUM_SOURCES)[number]>('OWN_MOTHER');
  const [method, setMethod] = useState<(typeof COLOSTRUM_METHODS)[number]>('BOTTLE');
  const [quality, setQuality] = useState<(typeof COLOSTRUM_QUALITY)[number]>('THICK_YELLOW');

  const rec = recent.find((r) => r.id === id);
  const hours = rec?.birthDate
    ? (fromDateTimeLocal(fedAt).getTime() - new Date(rec.birthDate).getTime()) / (1000 * 60 * 60)
    : null;
  const hourClass = hours == null ? '' : hours < 2 ? 'ok' : hours <= 6 ? 'warn' : 'bad';

  const save = useMutation({
    mutationFn: () => {
      const body = {
        fedAt: fromDateTimeLocal(fedAt),
        liters: Number(liters),
        volumeLitres: Number(liters),
        source,
        method,
        quality,
        taskId: taskId || undefined,
        calfId: animalId || undefined,
      };
      if (animalId) return recordFarmColostrum(body);
      return recordColostrum(id, body);
    },
    onSuccess: onSaved,
  });

  return (
    <form
      className="card form-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!id) return;
        save.mutate();
      }}
    >
      <h2>{t('breeding.tab.colostrum')}</h2>
      <p className="muted">{t('breeding.colostrumHelp')}</p>
      <div className="form-grid">
        <RecordField records={recent} value={id} onChange={setId} empty={t('breeding.noRecentCalving')} />
        <div className="field">
          <label htmlFor="col-when">{t('breeding.fedAt')}</label>
          <input id="col-when" type="datetime-local" required value={fedAt} onChange={(e) => setFedAt(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="col-l">{t('breeding.colostrumLiters')}</label>
          <input id="col-l" type="number" min="0.1" step="0.1" required value={liters} onChange={(e) => setLiters(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="col-src">{t('breeding.colostrumSource')}</label>
          <select id="col-src" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            {COLOSTRUM_SOURCES.map((v) => (
              <option key={v} value={v}>
                {t(`enum.colostrumSource.${v}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="col-m">{t('breeding.colostrumMethod')}</label>
          <select id="col-m" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {COLOSTRUM_METHODS.map((v) => (
              <option key={v} value={v}>
                {t(`enum.colostrumMethod.${v}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="col-q">{t('breeding.colostrumQuality')}</label>
          <select id="col-q" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
            {COLOSTRUM_QUALITY.map((v) => (
              <option key={v} value={v}>
                {t(`enum.colostrumQuality.${v}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {hours != null && (
        <p className={`hours-pill hours-${hourClass}`}>
          {t('breeding.hoursAfterBirth', { n: hours.toFixed(1) })}
        </p>
      )}
      {canWrite && (
        <div className="page-actions">
          <button className="btn" type="submit" disabled={save.isPending || (!id && !animalId)}>
            {t('breeding.saveColostrum')}
          </button>
        </div>
      )}
    </form>
  );
}

function RecordsPanel({
  records,
  heats,
  onOpen,
}: {
  records: BreedingDto[];
  heats: HeatLogDto[];
  onOpen: (tab: Tab) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="page-actions" style={{ marginBottom: 16 }}>
        <button type="button" className="btn" onClick={() => onOpen('heat')}>
          {t('breeding.logHeat')}
        </button>
        <button type="button" className="btn secondary" onClick={() => onOpen('service')}>
          {t('breeding.add')}
        </button>
      </div>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('breeding.mother')}</th>
              <th>{t('breeding.matingType')}</th>
              <th>{t('breeding.matingDate')}</th>
              <th>{t('breeding.dueDate')}</th>
              <th>{t('breeding.daysRemaining')}</th>
              <th>{t('breeding.daysOpen')}</th>
              <th>{t('breeding.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/animals/${row.motherId}`}>{row.motherTag ?? row.motherId}</Link>
                </td>
                <td>{row.matingType}</td>
                <td>{formatDate(row.matingDate)}</td>
                <td>{formatDate(row.dueDate)}</td>
                <td>{row.daysRemaining ?? '—'}</td>
                <td>{row.daysOpen ?? '—'}</td>
                <td>
                  <StatusChip
                    status={row.pregnancyStatus === 'FAILED' ? 'SICK' : 'PREGNANT'}
                    label={row.pregnancyStatus}
                  />
                </td>
                <td className="row-actions">
                  {row.pregnancyStatus !== 'DELIVERED' && row.pregnancyStatus !== 'FAILED' && (
                    <>
                      <button type="button" className="btn secondary" onClick={() => onOpen('pd')}>
                        {t('breeding.tab.pd')}
                      </button>
                      <button type="button" className="btn secondary" onClick={() => onOpen('calving')}>
                        {t('breeding.tab.calving')}
                      </button>
                    </>
                  )}
                  {row.pregnancyStatus === 'DELIVERED' && !row.colostrumFed && (
                    <button type="button" className="btn" onClick={() => onOpen('colostrum')}>
                      {t('breeding.tab.colostrum')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {heats.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h2>{t('breeding.heatLog')}</h2>
          <ul className="activity-list">
            {heats.slice(0, 12).map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.animalTag ?? row.animalId}</strong>
                  <span className="muted">
                    {' · '}
                    {t(`enum.heatIntensity.${row.intensity}`, { defaultValue: row.intensity })}
                  </span>
                </div>
                <span className="muted">{formatDate(row.observedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type Female = {
  id: string;
  tag: string;
  herdNumber?: string | null;
  name: string | null;
  species: string;
  isPregnant?: boolean;
  lactationStartDate?: string | null;
};

function AnimalField({
  females,
  value,
  onChange,
}: {
  females: Female[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="field">
      <label>{t('breeding.mother')}</label>
      <select required value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('breeding.selectMother')}</option>
        {females.map((a) => (
          <option key={a.id} value={a.id}>
            {a.herdNumber ?? a.tag}
            {a.name ? ` · ${a.name}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function RecordField({
  records,
  value,
  onChange,
  empty,
}: {
  records: BreedingDto[];
  value: string;
  onChange: (id: string) => void;
  empty: string;
}) {
  const { t } = useTranslation();
  if (records.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="field">
      <label>{t('breeding.record')}</label>
      <select required value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('breeding.selectRecord')}</option>
        {records.map((r) => (
          <option key={r.id} value={r.id}>
            {r.motherTag ?? r.motherId} · {formatDate(r.matingDate)} · {r.pregnancyStatus}
          </option>
        ))}
      </select>
    </div>
  );
}

function PedigreeTree({ node }: { node: PedigreeNodeDto }) {
  return (
    <ul className="pedigree-tree">
      <li>
        <strong>{node.herdNumber ?? node.tag}</strong>
        {node.name ? ` · ${node.name}` : ''}
        {(node.dam || node.sire) && (
          <ul>
            {node.dam && (
              <li>
                ♀ <PedigreeTree node={node.dam} />
              </li>
            )}
            {node.sire && (
              <li>
                ♂ <PedigreeTree node={node.sire} />
              </li>
            )}
          </ul>
        )}
      </li>
    </ul>
  );
}

function pedigreeIds(node: PedigreeNodeDto | null | undefined, into = new Set<string>()): Set<string> {
  if (!node) return into;
  into.add(node.id);
  pedigreeIds(node.dam, into);
  pedigreeIds(node.sire, into);
  return into;
}

function relatedPedigree(dam: PedigreeNodeDto | undefined, sire: PedigreeNodeDto | undefined): boolean {
  if (!dam || !sire) return false;
  const a = pedigreeIds(dam.dam);
  pedigreeIds(dam.sire, a);
  const b = pedigreeIds(sire);
  for (const id of a) if (b.has(id)) return true;
  return false;
}

function fmtPct(n: number | null | undefined): string {
  return n == null ? '—' : `${Math.round(n)}%`;
}

function fmtNum(n: number | null | undefined): string {
  return n == null ? '—' : String(n);
}

function isBelow(actual: number | null | undefined, min: number | null | undefined): boolean {
  return actual != null && min != null && actual < min;
}

function isAbove(actual: number | null | undefined, max: number | null | undefined): boolean {
  return actual != null && max != null && actual > max;
}

function daysUntilReady(lactationStart: string | null | undefined, waitingDays: number): number | null {
  if (!lactationStart) return null;
  const ready = new Date(lactationStart);
  ready.setDate(ready.getDate() + waitingDays);
  const left = Math.ceil((ready.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return left > 0 ? left : null;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDateTimeLocal(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function fromDateTimeLocal(value: string): Date {
  return new Date(value);
}
