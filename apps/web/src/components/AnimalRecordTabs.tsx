import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate, type AnimalDetailDto, type Permission } from '@farm/contracts';
import { addWeight, getAnimalProductionStats } from '../api/animals';
import { createHeat, listHeat } from '../api/breeding';
import { createHealthRecord, listHealthRecords } from '../api/health';
import { createProduction } from '../api/production';
import { ErrorState, LoadingState } from './PageState';
import { useAuth } from '../auth/auth-context';
import { useFarmMode } from '../hooks/useFarmMode';
import {
  ANIMAL_RECORD_TABS,
  animalRecordPath,
  parseAnimalTab,
  parseRecordMode,
  type AnimalRecordMode,
  type AnimalRecordTab,
} from '../lib/livestock';

const TOPIC_LABEL: Record<Exclude<AnimalRecordTab, 'overview'>, string> = {
  milk: 'qr.action.milk',
  vaccine: 'qr.action.vaccine',
  treatment: 'qr.action.treatment',
  heat: 'qr.action.heat',
  weight: 'qr.action.weight',
};

const WRITE_PERMISSION: Record<Exclude<AnimalRecordTab, 'overview'>, Permission> = {
  milk: 'production:write',
  vaccine: 'health:write',
  treatment: 'health:write',
  heat: 'breeding:write',
  weight: 'animals:write',
};

