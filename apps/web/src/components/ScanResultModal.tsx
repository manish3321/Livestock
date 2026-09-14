import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  SPECIES_LABEL,
  formatNPR,
  type AnimalEconomicsDto,
  type BatchEconomicsDto,
} from '@farm/contracts';
import { getAnimal, getAnimalEconomics, updateAnimal } from '../api/animals';
import { getBatch, getBatchEconomics } from '../api/batches';
import { useAuth } from '../auth/auth-context';
import { AnimalActionGrid } from './AnimalActionGrid';
import { ErrorState, LoadingState } from './PageState';
import type { QrTarget } from '../lib/qr';

function EconomicsBlock({
  invested,
  earned,
  net,
  breakdown,
}: {
  invested: number;
  earned: number;
  net: number;
  breakdown: Array<{ label: string; value: number }>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="stats-grid scan-modal-stats">
        <div className="stat-card">
          <span className="stat-label">{t('qr.invested')}</span>
          <span className="stat-value">{formatNPR(invested)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t('qr.earned')}</span>
          <span className="stat-value">{formatNPR(earned)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t('qr.net')}</span>
          <span
            className="stat-value"
            style={{ color: net >= 0 ? undefined : 'var(--danger, #b33)' }}
          >
            {formatNPR(net)}
          </span>
        </div>
      </div>
      <h3 className="scan-modal-subtitle">{t('qr.breakdown')}</h3>
      <dl className="info-grid">
        {breakdown.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{formatNPR(row.value)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function AnimalResult({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();

  const animalQ = useQuery({
    queryKey: ['animal', id],
    queryFn: () => getAnimal(id),
  });
  const econQ = useQuery({
    queryKey: ['animal', id, 'economics'],
    queryFn: () => getAnimalEconomics(id),
  });

  const breedingMut = useMutation({
    mutationFn: (breedingStock: boolean) => updateAnimal(id, { breedingStock }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['animal', id] });
      void qc.invalidateQueries({ queryKey: ['animal', id, 'economics'] });
    },
  });

  if (animalQ.isLoading || econQ.isLoading) return <LoadingState />;
  if (animalQ.isError || econQ.isError || !animalQ.data || !econQ.data) {
    return (
      <ErrorState onRetry={() => void Promise.all([animalQ.refetch(), econQ.refetch()])} />
    );
  }

  const animal = animalQ.data;
  const econ = econQ.data as AnimalEconomicsDto;

  return (
    <div className="scan-result">
      <p className="muted">{t('qr.scanAnimal')}</p>
      <h2>
        {animal.name?.trim() || SPECIES_LABEL[animal.species]} #{animal.tag}
      </h2>
      <div className="chip-row" style={{ marginBottom: 16 }}>
        <span className="meta-pill">{SPECIES_LABEL[animal.species]}</span>
        <span className="meta-pill">{animal.breed}</span>
        {animal.breedingStock && (
          <span className="meta-pill">{t('animals.breedingStock')}</span>
        )}
      </div>

      <h3 className="scan-modal-subtitle">{t('qr.whatNext')}</h3>
      <p className="muted">{t('qr.whatNextHint')}</p>
      <AnimalActionGrid animalId={animal.id} onNavigate={onClose} />
      {can('animals:write') && (
        <div className="page-actions" style={{ marginTop: 16 }}>
          <button
            className="btn secondary"
            type="button"
            disabled={breedingMut.isPending}
            onClick={() => breedingMut.mutate(!animal.breedingStock)}
          >
            {animal.breedingStock ? t('qr.unsetBreeding') : t('qr.setBreeding')}
          </button>
        </div>
      )}

      <EconomicsBlock
        invested={econ.investedTotal}
        earned={econ.earnedTotal}
        net={econ.net}
        breakdown={[
          { label: t('animals.purchaseCost'), value: econ.purchaseCost },
          { label: t('qr.expenses'), value: econ.expenseTotal },
          { label: t('qr.healthCost'), value: econ.healthCostTotal },
          { label: t('qr.revenue'), value: econ.revenueTotal },
        ]}
      />
    </div>
  );
}

function BatchResult({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { can } = useAuth();

  const batchQ = useQuery({
    queryKey: ['batch', id],
    queryFn: () => getBatch(id),
  });
  const econQ = useQuery({
    queryKey: ['batch', id, 'economics'],
    queryFn: () => getBatchEconomics(id),
  });

  if (batchQ.isLoading || econQ.isLoading) return <LoadingState />;
  if (batchQ.isError || econQ.isError || !batchQ.data || !econQ.data) {
    return (
      <ErrorState onRetry={() => void Promise.all([batchQ.refetch(), econQ.refetch()])} />
    );
  }

  const batch = batchQ.data;
  const econ = econQ.data as BatchEconomicsDto;

  return (
    <div className="scan-result">
      <p className="muted">{t('qr.scanBatch')}</p>
      <h2>{batch.name}</h2>
      <div className="chip-row" style={{ marginBottom: 16 }}>
        <span className="meta-pill">{batch.category}</span>
        <span className="meta-pill">
          {batch.currentCount} {t('batches.head')}
        </span>
      </div>

      <EconomicsBlock
        invested={econ.investedTotal}
        earned={econ.earnedTotal}
        net={econ.net}
        breakdown={[
          { label: t('qr.expenses'), value: econ.expenseTotal },
          { label: t('qr.healthCost'), value: econ.healthCostTotal },
          { label: t('qr.revenue'), value: econ.revenueTotal },
        ]}
      />

      <h3 className="scan-modal-subtitle">{t('qr.quickActions')}</h3>
      <div className="page-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
        <Link className="btn" to={`/batches/${batch.id}`} onClick={onClose}>
          {t('qr.openDetail')}
        </Link>
        {can('expenses:submit') && (
          <Link
            className="btn secondary"
            to={`/expenses?herdBatchId=${batch.id}`}
            onClick={onClose}
          >
            {t('qr.addExpense')}
          </Link>
        )}
        {can('health:write') && (
          <Link
            className="btn secondary"
            to={`/health?herdBatchId=${batch.id}`}
            onClick={onClose}
          >
            {t('qr.addHealth')}
          </Link>
        )}
        {can('revenue:write') && (
          <Link
            className="btn secondary"
            to={`/revenue?herdBatchId=${batch.id}`}
            onClick={onClose}
          >
            {t('qr.addRevenue')}
          </Link>
        )}
      </div>
    </div>
  );
}

export function ScanResultModal({
  target,
  onClose,
}: {
  target: QrTarget;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('qr.resultTitle')}
      >
        <div className="modal-sheet-header">
          <h2>{t('qr.resultTitle')}</h2>
          <button className="btn secondary" type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <div className="modal-sheet-body">
          {target.kind === 'animal' ? (
            <AnimalResult id={target.id} onClose={onClose} />
          ) : (
            <BatchResult id={target.id} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
