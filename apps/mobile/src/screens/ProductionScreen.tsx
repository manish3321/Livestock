import { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { PRODUCTION_TYPES, type PageResult, type ProductionCreate } from '@farm/contracts';
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
} from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { toQuery } from '../api/query';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';

type Prod = {
  id: string;
  type?: string;
  quantity?: number;
  unit?: string;
  entryDate?: string;
  animalTag?: string | null;
};

export function ProductionScreen() {
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const canWrite = can('production:write');
  const [items, setItems] = useState<Prod[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<(typeof PRODUCTION_TYPES)[number]>('MILK');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('L');
  const [animalId, setAnimalId] = useState('');
  const [herdBatchId, setHerdBatchId] = useState('');
  const [quality, setQuality] = useState('');
  const [milkerName, setMilkerName] = useState('');
  const [fatPercent, setFatPercent] = useState('');
  const [snfPercent, setSnfPercent] = useState('');
  const [scc, setScc] = useState('');
  const [collectionMethod, setCollectionMethod] = useState<'HAND' | 'MACHINE' | ''>('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.get<PageResult<Prod>>(
        `/v1/production${toQuery({ page: 1, pageSize: 100 })}`,
      );
      setItems(page.items);
      setModuleCache(store, 'production', page);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const cached = getModuleCache<PageResult<Prod>>(store, 'production');
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

  const onType = (t: (typeof PRODUCTION_TYPES)[number]) => {
    setType(t);
    setUnit(t === 'MILK' ? 'L' : t === 'EGGS' ? 'pcs' : 'kg');
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    const body: ProductionCreate = {
      type,
      entryDate: new Date(),
      quantity: Number(quantity),
      unit,
      animalId: animalId.trim() || undefined,
      herdBatchId: herdBatchId.trim() || undefined,
      quality: quality.trim()
        ? (quality.trim() as ProductionCreate['quality'])
        : undefined,
      milkerName: milkerName.trim() || undefined,
      fatPercent: fatPercent.trim() ? Number(fatPercent) : undefined,
      snfPercent: snfPercent.trim() ? Number(snfPercent) : undefined,
      scc: scc.trim() ? Number(scc) : undefined,
      collectionMethod: collectionMethod || undefined,
    };
    try {
      await api.post('/v1/production', body);
      setShowForm(false);
      setQuantity('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell module="production">
      <PageHeader
        title={t('nav.production')}
        subtitle={t('production.subtitle')}
        actions={
          canWrite ? (
            <Button
              label={showForm ? t('common.cancel') : t('production.add')}
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
          <ChipSelect label={t('production.type')} options={[...PRODUCTION_TYPES]} value={type} onChange={onType} />
          <Field
            label={t('production.quantity')}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
          />
          <Field label={t('inventory.unit')} value={unit} onChangeText={setUnit} />
          <Field
            label={t('production.animal')}
            value={animalId}
            onChangeText={setAnimalId}
            autoCapitalize="none"
          />
          <Field label="Herd batch ID" value={herdBatchId} onChangeText={setHerdBatchId} autoCapitalize="none" />
          <Field label={t('production.quality') !== 'production.quality' ? t('production.quality') : 'Quality'} value={quality} onChangeText={setQuality} />
          <Field label={t('production.milkerName') !== 'production.milkerName' ? t('production.milkerName') : 'Milker'} value={milkerName} onChangeText={setMilkerName} />
          <Field label="Fat %" value={fatPercent} onChangeText={setFatPercent} keyboardType="decimal-pad" />
          <Field label="SNF %" value={snfPercent} onChangeText={setSnfPercent} keyboardType="decimal-pad" />
          <Field label="SCC" value={scc} onChangeText={setScc} keyboardType="number-pad" />
          <ChipSelect
            label="Collection"
            options={['HAND', 'MACHINE'] as const}
            value={collectionMethod || null}
            onChange={setCollectionMethod}
          />
          <FormActions>
            <PrimaryButton label={t('common.save')} onPress={() => void create()} disabled={busy} />
            <SecondaryButton label={t('common.cancel')} onPress={() => setShowForm(false)} />
          </FormActions>
        </ScrollView>
      ) : (
        <>
          {loading && items.length === 0 ? <LoadingBlock /> : null}
          <FlatList
            style={styles.list}
            data={items}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={!loading ? <EmptyState /> : null}
            initialNumToRender={12}
            windowSize={7}
            removeClippedSubviews
            renderItem={({ item }) => (
              <ListRow
                title={`${item.type ?? t('production.add')} · ${item.quantity ?? 0} ${item.unit ?? ''}`}
                subtitle={item.animalTag ?? undefined}
                meta={item.entryDate?.slice(0, 10)}
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
