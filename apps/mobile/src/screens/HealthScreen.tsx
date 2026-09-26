import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import {
  HEALTH_RECORD_TYPES,
  NEPAL_VACCINE_PROTOCOLS,
  formatDate,
  formatNPR,
  type AnimalDto,
  type BatchVaccinate,
  type HealthCreate,
  type PageResult,
} from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { AnimalIdSearch } from '../components/AnimalIdSearch';
import { ChipSelect, Field, FormActions } from '../components/forms';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorText,
  FilterChip,
  LoadingBlock,
  Muted,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  StatusChip,
  Txt,
} from '../components/ui';
import { toQuery } from '../api/query';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import { useLocale } from '../locale/LocaleProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import type { RootStackParamList } from '../navigation/types';
import { color, radius, space, tap } from '../theme/tokens';

type HealthRecord = {
  id: string;
  title: string;
  type?: string;
  animalId?: string | null;
  animalTag?: string | null;
  animalName?: string | null;
  herdBatchId?: string | null;
  herdBatchName?: string | null;
  performedAt?: string;
  nextDueAt?: string | null;
  cost?: number | null;
};

type DueFilter = 'all' | 'overdue' | 'due_soon';
type FormMode = 'create' | 'group' | null;

type BatchLite = { id: string; name: string; kind?: string };
type InvLite = { id: string; name: string; category?: string };
type CalendarRow = {
  id: string;
  title?: string;
  type?: string;
  animalTag?: string | null;
  nextDueAt?: string | null;
};

function toDateInput(value?: Date | string): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function protocolTiming(p: (typeof NEPAL_VACCINE_PROTOCOLS)[number]): string {
  const parts = [`${p.firstDoseMonths}m`];
  if (p.boosterDays) parts.push(`+${p.boosterDays}d`);
  if (p.intervalDays) parts.push(`/ ${p.intervalDays}d`);
  return parts.join(' ');
}

function resolveSource(row: HealthRecord): string {
  const animal =
    row.animalTag ||
    row.animalName ||
    (row.animalId ? row.animalId.slice(0, 8) : null);
  const batch = row.herdBatchName || null;
  if (animal && batch) return `${animal} / ${batch}`;
  return animal || batch || '—';
}

