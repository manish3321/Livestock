import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  formatDateTime,
  type PlatformClientCreate,
  type PlatformClientDetailDto,
  type PlatformClientListItemDto,
} from '@farm/contracts';
import { useAuth } from '../../auth/auth-context';
import { api } from '../../api/client';
import { ErrorState, LoadingState } from '../../components/PageState';

export function PlatformLayout() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  return (
    <div className="platform-shell">
      <header className="platform-topbar">
        <div>
          <p className="platform-kicker">{t('platform.kicker')}</p>
          <h1>{t('platform.title')}</h1>
        </div>
        <div className="platform-topbar-actions">
          <span className="muted">{user?.email}</span>
          <button type="button" className="btn secondary" onClick={() => void signOut()}>
            {t('nav.logout')}
          </button>
        </div>
      </header>
      <main className="platform-main">
        <Outlet />
      </main>
    </div>
  );
}

export function PlatformClientsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const query = useQuery({
    queryKey: ['platform', 'clients'],
    queryFn: () => api<PlatformClientListItemDto[]>('/v1/platform/clients'),
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{t('platform.clients')}</h2>
          <p className="page-subtitle">{t('platform.clientsHelp')}</p>
        </div>
        <button type="button" className="btn" onClick={() => setShowNew((v) => !v)}>
          {showNew ? t('common.cancel') : t('platform.createClient')}
        </button>
      </div>

      {showNew ? (
        <CreateClientForm
          onDone={(farmId) => {
            setShowNew(false);
            void navigate(`/platform/clients/${farmId}`);
          }}
        />
      ) : null}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('platform.farmName')}</th>
              <th>{t('platform.location')}</th>
              <th>{t('platform.status')}</th>
              <th>{t('platform.admin')}</th>
              <th>{t('platform.staff')}</th>
              <th>{t('platform.created')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((row) => (
              <tr key={row.farmId}>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>{row.location ?? '—'}</td>
                <td>
                  <span className={`chip member-status ${row.isActive ? 'on' : 'off'}`}>
                    {row.isActive ? t('platform.active') : t('platform.suspended')}
                  </span>
                </td>
                <td>
                  {row.adminName ?? '—'}
                  {row.adminEmail ? (
                    <>
                      <br />
                      <span className="muted">{row.adminEmail}</span>
                    </>
                  ) : null}
                </td>
                <td>{row.staffCount}</td>
                <td>{formatDateTime(row.createdAt)}</td>
                <td>
                  <Link className="btn secondary" to={`/platform/clients/${row.farmId}`}>
                    {t('platform.open')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(query.data ?? []).length === 0 ? <p className="muted">{t('platform.empty')}</p> : null}
      </div>
    </div>
  );
}

function CreateClientForm({ onDone }: { onDone: (farmId: string) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    location: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => {
      const body: PlatformClientCreate = {
        name: form.name,
        location: form.location.trim() || null,
        adminName: form.adminName,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
      };
      return api<PlatformClientDetailDto>('/v1/platform/clients', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ['platform', 'clients'] });
      onDone(row.farmId);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <form
      className="card form-card"
      style={{ marginBottom: 24 }}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        setError(null);
        create.mutate();
      }}
    >
      <h3>{t('platform.createClient')}</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="pc-name">{t('platform.farmName')}</label>
          <input
            id="pc-name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="pc-loc">{t('platform.location')}</label>
          <input
            id="pc-loc"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="pc-admin">{t('platform.adminName')}</label>
          <input
            id="pc-admin"
            required
            value={form.adminName}
            onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="pc-email">{t('platform.adminEmail')}</label>
          <input
            id="pc-email"
            type="email"
            required
            value={form.adminEmail}
            onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="pc-pass">{t('platform.adminPassword')}</label>
          <input
            id="pc-pass"
            type="password"
            required
            minLength={8}
            value={form.adminPassword}
            onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
          />
        </div>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <button className="btn" type="submit" disabled={create.isPending}>
        {t('common.save')}
      </button>
    </form>
  );
}

export function PlatformClientDetailPage() {
  const { t } = useTranslation();
  const { farmId } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['platform', 'clients', farmId],
    queryFn: () => api<PlatformClientDetailDto>(`/v1/platform/clients/${farmId}`),
    enabled: Boolean(farmId),
  });

  const toggle = useMutation({
    mutationFn: (isActive: boolean) =>
      api<PlatformClientDetailDto>(`/v1/platform/clients/${farmId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'clients'] });
      void qc.invalidateQueries({ queryKey: ['platform', 'clients', farmId] });
    },
  });

  if (!farmId) return <Navigate to="/platform" replace />;
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => void query.refetch()} />;

  const client = query.data;
  return (
    <div>
      <button type="button" className="btn secondary" onClick={() => void navigate('/platform')}>
        {t('platform.back')}
      </button>
      <div className="page-header" style={{ marginTop: 12 }}>
        <div>
          <h2>{client.name}</h2>
          <p className="page-subtitle">
            {client.location ?? t('platform.noLocation')} ·{' '}
            {client.isActive ? t('platform.active') : t('platform.suspended')}
          </p>
        </div>
        <button
          type="button"
          className={`btn ${client.isActive ? 'secondary' : ''}`}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(!client.isActive)}
        >
          {client.isActive ? t('platform.suspend') : t('platform.reactivate')}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p>
          <strong>{t('platform.admin')}:</strong> {client.adminName ?? '—'}{' '}
          <span className="muted">{client.adminEmail ?? ''}</span>
        </p>
        <p>
          <strong>{t('platform.staff')}:</strong> {client.staffCount}
        </p>
        <p>
          <strong>{t('platform.created')}:</strong> {formatDateTime(client.createdAt)}
        </p>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h3>{t('platform.members')}</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('admin.name')}</th>
              <th>{t('admin.email')}</th>
              <th>{t('admin.role')}</th>
              <th>{t('members.status')}</th>
              <th>{t('platform.created')}</th>
            </tr>
          </thead>
          <tbody>
            {client.members.map((m) => (
              <tr key={m.userId}>
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td>{t(`common.role.${m.role}`)}</td>
                <td>{m.isActive ? t('admin.active') : t('members.inactive')}</td>
                <td>{formatDateTime(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Farm users typing /platform land here. */
export function PlatformForbiddenRedirect() {
  return <Navigate to="/forbidden" replace />;
}

export function usePlatformHomePath() {
  const { user } = useAuth();
  return useMemo(() => (user?.platformAdmin ? '/platform' : '/dashboard'), [user?.platformAdmin]);
}
