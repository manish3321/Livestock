import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  GROUP_HEALTH,
  POULTRY_TYPES,
  formatDate,
  type GroupCreate,
} from '@farm/contracts';
import { createGroup, listGroups, logMortality, type GroupDto } from '../../api/groups';
import { useAuth } from '../../auth/auth-context';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';

export function GroupsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [mortalityFor, setMortalityFor] = useState<string | null>(null);
  const [mortalityCount, setMortalityCount] = useState('');
  const [mortalityReason, setMortalityReason] = useState('');
  const [form, setForm] = useState<Partial<GroupCreate>>({
    poultryType: 'LAYER',
    healthStatus: 'HEALTHY',
    startedAt: new Date(),
  });
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups({ pageSize: 100 }),
  });

  const save = useMutation({
    mutationFn: () =>
      createGroup({
        name: form.name!,
        poultryType: form.poultryType!,
        breed: form.breed!,
        initialCount: Number(form.initialCount),
        startedAt: form.startedAt ?? new Date(),
        healthStatus: form.healthStatus ?? 'HEALTHY',
        notes: form.notes,
      }),
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setForm({ poultryType: 'LAYER', healthStatus: 'HEALTHY', startedAt: new Date() });
      void qc.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const mortality = useMutation({
    mutationFn: ({ id, count, reason }: { id: string; count: number; reason?: string }) =>
      logMortality(id, { count, reason, occurredAt: new Date() }),
    onSuccess: () => {
      setMortalityFor(null);
      setMortalityCount('');
      setMortalityReason('');
      void qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim() || !form.breed?.trim() || !form.initialCount) {
      setError(t('groups.requiredFields'));
      return;
    }
    save.mutate();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.groups')}</h1>
          <p className="page-subtitle">{t('groups.subtitle')}</p>
        </div>
        {can('groups:write') && (
          <div className="page-actions">
            <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? t('common.cancel') : t('groups.add')}
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="grp-name">{t('groups.name')}</label>
              <input
                id="grp-name"
                required
                value={form.name ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="grp-type">{t('groups.poultryType')}</label>
              <select
                id="grp-type"
                value={form.poultryType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    poultryType: e.target.value as GroupCreate['poultryType'],
                  }))
                }
              >
                {POULTRY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="grp-breed">{t('groups.breed')}</label>
              <input
                id="grp-breed"
                required
                value={form.breed ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, breed: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="grp-count">{t('groups.initialCount')}</label>
              <input
                id="grp-count"
                type="number"
                min="1"
                required
                value={form.initialCount ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    initialCount: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="grp-health">{t('groups.healthStatus')}</label>
              <select
                id="grp-health"
                value={form.healthStatus ?? 'HEALTHY'}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    healthStatus: e.target.value as GroupCreate['healthStatus'],
                  }))
                }
              >
                {GROUP_HEALTH.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="grp-started">{t('groups.startedAt')}</label>
              <input
                id="grp-started"
                type="date"
                required
                value={toDateInput(form.startedAt)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    startedAt: e.target.value ? new Date(e.target.value) : new Date(),
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
            query.data.items.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                canWrite={can('groups:write')}
                mortalityFor={mortalityFor}
                mortalityCount={mortalityCount}
                mortalityReason={mortalityReason}
                pending={mortality.isPending}
                onOpenMortality={() => setMortalityFor(group.id)}
                onCancelMortality={() => setMortalityFor(null)}
                onCountChange={setMortalityCount}
                onReasonChange={setMortalityReason}
                onSubmitMortality={() =>
                  mortality.mutate({
                    id: group.id,
                    count: Number(mortalityCount),
                    reason: mortalityReason || undefined,
                  })
                }
                t={t}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function GroupCard({
  group,
  canWrite,
  mortalityFor,
  mortalityCount,
  mortalityReason,
  pending,
  onOpenMortality,
  onCancelMortality,
  onCountChange,
  onReasonChange,
  onSubmitMortality,
  t,
}: {
  group: GroupDto;
  canWrite: boolean;
  mortalityFor: string | null;
  mortalityCount: string;
  mortalityReason: string;
  pending: boolean;
  onOpenMortality: () => void;
  onCancelMortality: () => void;
  onCountChange: (v: string) => void;
  onReasonChange: (v: string) => void;
  onSubmitMortality: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="card flock-card">
      <div className="flock-head">
        <h2>{group.name}</h2>
        <StatusChip status={group.healthStatus === 'SICK' ? 'SICK' : 'ACTIVE'} label={group.healthStatus} />
      </div>
      <p className="muted">
        {group.poultryType} · {group.breed} · {formatDate(group.startedAt)}
      </p>
      <div className="count-compare">
        <div>
          <span className="stat-label">{t('groups.initialCount')}</span>
          <span className="stat-value">{group.initialCount}</span>
        </div>
        <div>
          <span className="stat-label">{t('groups.currentCount')}</span>
          <span className="stat-value">{group.currentCount}</span>
        </div>
      </div>
      {canWrite && (
        mortalityFor === group.id ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (Number(mortalityCount) > 0) onSubmitMortality();
            }}
          >
            <input
              type="number"
              min="1"
              placeholder={t('groups.mortalityCount')}
              value={mortalityCount}
              onChange={(e) => onCountChange(e.target.value)}
            />
            <input
              placeholder={t('groups.reason')}
              value={mortalityReason}
              onChange={(e) => onReasonChange(e.target.value)}
            />
            <button className="btn" type="submit" disabled={pending}>
              {t('common.save')}
            </button>
            <button className="btn secondary" type="button" onClick={onCancelMortality}>
              {t('common.cancel')}
            </button>
          </form>
        ) : (
          <button className="btn secondary" type="button" onClick={onOpenMortality}>
            {t('groups.logMortality')}
          </button>
        )
      )}
    </div>
  );
}

function toDateInput(value: Date | string | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}
