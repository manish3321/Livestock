import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ROLES,
  formatDateTime,
  normalizeNepalMobile,
  type FarmMemberDto,
  type FarmMemberUpdate,
  type Role,
} from '@farm/contracts';
import { useAuth } from '../../auth/auth-context';
import { api } from '../../api/client';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';

type StatusFilter = 'all' | 'active' | 'inactive';

const EMPTY_NEW = {
  email: '',
  name: '',
  phone: '',
  role: 'WORKER' as Role,
  password: '',
  literacySupport: false,
};

export function AdminMembersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_NEW);
  const [newError, setNewError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'members'],
    queryFn: () => api<FarmMemberDto[]>('/v1/farms/me/members'),
    enabled: can('users:manage'),
  });

  const create = useMutation({
    mutationFn: () => {
      const phone = newForm.phone.trim();
      if (phone && !normalizeNepalMobile(phone)) throw new Error(t('sms.invalid'));
      return api<FarmMemberDto>('/v1/farms/me/members', {
        method: 'POST',
        body: JSON.stringify({ ...newForm, phone: phone || null }),
      });
    },
    onSuccess: (row) => {
      setShowNew(false);
      setNewForm(EMPTY_NEW);
      setNewError(null);
      setEditingId(row.userId);
      void qc.invalidateQueries({ queryKey: ['admin', 'members'] });
    },
    onError: (err: Error) => setNewError(err.message),
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data ?? []).filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (statusFilter === 'active' && !m.isActive) return false;
      if (statusFilter === 'inactive' && m.isActive) return false;
      if (!needle) return true;
      return [m.name, m.email, m.phone ?? ''].some((v) => v.toLowerCase().includes(needle));
    });
  }, [query.data, roleFilter, search, statusFilter]);

  const editing = query.data?.find((m) => m.userId === editingId) ?? null;

  const columns = useMemo<Column<FarmMemberDto>[]>(
    () => [
      {
        key: 'name',
        header: t('admin.name'),
        render: (r) => (
          <span>
            <strong>{r.name}</strong>
            {r.isSelf ? <span className="chip member-you">{t('members.you')}</span> : null}
          </span>
        ),
      },
      { key: 'email', header: t('admin.email'), render: (r) => r.email },
      { key: 'phone', header: t('admin.phone'), render: (r) => r.phone ?? '—' },
      { key: 'role', header: t('admin.role'), render: (r) => t(`common.role.${r.role}`) },
      {
        key: 'status',
        header: t('members.status'),
        render: (r) => (
          <span className={`chip member-status ${r.isActive ? 'on' : 'off'}`}>
            {r.isActive ? t('admin.active') : t('members.inactive')}
          </span>
        ),
      },
      {
        key: 'lastSignIn',
        header: t('members.lastSignIn'),
        render: (r) => (r.lastSignInAt ? formatDateTime(r.lastSignInAt) : t('members.never')),
      },
      {
        key: 'edit',
        header: '',
        render: (r) => (
          <button className="btn secondary" type="button" onClick={() => setEditingId(r.userId)}>
            {t('members.edit')}
          </button>
        ),
      },
    ],
    [t],
  );

  if (!can('users:manage')) return <p className="muted">{t('errors.forbidden')}</p>;
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  const total = query.data?.length ?? 0;
  const activeCount = query.data?.filter((m) => m.isActive).length ?? 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('admin.members')}</h1>
          <p className="page-subtitle">
            {t('members.summary', { total, active: activeCount })}
          </p>
        </div>
        <button className="btn" type="button" onClick={() => setShowNew((v) => !v)}>
          {showNew ? t('common.cancel') : t('admin.addMember')}
        </button>
      </div>

      <FarmSettingsForm />

      {showNew && (
        <form
          className="card form-card"
          style={{ marginBottom: 24 }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2>{t('admin.addMember')}</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="m-name">{t('admin.name')}</label>
              <input
                id="m-name"
                required
                value={newForm.name}
                onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="m-email">{t('admin.email')}</label>
              <input
                id="m-email"
                type="email"
                required
                value={newForm.email}
                onChange={(e) => setNewForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="m-phone">{t('admin.phone')}</label>
              <input
                id="m-phone"
                type="tel"
                inputMode="tel"
                placeholder="98XXXXXXXX"
                value={newForm.phone}
                onChange={(e) => setNewForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="m-role">{t('admin.role')}</label>
              <select
                id="m-role"
                value={newForm.role}
                onChange={(e) => setNewForm((f) => ({ ...f, role: e.target.value as Role }))}
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
                value={newForm.password}
                onChange={(e) => setNewForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <label className="member-check">
              <input
                type="checkbox"
                checked={newForm.literacySupport}
                onChange={(e) => setNewForm((f) => ({ ...f, literacySupport: e.target.checked }))}
              />
              {t('members.voiceAlerts')}
            </label>
          </div>
          {newError && <p className="error-text">{newError}</p>}
          <button className="btn" type="submit" disabled={create.isPending}>
            {t('common.save')}
          </button>
        </form>
      )}

      {editing && (
        <MemberEditor key={editing.userId} member={editing} onClose={() => setEditingId(null)} />
      )}

      <div className="toolbar">
        <input
          className="toolbar-search"
          type="search"
          placeholder={t('members.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label={t('admin.role')}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | 'all')}
        >
          <option value="all">{t('members.allRoles')}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`common.role.${r}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('members.status')}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">{t('members.allStatuses')}</option>
          <option value="active">{t('admin.active')}</option>
          <option value="inactive">{t('members.inactive')}</option>
        </select>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.userId} />
    </div>
  );
}

/** Full edit form for one person: profile, access, password reset, removal. */
function MemberEditor({ member, onClose }: { member: FarmMemberDto; onClose: () => void }) {
  const { t } = useTranslation();
  const { patchUser } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: member.name,
    email: member.email,
    phone: member.phone ?? '',
    role: member.role,
    isActive: member.isActive,
    literacySupport: member.literacySupport,
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'members'] });

  const patch = useMutation({
    mutationFn: (body: FarmMemberUpdate) =>
      api<FarmMemberDto>(`/v1/farms/me/members/${member.userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (row) => {
      setError(null);
      if (row.isSelf) patchUser({ name: row.name, email: row.email, phone: row.phone });
      void refresh();
    },
    onError: (err: Error) => {
      setNotice(null);
      setError(err.message);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/v1/farms/me/members/${member.userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      onClose();
      void refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const saveDetails = (e: FormEvent) => {
    e.preventDefault();
    const phone = form.phone.trim();
    if (phone && !normalizeNepalMobile(phone)) {
      setError(t('sms.invalid'));
      return;
    }
    const body: FarmMemberUpdate = {
      name: form.name.trim(),
      phone: phone || null,
      literacySupport: form.literacySupport,
    };
    if (!member.sharedAccount && form.email.trim() !== member.email) body.email = form.email.trim();
    if (!member.isSelf) {
      body.role = form.role;
      body.isActive = form.isActive;
    }
    patch.mutate(body, { onSuccess: () => setNotice(t('members.saved')) });
  };

  const resetPassword = () => {
    if (password.length < 8) {
      setError(t('members.passwordTooShort'));
      return;
    }
    patch.mutate(
      { password },
      {
        onSuccess: () => {
          setPassword('');
          setNotice(t('members.passwordReset'));
        },
      },
    );
  };

  return (
    <section className="card form-card member-editor" aria-label={t('members.editing', { name: member.name })}>
      <div className="member-editor-head">
        <div>
          <h2>{t('members.editing', { name: member.name })}</h2>
          <p className="muted">
            {t('members.joined', { date: formatDateTime(member.createdAt) })}
            {' · '}
            {member.lastSignInAt
              ? t('members.lastSeen', { date: formatDateTime(member.lastSignInAt) })
              : t('members.never')}
          </p>
        </div>
        <button className="btn ghost" type="button" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>

      <form onSubmit={saveDetails}>
        <h3>{t('members.details')}</h3>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="e-name">{t('admin.name')}</label>
            <input
              id="e-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="e-email">{t('admin.email')}</label>
            <input
              id="e-email"
              type="email"
              required
              disabled={member.sharedAccount}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            {member.sharedAccount && <p className="muted">{t('members.sharedHint')}</p>}
          </div>
          <div className="field">
            <label htmlFor="e-phone">{t('admin.phone')}</label>
            <input
              id="e-phone"
              type="tel"
              inputMode="tel"
              placeholder="98XXXXXXXX"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="e-role">{t('admin.role')}</label>
            <select
              id="e-role"
              value={form.role}
              disabled={member.isSelf}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`common.role.${r}`)}
                </option>
              ))}
            </select>
            {member.isSelf && <p className="muted">{t('members.selfHint')}</p>}
          </div>
          <label className="member-check">
            <input
              type="checkbox"
              checked={form.isActive}
              disabled={member.isSelf}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            {t('members.canSignIn')}
          </label>
          <label className="member-check">
            <input
              type="checkbox"
              checked={form.literacySupport}
              onChange={(e) => setForm((f) => ({ ...f, literacySupport: e.target.checked }))}
            />
            {t('members.voiceAlerts')}
          </label>
        </div>
        <button className="btn" type="submit" disabled={patch.isPending}>
          {t('common.save')}
        </button>
      </form>

      {!member.sharedAccount && (
        <div className="member-editor-section">
          <h3>{t('members.resetPassword')}</h3>
          <p className="muted">{t('members.resetHint')}</p>
          <div className="member-inline">
            <input
              type="password"
              minLength={8}
              autoComplete="new-password"
              placeholder={t('members.newPassword')}
              aria-label={t('members.newPassword')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn secondary" type="button" disabled={patch.isPending} onClick={resetPassword}>
              {t('members.resetPassword')}
            </button>
          </div>
        </div>
      )}

      {!member.isSelf && (
        <div className="member-editor-section member-danger">
          <h3>{t('members.removeTitle')}</h3>
          <p className="muted">{t('members.removeHint')}</p>
          <button
            className="btn danger"
            type="button"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(t('members.removeConfirm', { name: member.name }))) remove.mutate();
            }}
          >
            {t('members.remove')}
          </button>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      {notice && !error && <p className="muted">{notice}</p>}
    </section>
  );
}

function FarmSettingsForm() {
  const { t } = useTranslation();
  const { can, patchUser } = useAuth();
  const qc = useQueryClient();
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

  if (!can('farm:manage')) return null;

  return (
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
              setFarmForm((f) => ({ ...f, mode: e.target.value as 'HOUSEHOLD' | 'COMMERCIAL' }))
            }
          >
            <option value="HOUSEHOLD">{t('admin.modeHousehold')}</option>
            <option value="COMMERCIAL">{t('admin.modeCommercial')}</option>
          </select>
          <p className="muted" style={{ marginTop: 6 }}>
            {farmForm.mode === 'HOUSEHOLD' ? t('admin.modeHouseholdHint') : t('admin.modeCommercialHint')}
          </p>
        </div>
      </div>
      <button className="btn" type="submit" disabled={saveFarm.isPending}>
        {t('common.save')}
      </button>
    </form>
  );
}
