import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import {
  REVENUE_SOURCES,
  formatNPR,
  type PageResult,
  type RevenueCreate,
  type RevenueSource,
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
import type { RootStackParamList } from '../navigation/types';

type Rev = {
  id: string;
  source?: string;
  amount?: number;
  revenueDate?: string;
  buyerName?: string | null;
  paymentStatus?: string;
};

export function RevenueScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Revenue'>>();
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const canWrite = can('revenue:write');
  const [items, setItems] = useState<Rev[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(Boolean(route.params?.animalId));
  const [source, setSource] = useState<RevenueSource>('MILK');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('L');
  const [rate, setRate] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerContact, setBuyerContact] = useState('');
  const [animalId, setAnimalId] = useState(route.params?.animalId ?? '');
  const [herdBatchId, setHerdBatchId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'PENDING' | 'PAID' | 'PARTIAL'>('PENDING');
  const [qualityBonus, setQualityBonus] = useState('');
  const [qualityPenalty, setQualityPenalty] = useState('');
  const [deductions, setDeductions] = useState('');
  const [busy, setBusy] = useState(false);
  const [payQty, setPayQty] = useState('');
  const [payPrice, setPayPrice] = useState('');
  const [effPrice, setEffPrice] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [page, price] = await Promise.all([
        api.get<PageResult<Rev>>(`/v1/revenue${toQuery({ page: 1, pageSize: 100 })}`),
        api
          .get<{ effectivePrice?: number; price?: number }>('/v1/milk/effective-price')
          .catch(() => null),
      ]);
      setItems(page.items);
      setEffPrice(price?.effectivePrice ?? price?.price ?? null);
      setModuleCache(store, 'revenue', page);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const cached = getModuleCache<PageResult<Rev>>(store, 'revenue');
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

  const create = async () => {
    setBusy(true);
    setError(null);
    const body: RevenueCreate = {
      source,
      quantity: Number(quantity),
      unit,
      rate: Number(rate),
      revenueDate: new Date(),
      buyerName: buyerName.trim() || undefined,
      buyerContact: buyerContact.trim() || undefined,
      animalId: animalId.trim() || undefined,
      herdBatchId: herdBatchId.trim() || undefined,
      qualityBonus: qualityBonus.trim() ? Number(qualityBonus) : undefined,
      qualityPenalty: qualityPenalty.trim() ? Number(qualityPenalty) : undefined,
      deductions: deductions.trim() ? Number(deductions) : undefined,
      paymentStatus,
    };
    try {
      await api.post('/v1/revenue', body);
      setShowForm(false);
      setQuantity('');
      setRate('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (id: string) => {
    Alert.alert(t('revenue.markPaid', { defaultValue: 'Mark paid?' }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.save'),
        onPress: () => {
          void (async () => {
            try {
              await api.patch(`/v1/revenue/${id}`, { paymentStatus: 'PAID' });
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Update failed');
            }
          })();
        },
      },
    ]);
  };

  const recordMilkPayment = async () => {
    const qty = Number(payQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(t('revenue.quantity'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/v1/milk/payments', {
        quantityLiters: qty,
        pricePerLiter: Number(payPrice) || effPrice || undefined,
        paidAt: new Date(),
      });
      setPayQty('');
      setPayPrice('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setBusy(false);
    }
  };

  const paymentFooter =
    canWrite && !showForm ? (
      <View style={styles.pad}>
        <SectionTitle>{t('revenue.coopPayment')}</SectionTitle>
        <Muted>{t('revenue.coopPaymentHelp')}</Muted>
        <Field
          label={t('revenue.quantity')}
          value={payQty}
          onChangeText={setPayQty}
          keyboardType="decimal-pad"
        />
        <Field
          label={t('revenue.rate')}
          value={payPrice}
          onChangeText={setPayPrice}
          keyboardType="decimal-pad"
        />
        {effPrice != null ? (
          <Muted>
            {t('profit.effective')}: {formatNPR(effPrice)}
          </Muted>
        ) : null}
        <PrimaryButton
          label={t('revenue.savePayment')}
          disabled={busy}
          onPress={() => void recordMilkPayment()}
        />
      </View>
    ) : null;

  return (
    <AppShell module="revenue">
      <PageHeader
        title={t('nav.revenue')}
        subtitle={t('revenue.subtitle')}
        actions={
          canWrite ? (
            <Button
              label={showForm ? t('common.cancel') : t('revenue.add')}
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
          <ChipSelect
            label={t('revenue.source')}
            options={[...REVENUE_SOURCES]}
            value={source}
            onChange={setSource}
          />
          <Field label={t('revenue.quantity')} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
          <Field label={t('inventory.unit')} value={unit} onChangeText={setUnit} />
          <Field label={t('revenue.rate')} value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
          <Field label={t('revenue.buyer')} value={buyerName} onChangeText={setBuyerName} />
          <Field label="Buyer contact" value={buyerContact} onChangeText={setBuyerContact} />
          <Field label="Animal ID" value={animalId} onChangeText={setAnimalId} autoCapitalize="none" />
          <Field label="Batch ID" value={herdBatchId} onChangeText={setHerdBatchId} autoCapitalize="none" />
          <Field label="Quality bonus" value={qualityBonus} onChangeText={setQualityBonus} keyboardType="decimal-pad" />
          <Field label="Quality penalty" value={qualityPenalty} onChangeText={setQualityPenalty} keyboardType="decimal-pad" />
          <Field label="Deductions" value={deductions} onChangeText={setDeductions} keyboardType="decimal-pad" />
          <ChipSelect
            label="Payment"
            options={['PENDING', 'PAID', 'PARTIAL'] as const}
            value={paymentStatus}
            onChange={setPaymentStatus}
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
            style={{ flex: 1 }}
            data={items}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
            ListEmptyComponent={!loading ? <EmptyState /> : null}
            ListFooterComponent={paymentFooter}
            renderItem={({ item }) => (
              <ListRow
                title={`${item.source ?? t('revenue.add')} · ${formatNPR(item.amount ?? 0)}`}
                subtitle={[item.buyerName, item.paymentStatus].filter(Boolean).join(' · ')}
                meta={item.revenueDate?.slice(0, 10)}
                onPress={
                  canWrite && item.paymentStatus !== 'PAID'
                    ? () => void markPaid(item.id)
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
  pad: { paddingHorizontal: 16, paddingBottom: 24 },
});