export function HealthScreen() {
  const navRoute = useRoute<RouteProp<RootStackParamList, 'Health'>>();
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t, locale } = useLocale();
  const canWrite = can('health:write');

  const paramType = navRoute.params?.type;
  const initialType =
    paramType && (HEALTH_RECORD_TYPES as readonly string[]).includes(paramType)
      ? (paramType as (typeof HEALTH_RECORD_TYPES)[number])
      : 'VACCINATION';

  const [due, setDue] = useState<DueFilter>('all');
  const [formMode, setFormMode] = useState<FormMode>(
    paramType || navRoute.params?.animalId ? 'create' : null,
  );
  const [items, setItems] = useState<HealthRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [calendar, setCalendar] = useState<CalendarRow[]>([]);
  const [animals, setAnimals] = useState<AnimalDto[]>([]);
  const [batches, setBatches] = useState<BatchLite[]>([]);
  const [inventory, setInventory] = useState<InvLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [type, setType] = useState<(typeof HEALTH_RECORD_TYPES)[number]>(initialType);
  const [title, setTitle] = useState('');
  const [animalId, setAnimalId] = useState(navRoute.params?.animalId ?? '');
  const [herdBatchId, setHerdBatchId] = useState('');
  const [performedAt, setPerformedAt] = useState(toDateInput(new Date()));
  const [nextDue, setNextDue] = useState('');
  const [cost, setCost] = useState('');
  const [medicine, setMedicine] = useState('');
  const [dosage, setDosage] = useState('');
  const [method, setMethod] = useState('');
  const [vetName, setVetName] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');

  const [protocolKey, setProtocolKey] = useState<(typeof NEPAL_VACCINE_PROTOCOLS)[number]['key']>(
    'FMD',
  );
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [groupItemId, setGroupItemId] = useState('');
  const [expiredLotReason, setExpiredLotReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const path = `/v1/health-records${toQuery({ page: 1, pageSize: 100, due })}`;
    try {
      const [page, cal, animalPage, batchPage] = await Promise.all([
        api.get<PageResult<HealthRecord>>(path),
        api.get<CalendarRow[] | PageResult<CalendarRow>>('/v1/health-records/calendar').catch(() => []),
        api.get<PageResult<AnimalDto>>(`/v1/animals${toQuery({ pageSize: 200 })}`).catch(() => null),
        api
          .get<PageResult<BatchLite>>(`/v1/batches${toQuery({ pageSize: 200 })}`)
          .catch(() => null),
      ]);
      setItems(page.items);
      setTotal(page.total ?? page.items.length);
      setModuleCache(store, 'health', page);
      persist();
      setFromCache(false);
      setError(null);
      setCalendar(Array.isArray(cal) ? cal : cal.items ?? []);
      if (animalPage?.items) setAnimals(animalPage.items);
      if (batchPage?.items) setBatches(batchPage.items);
    } catch {
      const cached = getModuleCache<PageResult<HealthRecord>>(store, 'health');
      if (cached?.items) {
        setItems(cached.items);
        setTotal(cached.total ?? cached.items.length);
        setFromCache(true);
      } else setError(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [api, due, persist, store, t]);

  const loadInventory = useCallback(async () => {
    try {
      const page = await api.get<PageResult<InvLite>>(
        `/v1/inventory${toQuery({ pageSize: 100 })}`,
      );
      setInventory(
        page.items.filter((i) => i.category === 'MEDICINE' || i.category === 'VACCINE'),
      );
    } catch {
      setInventory([]);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (formMode === 'group') void loadInventory();
  }, [formMode, loadInventory]);

  useEffect(() => {
    const nextType = navRoute.params?.type;
    if (nextType && (HEALTH_RECORD_TYPES as readonly string[]).includes(nextType)) {
      setType(nextType as (typeof HEALTH_RECORD_TYPES)[number]);
      setFormMode('create');
    }
    if (navRoute.params?.animalId) {
      setAnimalId(navRoute.params.animalId);
      setFormMode('create');
    }
  }, [navRoute.params?.animalId, navRoute.params?.type]);

  const resetCreate = () => {
    setType('VACCINATION');
    setTitle('');
    setAnimalId('');
    setHerdBatchId('');
    setPerformedAt(toDateInput(new Date()));
    setNextDue('');
    setCost('');
    setMedicine('');
    setDosage('');
    setMethod('');
    setVetName('');
    setBatchNumber('');
    setNotes('');
    setInventoryItemId('');
  };

  const closeForm = () => {
    setFormMode(null);
    setError(null);
    setGroupIds([]);
    setExpiredLotReason('');
    setGroupItemId('');
  };

  const create = async () => {
    if (!title.trim()) {
      setError(t('health.requiredFields'));
      return;
    }
    setBusy(true);
    setError(null);
    const body: HealthCreate = {
      type,
      title: title.trim(),
      animalId: animalId.trim() || undefined,
      herdBatchId: herdBatchId.trim() || undefined,
      medicine: medicine.trim() || undefined,
      dosage: dosage.trim() || undefined,
      method: method.trim() || undefined,
      vetName: vetName.trim() || undefined,
      cost: cost.trim() ? Number(cost) : undefined,
      batchNumber: batchNumber.trim() || undefined,
      inventoryItemId: inventoryItemId.trim() || undefined,
      notes: notes.trim() || undefined,
      performedAt: performedAt.trim() ? new Date(performedAt) : new Date(),
      nextDueAt: nextDue.trim() ? new Date(nextDue) : undefined,
    };
    try {
      await api.post('/v1/health-records', body);
      resetCreate();
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const runGroupVaccinate = async () => {
    if (groupIds.length === 0) return;
    setBusy(true);
    setError(null);
    const body: BatchVaccinate = {
      animalIds: groupIds,
      itemId: groupItemId || undefined,
      administeredAt: new Date(),
      doseAmount: 2,
      route: 'SUBCUTANEOUS',
      disease: protocolKey,
      expiredLotReason: expiredLotReason.trim() || undefined,
    };
    try {
      const res = await api.post<{
        recorded: unknown[];
        skipped: Array<{ animalId: string; reason: string }>;
      }>('/v1/health/vaccinations/batch', body);
      if (res.skipped?.length) {
        setError(t('health.skippedPregnant', { n: res.skipped.length }));
      }
      setGroupIds([]);
      setExpiredLotReason('');
      setGroupItemId('');
      setFormMode(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('health.batchFailed'));
    } finally {
      setBusy(false);
    }
  };

  const typeLabel = (value?: string) => {
    if (!value) return '—';
    const key = `enum.healthType.${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };

  const fmt = useMemo(
    () => ({
      date: (v?: string | null) => (v ? formatDate(v, locale) : '—'),
      npr: (v?: number | null) => (v != null ? formatNPR(v, locale) : '—'),
    }),
    [locale],
  );

  return (
    <AppShell module="health">
      <View style={styles.screen}>
        <View style={styles.stickyTop}>
          <PageHeader
            title={t('nav.health')}
            subtitle={t('health.subtitle')}
            actions={
              canWrite ? (
                <>
                  <Button
                    label={formMode === 'create' ? t('common.cancel') : t('health.add')}
                    onPress={() =>
                      setFormMode((m) => {
                        if (m === 'create') return null;
                        resetCreate();
                        return 'create';
                      })
                    }
                  />
                  <Button
                    label={t('health.groupVax')}
                    variant="secondary"
                    onPress={() => setFormMode((m) => (m === 'group' ? null : 'group'))}
                  />
                </>
              ) : null
            }
          />
          {fromCache ? <Muted>{t('native.cached')}</Muted> : null}
          {error && !formMode ? <ErrorText message={error} /> : null}
          <ChipRow>
            {(['all', 'overdue', 'due_soon'] as const).map((k) => (
              <FilterChip
                key={k}
                label={t(`health.due.${k}`)}
                active={due === k}
                onPress={() => setDue(k)}
              />
            ))}
          </ChipRow>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.pageContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {loading && items.length === 0 ? <LoadingBlock /> : null}

          <Card style={styles.protocolCard}>
            <SectionTitle>{t('health.protocols')}</SectionTitle>
            <Muted>{t('health.protocolsHelp')}</Muted>
            {NEPAL_VACCINE_PROTOCOLS.map((p) => (
              <View key={p.key} style={styles.protocolRow}>
                <View style={styles.protocolText}>
                  <Txt weight="semibold">
                    {locale === 'ne' ? p.titleNp : p.titleEn}
                  </Txt>
                  {p.blockPregnant ? (
                    <Muted>{t('health.blockPregnant')}</Muted>
                  ) : null}
                </View>
                <Muted>{protocolTiming(p)}</Muted>
              </View>
            ))}
          </Card>

          {calendar.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle>{t('health.calendar')}</SectionTitle>
              {calendar.slice(0, 12).map((row) => (
                <Card key={row.id} style={styles.recordCard}>
                  <Txt weight="semibold">{row.title ?? typeLabel(row.type)}</Txt>
                  <Muted>
                    {[typeLabel(row.type), row.animalTag].filter(Boolean).join(' · ')}
                  </Muted>
                  <Muted>
                    {t('health.nextDueAt')}: {fmt.date(row.nextDueAt)}
                  </Muted>
                </Card>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <Muted>{t('common.resultCount', { count: total })}</Muted>
            {!loading && items.length === 0 ? <EmptyState /> : null}
            {items.map((item) => (
              <Card key={item.id} style={styles.recordCard}>
                <View style={styles.recordTop}>
                  <StatusChip status="ACTIVE" label={typeLabel(item.type)} />
                  <Muted>{fmt.npr(item.cost)}</Muted>
                </View>
                <Txt weight="semibold" style={styles.recordTitle}>
                  {item.title}
                </Txt>
                <Muted>
                  {t('health.performedAt')}: {fmt.date(item.performedAt)}
                </Muted>
                <Muted>
                  {t('health.nextDueAt')}: {fmt.date(item.nextDueAt)}
                </Muted>
                <Muted>
                  {t('health.source')}: {resolveSource(item)}
                </Muted>
              </Card>
            ))}
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={formMode === 'create'}
        animationType="slide"
        onRequestClose={closeForm}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Txt weight="semibold" style={styles.eyebrow}>
                {t('health.add')}
              </Txt>
              <Txt weight="display" style={styles.modalTitle}>
                {t('nav.health')}
              </Txt>
            </View>
            <SecondaryButton label={t('common.close')} onPress={closeForm} />
          </View>
          {error ? <ErrorText message={error} /> : null}
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <ChipSelect
              label={t('health.type')}
              options={[...HEALTH_RECORD_TYPES]}
              value={type}
              onChange={setType}
              labels={Object.fromEntries(
                HEALTH_RECORD_TYPES.map((k) => [k, typeLabel(k)]),
              ) as Partial<Record<(typeof HEALTH_RECORD_TYPES)[number], string>>}
            />
            <Field label={t('health.title')} value={title} onChangeText={setTitle} />
            <AnimalIdSearch
              label={t('health.animal')}
              value={animalId}
              onChange={(id) => setAnimalId(id)}
            />
            <ChipSelect
              label={t('health.herdBatch')}
              options={['', ...batches.map((b) => b.id)]}
              value={herdBatchId || null}
              onChange={setHerdBatchId}
              labels={{
                '': t('health.selectBatch'),
                ...Object.fromEntries(batches.map((b) => [b.id, b.name])),
              }}
            />
            <Field
              label={t('health.performedAt')}
              value={performedAt}
              onChangeText={setPerformedAt}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
            />
            <Field
              label={t('health.nextDueAt')}
              value={nextDue}
              onChangeText={setNextDue}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
            />
            <Field
              label={t('health.cost')}
              value={cost}
              onChangeText={setCost}
              keyboardType="decimal-pad"
            />
            <Field label={t('health.medicine')} value={medicine} onChangeText={setMedicine} />
            <Field label={t('health.dosage')} value={dosage} onChangeText={setDosage} />
            <Field label={t('health.method')} value={method} onChangeText={setMethod} />
            <Field label={t('health.vetName')} value={vetName} onChangeText={setVetName} />
            <Field
              label={t('health.batchNumber')}
              value={batchNumber}
              onChangeText={setBatchNumber}
            />
            <Field
              label={t('common.notes')}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
            <FormActions>
              <PrimaryButton
                label={t('common.save')}
                onPress={() => void create()}
                disabled={busy}
              />
              <SecondaryButton label={t('common.cancel')} onPress={closeForm} />
            </FormActions>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={formMode === 'group'} animationType="slide" onRequestClose={closeForm}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Txt weight="semibold" style={styles.eyebrow}>
                {t('health.groupVax')}
              </Txt>
              <Txt weight="display" style={styles.modalTitle}>
                {t('nav.health')}
              </Txt>
            </View>
            <SecondaryButton label={t('common.close')} onPress={closeForm} />
          </View>
          {error ? <ErrorText message={error} /> : null}
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Muted>{t('health.groupVaxHelp')}</Muted>
            <ChipSelect
              label={t('health.protocol')}
              options={NEPAL_VACCINE_PROTOCOLS.map((p) => p.key)}
              value={protocolKey}
              onChange={setProtocolKey}
              labels={Object.fromEntries(
                NEPAL_VACCINE_PROTOCOLS.map((p) => [
                  p.key,
                  locale === 'ne' ? p.titleNp : p.titleEn,
                ]),
              )}
            />
            <ChipSelect
              label={t('health.inventoryItem')}
              options={['', ...inventory.map((i) => i.id)]}
              value={groupItemId || null}
              onChange={setGroupItemId}
              labels={{
                '': t('health.noInventoryItem'),
                ...Object.fromEntries(inventory.map((i) => [i.id, i.name])),
              }}
            />
            <Field
              label={t('health.expiredLotReason')}
              value={expiredLotReason}
              onChangeText={setExpiredLotReason}
              placeholder={t('health.expiredLotReasonHelp')}
            />
            <Txt weight="medium" style={styles.pickLabel}>
              {t('health.animal')}
            </Txt>
            <View style={styles.animalPickWrap}>
              {animals.map((a) => {
                const on = groupIds.includes(a.id);
                const label = a.herdNumber ?? a.tag;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() =>
                      setGroupIds((ids) =>
                        ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id],
                      )
                    }
                    style={[styles.animalChip, on && styles.animalChipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Txt weight={on ? 'semibold' : 'regular'} style={on ? styles.animalChipTextOn : undefined}>
                      {label}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <FormActions>
              <PrimaryButton
                label={t('health.vaccinateN', { n: groupIds.length })}
                onPress={() => void runGroupVaccinate()}
                disabled={busy || groupIds.length === 0}
              />
              <SecondaryButton label={t('common.cancel')} onPress={closeForm} />
            </FormActions>
          </ScrollView>
        </View>
      </Modal>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  stickyTop: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: color.surfaceSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
    zIndex: 2,
  },
  scroll: { flex: 1 },
  pageContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 48,
    gap: 8,
  },
  protocolCard: { gap: 8, marginBottom: 8 },
  protocolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  protocolText: { flex: 1, gap: 2 },
  section: { marginTop: 8, gap: 8 },
  recordCard: { gap: 6, marginBottom: 4 },
  recordTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  recordTitle: { fontSize: 16 },
  modal: { flex: 1, backgroundColor: color.surface, paddingTop: 48 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.brand,
    marginBottom: 2,
  },
  modalTitle: { fontSize: 28 },
  modalBody: { padding: 16, paddingBottom: 60, gap: space.sm },
  pickLabel: { fontSize: 13, color: color.textSecondary, marginBottom: 4 },
  animalPickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  animalChip: {
    minHeight: tap,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceMuted,
    borderWidth: 1.5,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  animalChipOn: {
    backgroundColor: color.brand,
    borderColor: color.brandStrong,
  },
  animalChipTextOn: { color: color.surface },
});
