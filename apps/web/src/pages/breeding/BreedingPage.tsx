import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate, formatNPR, type PedigreeNodeDto, type SpeciesConfigDto } from '@farm/contracts';
import { listAnimals } from '../../api/animals';
import {
  animalPedigree,
  breedingMetrics,
  createBreeding,
  createHeat,
  deleteBreeding,
  deleteHeat,
  listBreeding,
  listHeat,
  pregnancyCheck,
  recordCalving,
  recordColostrum,
  recordFarmCalving,
  recordFarmColostrum,
  updateBreeding,
  type BreedingDto,
  type HeatLogDto,
} from '../../api/breeding';
import { listSpeciesConfig } from '../../api/config';
import { useAuth } from '../../auth/auth-context';
import { FieldError } from '../../components/FieldError';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';
import { useToast } from '../../components/Toast';
import { animalLabel, parseBreedingStage, type BreedingStage } from '../../lib/breeding-cycle';
import { inRange, notFuture, required, useFieldErrors } from '../../lib/form-errors';
import { BreedingBoard } from './BreedingBoard';
import { BreedingWatch } from './BreedingWatch';

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
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const animalId = searchParams.get('animalId') ?? '';
  const breedingId = searchParams.get('breedingId') ?? '';
  const taskId = searchParams.get('taskId') ?? '';
  const formParam = parseBreedingStage(searchParams.get('form'));
  const herdTab = searchParams.get('tab') === 'herd';
  const walkTab = searchParams.get('tab') === 'walk';
  const watchTab = !herdTab && !walkTab;
  const sheetOpen = Boolean(formParam);
  const isWorker = user?.role === 'WORKER';

  const breedingQ = useQuery({
    queryKey: ['breeding'],
    queryFn: () => listBreeding({ pageSize: 200 }),
    enabled: sheetOpen || herdTab,
  });
  const heatQ = useQuery({
    queryKey: ['breeding', 'heat'],
    queryFn: () => listHeat(),
    enabled: herdTab,
  });
  const animalsQ = useQuery({
    queryKey: ['animals', 'females'],
    queryFn: () => listAnimals({ gender: 'FEMALE', pageSize: 200 }),
    enabled: sheetOpen || herdTab,
  });
  const malesQ = useQuery({
    queryKey: ['animals', 'males'],
    queryFn: () => listAnimals({ gender: 'MALE', pageSize: 200 }),
    enabled: formParam === 'service',
  });
  const configQ = useQuery({
    queryKey: ['species-config'],
    queryFn: listSpeciesConfig,
    enabled: sheetOpen,
  });
  const metricsQ = useQuery({
    queryKey: ['breeding', 'metrics'],
    queryFn: breedingMetrics,
    enabled: herdTab && !isWorker,
  });

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

  const dam = females.find((row) => row.id === animalId);
  const stage: BreedingStage = formParam || 'heat';

  const closeSheet = () => {
    const next = new URLSearchParams();
    if (herdTab) next.set('tab', 'herd');
    if (walkTab) next.set('tab', 'walk');
    setSearchParams(next, { replace: true });
  };

  const openSheet = (opts: { animalId?: string; form?: BreedingStage; breedingId?: string; taskId?: string }) => {
    const next = new URLSearchParams();
    if (herdTab) next.set('tab', 'herd');
    if (walkTab) next.set('tab', 'walk');
    const nextAnimal = opts.animalId ?? animalId;
    const nextForm = opts.form ?? stage;
    if (nextAnimal) next.set('animalId', nextAnimal);
    if (nextForm) next.set('form', nextForm);
    if (opts.breedingId || (opts.form && ['pd', 'calving', 'colostrum'].includes(opts.form) ? breedingId : '')) {
      next.set('breedingId', opts.breedingId ?? breedingId);
    }
    const nextTask = opts.taskId ?? (nextForm && ['heat', 'service', 'pd', 'colostrum'].includes(nextForm) ? taskId : '');
    if (nextTask) next.set('taskId', nextTask);
    setSearchParams(next, { replace: true });
  };

  const afterSave = () => {
    void qc.invalidateQueries({ queryKey: ['breeding'] });
    closeSheet();
  };

  const damLabel = animalLabel(
    dam,
    records.find((row) => row.motherId === animalId)?.motherTag ??
      heats.find((row) => row.animalId === animalId)?.animalTag,
  );

  return (
    <div className="breeding-desk">
      <div className="page-header">
        <div>
          <h1>{t('nav.breeding')}</h1>
          <p className="page-subtitle">{t('breeding.subtitle')}</p>
        </div>
        {can('breeding:write') && !isWorker && (
          <div className="page-actions">
            <button type="button" className="btn" onClick={() => openSheet({ form: 'heat' })}>
              {t('breeding.logHeat')}
            </button>
            <button type="button" className="btn secondary" onClick={() => openSheet({ form: 'service' })}>
              {t('breeding.add')}
            </button>
          </div>
        )}
      </div>

        <div className="choice-row breeding-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`choice-btn ${watchTab ? 'selected' : ''}`}
            onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
          >
            {t('breeding.tabs.watch')}
          </button>
          <button
            type="button"
            role="tab"
            className={`choice-btn ${walkTab ? 'selected' : ''}`}
            onClick={() => setSearchParams(new URLSearchParams({ tab: 'walk' }), { replace: true })}
          >
            {t('breeding.tabs.walk')}
          </button>
          {!isWorker && (
            <button
              type="button"
              role="tab"
              className={`choice-btn ${herdTab ? 'selected' : ''}`}
              onClick={() => setSearchParams(new URLSearchParams({ tab: 'herd' }), { replace: true })}
            >
              {t('breeding.tabs.herd')}
            </button>
          )}
        </div>

      {herdTab && !isWorker ? (
        <>
          {metricsQ.isError ? (
            <ErrorState onRetry={() => void metricsQ.refetch()} />
          ) : (
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
                miss={isAbove(metrics?.daysOpen, metrics?.targets.daysOpenMax)}
              />
            </div>
          )}
          {metrics && metrics.observers.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h2>{t('breeding.observersTitle')}</h2>
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
          {breedingQ.isError ? (
            <ErrorState onRetry={() => void breedingQ.refetch()} />
          ) : (
            <RecordsPanel
              records={records}
              heats={heats}
              canWrite={can('breeding:write')}
              onOpen={(form, animalId, breedingId) => openSheet({ form, animalId, breedingId })}
              onDeleted={() => void qc.invalidateQueries({ queryKey: ['breeding'] })}
            />
          )}
        </>
      ) : walkTab ? (
        <BreedingBoard
          onOpen={(item) =>
            openSheet({
              animalId: item.animalId,
              form: parseBreedingStage(item.form ?? null) || undefined,
              taskId: item.taskId,
            })
          }
          onToast={notify}
        />
      ) : (
        <BreedingWatch
          onOpen={(item) =>
            openSheet({
              animalId: item.animalId,
              form: parseBreedingStage(item.form ?? null) || undefined,
            })
          }
        />
      )}

      <Modal
        open={sheetOpen}
        onClose={closeSheet}
        className="breeding-sheet"
        kicker={t(`breeding.tab.${stage}`)}
        title={animalId ? damLabel : t('nav.breeding')}
        label={t(`breeding.tab.${stage}`)}
      >
        {(animalsQ.isLoading ||
          (['service', 'pd', 'calving', 'colostrum'].includes(stage) && breedingQ.isLoading)) && <LoadingState />}
        {!animalsQ.isLoading && stage === 'heat' && (
          <HeatForm
            females={females}
            animalId={animalId}
            configBySpecies={configBySpecies}
            canWrite={can('breeding:write')}
            observerDefault={user?.name ?? ''}
            taskId={taskId}
            onSaved={afterSave}
          />
        )}
        {!animalsQ.isLoading && !breedingQ.isLoading && stage === 'service' && (
          <ServiceForm
            females={females}
            males={males}
            records={records}
            animalId={animalId}
            configBySpecies={configBySpecies}
            canWrite={can('breeding:write')}
            onSaved={afterSave}
          />
        )}
        {!animalsQ.isLoading && !breedingQ.isLoading && stage === 'pd' && (
          <PdForm
            records={records}
            breedingId={breedingId}
            animalId={animalId}
            canWrite={can('breeding:write')}
            onSaved={afterSave}
          />
        )}
        {!animalsQ.isLoading && !breedingQ.isLoading && stage === 'calving' && (
          <CalvingForm
            records={records}
            females={females}
            breedingId={breedingId}
            animalId={animalId}
            canWrite={can('breeding:write')}
            onSaved={(nextId, opts) => {
              void qc.invalidateQueries({ queryKey: ['breeding'] });
              void qc.invalidateQueries({ queryKey: ['animals'] });
              if (opts?.aborted) {
                closeSheet();
                return;
              }
              openSheet({
                form: 'colostrum',
                animalId: animalId || undefined,
                breedingId: nextId,
              });
            }}
          />
        )}
        {!animalsQ.isLoading && !breedingQ.isLoading && stage === 'colostrum' && (
          <ColostrumForm
            records={records}
            breedingId={breedingId}
            animalId={animalId}
            taskId={taskId}
            canWrite={can('breeding:write')}
            onSaved={afterSave}
          />
        )}
      </Modal>
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
  animalId,
  configBySpecies,
  canWrite,
  observerDefault,
  taskId,
  onSaved,
}: {
  females: Female[];
  animalId: string;
  configBySpecies: Map<string, SpeciesConfigDto>;
  canWrite: boolean;
  observerDefault: string;
  taskId: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(animalId);
  const [observedAt, setObservedAt] = useState(toDateTimeLocal(new Date()));
  const [intensity, setIntensity] = useState<'WEAK' | 'MEDIUM' | 'STRONG'>('STRONG');
  const [silent, setSilent] = useState(false);
  const [signs, setSigns] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const { errors, validate, clearField, fieldProps } = useFieldErrors('heat');

  useEffect(() => {
    if (animalId) setSelected(animalId);
  }, [animalId]);

  const animal = females.find((a) => a.id === selected);
  const cfg = animal ? configBySpecies.get(animal.species) : undefined;
  const tooSoon = animal && cfg ? daysUntilReady(animal.lactationStartDate, cfg.voluntaryWaitingDays) : null;

  const save = useMutation({
    meta: { successKey: 'breeding.toast.heatSaved' },
    mutationFn: () =>
      createHeat({
        animalId: selected,
        observedAt: fromDateTimeLocal(observedAt),
        intensity: silent ? 'SILENT_SUSPECTED' : intensity,
        observerName: observerDefault || undefined,
        signs: [...(silent ? ['SILENT_SUSPECTED'] : []), ...signs].join(','),
        taskId: taskId || undefined,
      }),
    onSuccess: onSaved,
  });

  return (
    <form
      className="sheet-form"
      onSubmit={(e) => {
        e.preventDefault();
        const ok = validate({
          animalId: required(selected, t('common.requiredField')),
          observedAt:
            required(observedAt, t('common.requiredField')) ||
            notFuture(fromDateTimeLocal(observedAt), t('common.futureDate')),
        });
        if (ok) save.mutate();
      }}
    >
      {!animalId && (
        <AnimalField
          females={females}
          value={selected}
          onChange={(id) => {
            clearField('animalId');
            setSelected(id);
          }}
          error={errors.animalId}
          fieldProps={fieldProps('animalId')}
        />
      )}
      {animal?.isPregnant && <div className="hold-banner hold-banner-red">{t('breeding.heatOnPregnant')}</div>}
      {tooSoon != null && <p className="warn-text">{t('breeding.tooSoon', { n: tooSoon })}</p>}

      <div className="field">
        <label htmlFor="heat-observedAt">{t('breeding.observedAt')}</label>
        <input
          {...fieldProps('observedAt')}
          type="datetime-local"
          data-autofocus={animalId ? true : undefined}
          value={observedAt}
          onChange={(e) => {
            clearField('observedAt');
            setObservedAt(e.target.value);
          }}
        />
        <FieldError id="heat-observedAt-error" message={errors.observedAt} />
      </div>

      <fieldset className="sheet-fieldset">
        <legend>{t('breeding.intensity')}</legend>
        <div className="choice-row">
          {(['STRONG', 'MEDIUM', 'WEAK'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`choice-btn ${intensity === v && !silent ? 'selected' : ''}`}
              onClick={() => {
                setSilent(false);
                setIntensity(v);
              }}
            >
              {t(`enum.heatIntensity.${v}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <button type="button" className="text-link" onClick={() => setMore((v) => !v)}>
        {more ? t('common.close') : t('breeding.moreSigns')}
      </button>
      {more && (
        <fieldset className="chip-fieldset">
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
      )}

      <FormFooter
        canWrite={canWrite}
        pending={save.isPending}
        label={t('breeding.saveHeat')}
        hasErrors={Object.keys(errors).length > 0}
      />
    </form>
  );
}

/** Save button plus the one-line "fix the highlighted fields" summary. */
function FormFooter({
  canWrite,
  pending,
  label,
  hasErrors,
}: {
  canWrite: boolean;
  pending: boolean;
  label: string;
  hasErrors: boolean;
}) {
  const { t } = useTranslation();
  if (!canWrite) return null;
  return (
    <div className="sheet-save-block">
      {hasErrors && <p className="form-summary-error">{t('common.fixErrors')}</p>}
      <button className="btn sheet-save" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? t('common.saving') : label}
      </button>
    </div>
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
  const [more, setMore] = useState(false);
  const { errors, validate, clearField, fieldProps } = useFieldErrors('svc');

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

  const damTreeQ = useQuery({
    queryKey: ['pedigree', motherId],
    queryFn: () => animalPedigree(motherId),
    enabled: Boolean(motherId) && Boolean(sireId),
  });
  const sireTreeQ = useQuery({
    queryKey: ['pedigree', sireId],
    queryFn: () => animalPedigree(sireId),
    enabled: Boolean(sireId),
  });
  const related = relatedPedigree(damTreeQ.data, sireTreeQ.data);

  const save = useMutation({
    meta: { successKey: 'breeding.toast.serviceSaved' },
    mutationFn: () =>
      createBreeding({
        motherId,
        matingType,
        fatherTagOrAi: fatherTagOrAi || undefined,
        sireId: sireId || undefined,
        matingDate: new Date(matingDate),
        pregnancyStatus: 'OPEN',
      }),
    onSuccess: onSaved,
  });

  return (
    <form
      className="sheet-form"
      onSubmit={(e) => {
        e.preventDefault();
        const rules = {
          animalId: required(motherId, t('common.requiredField')),
          matingDate:
            required(matingDate, t('common.requiredField')) ||
            notFuture(new Date(matingDate), t('common.futureDate')),
        };
        // The date lives behind "more"; open it so the error is visible.
        if (rules.matingDate) setMore(true);
        if (validate(rules)) save.mutate();
      }}
    >
      {!animalId && (
        <AnimalField
          females={females}
          value={motherId}
          onChange={(id) => {
            clearField('animalId');
            setMotherId(id);
          }}
          error={errors.animalId}
          fieldProps={fieldProps('animalId')}
        />
      )}
      {animal?.isPregnant && <div className="hold-banner hold-banner-red">{t('breeding.alreadyPregnant')}</div>}
      {tooSoon != null && <p className="warn-text">{t('breeding.tooSoon', { n: tooSoon })}</p>}
      {serviceNo >= 3 && <p className="warn-text">{t('breeding.repeatWarn', { n: serviceNo })}</p>}
      {related && <p className="warn-text">{t('breeding.inbreedingWarn')}</p>}

      <div className="choice-row">
        <button
          type="button"
          className={`choice-btn ${matingType === 'AI' ? 'selected' : ''}`}
          onClick={() => setMatingType('AI')}
        >
          {t('breeding.ai')}
        </button>
        <button
          type="button"
          className={`choice-btn ${matingType === 'NATURAL' ? 'selected' : ''}`}
          onClick={() => setMatingType('NATURAL')}
        >
          {t('breeding.natural')}
        </button>
      </div>

      <div className="field">
        <label htmlFor="svc-sire">{matingType === 'AI' ? t('breeding.straw') : t('breeding.bull')}</label>
        <input id="svc-sire" value={fatherTagOrAi} onChange={(e) => setFather(e.target.value)} />
      </div>

      <button type="button" className="text-link" onClick={() => setMore((v) => !v)}>
        {more ? t('common.close') : t('breeding.moreService')}
      </button>
      {more && (
        <>
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
            <label htmlFor="svc-matingDate">{t('breeding.matingDate')}</label>
            <input
              {...fieldProps('matingDate')}
              type="date"
              value={matingDate}
              onChange={(e) => {
                clearField('matingDate');
                setMatingDate(e.target.value);
              }}
            />
            <FieldError id="svc-matingDate-error" message={errors.matingDate} />
          </div>
        </>
      )}

      <FormFooter
        canWrite={canWrite}
        pending={save.isPending}
        label={t('breeding.saveService')}
        hasErrors={Object.keys(errors).length > 0}
      />
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
  const scoped = animalId ? records.filter((r) => r.motherId === animalId) : records;
  const open = scoped.filter((r) => r.pregnancyStatus === 'PREGNANT' || r.pregnancyStatus === 'OPEN' || r.pregnancyStatus === 'INCONCLUSIVE');
  const [id, setId] = useState(breedingId || open.find((r) => r.motherId === animalId)?.id || open[0]?.id || '');
  const [result, setResult] = useState<'CONFIRMED' | 'OPEN' | 'INCONCLUSIVE'>('CONFIRMED');
  const [daysPregnant, setDays] = useState('');
  const { errors, validate, clearField, fieldProps } = useFieldErrors('pd');

  useEffect(() => {
    if (breedingId) setId(breedingId);
  }, [breedingId]);

  const save = useMutation({
    meta: { successKey: 'breeding.toast.pdSaved' },
    mutationFn: () =>
      pregnancyCheck(id, {
        result,
        daysPregnant: daysPregnant ? Number(daysPregnant) : undefined,
        estimatedDaysPregnant: daysPregnant ? Number(daysPregnant) : undefined,
        checkDate: new Date(),
      }),
    onSuccess: onSaved,
  });

  return (
    <form
      className="sheet-form"
      onSubmit={(e) => {
        e.preventDefault();
        const ok = validate({
          record: required(id, t('common.requiredField')),
          daysPregnant:
            result === 'CONFIRMED'
              ? inRange(daysPregnant, 1, 400, t('common.numberRange', { min: 1, max: 400 }))
              : '',
        });
        if (ok) save.mutate();
      }}
    >
      {open.length !== 1 && (
        <RecordField
          records={open}
          value={id}
          onChange={(next) => {
            clearField('record');
            setId(next);
          }}
          empty={t('breeding.noOpenServices')}
          error={errors.record}
          fieldProps={fieldProps('record')}
        />
      )}
      {open.length === 1 && (
        <p className="muted">
          {t('breeding.matingDate')}: {formatDate(open[0]!.matingDate)}
        </p>
      )}

      <div className="choice-row">
        {(
          [
            ['CONFIRMED', t('breeding.pdConfirmed')],
            ['OPEN', t('breeding.pdOpen')],
            ['INCONCLUSIVE', t('breeding.pdInconclusive')],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`choice-btn ${result === value ? 'selected' : ''}`}
            onClick={() => setResult(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {result === 'CONFIRMED' && (
        <div className="field">
          <label htmlFor="pd-daysPregnant">{t('breeding.daysPregnant')}</label>
          <input
            {...fieldProps('daysPregnant')}
            type="number"
            min="1"
            max="400"
            value={daysPregnant}
            onChange={(e) => {
              clearField('daysPregnant');
              setDays(e.target.value);
            }}
          />
          <FieldError id="pd-daysPregnant-error" message={errors.daysPregnant} />
        </div>
      )}

      <FormFooter
        canWrite={canWrite}
        pending={save.isPending}
        label={t('breeding.savePd')}
        hasErrors={Object.keys(errors).length > 0}
      />
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
  onSaved: (breedingId?: string, opts?: { aborted?: boolean }) => void;
}) {
  const { t } = useTranslation();
  const scoped = animalId ? records.filter((r) => r.motherId === animalId) : records;
  const pending = scoped.filter((r) => r.pregnancyStatus !== 'DELIVERED' && r.pregnancyStatus !== 'FAILED');
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
  const [more, setMore] = useState(false);
  const { errors, validate, clearField, fieldProps } = useFieldErrors('calve');

  const save = useMutation({
    meta: { successKey: 'breeding.toast.calvingSaved' },
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
    onSuccess: (row) => {
      const nextId = row && typeof row === 'object' && 'id' in row ? String((row as { id: string }).id) : id;
      onSaved(nextId, { aborted: outcome === 'ABORTED' });
    },
  });

  return (
    <form
      className="sheet-form"
      onSubmit={(e) => {
        e.preventDefault();
        const needsRecord = !noService && outcome !== 'ABORTED';
        const badWeight = calves.some((c) => c.weightKg !== '' && Number(c.weightKg) < 0);
        const rules = {
          record: needsRecord ? required(id, t('common.requiredField')) : '',
          animalId: needsRecord ? '' : required(motherId || id, t('errors.damRequired')),
          birthDate:
            required(birthDate, t('common.requiredField')) ||
            notFuture(fromDateTimeLocal(birthDate), t('common.futureDate')),
          calfWeight: badWeight ? t('common.numberRange', { min: 0, max: 200 }) : '',
        };
        if (rules.calfWeight) setMore(true);
        if (validate(rules)) save.mutate();
      }}
    >
      {pending.length !== 1 && !noService && (
        <RecordField
          records={pending}
          value={id}
          onChange={(next) => {
            clearField('record');
            setId(next);
          }}
          empty={t('breeding.noPendingCalving')}
          error={errors.record}
          fieldProps={fieldProps('record')}
        />
      )}
      {!animalId && noService && (
        <AnimalField
          females={females}
          value={motherId}
          onChange={(next) => {
            clearField('animalId');
            setMotherId(next);
          }}
          error={errors.animalId}
          fieldProps={fieldProps('animalId')}
        />
      )}

      <div className="field">
        <label htmlFor="calve-birthDate">{t('breeding.calvingAt')}</label>
        <input
          {...fieldProps('birthDate')}
          type="datetime-local"
          value={birthDate}
          onChange={(e) => {
            clearField('birthDate');
            setBirthDate(e.target.value);
          }}
        />
        <FieldError id="calve-birthDate-error" message={errors.birthDate} />
      </div>

      <div className="choice-row">
        <button
          type="button"
          className={`choice-btn ${outcome === 'LIVE' ? 'selected' : ''}`}
          onClick={() => setOutcome('LIVE')}
        >
          {t('breeding.outcomeLive')}
        </button>
        <button
          type="button"
          className={`choice-btn ${outcome === 'ABORTED' ? 'selected' : ''}`}
          onClick={() => setOutcome('ABORTED')}
        >
          {t('breeding.outcomeAborted')}
        </button>
      </div>

      {outcome === 'ABORTED' && <p className="warn-text">{t('breeding.abortHelp')}</p>}

      <fieldset className="sheet-fieldset">
        <legend>{t('breeding.calvingDifficulty')}</legend>
        <div className="choice-row">
          {DIFFICULTY.map((v) => (
            <button
              key={v}
              type="button"
              className={`choice-btn ${difficulty === v ? 'selected' : ''}`}
              onClick={() => setDifficulty(v)}
            >
              {t(`enum.calvingDifficulty.${v}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {outcome !== 'ABORTED' && (
        <fieldset className="sheet-fieldset">
          <legend>{t('animals.gender')}</legend>
          <div className="choice-row">
            {(['FEMALE', 'MALE'] as const).map((sex) => (
              <button
                key={sex}
                type="button"
                className={`choice-btn ${calves[0]?.sex === sex ? 'selected' : ''}`}
                onClick={() => setCalves((rows) => rows.map((r, idx) => (idx === 0 ? { ...r, sex } : r)))}
              >
                {sex === 'FEMALE' ? t('animals.female') : t('animals.male')}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <button type="button" className="text-link" onClick={() => setMore((v) => !v)}>
        {more ? t('common.close') : t('breeding.moreCalving')}
      </button>
      {more && (
        <>
          <label className="filter-chip">
            <input type="checkbox" checked={noService} onChange={(e) => setNoService(e.target.checked)} />
            {t('breeding.noService')}
          </label>
          <label>
            <input type="checkbox" checked={placenta} onChange={(e) => setPlacenta(e.target.checked)} /> {t('breeding.placenta12h')}
          </label>
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
          {outcome !== 'ABORTED' &&
            calves.map((calf, i) => (
              <div className="form-grid" key={i}>
                {i > 0 && (
                  <div className="field">
                    <label>{t('animals.gender')}</label>
                    <select
                      value={calf.sex}
                      onChange={(e) =>
                        setCalves((rows) =>
                          rows.map((r, idx) => (idx === i ? { ...r, sex: e.target.value as 'FEMALE' | 'MALE' } : r)),
                        )
                      }
                    >
                      <option value="FEMALE">{t('animals.female')}</option>
                      <option value="MALE">{t('animals.male')}</option>
                    </select>
                  </div>
                )}
                <div className="field">
                  <label htmlFor={i === 0 ? 'calve-calfWeight' : `calve-calfWeight-${i}`}>
                    {t('breeding.birthWeight')}
                  </label>
                  <input
                    id={i === 0 ? 'calve-calfWeight' : `calve-calfWeight-${i}`}
                    type="number"
                    min="0"
                    step="0.1"
                    aria-invalid={errors.calfWeight ? true : undefined}
                    value={calf.weightKg}
                    onChange={(e) => {
                      clearField('calfWeight');
                      setCalves((rows) => rows.map((r, idx) => (idx === i ? { ...r, weightKg: e.target.value } : r)));
                    }}
                  />
                  {i === 0 && <FieldError id="calve-calfWeight-error" message={errors.calfWeight} />}
                </div>
                <div className="field">
                  <label>{t('animals.name')}</label>
                  <input
                    value={calf.name}
                    onChange={(e) =>
                      setCalves((rows) => rows.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r)))
                    }
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
        </>
      )}

      <FormFooter
        canWrite={canWrite}
        pending={save.isPending}
        label={t('breeding.saveCalving')}
        hasErrors={Object.keys(errors).length > 0}
      />
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
  const scoped = animalId ? records.filter((r) => r.motherId === animalId) : records;
  const recent = scoped.filter((r) => r.pregnancyStatus === 'DELIVERED');
  const [id, setId] = useState(breedingId || recent.find((r) => r.motherId === animalId)?.id || recent[0]?.id || '');
  const [fedAt, setFedAt] = useState(toDateTimeLocal(new Date()));
  const [liters, setLiters] = useState('1');
  const [source, setSource] = useState<(typeof COLOSTRUM_SOURCES)[number]>('OWN_MOTHER');
  const [method, setMethod] = useState<(typeof COLOSTRUM_METHODS)[number]>('BOTTLE');
  const [quality, setQuality] = useState<(typeof COLOSTRUM_QUALITY)[number]>('THICK_YELLOW');
  const [more, setMore] = useState(false);
  const { errors, validate, clearField, fieldProps } = useFieldErrors('col');

  const rec = recent.find((r) => r.id === id);
  const hours = rec?.birthDate
    ? (fromDateTimeLocal(fedAt).getTime() - new Date(rec.birthDate).getTime()) / (1000 * 60 * 60)
    : null;
  const hourClass = hours == null ? '' : hours < 2 ? 'ok' : hours <= 6 ? 'warn' : 'bad';

  const save = useMutation({
    meta: { successKey: 'breeding.toast.colostrumSaved' },
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
      className="sheet-form"
      onSubmit={(e) => {
        e.preventDefault();
        const ok = validate({
          record: animalId ? '' : required(id, t('common.requiredField')),
          fedAt:
            required(fedAt, t('common.requiredField')) ||
            notFuture(fromDateTimeLocal(fedAt), t('common.futureDate')),
          liters:
            required(liters, t('common.requiredField')) ||
            inRange(liters, 0.1, 20, t('common.numberRange', { min: 0.1, max: 20 })),
        });
        if (ok) save.mutate();
      }}
    >
      {!animalId && (
        <RecordField
          records={recent}
          value={id}
          onChange={(next) => {
            clearField('record');
            setId(next);
          }}
          empty={t('breeding.noRecentCalving')}
          error={errors.record}
          fieldProps={fieldProps('record')}
        />
      )}

      <div className="field">
        <label htmlFor="col-fedAt">{t('breeding.fedAt')}</label>
        <input
          {...fieldProps('fedAt')}
          type="datetime-local"
          value={fedAt}
          onChange={(e) => {
            clearField('fedAt');
            setFedAt(e.target.value);
          }}
        />
        <FieldError id="col-fedAt-error" message={errors.fedAt} />
      </div>
      <div className="field">
        <label htmlFor="col-liters">{t('breeding.colostrumLiters')}</label>
        <input
          {...fieldProps('liters')}
          type="number"
          min="0.1"
          step="0.1"
          value={liters}
          onChange={(e) => {
            clearField('liters');
            setLiters(e.target.value);
          }}
        />
        <FieldError id="col-liters-error" message={errors.liters} />
      </div>

      <fieldset className="sheet-fieldset">
        <legend>{t('breeding.colostrumMethod')}</legend>
        <div className="choice-row">
          {COLOSTRUM_METHODS.map((v) => (
            <button
              key={v}
              type="button"
              className={`choice-btn ${method === v ? 'selected' : ''}`}
              onClick={() => setMethod(v)}
            >
              {t(`enum.colostrumMethod.${v}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {hours != null && (
        <p className={`hours-pill hours-${hourClass}`}>{t('breeding.hoursAfterBirth', { n: hours.toFixed(1) })}</p>
      )}

      <button type="button" className="text-link" onClick={() => setMore((v) => !v)}>
        {more ? t('common.close') : t('breeding.moreColostrum')}
      </button>
      {more && (
        <>
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
            <label htmlFor="col-q">{t('breeding.colostrumQuality')}</label>
            <select id="col-q" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
              {COLOSTRUM_QUALITY.map((v) => (
                <option key={v} value={v}>
                  {t(`enum.colostrumQuality.${v}`)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <FormFooter
        canWrite={canWrite}
        pending={save.isPending}
        label={t('breeding.saveColostrum')}
        hasErrors={Object.keys(errors).length > 0}
      />
    </form>
  );
}

function RecordsPanel({
  records,
  heats,
  canWrite,
  onOpen,
  onDeleted,
}: {
  records: BreedingDto[];
  heats: HeatLogDto[];
  canWrite: boolean;
  onOpen: (form: BreedingStage, animalId: string, breedingId?: string) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'breeding' | 'heat'; id: string } | null>(null);
  const deleteBreedingMut = useMutation({
    meta: { successKey: 'breeding.toast.recordDeleted' },
    mutationFn: (id: string) => deleteBreeding(id),
    onSuccess: onDeleted,
    onSettled: () => setPendingDelete(null),
  });
  const deleteHeatMut = useMutation({
    meta: { successKey: 'breeding.toast.heatDeleted' },
    mutationFn: (id: string) => deleteHeat(id),
    onSuccess: onDeleted,
    onSettled: () => setPendingDelete(null),
  });
  const editing = records.find((row) => row.id === editingId) ?? null;
  const deletePending = deleteBreedingMut.isPending || deleteHeatMut.isPending;

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'breeding') deleteBreedingMut.mutate(pendingDelete.id);
    else deleteHeatMut.mutate(pendingDelete.id);
  };

  return (
    <div>
      <div className="card">
        <h2>{t('breeding.tab.records')}</h2>
        {records.length === 0 ? (
          <p className="empty-note">{t('common.empty')}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table stacked-sm">
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
                    <td data-label={t('breeding.mother')}>
                      <button type="button" className="text-link" onClick={() => onOpen('heat', row.motherId, row.id)}>
                        {row.motherTag ?? row.motherId}
                      </button>
                    </td>
                    <td data-label={t('breeding.matingType')}>{row.matingType}</td>
                    <td data-label={t('breeding.matingDate')}>{formatDate(row.matingDate)}</td>
                    <td data-label={t('breeding.dueDate')}>{formatDate(row.dueDate)}</td>
                    <td data-label={t('breeding.daysRemaining')}>{row.daysRemaining ?? '—'}</td>
                    <td data-label={t('breeding.daysOpen')}>{row.daysOpen ?? '—'}</td>
                    <td data-label={t('breeding.status')}>
                      <StatusChip
                        status={row.pregnancyStatus === 'FAILED' ? 'SICK' : 'PREGNANT'}
                        label={row.pregnancyStatus}
                      />
                    </td>
                    <td className="row-actions" data-label={t('common.actions')}>
                      {row.pregnancyStatus !== 'DELIVERED' && row.pregnancyStatus !== 'FAILED' && (
                        <>
                          <button type="button" className="btn secondary" onClick={() => onOpen('pd', row.motherId, row.id)}>
                            {t('breeding.tab.pd')}
                          </button>
                          <button type="button" className="btn secondary" onClick={() => onOpen('calving', row.motherId, row.id)}>
                            {t('breeding.tab.calving')}
                          </button>
                        </>
                      )}
                      {row.pregnancyStatus === 'DELIVERED' && (
                        <button type="button" className="btn secondary" onClick={() => onOpen('colostrum', row.motherId, row.id)}>
                          {t('breeding.tab.colostrum')}
                        </button>
                      )}
                      {canWrite && (
                        <>
                          <button type="button" className="btn secondary" onClick={() => setEditingId(row.id)}>
                            {t('common.edit')}
                          </button>
                          <button
                            type="button"
                            className="btn secondary danger"
                            onClick={() => setPendingDelete({ kind: 'breeding', id: row.id })}
                          >
                            {t('common.delete')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && canWrite && (
        <BreedingEditForm
          record={editing}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            onDeleted();
          }}
        />
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <h2>{t('breeding.heatLog')}</h2>
        {heats.length === 0 ? (
          <p className="empty-note">{t('common.empty')}</p>
        ) : (
          <ul className="record-rows">
            {heats.slice(0, 12).map((row) => (
              <li key={row.id} className="record-row">
                <div className="record-row-main">
                  <button type="button" className="text-link" onClick={() => onOpen('heat', row.animalId)}>
                    {row.animalTag ?? row.animalId}
                  </button>
                  <span className="muted">
                    {t(`enum.heatIntensity.${row.intensity}`, { defaultValue: row.intensity })}
                  </span>
                </div>
                <span className="record-row-date muted">{formatDate(row.observedAt)}</span>
                {canWrite && (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn secondary danger"
                      onClick={() => setPendingDelete({ kind: 'heat', id: row.id })}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete != null}
        message={
          pendingDelete?.kind === 'heat'
            ? t('breeding.confirmDeleteHeat')
            : t('breeding.confirmDeleteBreeding')
        }
        pending={deletePending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function BreedingEditForm({
  record,
  onClose,
  onSaved,
}: {
  record: BreedingDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(record.pregnancyStatus);
  const [matingType, setMatingType] = useState(record.matingType);
  const [matingDate, setMatingDate] = useState(record.matingDate.slice(0, 10));
  const [father, setFather] = useState(record.fatherTagOrAi ?? '');
  const [notes, setNotes] = useState(record.notes ?? '');
  const { errors, validate, clearField, fieldProps } = useFieldErrors('edit');
  const formId = `breeding-edit-${record.id}`;
  const save = useMutation({
    meta: { successKey: 'breeding.toast.recordUpdated' },
    mutationFn: () =>
      updateBreeding(record.id, {
        pregnancyStatus: status as 'OPEN' | 'PREGNANT' | 'CONFIRMED' | 'DELIVERED' | 'FAILED',
        matingType: matingType as 'NATURAL' | 'AI',
        matingDate: new Date(matingDate),
        fatherTagOrAi: father || undefined,
        notes: notes || undefined,
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t('breeding.editRecord')}
      kicker={record.motherTag ?? record.motherId}
      label={t('breeding.editRecord')}
      footer={
        <div className="sheet-actions">
          <button className="btn secondary" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn" type="submit" form={formId} disabled={save.isPending} aria-busy={save.isPending}>
            {save.isPending ? t('common.saving') : t('breeding.saveEdit')}
          </button>
        </div>
      }
    >
      <form
        id={formId}
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault();
          const ok = validate({
            matingDate:
              required(matingDate, t('common.requiredField')) ||
              notFuture(new Date(matingDate), t('common.futureDate')),
          });
          if (ok) save.mutate();
        }}
      >
        {Object.keys(errors).length > 0 && <p className="form-summary-error">{t('common.fixErrors')}</p>}
        <div className="field">
          <label htmlFor="edit-status">{t('breeding.status')}</label>
          <select id="edit-status" data-autofocus value={status} onChange={(e) => setStatus(e.target.value)}>
            {['OPEN', 'PREGNANT', 'CONFIRMED', 'DELIVERED', 'FAILED'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="edit-mating-type">{t('breeding.matingType')}</label>
          <select id="edit-mating-type" value={matingType} onChange={(e) => setMatingType(e.target.value)}>
            <option value="NATURAL">{t('breeding.natural')}</option>
            <option value="AI">{t('breeding.ai')}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="edit-matingDate">{t('breeding.matingDate')}</label>
          <input
            {...fieldProps('matingDate')}
            type="date"
            value={matingDate}
            onChange={(e) => {
              clearField('matingDate');
              setMatingDate(e.target.value);
            }}
          />
          <FieldError id="edit-matingDate-error" message={errors.matingDate} />
        </div>
        <div className="field">
          <label htmlFor="edit-father">{t('breeding.fatherTagOrAi')}</label>
          <input id="edit-father" value={father} onChange={(e) => setFather(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="edit-notes">{t('common.notes')}</label>
          <textarea id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </form>
    </Modal>
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

type FieldA11yProps = { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string };

function AnimalField({
  females,
  value,
  onChange,
  error,
  fieldProps,
}: {
  females: Female[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
  fieldProps?: FieldA11yProps;
}) {
  const { t } = useTranslation();
  const props = fieldProps ?? { id: 'breeding-mother' };
  return (
    <div className="field">
      <label htmlFor={props.id}>{t('breeding.mother')}</label>
      <select {...props} data-autofocus value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('breeding.selectMother')}</option>
        {females.map((a) => (
          <option key={a.id} value={a.id}>
            {a.herdNumber ?? a.tag}
            {a.name ? ` · ${a.name}` : ''}
          </option>
        ))}
      </select>
      <FieldError id={`${props.id}-error`} message={error} />
    </div>
  );
}

function RecordField({
  records,
  value,
  onChange,
  empty,
  error,
  fieldProps,
}: {
  records: BreedingDto[];
  value: string;
  onChange: (id: string) => void;
  empty: string;
  error?: string;
  fieldProps?: FieldA11yProps;
}) {
  const { t } = useTranslation();
  if (records.length === 0) return <p className="empty-note">{empty}</p>;
  const props = fieldProps ?? { id: 'breeding-record' };
  return (
    <div className="field">
      <label htmlFor={props.id}>{t('breeding.record')}</label>
      <select {...props} data-autofocus value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('breeding.selectRecord')}</option>
        {records.map((r) => (
          <option key={r.id} value={r.id}>
            {r.motherTag ?? r.motherId} · {formatDate(r.matingDate)} · {r.pregnancyStatus}
          </option>
        ))}
      </select>
      <FieldError id={`${props.id}-error`} message={error} />
    </div>
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
