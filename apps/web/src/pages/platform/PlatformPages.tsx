import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ROLES,
  formatDateTime,
  type PlatformClientCreate,
  type PlatformClientDetailDto,
  type PlatformClientListItemDto,
  type PlatformClientMemberDto,
  type PlatformMemberCreate,
  type PlatformMemberUpdate,
  type Role,
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
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['platform', 'clients', farmId],
    queryFn: () => api<PlatformClientDetailDto>(`/v1/platform/clients/${farmId}`),
    enabled: Boolean(farmId),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['platform', 'clients'] });
    void qc.invalidateQueries({ queryKey: ['platform', 'clients', farmId] });
  };

  const toggle = useMutation({
    mutationFn: (isActive: boolean) =>
      api<PlatformClientDetailDto>(`/v1/platform/clients/${farmId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: refresh,
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

      <div className="page-header">
        <div>
          <h3>{t('platform.members')}</h3>
          <p className="page-subtitle">{t('platform.membersHelp')}</p>
        </div>
        <button type="button" className="btn" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? t('common.cancel') : t('platform.addMember')}
        </button>
      </div>

      {showAdd ? (
        <MemberEditor
          farmId={farmId}
          onDone={() => {
            setShowAdd(false);
            refresh();
          }}
          onCancel={() => setShowAdd(false)}
        />
      ) : null}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('admin.name')}</th>
              <th>{t('admin.email')}</th>
              <th>{t('admin.role')}</th>
              <th>{t('members.status')}</th>
              <th>{t('platform.created')}</th>
              <th>{t('platform.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {client.members.map((m) => (
              <tr key={m.userId}>
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td>{t(`common.role.${m.role}`)}</td>
                <td>
                  <span className={`chip member-status ${m.isActive ? 'on' : 'off'}`}>
                    {m.isActive ? t('admin.active') : t('members.inactive')}
                  </span>
                </td>
                <td>{formatDateTime(m.createdAt)}</td>
                <td>
                  <div className="platform-member-actions">
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setEditingId(editingId === m.userId ? null : m.userId)}
                    >
                      {editingId === m.userId ? t('common.cancel') : t('platform.editMember')}
                    </button>
                    <MemberAccessButtons farmId={farmId} member={m} onDone={refresh} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {client.members.length === 0 ? <p className="muted">{t('platform.noMembers')}</p> : null}
      </div>

      {editingId ? (
        <MemberEditor
          farmId={farmId}
          member={client.members.find((m) => m.userId === editingId)}
          onDone={() => {
            setEditingId(null);
            refresh();
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : null}
    </div>
  );
}

function MemberAccessButtons({
  farmId,
  member,
  onDone,
}: {
  farmId: string;
  member: PlatformClientMemberDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const mutate = useMutation({
    mutationFn: (body: PlatformMemberUpdate) =>
      api<PlatformClientMemberDto>(`/v1/platform/clients/${farmId}/members/${member.userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/v1/platform/clients/${farmId}/members/${member.userId}`, { method: 'DELETE' }),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <>
      <button
        type="button"
        className={`btn ${member.isActive ? 'secondary' : ''}`}
        disabled={mutate.isPending}
        onClick={() => {
          setError(null);
          mutate.mutate({ isActive: !member.isActive });
        }}
      >
        {member.isActive ? t('platform.revokeAccess') : t('platform.grantAccess')}
      </button>
      <button
        type="button"
        className="btn secondary"
        disabled={remove.isPending}
        onClick={() => {
          if (!window.confirm(t('platform.removeConfirm'))) return;
          setError(null);
          remove.mutate();
        }}
      >
        {t('platform.removeMember')}
      </button>
      {error ? <p className="error-text">{error}</p> : null}
    </>
  );
}

function MemberEditor({
  farmId,
  member,
  onDone,
  onCancel,
}: {
  farmId: string;
  member?: PlatformClientMemberDto;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = Boolean(member);
  const [form, setForm] = useState({
    name: member?.name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    role: (member?.role ?? 'WORKER') as Role,
    password: '',
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (isEdit && member) {
        const body: PlatformMemberUpdate = {
          name: form.name,
          email: form.email,
          role: form.role,
          phone: form.phone.trim() ? form.phone.trim() : null,
        };
        if (form.password.trim()) body.password = form.password;
        return api<PlatformClientMemberDto>(
          `/v1/platform/clients/${farmId}/members/${member.userId}`,
          { method: 'PATCH', body: JSON.stringify(body) },
        );
      }
      const body: PlatformMemberCreate = {
        name: form.name,
        email: form.email,
        role: form.role,
        password: form.password,
        phone: form.phone.trim() ? form.phone.trim() : null,
      };
      return api<PlatformClientMemberDto>(`/v1/platform/clients/${farmId}/members`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <form
      className="card form-card"
      style={{ marginBottom: 16, marginTop: 12 }}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        setError(null);
        save.mutate();
      }}
    >
      <h3>{isEdit ? t('platform.editMember') : t('platform.addMember')}</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="pm-name">{t('admin.name')}</label>
          <input
            id="pm-name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="pm-email">{t('admin.email')}</label>
          <input
            id="pm-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="pm-phone">{t('admin.phone')}</label>
          <input
            id="pm-phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="pm-role">{t('admin.role')}</label>
          <select
            id="pm-role"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`common.role.${role}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pm-pass">
            {isEdit ? t('platform.resetPassword') : t('platform.adminPassword')}
          </label>
          <input
            id="pm-pass"
            type="password"
            required={!isEdit}
            minLength={isEdit ? undefined : 8}
            placeholder={isEdit ? t('platform.resetPasswordHint') : undefined}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </div>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="platform-member-actions">
        <button className="btn" type="submit" disabled={save.isPending}>
          {t('common.save')}
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
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
