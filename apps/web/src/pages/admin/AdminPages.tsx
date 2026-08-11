import { FormEvent, useMemo, useState } from 'react';
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
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: '',
    name: '',
    role: 'WORKER' as Role,
    password: '',
  });
  const [error, setError] = useState<string | null>(null);

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

  const columns = useMemo<Column<Member>[]>(
    () => [
      { key: 'name', header: t('admin.name'), render: (r) => r.name },
      { key: 'email', header: t('admin.email'), render: (r) => r.email },
      { key: 'role', header: t('admin.role'), render: (r) => r.role },
      {
        key: 'active',
        header: t('admin.active'),
        render: (r) => (r.isActive ? t('common.yes') : t('common.no')),
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
