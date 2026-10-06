import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { ROLES, formatDateTime, normalizeNepalMobile, type Role } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { ChipSelect, Field, FormActions } from '../components/forms';
import {
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  ErrorText,
  ListRow,
  LoadingBlock,
  Muted,
  PageHeader,
  SectionHead,
} from '../components/ui';
import { useFarm } from '../state/FarmProvider';
import { useAccess } from '../hooks/useAccess';
import { useLocale } from '../locale/LocaleProvider';
import { getModuleCache, setModuleCache, MODULE_CACHE_PATHS } from '../offline/module-cache';
import type { RootStackParamList } from '../navigation/types';
import { space } from '../theme/tokens';

type Member = {
  userId?: string;
  id?: string;
  email?: string;
  name?: string;
  phone?: string | null;
  role?: Role | string;
  isActive?: boolean;
  active?: boolean;
  literacySupport?: boolean;
  sharedAccount?: boolean;
  isSelf?: boolean;
  lastSignInAt?: string | null;
};

const memberId = (m: Member) => m.userId ?? m.id ?? '';
const memberActive = (m: Member) => m.isActive ?? m.active ?? true;

function MemberEditor({
  member,
  roleLabels,
  onChanged,
  onClose,
}: {
  member: Member;
  roleLabels: Record<Role, string>;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const { api, patchUser } = useFarm();
  const { t } = useLocale();
  const id = memberId(member);
  const self = member.isSelf === true;
  const shared = member.sharedAccount === true;
  const [name, setName] = useState(member.name ?? '');
  const [email, setEmail] = useState(member.email ?? '');
  const [phone, setPhone] = useState(member.phone ?? '');
  const [role, setRole] = useState<Role>((member.role as Role) ?? 'WORKER');
  const [active, setActive] = useState(memberActive(member));
  const [voice, setVoice] = useState(member.literacySupport ?? false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const trimmedPhone = phone.trim();
    const nextPhone = trimmedPhone ? normalizeNepalMobile(trimmedPhone) : null;
    if (trimmedPhone && !nextPhone) {
      setError(t('sms.invalid'));
      return;
    }
    const body: Record<string, unknown> = {
      name: name.trim() || undefined,
      phone: nextPhone,
      literacySupport: voice,
    };
    const nextEmail = email.trim().toLowerCase();
    if (!shared && nextEmail && nextEmail !== (member.email ?? '').toLowerCase()) {
      body.email = nextEmail;
    }
    if (!self) {
      body.role = role;
      body.isActive = active;
    }
    void run(async () => {
      await api.patch(`/v1/farms/me/members/${id}`, body);
      if (self) patchUser({ name: name.trim() || undefined, phone: nextPhone });
      setNotice(t('members.saved'));
      await onChanged();
    });
  };

  const resetPassword = () => {
    if (password.length < 8) {
      setError(t('members.passwordTooShort'));
      return;
    }
    void run(async () => {
      await api.patch(`/v1/farms/me/members/${id}`, { password });
      setPassword('');
      setNotice(t('members.passwordReset'));
    });
  };

  const remove = () => {
    Alert.alert(t('members.remove'), t('members.removeConfirm', { name: member.name ?? member.email ?? '' }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('members.remove'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await api.del(`/v1/farms/me/members/${id}`);
            onClose();
            await onChanged();
          }),
      },
    ]);
  };

  return (
    <View style={styles.editor}>
      {error ? <ErrorText message={error} /> : null}
      {notice ? <Muted>{notice}</Muted> : null}
      <Field label={t('admin.name')} value={name} onChangeText={setName} />
      <Field
        label={t('admin.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!shared}
        hint={shared ? t('members.sharedHint') : undefined}
      />
      <Field
        label={t('admin.phone')}
        value={phone}
        onChangeText={setPhone}
        placeholder="98XXXXXXXX"
        keyboardType="phone-pad"
      />
      {self ? (
        <Muted>{t('members.selfHint')}</Muted>
      ) : (
        <>
          <ChipSelect
            label={t('admin.role')}
            options={[...ROLES]}
            value={role}
            onChange={setRole}
            labels={roleLabels}
          />
          <ChipSelect
            label={t('members.canSignIn')}
            options={['yes', 'no']}
            value={active ? 'yes' : 'no'}
            onChange={(v) => setActive(v === 'yes')}
            labels={{ yes: t('common.yes'), no: t('common.no') }}
          />
        </>
      )}
      <ChipSelect
        label={t('members.voiceAlerts')}
        options={['yes', 'no']}
        value={voice ? 'yes' : 'no'}
        onChange={(v) => setVoice(v === 'yes')}
        labels={{ yes: t('common.yes'), no: t('common.no') }}
      />
      <FormActions>
        <Button label={t('common.save')} onPress={save} disabled={busy} />
        <Button label={t('common.cancel')} variant="ghost" onPress={onClose} disabled={busy} />
      </FormActions>

      {!shared ? (
        <View style={styles.editorSection}>
          <SectionHead title={t('members.resetPassword')} />
          <Muted>{t('members.resetHint')}</Muted>
          <Field
            label={t('members.newPassword')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <Button
            label={t('members.resetPassword')}
            variant="secondary"
            onPress={resetPassword}
            disabled={busy || password.length === 0}
          />
        </View>
      ) : null}

      {!self ? (
        <View style={styles.editorSection}>
          <Muted>{t('members.removeHint')}</Muted>
          <Button label={t('members.remove')} variant="danger" onPress={remove} disabled={busy} />
        </View>
      ) : null}
    </View>
  );
}

type AuditItem = {
  id: string;
  action?: string;
  entityType?: string | null;
  entityId?: string | null;
  createdAt?: string;
};

export function AdminScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Admin'>>();
  const section = route.params?.section === 'audit' ? 'audit' : 'members';
  if (section === 'audit') return <AdminAudit />;
  return <AdminMembers />;
}

function AdminMembers() {
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t, locale } = useLocale();
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('WORKER');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [farmName, setFarmName] = useState('');
  const [location, setLocation] = useState('');
  const [farmMode, setFarmMode] = useState<'HOUSEHOLD' | 'COMMERCIAL'>('COMMERCIAL');
  const [timezone, setTimezone] = useState('Asia/Kathmandu');
  const [currency, setCurrency] = useState('NPR');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, me] = await Promise.all([
        can('users:manage')
          ? api.get<Member[] | { items: Member[] }>(MODULE_CACHE_PATHS.members)
          : Promise.resolve([] as Member[]),
        api
          .get<{
            name?: string;
            location?: string | null;
            mode?: string;
            timezone?: string;
            currency?: string;
          }>('/v1/farms/me')
          .catch(() => null),
      ]);
      const memberRows = Array.isArray(m) ? m : (m.items ?? []);
      setMembers(memberRows);
      if (me) {
        setFarmName(me.name ?? '');
        setLocation(me.location ?? '');
        setFarmMode((me.mode as 'HOUSEHOLD' | 'COMMERCIAL') || 'COMMERCIAL');
        setTimezone(me.timezone ?? 'Asia/Kathmandu');
        setCurrency(me.currency ?? 'NPR');
      }
      setModuleCache(store, 'members', m);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const cm = getModuleCache<Member[] | { items: Member[] }>(store, 'members');
      if (cm) {
        setMembers(Array.isArray(cm) ? cm : (cm.items ?? []));
        setFromCache(true);
      } else setError(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [api, can, persist, store, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!can('users:manage')) {
    return (
      <AppShell module="admin">
        <Muted>{t('errors.forbidden')}</Muted>
      </AppShell>
    );
  }

  const saveFarm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch('/v1/farms/me', {
        name: farmName.trim() || undefined,
        location: location.trim() || undefined,
        mode: farmMode,
        timezone: timezone.trim() || undefined,
        currency: currency.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/v1/farms/me/members', {
        email: email.trim(),
        name: name.trim(),
        phone: phone.trim() || null,
        role,
        password: password || undefined,
      });
      setEmail('');
      setName('');
      setPhone('');
      setPassword('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const needle = query.trim().toLowerCase();
  const visible = members.filter((m) => {
    if (roleFilter !== 'ALL' && m.role !== roleFilter) return false;
    if (statusFilter === 'ACTIVE' && !memberActive(m)) return false;
    if (statusFilter === 'INACTIVE' && memberActive(m)) return false;
    if (!needle) return true;
    return [m.name, m.email, m.phone].some((v) => v?.toLowerCase().includes(needle));
  });
  const activeCount = members.filter(memberActive).length;

  const roleLabels = Object.fromEntries(ROLES.map((r) => [r, t(`common.role.${r}`)])) as Record<
    Role,
    string
  >;

  return (
    <AppShell module="admin">
      <PageHeader
        title={t('admin.members')}
        subtitle={t('admin.membersSubtitle')}
        actions={
          <Button
            label={showForm ? t('common.cancel') : t('admin.addMember')}
            onPress={() => setShowForm((v) => !v)}
          />
        }
      />
      {loading && members.length === 0 ? <LoadingBlock /> : null}
      {error ? <ErrorText message={error} /> : null}
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        {fromCache ? <Muted>{t('native.cached')}</Muted> : null}

        {can('farm:manage') ? (
          <Card style={styles.card}>
            <SectionHead title={t('admin.farmSettings')} />
            <Field label={t('admin.farmName')} value={farmName} onChangeText={setFarmName} />
            <Field label={t('admin.location')} value={location} onChangeText={setLocation} />
            <Field label={t('admin.currency')} value={currency} onChangeText={setCurrency} autoCapitalize="characters" />
            <Field
              label={t('admin.timezone')}
              value={timezone}
              onChangeText={setTimezone}
              autoCapitalize="none"
            />
            <ChipSelect
              label={t('admin.farmMode')}
              options={['HOUSEHOLD', 'COMMERCIAL']}
              value={farmMode}
              onChange={setFarmMode}
              labels={{
                HOUSEHOLD: t('admin.modeHousehold'),
                COMMERCIAL: t('admin.modeCommercial'),
              }}
            />
            <Muted>
              {farmMode === 'HOUSEHOLD' ? t('admin.modeHouseholdHint') : t('admin.modeCommercialHint')}
            </Muted>
            <FormActions>
              <Button label={t('common.save')} onPress={() => void saveFarm()} disabled={busy} />
            </FormActions>
          </Card>
        ) : null}

        {showForm ? (
          <Card style={styles.card}>
            <Field label={t('admin.name')} value={name} onChangeText={setName} />
            <Field
              label={t('admin.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Field
              label={t('admin.phone')}
              value={phone}
              onChangeText={setPhone}
              placeholder="98XXXXXXXX"
              keyboardType="phone-pad"
            />
            <ChipSelect
              label={t('admin.role')}
              options={[...ROLES]}
              value={role}
              onChange={setRole}
              labels={roleLabels}
            />
            <Field
              label={t('admin.tempPassword')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <FormActions>
              <Button label={t('common.save')} onPress={() => void invite()} disabled={busy} />
            </FormActions>
          </Card>
        ) : null}

        {members.length > 0 ? (
          <>
            <Muted>{t('members.summary', { total: members.length, active: activeCount })}</Muted>
            <Field
              label={t('members.search')}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
            />
            <ChipSelect
              label={t('admin.role')}
              options={['ALL', ...ROLES]}
              value={roleFilter}
              onChange={setRoleFilter}
              labels={{ ALL: t('members.all'), ...roleLabels }}
            />
            <ChipSelect
              label={t('members.canSignIn')}
              options={['ALL', 'ACTIVE', 'INACTIVE']}
              value={statusFilter}
              onChange={setStatusFilter}
              labels={{
                ALL: t('members.all'),
                ACTIVE: t('common.yes'),
                INACTIVE: t('members.inactive'),
              }}
            />
          </>
        ) : null}

        {visible.length === 0 && !loading ? <EmptyState /> : null}
        {visible.map((m) => {
          const id = memberId(m) || m.email || '';
          const active = memberActive(m);
          const editing = editingId === id;
          return (
            <Card key={id} style={styles.card}>
              <ListRow
                title={m.name ?? m.email ?? id}
                subtitle={[m.email, m.phone].filter(Boolean).join(' · ')}
                meta={t(`common.role.${String(m.role ?? 'WORKER')}`)}
              />
              <ChipRow>
                {m.isSelf ? <Chip label={t('members.you')} status="PREGNANT" /> : null}
                {active ? null : <Chip label={t('members.inactive')} status="REJECTED" />}
                <Muted>
                  {m.lastSignInAt
                    ? t('members.lastSeen', { date: formatDateTime(m.lastSignInAt, locale) })
                    : t('members.never')}
                </Muted>
              </ChipRow>
              {editing ? (
                <MemberEditor
                  member={m}
                  roleLabels={roleLabels}
                  onChanged={load}
                  onClose={() => setEditingId(null)}
                />
              ) : (
                <Button
                  label={t('members.edit')}
                  variant="secondary"
                  onPress={() => setEditingId(id)}
                />
              )}
            </Card>
          );
        })}
      </ScrollView>
    </AppShell>
  );
}

function AdminAudit() {
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t, locale } = useLocale();
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const a = await api.get<{ items: AuditItem[] }>(MODULE_CACHE_PATHS.audit);
      setAudit(a.items ?? []);
      setModuleCache(store, 'audit', a);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const ca = getModuleCache<{ items: AuditItem[] }>(store, 'audit');
      if (ca) {
        setAudit(ca.items ?? []);
        setFromCache(true);
      } else setError(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [api, persist, store, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!can('audit:read')) {
    return (
      <AppShell module="admin">
        <Muted>{t('errors.forbidden')}</Muted>
      </AppShell>
    );
  }

  return (
    <AppShell module="admin">
      <PageHeader title={t('admin.audit')} subtitle={t('admin.auditSubtitle')} />
      {loading && audit.length === 0 ? <LoadingBlock /> : null}
      {error ? <ErrorText message={error} /> : null}
      <ScrollView contentContainerStyle={styles.pad}>
        {fromCache ? <Muted>{t('native.cached')}</Muted> : null}
        {audit.length === 0 && !loading ? <EmptyState /> : null}
        {audit.map((item) => (
          <ListRow
            key={item.id}
            title={item.action ?? '—'}
            subtitle={[item.entityType, item.entityId].filter(Boolean).join(' ') || '—'}
            meta={item.createdAt ? formatDateTime(item.createdAt, locale) : undefined}
          />
        ))}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 48, gap: space.sm },
  card: { marginBottom: 16 },
  editor: { marginTop: space.sm, gap: space.xs },
  editorSection: { marginTop: space.md, gap: space.xs },
});
