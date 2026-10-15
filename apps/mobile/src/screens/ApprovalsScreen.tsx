import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { hasPermission, type ChangeRequestDto } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { Button, Card, EmptyState, ErrorText, PageHeader, Txt, inputStyle, useTypeface } from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useFarm } from '../state/FarmProvider';
import type { RootStackParamList } from '../navigation/types';
import { color, space } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Approvals'>;

const HIDDEN_FIELDS = new Set(['id', 'farmId', 'createdAt', 'updatedAt', 'deletedAt', 'version']);

function fieldLabel(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function showValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function ApprovalsScreen({ navigation }: Props) {
  const { api, user } = useFarm();
  const { t } = useLocale();
  const face = useTypeface();
  const approver = user ? hasPermission(user.role, 'changes:approve') : false;
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [rows, setRows] = useState<ChangeRequestDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = approver && tab === 'pending' ? 'PENDING' : 'ALL';
      const list = await api.get<ChangeRequestDto[]>(`/v1/change-requests?status=${status}`);
      setRows(approver && tab === 'done' ? list.filter((r) => r.status !== 'PENDING') : list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.serverUnreachable'));
    } finally {
      setLoading(false);
    }
  }, [api, approver, tab, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const act = async (row: ChangeRequestDto, action: 'approve' | 'reject' | 'cancel') => {
    setBusyId(row.id);
    setError(null);
    try {
      const result = await api.post<ChangeRequestDto>(
        `/v1/change-requests/${row.id}/${action}`,
        action === 'cancel' ? {} : { note: notes[row.id] || undefined },
      );
      setMessage(t(`approvals.result.${result.status}`));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.serverUnreachable'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell module="inbox">
      <PageHeader
        title={t('approvals.title')}
        subtitle={approver ? t('approvals.subtitleApprover') : t('approvals.subtitleMine')}
        backLabel={t('nav.inbox')}
        onBack={() => navigation.navigate('Inbox')}
      />
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        {approver ? (
          <View style={styles.tabs}>
            {(['pending', 'done'] as const).map((key) => (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                style={[styles.tab, tab === key && styles.tabOn]}
              >
                <Txt weight="semibold" style={tab === key ? styles.tabTextOn : undefined}>
                  {t(`approvals.tab.${key}`)}
                </Txt>
              </Pressable>
            ))}
          </View>
        ) : null}
        {message ? <Txt style={styles.message}>{message}</Txt> : null}
        {error ? <ErrorText message={error} /> : null}
        {!loading && rows.length === 0 ? <EmptyState message={t('approvals.empty')} /> : null}
        {rows.map((row) => {
          const isDelete = row.method === 'DELETE';
          const fields = Object.keys(row.changes).filter((k) => !HIDDEN_FIELDS.has(k));
          const changed = fields.filter((k) => showValue(row.before?.[k]) !== showValue(row.changes[k]));
          const shown = changed.length > 0 ? changed : fields;
          const thing = t(`approvals.entity.${row.entityType}`, { defaultValue: row.entityType });
          const pending = row.status === 'PENDING';
          return (
            <Card key={row.id}>
              <View style={styles.head}>
                <Txt weight="bold" style={{ flex: 1, fontSize: 16 }}>
                  {isDelete ? t('approvals.delete') : t('approvals.edit')} · {thing}
                  {row.entityLabel ? ` ${row.entityLabel}` : ''}
                </Txt>
                <Txt weight="semibold" style={styles.status}>
                  {t(`approvals.status.${row.status}`)}
                </Txt>
              </View>
              <Txt muted style={{ marginBottom: 8 }}>
                {t('approvals.by', { name: row.requestedBy.name })} · {row.createdAt.slice(0, 16).replace('T', ' ')}
              </Txt>
              {isDelete ? (
                <Txt style={{ color: color.danger }}>{t('approvals.deleteWarning')}</Txt>
              ) : (
                shown.map((k) => (
                  <View key={k} style={styles.diffRow}>
                    <Txt muted style={styles.diffField}>
                      {fieldLabel(k)}
                    </Txt>
                    <Txt style={styles.diffValue}>{showValue(row.before?.[k])}</Txt>
                    <Txt style={styles.arrow}>→</Txt>
                    <Txt weight="bold" style={styles.diffValue}>
                      {showValue(row.changes[k])}
                    </Txt>
                  </View>
                ))
              )}
              {row.reason ? <Txt style={{ fontStyle: 'italic', marginTop: 6 }}>“{row.reason}”</Txt> : null}
              {row.reviewedBy ? (
                <Txt muted style={{ marginTop: 6 }}>
                  {t('approvals.reviewedBy', { name: row.reviewedBy.name })}
                  {row.reviewNote ? ` — ${row.reviewNote}` : ''}
                </Txt>
              ) : null}
              {row.error ? <ErrorText message={row.error} /> : null}
              {pending && approver ? (
                <View style={{ gap: 8, marginTop: 10 }}>
                  <TextInput
                    style={inputStyle(face)}
                    value={notes[row.id] ?? ''}
                    onChangeText={(v) => setNotes((n) => ({ ...n, [row.id]: v }))}
                    placeholder={t('approvals.notePlaceholder')}
                    placeholderTextColor={color.textMuted}
                  />
                  <View style={styles.actions}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label={t('approvals.approve')}
                        block
                        disabled={busyId != null}
                        onPress={() => void act(row, 'approve')}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label={t('approvals.reject')}
                        variant="danger"
                        block
                        disabled={busyId != null}
                        onPress={() => void act(row, 'reject')}
                      />
                    </View>
                  </View>
                </View>
              ) : null}
              {pending && !approver ? (
                <View style={{ marginTop: 10 }}>
                  <Button
                    label={t('approvals.cancel')}
                    variant="secondary"
                    disabled={busyId != null}
                    onPress={() => void act(row, 'cancel')}
                  />
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 48, gap: space.sm },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  tabOn: { backgroundColor: color.brand, borderColor: color.brand },
  tabTextOn: { color: '#FFFDF9' },
  message: { color: color.brand, fontWeight: '600' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 2 },
  status: { fontSize: 13, color: color.brandStrong },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  diffField: { width: 110, fontSize: 13 },
  diffValue: { flex: 1 },
  arrow: { color: color.textMuted },
  actions: { flexDirection: 'row', gap: 8 },
});
