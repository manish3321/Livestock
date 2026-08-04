import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@farm/contracts';
import { addSampling, addWaterQuality, getFish } from '../../api/fish';
import { useAuth } from '../../auth/auth-context';
import { ErrorState, LoadingState } from '../../components/PageState';

export function FishDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();

  const [sampleCount, setSampleCount] = useState('');
  const [totalWeight, setTotalWeight] = useState('');
  const [estCount, setEstCount] = useState('');
  const [temp, setTemp] = useState('');
  const [ph, setPh] = useState('');
  const [dO2, setDO2] = useState('');

  const query = useQuery({
    queryKey: ['fish', id],
    queryFn: () => getFish(id!),
    enabled: Boolean(id),
  });

  const sampling = useMutation({
    mutationFn: () =>
      addSampling(id!, {
        sampledAt: new Date(),
        sampleCount: Number(sampleCount),
        totalWeightGrams: Number(totalWeight),
        estimatedCount: estCount ? Number(estCount) : undefined,
      }),
    onSuccess: () => {
      setSampleCount('');
      setTotalWeight('');
      setEstCount('');
      void qc.invalidateQueries({ queryKey: ['fish', id] });
      void qc.invalidateQueries({ queryKey: ['fish'] });
    },
  });

  const water = useMutation({
    mutationFn: () =>
      addWaterQuality(id!, {
        recordedAt: new Date(),
        temperatureC: temp ? Number(temp) : undefined,
        ph: ph ? Number(ph) : undefined,
        dissolvedO2: dO2 ? Number(dO2) : undefined,
      }),
    onSuccess: () => {
      setTemp('');
      setPh('');
      setDO2('');
      void qc.invalidateQueries({ queryKey: ['fish', id] });
    },
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) {
    return <ErrorState onRetry={() => void query.refetch()} />;
  }

  const batch = query.data;

  const onSample = (e: FormEvent) => {
    e.preventDefault();
    if (!sampleCount || !totalWeight) return;
    sampling.mutate();
  };

  const onWater = (e: FormEvent) => {
    e.preventDefault();
    water.mutate();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/fish" className="back-link">
            ← {t('nav.fish')}
          </Link>
          <h1>{batch.name}</h1>
          <p className="page-subtitle">
            {batch.species} · {t('fish.ageDays')}:{' '}
            {batch.ageDays ?? ageDays(batch.stockingDate)}
          </p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <span className="stat-label">{t('fish.estimatedCount')}</span>
          <span className="stat-value">{batch.estimatedCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t('fish.avgWeight')}</span>
          <span className="stat-value">{batch.avgWeightGrams} g</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t('fish.stockingDate')}</span>
          <span className="stat-value">{formatDate(batch.stockingDate)}</span>
        </div>
      </div>

      <div className="detail-grid">
        <div className="card">
          <h2>{t('fish.sampling')}</h2>
          {can('fish:write') && (
            <form className="form-grid" onSubmit={onSample}>
              <div className="field">
                <label htmlFor="sample-count">{t('fish.sampleCount')}</label>
                <input
                  id="sample-count"
                  type="number"
                  min="1"
                  required
                  value={sampleCount}
                  onChange={(e) => setSampleCount(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="sample-weight">{t('fish.totalWeight')}</label>
                <input
                  id="sample-weight"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={totalWeight}
                  onChange={(e) => setTotalWeight(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="sample-est">{t('fish.estimatedCount')}</label>
                <input
                  id="sample-est"
                  type="number"
                  min="1"
                  value={estCount}
                  onChange={(e) => setEstCount(e.target.value)}
                />
              </div>
              <div className="page-actions">
                <button className="btn" type="submit" disabled={sampling.isPending}>
                  {t('fish.addSampling')}
                </button>
              </div>
            </form>
          )}
          {(batch.samplings?.length ?? 0) === 0 ? (
            <p className="muted">{t('common.empty')}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('fish.sampleCount')}</th>
                  <th>{t('fish.avgWeight')}</th>
                </tr>
              </thead>
              <tbody>
                {batch.samplings.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.sampledAt)}</td>
                    <td>{s.sampleCount}</td>
                    <td>{s.avgWeightGrams} g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>{t('fish.waterQuality')}</h2>
          {can('fish:write') && (
            <form className="form-grid" onSubmit={onWater}>
              <div className="field">
                <label htmlFor="wq-temp">{t('fish.temperature')}</label>
                <input
                  id="wq-temp"
                  type="number"
                  step="0.1"
                  value={temp}
                  onChange={(e) => setTemp(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="wq-ph">{t('fish.ph')}</label>
                <input
                  id="wq-ph"
                  type="number"
                  step="0.01"
                  value={ph}
                  onChange={(e) => setPh(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="wq-do">{t('fish.dissolvedO2')}</label>
                <input
                  id="wq-do"
                  type="number"
                  step="0.01"
                  value={dO2}
                  onChange={(e) => setDO2(e.target.value)}
                />
              </div>
              <div className="page-actions">
                <button className="btn" type="submit" disabled={water.isPending}>
                  {t('fish.addWaterQuality')}
                </button>
              </div>
            </form>
          )}
          {(batch.waterQuality?.length ?? 0) === 0 ? (
            <p className="muted">{t('common.empty')}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('fish.temperature')}</th>
                  <th>{t('fish.ph')}</th>
                  <th>{t('fish.dissolvedO2')}</th>
                </tr>
              </thead>
              <tbody>
                {batch.waterQuality.map((w) => (
                  <tr key={w.id}>
                    <td>{formatDate(w.recordedAt)}</td>
                    <td>{w.temperatureC ?? '—'}</td>
                    <td>{w.ph ?? '—'}</td>
                    <td>{w.dissolvedO2 ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function ageDays(stockingDate: string): number {
  const ms = Date.now() - new Date(stockingDate).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
