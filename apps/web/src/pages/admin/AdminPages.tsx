import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ROLES, formatDateTime, type Role } from '@farm/contracts';
import { useAuth } from '../../auth/auth-context';
import { api } from '../../api/client';
import { toQuery } from '../../api/query';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';

interface Member {
  userId: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
}

interface AuditRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  userId: string | null;
}

export function AdminMembersPage() {
  const { t } = useTranslation();
  const { can, patchUser } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: '',
    name: '',
    role: 'WORKER' as Role,
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [farmForm, setFarmForm] = useState({
    name: '',
    location: '',
    currency: 'NPR',
    timezone: 'Asia/Kathmandu',
    mode: 'HOUSEHOLD' as 'HOUSEHOLD' | 'COMMERCIAL',
  });

  const farmQ = useQuery({
    queryKey: ['admin', 'farm'],
    queryFn: () =>
      api<{
        name: string;
        location: string | null;
        currency: string;
        timezone: string;
        mode: 'HOUSEHOLD' | 'COMMERCIAL';
      }>('/v1/farms/me'),
  });

  useEffect(() => {
    if (!farmQ.data) return;
    setFarmForm({
      name: farmQ.data.name,
      location: farmQ.data.location ?? '',
      currency: farmQ.data.currency,
      timezone: farmQ.data.timezone,
      mode: farmQ.data.mode === 'COMMERCIAL' ? 'COMMERCIAL' : 'HOUSEHOLD',
    });
  }, [farmQ.data]);

  const query = useQuery({
    queryKey: ['admin', 'members'],
    queryFn: () => api<Member[]>('/v1/farms/me/members'),
    enabled: can('users:manage'),
  });

  const create = useMutation({
    mutationFn: () =>
      api('/v1/farms/me/members', {
        method: 'POST',
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      setShowForm(false);
      setForm({ email: '', name: '', role: 'WORKER', password: '' });
      setError(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'members'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMember = useMutation({
    mutationFn: ({
      userId,
      role,
      isActive,
    }: {
      userId: string;
      role?: Role;
      isActive?: boolean;
    }) =>
      api(`/v1/farms/me/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role, isActive }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'members'] }),
  });

  const saveFarm = useMutation({
    mutationFn: () =>
      api<{ name: string; mode: 'HOUSEHOLD' | 'COMMERCIAL' }>('/v1/farms/me', {
        method: 'PATCH',
        body: JSON.stringify(farmForm),
      }),
    onSuccess: (farm) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'farm'] });
      patchUser({
        farmName: farm.name,
        farmMode: farm.mode === 'COMMERCIAL' ? 'COMMERCIAL' : 'HOUSEHOLD',
      });
    },
  });

  const columns = useMemo<Column<Member>[]>(
    () => [
      { key: 'name', header: t('admin.name'), render: (r) => r.name },
      { key: 'email', header: t('admin.email'), render: (r) => r.email },
      {
        key: 'role',
        header: t('admin.role'),
        render: (r) => (
          <select
            value={r.role}
            onChange={(e) =>
              updateMember.mutate({ userId: r.userId, role: e.target.value as Role })
            }
            disabled={updateMember.isPending}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`common.role.${role}`)}
              </option>
            ))}
          </select>
        ),
      },
      {
        key: 'active',
        header: t('admin.active'),
        render: (r) => (
          <button
            className="btn secondary"
            type="button"
            disabled={updateMember.isPending}
            onClick={() => updateMember.mutate({ userId: r.userId, isActive: !r.isActive })}
          >
            {r.isActive ? t('admin.deactivate') : t('admin.activate')}
          </button>
        ),
      },
    ],
    [t],
  );

  if (!can('users:manage')) return <p className="muted">{t('errors.forbidden')}</p>;
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('admin.members')}</h1>
          <p className="page-subtitle">{t('admin.membersSubtitle')}</p>
        </div>
        <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? t('common.cancel') : t('admin.addMember')}
        </button>
      </div>

      {can('farm:manage') && (
        <form
          className="card form-card"
          style={{ marginBottom: 24 }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            saveFarm.mutate();
          }}
        >
          <h2>{t('admin.farmSettings')}</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="farm-name">{t('admin.farmName')}</label>
              <input
                id="farm-name"
                value={farmForm.name}
                onChange={(e) => setFarmForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="farm-loc">{t('admin.location')}</label>
              <input
                id="farm-loc"
                value={farmForm.location}
                onChange={(e) => setFarmForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="farm-cur">{t('admin.currency')}</label>
              <input
                id="farm-cur"
                value={farmForm.currency}
                onChange={(e) => setFarmForm((f) => ({ ...f, currency: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="farm-tz">{t('admin.timezone')}</label>
              <input
                id="farm-tz"
                value={farmForm.timezone}
                onChange={(e) => setFarmForm((f) => ({ ...f, timezone: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="farm-mode">{t('admin.farmMode')}</label>
              <select
                id="farm-mode"
                value={farmForm.mode}
                onChange={(e) =>
                  setFarmForm((f) => ({
                    ...f,
                    mode: e.target.value as 'HOUSEHOLD' | 'COMMERCIAL',
                  }))
                }
              >
                <option value="HOUSEHOLD">{t('admin.modeHousehold')}</option>
                <option value="COMMERCIAL">{t('admin.modeCommercial')}</option>
              </select>
              <p className="muted" style={{ marginTop: 6 }}>
                {farmForm.mode === 'HOUSEHOLD'
                  ? t('admin.modeHouseholdHint')
                  : t('admin.modeCommercialHint')}
              </p>
            </div>
          </div>
          <button className="btn" type="submit" disabled={saveFarm.isPending}>
            {t('common.save')}
          </button>
        </form>
      )}

      {showForm && (
        <form
          className="card form-card"
          style={{ marginBottom: 24 }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="m-name">{t('admin.name')}</label>
              <input
                id="m-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="m-email">{t('admin.email')}</label>
              <input
                id="m-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="m-role">{t('admin.role')}</label>
              <select
                id="m-role"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`common.role.${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="m-pass">{t('admin.tempPassword')}</label>
              <input
                id="m-pass"
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={create.isPending}>
            {t('common.save')}
          </button>
        </form>
      )}

      <DataTable columns={columns} rows={query.data ?? []} rowKey={(r) => r.userId} />
    </div>
  );
}

export function AdminAuditPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const query = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () =>
      api<{ items: AuditRow[] }>(`/v1/audit${toQuery({ page: 1, pageSize: 100 })}`),
    enabled: can('audit:read'),
  });

  const columns = useMemo<Column<AuditRow>[]>(
    () => [
      {
        key: 'when',
        header: t('common.date'),
        render: (r) => formatDateTime(r.createdAt),
      },
      { key: 'action', header: t('admin.action'), render: (r) => r.action },
      {
        key: 'entity',
        header: t('admin.entity'),
        render: (r) => [r.entityType, r.entityId].filter(Boolean).join(' ') || '—',
      },
    ],
    [t],
  );

  if (!can('audit:read')) return <p className="muted">{t('errors.forbidden')}</p>;
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('admin.audit')}</h1>
          <p className="page-subtitle">{t('admin.auditSubtitle')}</p>
        </div>
      </div>
      <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(r) => r.id} />
    </div>
  );
}
