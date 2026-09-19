import { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import type { FeedCreate, PageResult } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { AnimalIdSearch } from '../components/AnimalIdSearch';
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

type Feed = {
  id: string;
  feedType?: string;
  quantityKg?: number;
  animalTag?: string | null;
  herdBatchName?: string | null;
  occurredAt?: string;
};

export function FeedScreen() {
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const canWrite = can('feed:write');
  const [items, setItems] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [feedType, setFeedType] = useState('Concentrate');
  const [quantityKg, setQuantityKg] = useState('');
  const [animalId, setAnimalId] = useState('');
  const [herdBatchId, setHerdBatchId] = useState('');
  const [costPerKg, setCostPerKg] = useState('');
  const [condition, setCondition] = useState<'FRESH' | 'FERMENTED' | 'DRY' | ''>('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [feedNotes, setFeedNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [fcr, setFcr] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [page, fcrData] = await Promise.all([
        api.get<PageResult<Feed>>(`/v1/feed${toQuery({ page: 1, pageSize: 100 })}`),
        api.get<Record<string, unknown>>('/v1/feed/fcr').catch(() => null),
      ]);
      setItems(page.items);
      setFcr(fcrData);
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
  }, [api, persist, store]);

  useEffect(() => {
    void load();
  }, [load]);

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
          <Field label={t('feed.feedType')} value={feedType} onChangeText={setFeedType} />
          <Field
            label={t('feed.quantityKg')}
            value={quantityKg}
            onChangeText={setQuantityKg}
            keyboardType="decimal-pad"
          />
          <AnimalIdSearch value={animalId} onChange={(id) => setAnimalId(id)} />
          <Field
            label={t('feed.herdBatch')}
            value={herdBatchId}
            onChangeText={setHerdBatchId}
            autoCapitalize="none"
          />
          <Field label="Cost / kg" value={costPerKg} onChangeText={setCostPerKg} keyboardType="decimal-pad" />
          <ChipSelect
            label="Condition"
            options={['FRESH', 'FERMENTED', 'DRY'] as const}
            value={condition || null}
            onChange={setCondition}
          />
          <Field label="Inventory item ID" value={inventoryItemId} onChangeText={setInventoryItemId} autoCapitalize="none" />
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
            data={items}
            keyExtractor={(f) => f.id}
            ListEmptyComponent={!loading ? <EmptyState /> : null}
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
});