function toDateInput(value = new Date()): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDateTimeLocal(value = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function AnimalTopicTabs({ animalId }: { animalId: string }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const tab = parseAnimalTab(params.get('tab'));

  return (
    <nav className="animal-topic-tabs" aria-label={t('nav.animals')}>
      {ANIMAL_RECORD_TABS.map((key) => (
        <Link
          key={key}
          to={animalRecordPath(animalId, key)}
          className={tab === key ? 'active' : ''}
        >
          {key === 'overview' ? t('animals.tabOverview') : t(TOPIC_LABEL[key])}
        </Link>
      ))}
    </nav>
  );
}

export function AnimalRecordPanel({ animal }: { animal: AnimalDetailDto }) {
  const [params] = useSearchParams();
  const tab = parseAnimalTab(params.get('tab'));
  const mode = parseRecordMode(params.get('mode'));
  if (tab === 'overview') return null;
  return <RecordBody animal={animal} tab={tab} mode={mode} />;
}

function RecordBody({
  animal,
  tab,
  mode,
}: {
  animal: AnimalDetailDto;
  tab: Exclude<AnimalRecordTab, 'overview'>;
  mode: AnimalRecordMode;
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canAdd = can(WRITE_PERMISSION[tab]);
  const showAdd = mode === 'add' && canAdd;

  return (
    <div className="card">
      {canAdd && (
        <div className="animal-mode-tabs" role="tablist">
          <Link
            className={!showAdd ? 'active' : ''}
            to={animalRecordPath(animal.id, tab)}
          >
            {t('animals.tabRecords')}
          </Link>
          <Link
            className={showAdd ? 'active' : ''}
            to={animalRecordPath(animal.id, tab, 'add')}
          >
            {t('animals.tabAdd')}
          </Link>
        </div>
      )}
      {showAdd ? (
        <>
          <p className="muted animal-add-hint">{t('animals.addViaScan')}</p>
          <AddForm animal={animal} tab={tab} />
        </>
      ) : (
        <RecordList animal={animal} tab={tab} />
      )}
    </div>
  );
}

function RecordList({
  animal,
  tab,
}: {
  animal: AnimalDetailDto;
  tab: Exclude<AnimalRecordTab, 'overview'>;
}) {
  const { t } = useTranslation();
  const { commercial } = useFarmMode();

  const milkQ = useQuery({
    queryKey: ['animal', animal.id, 'production-stats'],
    queryFn: () => getAnimalProductionStats(animal.id),
    enabled: tab === 'milk',
  });
  const healthQ = useQuery({
    queryKey: ['health-records', animal.id, tab],
    queryFn: () =>
      listHealthRecords({
        animalId: animal.id,
        type: tab === 'vaccine' ? 'VACCINATION' : 'TREATMENT',
        pageSize: 100,
      }),
    enabled: tab === 'vaccine' || tab === 'treatment',
  });
  const heatQ = useQuery({
    queryKey: ['breeding', 'heat', animal.id],
    queryFn: () => listHeat(animal.id),
    enabled: tab === 'heat',
  });

  if (tab === 'milk') {
    if (milkQ.isLoading) return <LoadingState />;
    if (milkQ.isError) return <ErrorState onRetry={() => void milkQ.refetch()} />;
    const stats = milkQ.data;
    if (!stats || stats.last30Days.length === 0) {
      return <p className="muted">{t('common.empty')}</p>;
    }
    return (
      <>
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <span className="stat-label">{t('animals.milkAverage')}</span>
            <span className="stat-value">{stats.milkAverage.toFixed(1)} L</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t('animals.herdAverage')}</span>
            <span className="stat-value">{stats.herdAverage.toFixed(1)} L</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t('animals.milkTotal')}</span>
            <span className="stat-value">{stats.milkTotalLiters.toFixed(1)} L</span>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('common.date')}</th>
              <th>{t('animals.litres')}</th>
            </tr>
          </thead>
          <tbody>
            {stats.last30Days.map((row) => (
              <tr key={row.date}>
                <td>{formatDate(row.date)}</td>
                <td>{row.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  if (tab === 'vaccine' || tab === 'treatment') {
    if (healthQ.isLoading) return <LoadingState />;
    if (healthQ.isError) return <ErrorState onRetry={() => void healthQ.refetch()} />;
    const rows = healthQ.data?.items ?? [];
    if (rows.length === 0) return <p className="muted">{t('common.empty')}</p>;
    return (
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('common.date')}</th>
            <th>{t('health.title')}</th>
            <th>{t('health.medicine')}</th>
            <th>{t('health.nextDueAt')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.performedAt)}</td>
              <td>{row.title}</td>
              <td>{row.medicine ?? '—'}</td>
              <td>{row.nextDueAt ? formatDate(row.nextDueAt) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tab === 'heat') {
    if (heatQ.isLoading) return <LoadingState />;
    if (heatQ.isError) return <ErrorState onRetry={() => void heatQ.refetch()} />;
    const rows = heatQ.data?.items ?? [];
    if (rows.length === 0) return <p className="muted">{t('common.empty')}</p>;
    return (
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('common.date')}</th>
            <th>{t('animals.heatIntensity')}</th>
            <th>{t('common.notes')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.observedAt)}</td>
              <td>{row.intensity}</td>
              <td>{row.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (animal.weights.length === 0) return <p className="muted">{t('common.empty')}</p>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>{t('animals.date')}</th>
          <th>{t('animals.weight')}</th>
          {commercial && <th>{t('animals.bcs')}</th>}
        </tr>
      </thead>
      <tbody>
        {animal.weights.map((w) => (
          <tr key={w.id}>
            <td>{formatDate(w.recordedAt)}</td>
            <td>{w.weightKg} kg</td>
            {commercial && <td>{w.bcs ?? '—'}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AddForm({
  animal,
  tab,
}: {
  animal: AnimalDetailDto;
  tab: Exclude<AnimalRecordTab, 'overview'>;
}) {
  const { t } = useTranslation();
  const { commercial } = useFarmMode();
  const qc = useQueryClient();
  const [, setParams] = useSearchParams();
  const afterSave = () => {
    setParams({ tab }, { replace: true });
  };
  const [error, setError] = useState<string | null>(null);
  const [litres, setLitres] = useState('');
  const [date, setDate] = useState(toDateInput());
  const [title, setTitle] = useState('');
  const [medicine, setMedicine] = useState('');
  const [notes, setNotes] = useState('');
  const [when, setWhen] = useState(toDateTimeLocal());
  const [intensity, setIntensity] = useState<'WEAK' | 'MEDIUM' | 'STRONG'>('MEDIUM');
  const [weightKg, setWeightKg] = useState('');
  const [bcs, setBcs] = useState('');

  const milkMut = useMutation({
    mutationFn: () =>
      createProduction({
        type: 'MILK',
        entryDate: new Date(date),
        quantity: Number(litres),
        unit: 'L',
        animalId: animal.id,
      }),
    onSuccess: () => {
      setLitres('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['animal', animal.id, 'production-stats'] });
      afterSave();
    },
    onError: (err: Error) => setError(err.message),
  });
  const healthMut = useMutation({
    mutationFn: () =>
      createHealthRecord({
        type: tab === 'vaccine' ? 'VACCINATION' : 'TREATMENT',
        title,
        animalId: animal.id,
        performedAt: new Date(date),
        medicine: medicine || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      setTitle('');
      setMedicine('');
      setNotes('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['health-records', animal.id] });
      afterSave();
    },
    onError: (err: Error) => setError(err.message),
  });
  const heatMut = useMutation({
    mutationFn: () =>
      createHeat({
        animalId: animal.id,
        observedAt: new Date(when),
        intensity,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      setNotes('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['breeding', 'heat', animal.id] });
      afterSave();
    },
    onError: (err: Error) => setError(err.message),
  });
  const weightMut = useMutation({
    mutationFn: () =>
      addWeight(animal.id, {
        weightKg: Number(weightKg),
        recordedAt: new Date(),
        bcs: bcs ? Number(bcs) : undefined,
      }),
    onSuccess: () => {
      setWeightKg('');
      setBcs('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['animal', animal.id] });
      void qc.invalidateQueries({ queryKey: ['animals'] });
      afterSave();
    },
    onError: (err: Error) => setError(err.message),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (tab === 'milk') {
      if (!litres || Number(litres) <= 0) {
        setError(t('animals.weightRequired'));
        return;
      }
      milkMut.mutate();
      return;
    }
    if (tab === 'vaccine' || tab === 'treatment') {
      if (!title.trim()) {
        setError(t('health.requiredFields'));
        return;
      }
      healthMut.mutate();
      return;
    }
    if (tab === 'heat') {
      heatMut.mutate();
      return;
    }
    if (!weightKg || Number(weightKg) <= 0) {
      setError(t('animals.weightRequired'));
      return;
    }
    weightMut.mutate();
  };

  const pending =
    milkMut.isPending || healthMut.isPending || heatMut.isPending || weightMut.isPending;

  return (
    <form className="form-card animal-add-form" onSubmit={onSubmit}>
      {tab === 'milk' && (
        <>
          <div className="field">
            <label htmlFor="animal-litres">{t('animals.litres')}</label>
            <input
              id="animal-litres"
              type="number"
              min="0.1"
              step="0.1"
              value={litres}
              onChange={(e) => setLitres(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="animal-milk-date">{t('common.date')}</label>
            <input
              id="animal-milk-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </>
      )}
      {(tab === 'vaccine' || tab === 'treatment') && (
        <>
          <div className="field">
            <label htmlFor="animal-health-title">{t('health.title')}</label>
            <input
              id="animal-health-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="animal-health-date">{t('health.performedAt')}</label>
            <input
              id="animal-health-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          {tab === 'treatment' && (
            <div className="field">
              <label htmlFor="animal-medicine">{t('health.medicine')}</label>
              <input
                id="animal-medicine"
                value={medicine}
                onChange={(e) => setMedicine(e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="animal-health-notes">{t('common.notes')}</label>
            <input
              id="animal-health-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </>
      )}
      {tab === 'heat' && (
        <>
          <div className="field">
            <label htmlFor="animal-heat-when">{t('common.date')}</label>
            <input
              id="animal-heat-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="animal-heat-intensity">{t('animals.heatIntensity')}</label>
            <select
              id="animal-heat-intensity"
              value={intensity}
              onChange={(e) => setIntensity(e.target.value as 'WEAK' | 'MEDIUM' | 'STRONG')}
            >
              <option value="WEAK">{t('animals.heatWeak')}</option>
              <option value="MEDIUM">{t('animals.heatMedium')}</option>
              <option value="STRONG">{t('animals.heatStrong')}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="animal-heat-notes">{t('common.notes')}</label>
            <input
              id="animal-heat-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </>
      )}
      {tab === 'weight' && (
        <>
          <div className="field">
            <label htmlFor="animal-weight">{t('animals.weightKg')}</label>
            <input
              id="animal-weight"
              type="number"
              min="0.1"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              required
            />
          </div>
          {commercial && (
            <div className="field">
              <label htmlFor="animal-bcs">{t('animals.bcs')}</label>
              <input
                id="animal-bcs"
                type="number"
                min="1"
                max="5"
                value={bcs}
                onChange={(e) => setBcs(e.target.value)}
              />
            </div>
          )}
        </>
      )}
      {error && <p className="error-text">{error}</p>}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? t('common.loading') : t('common.save')}
      </button>
    </form>
  );
}
