import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { ROLES, formatDateTime, type Role } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { ChipSelect, Field, FormActions } from '../components/forms';
import {
  Button,
  Card,
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
  role?: Role | string;
  isActive?: boolean;
  active?: boolean;
};

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
  const { t } = useLocale();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
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
        role,
        password: password || undefined,
      });
      setEmail('');
      setName('');
      setPassword('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const patchMember = async (member: Member, body: { role?: Role; isActive?: boolean }) => {
    const id = member.userId ?? member.id;
    if (!id) return;
    try {
      await api.patch(`/v1/farms/me/members/${id}`, body);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

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

        {members.length === 0 && !loading ? <EmptyState /> : null}
        {members.map((m) => {
          const id = m.userId ?? m.id ?? m.email ?? '';
          const active = m.isActive ?? m.active ?? true;
          return (
            <Card key={id} style={styles.card}>
              <ListRow
                title={m.name ?? m.email ?? id}
                subtitle={m.email}
                meta={t(`common.role.${String(m.role ?? 'WORKER')}`)}
              />
              <ChipSelect
                label={t('admin.role')}
                options={[...ROLES]}
                value={(m.role as Role) ?? 'WORKER'}
                onChange={(next) => void patchMember(m, { role: next })}
                labels={roleLabels}
              />
              <Button
                label={active ? t('admin.deactivate') : t('admin.activate')}
                variant="secondary"
                onPress={() => void patchMember(m, { isActive: !active })}
              />
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
});
