import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  INVENTORY_ALERT_LEVELS,
  INVENTORY_CATEGORIES,
  formatDate,
  formatNPR,
  inventoryAlertLevel,
  type InventoryAlertLevel,
  type InventoryCreate,
  type PageResult,
  type StockMovementCreate,
} from '@farm/contracts';
import { AppShell } from '../components/AppShell';
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
  StatusChip,
  Txt,
  inputStyle,
  useTypeface,
} from '../components/ui';
import { toQuery } from '../api/query';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import { useLocale } from '../locale/LocaleProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import { color, radius, space } from '../theme/tokens';

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  unitCost?: number | null;
  valuation?: number | null;
  alertLevel?: InventoryAlertLevel | string;
  expiryDate?: string | null;
  supplier?: string | null;
  batchLotNumber?: string | null;
  notes?: string | null;
  withdrawalDaysMilk?: number;
  withdrawalDaysMeat?: number;
};

type Movement = {
  id: string;
  type: string;
  quantity: number;
  reason?: string | null;
  createdAt: string;
};

const MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUST'] as const;
const emptyForm = (): Partial<InventoryCreate> => ({
  category: 'FEED',
  currentStock: 0,
  minimumStock: 0,
  unit: 'kg',
});

function toDateInput(value?: Date | string | null): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function InventoryScreen() {
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t, locale } = useLocale();
  const face = useTypeface();
  const canWrite = can('inventory:write');
  const canRestock = can('inventory:restock-request') || canWrite;

  const [alert, setAlert] = useState<InventoryAlertLevel | ''>('');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<InventoryCreate>>(emptyForm());

  const [restockQty, setRestockQty] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [moveType, setMoveType] = useState<(typeof MOVEMENT_TYPES)[number]>('IN');
  const [moveQty, setMoveQty] = useState('');
  const [moveReason, setMoveReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.get<PageResult<InventoryItem>>(
        `/v1/inventory${toQuery({
          page: 1,
          pageSize: 100,
          alert: alert || undefined,
        })}`,
      );
      setItems(page.items);
      setTotal(page.total ?? page.items.length);
      setModuleCache(store, 'inventory', page);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const cached = getModuleCache<PageResult<InventoryItem>>(store, 'inventory');
      if (cached?.items) {
        setItems(cached.items);
        setTotal(cached.total ?? cached.items.length);
        setFromCache(true);
      } else setError(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [alert, api, persist, store, t]);

  const loadMoves = useCallback(
    async (id: string) => {
      try {
        const rows = await api.get<Movement[] | PageResult<Movement>>(
          `/v1/inventory/${id}/movements`,
        );
        setMovements(Array.isArray(rows) ? rows : rows.items ?? []);
      } catch {
        setMovements([]);
      }
    },
    [api],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (expandedId) void loadMoves(expandedId);
    else setMovements([]);
  }, [expandedId, loadMoves]);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
    setError(null);
  };

  const startEdit = (row: InventoryItem) => {
    setEditingId(row.id);
    setShowForm(true);
    setForm({
      name: row.name,
      category: row.category as InventoryCreate['category'],
      unit: row.unit,
      currentStock: row.currentStock,
      minimumStock: row.minimumStock,
      unitCost: row.unitCost ?? undefined,
      expiryDate: row.expiryDate ? new Date(row.expiryDate) : undefined,
      supplier: row.supplier ?? undefined,
      batchLotNumber: row.batchLotNumber ?? undefined,
      notes: row.notes ?? undefined,
      withdrawalDaysMilk: row.withdrawalDaysMilk,
      withdrawalDaysMeat: row.withdrawalDaysMeat,
    });
    setError(null);
  };

  const save = async () => {
    if (!form.name?.trim() || !form.unit?.trim()) {
      setError(t('inventory.requiredFields'));
      return;
    }
    setBusy(true);
    setError(null);
    const payload: InventoryCreate = {
      name: form.name.trim(),
      category: form.category ?? 'FEED',
      unit: form.unit.trim(),
      currentStock: Number(form.currentStock ?? 0),
      minimumStock: Number(form.minimumStock ?? 0),
      unitCost: form.unitCost,
      expiryDate: form.expiryDate,
      supplier: form.supplier,
      batchLotNumber: form.batchLotNumber,
      notes: form.notes,
      withdrawalDaysMilk: form.withdrawalDaysMilk,
      withdrawalDaysMeat: form.withdrawalDaysMeat,
    };
    try {
      if (editingId) await api.patch(`/v1/inventory/${editingId}`, payload);
      else await api.post('/v1/inventory', payload);
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const restock = async (id: string) => {
    const qty = restockQty[id];
    if (!qty || Number(qty) <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/inventory/${id}/restock`, { quantity: Number(qty) });
      setRestockQty((prev) => ({ ...prev, [id]: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const addMovement = async () => {
    if (!expandedId || !moveQty || Number(moveQty) <= 0) return;
    setBusy(true);
    setError(null);
    const body: StockMovementCreate = {
      type: moveType,
      quantity: Number(moveQty),
      reason: moveReason.trim() || undefined,
    };
    try {
      await api.post(`/v1/inventory/${expandedId}/movements`, body);
      setMoveQty('');
      setMoveReason('');
      await loadMoves(expandedId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const fmt = useMemo(
    () => ({
      date: (v?: string | null) => (v ? formatDate(v, locale) : '—'),
      npr: (v?: number | null) => (v != null ? formatNPR(v, locale) : '—'),
    }),
    [locale],
  );

  const alertOf = (row: InventoryItem) =>
    (row.alertLevel as InventoryAlertLevel | undefined) ??
    inventoryAlertLevel(row.currentStock, row.minimumStock);

  return (
    <AppShell module="inventory">
      <View style={styles.screen}>
        <View style={styles.stickyTop}>
          <PageHeader
            title={t('nav.inventory')}
            subtitle={t('inventory.subtitle')}
            actions={
              canWrite ? (
                <Button
                  label={showForm && !editingId ? t('common.cancel') : t('inventory.add')}
                  onPress={() => {
                    if (showForm && !editingId) closeForm();
                    else openAdd();
                  }}
                />
              ) : null
            }
          />
          {fromCache ? <Muted>{t('native.cached')}</Muted> : null}
          {error && !showForm ? <ErrorText message={error} /> : null}
          <ChipRow>
            <FilterChip
              label={t('common.filterAll')}
              active={alert === ''}
              onPress={() => setAlert('')}
            />
            {INVENTORY_ALERT_LEVELS.map((level) => (
              <FilterChip
                key={level}
                label={level}
                active={alert === level}
                onPress={() => setAlert(level)}
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
          <Muted>{t('common.resultCount', { count: total })}</Muted>
          {!loading && items.length === 0 ? <EmptyState /> : null}

          {items.map((row) => {
            const level = alertOf(row);
            const expanded = expandedId === row.id;
            return (
              <Card key={row.id} style={styles.itemCard}>
                <View style={styles.itemTop}>
                  <Txt weight="semibold" style={styles.itemName}>
                    {row.name}
                  </Txt>
                  <StatusChip status={level} label={level} />
                </View>
                <Muted>{row.category}</Muted>
                <Txt>
                  {t('inventory.stock')}: {row.currentStock} / {row.minimumStock} {row.unit}
                </Txt>
                <Muted>
                  {t('inventory.valuation')}: {fmt.npr(row.valuation)}
                </Muted>
                <Muted>
                  {t('inventory.expiryDate')}: {fmt.date(row.expiryDate)}
                </Muted>

                <View style={styles.rowActions}>
                  <SecondaryButton
                    label={
                      expanded ? t('inventory.hideMovements') : t('inventory.movements')
                    }
                    onPress={() => setExpandedId((prev) => (prev === row.id ? null : row.id))}
                  />
                  {canWrite ? (
                    <SecondaryButton
                      label={t('common.edit')}
                      onPress={() => startEdit(row)}
                    />
                  ) : null}
                </View>

                {canRestock ? (
                  <View style={styles.restockRow}>
                    <TextInput
                      style={[inputStyle(face), styles.qtyInput]}
                      placeholder={t('inventory.qty')}
                      placeholderTextColor={color.textMuted}
                      keyboardType="decimal-pad"
                      value={restockQty[row.id] ?? ''}
                      onChangeText={(v) =>
                        setRestockQty((prev) => ({ ...prev, [row.id]: v }))
                      }
                    />
                    <PrimaryButton
                      label={t('inventory.restock')}
                      disabled={busy || !restockQty[row.id]}
                      onPress={() => void restock(row.id)}
                    />
                  </View>
                ) : null}

                {expanded ? (
                  <View style={styles.movesBlock}>
                    <Txt weight="semibold">{t('inventory.movements')}</Txt>
                    {canWrite ? (
                      <>
                        <ChipSelect
                          label={t('inventory.movementType')}
                          options={[...MOVEMENT_TYPES]}
                          value={moveType}
                          onChange={setMoveType}
                        />
                        <Field
                          label={t('inventory.qty')}
                          value={moveQty}
                          onChangeText={setMoveQty}
                          keyboardType="decimal-pad"
                        />
                        <Field
                          label={t('inventory.reason')}
                          value={moveReason}
                          onChangeText={setMoveReason}
                        />
                        <PrimaryButton
                          label={t('inventory.addMovement')}
                          disabled={busy || !moveQty}
                          onPress={() => void addMovement()}
                        />
                      </>
                    ) : null}
                    {movements.length === 0 ? <Muted>{t('common.empty')}</Muted> : null}
                    {movements.map((m) => (
                      <View key={m.id} style={styles.moveRow}>
                        <Txt weight="semibold">
                          {m.type} · {m.quantity}
                        </Txt>
                        <Muted>
                          {[m.reason, m.createdAt ? formatDate(m.createdAt, locale) : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </Muted>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </ScrollView>
      </View>

      <Modal visible={showForm} animationType="slide" onRequestClose={closeForm}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Txt weight="semibold" style={styles.eyebrow}>
                {editingId ? t('inventory.edit') : t('inventory.add')}
              </Txt>
              <Txt weight="display" style={styles.modalTitle}>
                {t('nav.inventory')}
              </Txt>
            </View>
            <SecondaryButton label={t('common.close')} onPress={closeForm} />
          </View>
          {error ? <ErrorText message={error} /> : null}
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Field
              label={t('inventory.name')}
              value={form.name ?? ''}
              onChangeText={(v) => setForm((prev) => ({ ...prev, name: v }))}
            />
            <ChipSelect
              label={t('inventory.category')}
              options={[...INVENTORY_CATEGORIES]}
              value={form.category ?? 'FEED'}
              onChange={(v) => setForm((prev) => ({ ...prev, category: v }))}
            />
            <Field
              label={t('inventory.unit')}
              value={form.unit ?? ''}
              onChangeText={(v) => setForm((prev) => ({ ...prev, unit: v }))}
            />
            <Field
              label={t('inventory.currentStock')}
              value={form.currentStock != null ? String(form.currentStock) : ''}
              onChangeText={(v) =>
                setForm((prev) => ({
                  ...prev,
                  currentStock: v === '' ? 0 : Number(v),
                }))
              }
              keyboardType="decimal-pad"
            />
            <Field
              label={t('inventory.minimumStock')}
              value={form.minimumStock != null ? String(form.minimumStock) : ''}
              onChangeText={(v) =>
                setForm((prev) => ({
                  ...prev,
                  minimumStock: v === '' ? 0 : Number(v),
                }))
              }
              keyboardType="decimal-pad"
            />
            <Field
              label={t('inventory.unitCost')}
              value={form.unitCost != null ? String(form.unitCost) : ''}
              onChangeText={(v) =>
                setForm((prev) => ({
                  ...prev,
                  unitCost: v === '' ? undefined : Number(v),
                }))
              }
              keyboardType="decimal-pad"
            />
            <Field
              label={t('inventory.expiryDate')}
              value={toDateInput(form.expiryDate)}
              onChangeText={(v) =>
                setForm((prev) => ({
                  ...prev,
                  expiryDate: v.trim() ? new Date(v) : undefined,
                }))
              }
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
            />
            <Field
              label={t('inventory.supplier')}
              value={form.supplier ?? ''}
              onChangeText={(v) =>
                setForm((prev) => ({ ...prev, supplier: v || undefined }))
              }
            />
            <Field
              label={t('inventory.withdrawalDaysMilk')}
              value={
                form.withdrawalDaysMilk != null ? String(form.withdrawalDaysMilk) : '0'
              }
              onChangeText={(v) =>
                setForm((prev) => ({
                  ...prev,
                  withdrawalDaysMilk: v === '' ? 0 : Number(v),
                }))
              }
              keyboardType="number-pad"
            />
            <Field
              label={t('inventory.withdrawalDaysMeat')}
              value={
                form.withdrawalDaysMeat != null ? String(form.withdrawalDaysMeat) : '0'
              }
              onChangeText={(v) =>
                setForm((prev) => ({
                  ...prev,
                  withdrawalDaysMeat: v === '' ? 0 : Number(v),
                }))
              }
              keyboardType="number-pad"
            />
            <FormActions>
              <PrimaryButton
                label={t('common.save')}
                onPress={() => void save()}
                disabled={busy}
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
  itemCard: { gap: 8, marginBottom: 4 },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemName: { fontSize: 16, flex: 1 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  restockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  qtyInput: {
    width: 96,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  movesBlock: {
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  moveRow: { gap: 2, paddingVertical: 4 },
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
});
