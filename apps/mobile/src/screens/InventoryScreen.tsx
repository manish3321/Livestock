import { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import {
  INVENTORY_CATEGORIES,
  type InventoryCreate,
  type PageResult,
} from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { ChipSelect, Field, FormActions } from '../components/forms';
import {
  Button,
  EmptyState,
  ErrorText,
  ListRow,
  LoadingBlock,
  Muted,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
} from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { toQuery } from '../api/query';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import { space } from '../theme/tokens';

type Inv = {
  id: string;
  name: string;
  category?: string;
  currentStock?: number;
  unit?: string;
  alertLevel?: string;
  minimumStock?: number;
};

export function InventoryScreen() {
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const canWrite = can('inventory:write');
  const [items, setItems] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<(typeof INVENTORY_CATEGORIES)[number]>('FEED');
  const [unit, setUnit] = useState('kg');
  const [currentStock, setCurrentStock] = useState('0');
  const [minimumStock, setMinimumStock] = useState('0');
  const [busy, setBusy] = useState(false);
  const [restockId, setRestockId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [movements, setMovements] = useState<Array<Record<string, unknown>>>([]);
  const [showMoves, setShowMoves] = useState(false);
  const [moveQty, setMoveQty] = useState('');
  const [moveNote, setMoveNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.get<PageResult<Inv>>(
        `/v1/inventory${toQuery({ page: 1, pageSize: 100 })}`,
      );
      setItems(page.items);
      setModuleCache(store, 'inventory', page);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const cached = getModuleCache<PageResult<Inv>>(store, 'inventory');
      if (cached?.items) {
        setItems(cached.items);
        setFromCache(true);
      } else setError(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [api, persist, store]);

  const loadMoves = useCallback(
    async (id: string) => {
      try {
        const rows = await api.get<Array<Record<string, unknown>> | PageResult<Record<string, unknown>>>(
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

  const create = async () => {
    setBusy(true);
    setError(null);
    const body: InventoryCreate = {
      name: name.trim(),
      category,
      unit: unit.trim() || 'kg',
      currentStock: Number(currentStock),
      minimumStock: Number(minimumStock),
    };
    try {
      await api.post('/v1/inventory', body);
      setShowForm(false);
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const restock = async () => {
    if (!restockId) return;
    setBusy(true);
    try {
      await api.post(`/v1/inventory/${restockId}/restock`, {
        quantity: Number(restockQty),
      });
      setRestockId(null);
      setRestockQty('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restock failed');
    } finally {
      setBusy(false);
    }
  };

  const addMovement = async () => {
    if (!restockId) return;
    setBusy(true);
    try {
      await api.post(`/v1/inventory/${restockId}/movements`, {
        quantity: Number(moveQty),
        notes: moveNote.trim() || undefined,
      });
      setMoveQty('');
      setMoveNote('');
      await loadMoves(restockId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Movement failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell module="inventory">
      <PageHeader
        title={t('nav.inventory')}
        subtitle={t('inventory.subtitle')}
        actions={
          canWrite ? (
            <Button
              label={showForm ? t('common.cancel') : t('inventory.add')}
              onPress={() => setShowForm((v) => !v)}
            />
          ) : null
        }
      />
      {fromCache ? (
        <View style={styles.pad}>
          <Muted>{t('native.cached')}</Muted>
        </View>
      ) : null}
      {error ? <ErrorText message={error} /> : null}
      {showForm ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <Field label={t('inventory.name')} value={name} onChangeText={setName} />
          <ChipSelect
            label={t('inventory.category')}
            options={[...INVENTORY_CATEGORIES]}
            value={category}
            onChange={setCategory}
          />
          <Field label={t('inventory.unit')} value={unit} onChangeText={setUnit} />
          <Field
            label={t('inventory.currentStock')}
            value={currentStock}
            onChangeText={setCurrentStock}
            keyboardType="decimal-pad"
          />
          <Field
            label={t('inventory.minimumStock')}
            value={minimumStock}
            onChangeText={setMinimumStock}
            keyboardType="decimal-pad"
          />
          <FormActions>
            <PrimaryButton label={t('common.save')} onPress={() => void create()} disabled={busy} />
            <SecondaryButton label={t('common.cancel')} onPress={() => setShowForm(false)} />
          </FormActions>
        </ScrollView>
      ) : (
        <>
          {restockId ? (
            <View style={styles.pad}>
              <SectionTitle>{t('inventory.restock')}</SectionTitle>
              <Field
                label={t('inventory.qty')}
                value={restockQty}
                onChangeText={setRestockQty}
                keyboardType="decimal-pad"
              />
              <PrimaryButton label={t('inventory.restock')} onPress={() => void restock()} disabled={busy} />
              <Field
                label={t('inventory.qty')}
                value={moveQty}
                onChangeText={setMoveQty}
                keyboardType="decimal-pad"
              />
              <Field label={t('common.notes')} value={moveNote} onChangeText={setMoveNote} />
              <PrimaryButton label={t('inventory.addMovement')} onPress={() => void addMovement()} disabled={busy} />
              <PrimaryButton
                label={showMoves ? t('inventory.hideMovements') : t('inventory.movements')}
                onPress={() => {
                  setShowMoves((v) => !v);
                  if (!showMoves) void loadMoves(restockId);
                }}
              />
              {showMoves
                ? movements.map((m, i) => (
                    <ListRow
                      key={String(m.id ?? i)}
                      title={`${String(m.quantity ?? m.delta ?? '')} ${String(m.unit ?? '')}`}
                      subtitle={String(m.notes ?? m.type ?? '')}
                      meta={String(m.createdAt ?? m.occurredAt ?? '').slice(0, 10)}
                    />
                  ))
                : null}
              <SecondaryButton
                label={t('common.close')}
                onPress={() => {
                  setRestockId(null);
                  setShowMoves(false);
                }}
              />
            </View>
          ) : null}
          {loading && items.length === 0 ? <LoadingBlock /> : null}
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            ListEmptyComponent={!loading ? <EmptyState /> : null}
            renderItem={({ item }) => (
              <ListRow
                title={item.name}
                subtitle={[item.category, item.alertLevel].filter(Boolean).join(' · ')}
                meta={`${item.currentStock ?? 0} ${item.unit ?? ''}`}
                onPress={
                  canWrite
                    ? () => {
                        setRestockId(item.id);
                        setRestockQty('');
                      }
                    : undefined
                }
              />
            )}
          />
        </>
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 24, gap: space.sm },
});
