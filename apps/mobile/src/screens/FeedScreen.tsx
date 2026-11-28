import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import type { FeedCreate, PageResult } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { AnimalIdSearch } from '../components/AnimalIdSearch';
import { ChipSelect, Field, FormActions } from '../components/forms';
import { SuggestField, type SuggestOption } from '../components/SuggestField';
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
import type { RootStackParamList } from '../navigation/types';

type Feed = {
  id: string;
  feedType?: string;
  quantityKg?: number;
  animalTag?: string | null;
  herdBatchName?: string | null;
  occurredAt?: string;
};

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  unitCost?: number | null;
};

type BatchItem = {
  id: string;
  name: string;
  kind?: string;
};

export function FeedScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Feed'>>();
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const canWrite = can('feed:write');
  const [items, setItems] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(Boolean(route.params?.animalId));
  const [feedType, setFeedType] = useState('Concentrate');
  const [quantityKg, setQuantityKg] = useState('');
  const [animalId, setAnimalId] = useState(route.params?.animalId ?? '');
  const [herdBatchId, setHerdBatchId] = useState('');
  const [batchLabel, setBatchLabel] = useState('');
  const [costPerKg, setCostPerKg] = useState('');
  const [condition, setCondition] = useState<'FRESH' | 'FERMENTED' | 'DRY' | ''>('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [inventoryLabel, setInventoryLabel] = useState('');
  const [feedNotes, setFeedNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [fcr, setFcr] = useState<Record<string, unknown> | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [page, fcrData, invPage, batchPage] = await Promise.all([
        api.get<PageResult<Feed>>(`/v1/feed${toQuery({ page: 1, pageSize: 100 })}`),
        api.get<Record<string, unknown>>('/v1/feed/fcr').catch(() => null),
        api
          .get<PageResult<InventoryItem>>(`/v1/inventory${toQuery({ page: 1, pageSize: 200 })}`)
          .catch(() => ({ items: [] as InventoryItem[] })),
        api
          .get<PageResult<BatchItem>>(`/v1/batches${toQuery({ page: 1, pageSize: 200 })}`)
          .catch(() => ({ items: [] as BatchItem[] })),
      ]);
      setItems(page.items);
      setFcr(fcrData);
      setInventory(invPage.items ?? []);
      setBatches(batchPage.items ?? []);
      setModuleCache(store, 'feed', page);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const cached = getModuleCache<PageResult<Feed>>(store, 'feed');
      if (cached?.items) {
        setItems(cached.items);
        setFromCache(true);
      } else setError(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [api, persist, store, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (route.params?.animalId) {
      setAnimalId(route.params.animalId);
      setShowForm(true);
    }
  }, [route.params?.animalId]);

  const feedTypeOptions = useMemo<SuggestOption[]>(() => {
    const fromLogs = items.map((row) => row.feedType).filter(Boolean) as string[];
    const fromInv = inventory.filter((i) => i.category === 'FEED').map((i) => i.name);
    const seen = new Set<string>();
    const out: SuggestOption[] = [];
    for (const name of [...fromInv, ...fromLogs, 'Concentrate', 'Fodder', 'Silage']) {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ value: name, label: name });
    }
    return out;
  }, [inventory, items]);

  const batchOptions = useMemo<SuggestOption[]>(
    () =>
      batches.map((b) => ({
        value: b.id,
        label: b.name,
        hint: b.kind,
      })),
    [batches],
  );

  const inventoryOptions = useMemo<SuggestOption[]>(
    () =>
      inventory
        .filter((i) => i.category === 'FEED')
        .map((i) => ({
          value: i.id,
          label: i.name,
          hint: `${i.currentStock} ${i.unit}`,
        })),
    [inventory],
  );

  const create = async () => {
    setBusy(true);
    setError(null);
    const body: FeedCreate = {
      feedType: feedType.trim(),
      quantityKg: Number(quantityKg),
      animalId: animalId.trim() || undefined,
      herdBatchId: herdBatchId.trim() || undefined,
      costPerKg: costPerKg.trim() ? Number(costPerKg) : undefined,
      condition: condition || undefined,
      inventoryItemId: inventoryItemId.trim() || undefined,
      notes: feedNotes.trim() || undefined,
      occurredAt: new Date(),
    };
    try {
      await api.post('/v1/feed', body);
      setShowForm(false);
      setQuantityKg('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell module="feed">
      <PageHeader
        title={t('nav.feed')}
        subtitle={t('feed.subtitle')}
        actions={
          canWrite ? (
            <Button
              label={showForm ? t('common.cancel') : t('feed.add')}
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
          <SuggestField
            label={t('feed.feedType')}
            value={feedType}
            displayValue={feedType}
            options={feedTypeOptions}
            allowCustom
            onChange={({ value }) => setFeedType(value)}
          />
          <Field
            label={t('feed.quantityKg')}
            value={quantityKg}
            onChangeText={setQuantityKg}
            keyboardType="decimal-pad"
          />
          <AnimalIdSearch value={animalId} onChange={(id) => setAnimalId(id)} />
          <SuggestField
            label={t('feed.herdBatch')}
            value={herdBatchId}
            displayValue={batchLabel}
            options={batchOptions}
            allowCustom={false}
            placeholder={t('feed.selectBatch')}
            onChange={({ value, label }) => {
              setHerdBatchId(value);
              setBatchLabel(label);
            }}
          />
          <Field
            label={t('feed.costPerKg')}
            value={costPerKg}
            onChangeText={setCostPerKg}
            keyboardType="decimal-pad"
          />
          <ChipSelect
            label={t('feed.condition')}
            options={['FRESH', 'FERMENTED', 'DRY'] as const}
            value={condition || null}
            onChange={setCondition}
          />
          <SuggestField
            label={t('feed.inventory')}
            value={inventoryItemId}
            displayValue={inventoryLabel}
            options={inventoryOptions}
            allowCustom={false}
            placeholder={t('feed.noInventoryItem')}
            onChange={({ value, label, option }) => {
              setInventoryItemId(value);
              setInventoryLabel(label);
              const inv = inventory.find((i) => i.id === value);
              if (!feedType.trim() && option?.label) setFeedType(option.label);
              if (!costPerKg.trim() && inv?.unitCost != null) setCostPerKg(String(inv.unitCost));
            }}
          />
          <Field label={t('common.notes')} value={feedNotes} onChangeText={setFeedNotes} />
          <FormActions>
            <PrimaryButton label={t('common.save')} onPress={() => void create()} disabled={busy} />
            <SecondaryButton label={t('common.cancel')} onPress={() => setShowForm(false)} />
          </FormActions>
        </ScrollView>
      ) : (
        <>
          {fcr ? (
            <View style={styles.pad}>
              <SectionTitle>{t('feed.feedCostPerLiter')}</SectionTitle>
              <Muted>
                {t('feed.cost')} {String(fcr.feedCost ?? '—')} · {t('dashboard.yesterdayMilk')}{' '}
                {String(fcr.milkLiters ?? '—')}
              </Muted>
            </View>
          ) : null}
          {loading && items.length === 0 ? <LoadingBlock /> : null}
          <FlatList
            style={styles.list}
            data={items}
            keyExtractor={(f) => f.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={!loading ? <EmptyState /> : null}
            initialNumToRender={12}
            windowSize={7}
            removeClippedSubviews
            renderItem={({ item }) => (
              <ListRow
                title={`${item.feedType ?? t('nav.feed')} · ${item.quantityKg ?? 0} kg`}
                subtitle={item.animalTag ?? item.herdBatchName ?? undefined}
                meta={item.occurredAt?.slice(0, 10)}
              />
            )}
          />
        </>
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 24 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 48 },
});
