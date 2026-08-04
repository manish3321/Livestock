import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate, type FishBatchCreate } from '@farm/contracts';
import { createFish, listFish } from '../../api/fish';
import { useAuth } from '../../auth/auth-context';
import { ErrorState, LoadingState } from '../../components/PageState';

export function FishListPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<FishBatchCreate>>({
    stockingDate: new Date(),
  });
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['fish'],
    queryFn: () => listFish({ pageSize: 100 }),
  });

  const save = useMutation({
    mutationFn: () =>
      createFish({
        name: form.name!,
        species: form.species!,
        stockingDate: form.stockingDate ?? new Date(),
        estimatedCount: Number(form.estimatedCount),
        avgWeightGrams: Number(form.avgWeightGrams),
        notes: form.notes,
      }),
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setForm({ stockingDate: new Date() });
      void qc.invalidateQueries({ queryKey: ['fish'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (
      !form.name?.trim() ||
      !form.species?.trim() ||
      !form.estimatedCount ||
      !form.avgWeightGrams
    ) {
      setError(t('fish.requiredFields'));
      return;
    }
    save.mutate();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.fish')}</h1>
          <p className="page-subtitle">{t('fish.subtitle')}</p>
        </div>
        {can('fish:write') && (
          <div className="page-actions">
            <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? t('common.cancel') : t('fish.add')}
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="fish-name">{t('fish.name')}</label>
              <input
                id="fish-name"
                required
                value={form.name ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="fish-species">{t('fish.species')}</label>
              <input
                id="fish-species"
                required
                value={form.species ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, species: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="fish-count">{t('fish.estimatedCount')}</label>
              <input
                id="fish-count"
                type="number"
                min="1"
                required
                value={form.estimatedCount ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    estimatedCount: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="fish-weight">{t('fish.avgWeight')}</label>
              <input
                id="fish-weight"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.avgWeightGrams ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    avgWeightGrams: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="fish-stocked">{t('fish.stockingDate')}</label>
              <input
                id="fish-stocked"
                type="date"
                required
                value={toDateInput(form.stockingDate)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    stockingDate: e.target.value ? new Date(e.target.value) : new Date(),
                  }))
                }
              />
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
        <div className="card-grid">
          {query.data.items.length === 0 ? (
            <p className="muted">{t('common.empty')}</p>
          ) : (
            query.data.items.map((batch) => (
              <Link key={batch.id} to={`/fish/${batch.id}`} className="card flock-card link-card">
                <h2>{batch.name}</h2>
                <p className="muted">
                  {batch.species} · {formatDate(batch.stockingDate)}
                </p>
                <dl className="info-grid">
                  <div>
                    <dt>{t('fish.estimatedCount')}</dt>
                    <dd>{batch.estimatedCount}</dd>
                  </div>
                  <div>
                    <dt>{t('fish.avgWeight')}</dt>
                    <dd>{batch.avgWeightGrams} g</dd>
                  </div>
                  <div>
                    <dt>{t('fish.ageDays')}</dt>
                    <dd>{batch.ageDays ?? ageDays(batch.stockingDate)}</dd>
                  </div>
                </dl>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ageDays(stockingDate: string): number {
  const ms = Date.now() - new Date(stockingDate).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function toDateInput(value: Date | string | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}
