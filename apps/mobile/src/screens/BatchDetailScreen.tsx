import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import {
  ILLNESS_CONDITIONS,
  type BatchEconomicsDto,
  type IllnessCondition,
} from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { ChipSelect, Field, FormActions } from '../components/forms';
import {
  ErrorText,
  ListRow,
  LoadingBlock,
  Muted,
  PrimaryButton,
  SectionTitle,
  StatTile,
} from '../components/ui';
import { useFarm } from '../state/FarmProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import type { RootStackParamList } from '../navigation/types';
import { colors, space, tap } from '../theme/tokens';

type Batch = {
  id: string;
  name: string;
  kind?: string;
  category?: string;
  currentCount?: number;
  initialCount?: number;
  deadCount?: number;
  sickCount?: number;
  notes?: string | null;
  ageFromMonths?: number | null;
  ageToMonths?: number | null;
};

type EventRow = { id: string; label: string; meta?: string };

type DetailTab = 'overview' | 'illness' | 'mortality' | 'feed' | 'fish' | 'history';

const TABS: DetailTab[] = ['overview', 'illness', 'mortality', 'feed', 'fish', 'history'];

export function BatchDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BatchDetail'>>();
  const { api, store, persist } = useFarm();
  const cacheKey = `batch:${route.params.id}`;
  const [data, setData] = useState<Batch | null>(() => getModuleCache(store, cacheKey));
  const [economics, setEconomics] = useState<BatchEconomicsDto | null>(null);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [history, setHistory] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [illnessCount, setIllnessCount] = useState('1');
  const [illnessCondition, setIllnessCondition] = useState<IllnessCondition>('OTHER');
  const [mortalityCount, setMortalityCount] = useState('1');
  const [mortalityReason, setMortalityReason] = useState('');
  const [feedKg, setFeedKg] = useState('');
  const [feedType, setFeedType] = useState('');
  const [feedInventoryId, setFeedInventoryId] = useState('');
  const [tempC, setTempC] = useState('');
  const [ph, setPh] = useState('');
  const [dO2, setDO2] = useState('');
  const [sampleCount, setSampleCount] = useState('10');
  const [sampleWeightG, setSampleWeightG] = useState('');
  const [harvestKg, setHarvestKg] = useState('');
  const [harvestCount, setHarvestCount] = useState('');

  const module =
    data?.kind === 'POULTRY' ? 'groups' : data?.kind === 'FISH' ? 'fish' : 'batches';
  const isFish = data?.kind === 'FISH';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await api.get<Batch>(`/v1/batches/${route.params.id}`);
      setData(row);
      setModuleCache(store, cacheKey, row);
      persist();
      setError(null);
      void api
        .get<BatchEconomicsDto>(`/v1/batches/${route.params.id}/economics`)
        .then(setEconomics)
        .catch(() => setEconomics(null));
    } catch {
      if (!data) setError('Could not load batch');
    } finally {
      setLoading(false);
    }
  }, [api, cacheKey, data, persist, route.params.id, store]);

  const loadHistory = useCallback(async () => {
    const id = route.params.id;
    try {
      const [illness, mortality, feed, water, sampling, harvest] = await Promise.all([
        api.get<Array<Record<string, unknown>>>(`/v1/batches/${id}/illness`).catch(() => []),
        api.get<Array<Record<string, unknown>>>(`/v1/batches/${id}/mortality`).catch(() => []),
        api.get<Array<Record<string, unknown>>>(`/v1/batches/${id}/feed`).catch(() => []),
        api.get<Array<Record<string, unknown>>>(`/v1/batches/${id}/water-quality`).catch(() => []),
        api.get<Array<Record<string, unknown>>>(`/v1/batches/${id}/sampling`).catch(() => []),
        api.get<Array<Record<string, unknown>>>(`/v1/batches/${id}/harvest`).catch(() => []),
      ]);
      const rows: EventRow[] = [
        ...illness.map((r) => ({
          id: String(r.id),
          label: `Illness · ${String(r.condition ?? '')} ×${String(r.count ?? '')}`,
          meta: String(r.occurredAt ?? '').slice(0, 10),
        })),
        ...mortality.map((r) => ({
          id: String(r.id),
          label: `Mortality ×${String(r.count ?? '')}${r.reason ? ` · ${r.reason}` : ''}`,
          meta: String(r.occurredAt ?? '').slice(0, 10),
        })),
        ...feed.map((r) => ({
          id: String(r.id),
          label: `Feed ${String(r.quantityKg ?? '')} kg`,
          meta: String(r.occurredAt ?? '').slice(0, 10),
        })),
        ...water.map((r) => ({
          id: String(r.id),
          label: `Water pH ${String(r.ph ?? '—')} · ${String(r.temperatureC ?? '—')}°C`,
          meta: String(r.recordedAt ?? '').slice(0, 10),
        })),
        ...sampling.map((r) => ({
          id: String(r.id),
          label: `Sample n=${String(r.sampleCount ?? '')} · ${String(r.totalWeightGrams ?? '')}g`,
          meta: String(r.sampledAt ?? '').slice(0, 10),
        })),
        ...harvest.map((r) => ({
          id: String(r.id),
          label: `Harvest ${String(r.quantityKg ?? '')} kg`,
          meta: String(r.occurredAt ?? '').slice(0, 10),
        })),
      ];
      rows.sort((a, b) => String(b.meta).localeCompare(String(a.meta)));
      setHistory(rows);
    } catch {
      /* keep */
    }
  }, [api, route.params.id]);

  useEffect(() => {
    void load();
    // load once when id changes
  }, [route.params.id]);

  useEffect(() => {
    if (tab === 'history' || tab === 'overview') void loadHistory();
  }, [loadHistory, tab]);

  const postEvent = async (path: string, body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(path, body);
      Alert.alert('Saved', ok);
      await load();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const visibleTabs = TABS.filter((t) => t !== 'fish' || isFish);

  return (
    <AppShell title={data?.name ?? 'Batch'} module={module} showBack>
      {loading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorText message={error} /> : null}
      {data ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <Text style={styles.meta}>
            {data.kind} · {data.category}
            {data.ageFromMonths != null || data.ageToMonths != null
              ? ` · age ${data.ageFromMonths ?? '?'}-${data.ageToMonths ?? '?'} mo`
              : ''}
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
            {visibleTabs.map((t) => (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.tab, tab === t && styles.tabOn]}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {tab === 'overview' ? (
            <>
              <SectionTitle>Counts</SectionTitle>
              <View style={styles.stats}>
                <StatTile label="Current" value={String(data.currentCount ?? '—')} />
                <StatTile label="Initial" value={String(data.initialCount ?? '—')} />
                <StatTile label="Dead" value={String(data.deadCount ?? '—')} />
                <StatTile label="Sick" value={String(data.sickCount ?? '—')} />
              </View>
              {economics ? (
                <>
                  <SectionTitle>Economics</SectionTitle>
                  <View style={styles.stats}>
                    <StatTile label="Invested" value={String(economics.investedTotal)} />
                    <StatTile label="Earned" value={String(economics.earnedTotal)} />
                    <StatTile label="Net" value={String(economics.net)} />
                  </View>
                </>
              ) : null}
              <SectionTitle>Notes</SectionTitle>
              <Text style={styles.line}>{data.notes ?? '—'}</Text>
              <SectionTitle>Recent events</SectionTitle>
              {history.length === 0 ? <Muted>None yet</Muted> : null}
              {history.slice(0, 8).map((h) => (
                <ListRow key={h.id} title={h.label} meta={h.meta} />
              ))}
            </>
          ) : null}

          {tab === 'illness' ? (
            <>
              <SectionTitle>Record illness</SectionTitle>
              <ChipSelect
                label="Condition"
                options={[...ILLNESS_CONDITIONS]}
                value={illnessCondition}
                onChange={setIllnessCondition}
              />
              <Field
                label="Count"
                value={illnessCount}
                onChangeText={setIllnessCount}
                keyboardType="number-pad"
              />
              <PrimaryButton
                label={busy ? '…' : 'Add illness'}
                disabled={busy}
                onPress={() =>
                  void postEvent(
                    `/v1/batches/${data.id}/illness`,
                    { condition: illnessCondition, count: Number(illnessCount) },
                    'Illness recorded',
                  )
                }
              />
            </>
          ) : null}

          {tab === 'mortality' ? (
            <>
              <SectionTitle>Record mortality</SectionTitle>
              <Field
                label="Count"
                value={mortalityCount}
                onChangeText={setMortalityCount}
                keyboardType="number-pad"
              />
              <Field label="Reason" value={mortalityReason} onChangeText={setMortalityReason} />
              <PrimaryButton
                label={busy ? '…' : 'Add mortality'}
                disabled={busy}
                onPress={() =>
                  void postEvent(
                    `/v1/batches/${data.id}/mortality`,
                    {
                      count: Number(mortalityCount),
                      reason: mortalityReason.trim() || undefined,
                    },
                    'Mortality recorded',
                  )
                }
              />
            </>
          ) : null}

          {tab === 'feed' ? (
            <>
              <SectionTitle>Record feed</SectionTitle>
              <Field
                label="Quantity kg"
                value={feedKg}
                onChangeText={setFeedKg}
                keyboardType="decimal-pad"
              />
              <Field label="Feed type" value={feedType} onChangeText={setFeedType} />
              <Field
                label="Inventory item ID"
                value={feedInventoryId}
                onChangeText={setFeedInventoryId}
                autoCapitalize="none"
              />
              <FormActions>
                <PrimaryButton
                  label={busy ? '…' : 'Add feed'}
                  disabled={busy}
                  onPress={() =>
                    void postEvent(
                      `/v1/batches/${data.id}/feed`,
                      {
                        quantityKg: Number(feedKg),
                        feedType: feedType.trim() || undefined,
                        inventoryItemId: feedInventoryId.trim() || undefined,
                      },
                      'Feed recorded',
                    )
                  }
                />
              </FormActions>
            </>
          ) : null}

          {tab === 'fish' && isFish ? (
            <>
              <SectionTitle>Water quality</SectionTitle>
              <Field label="Temp °C" value={tempC} onChangeText={setTempC} keyboardType="decimal-pad" />
              <Field label="pH" value={ph} onChangeText={setPh} keyboardType="decimal-pad" />
              <Field label="Dissolved O₂" value={dO2} onChangeText={setDO2} keyboardType="decimal-pad" />
              <PrimaryButton
                label={busy ? '…' : 'Log water'}
                disabled={busy}
                onPress={() =>
                  void postEvent(
                    `/v1/batches/${data.id}/water-quality`,
                    {
                      temperatureC: tempC ? Number(tempC) : undefined,
                      ph: ph ? Number(ph) : undefined,
                      dissolvedO2: dO2 ? Number(dO2) : undefined,
                    },
                    'Water quality saved',
                  )
                }
              />

              <SectionTitle>Sampling</SectionTitle>
              <Field
                label="Sample count"
                value={sampleCount}
                onChangeText={setSampleCount}
                keyboardType="number-pad"
              />
              <Field
                label="Total weight (g)"
                value={sampleWeightG}
                onChangeText={setSampleWeightG}
                keyboardType="decimal-pad"
              />
              <PrimaryButton
                label={busy ? '…' : 'Log sampling'}
                disabled={busy}
                onPress={() =>
                  void postEvent(
                    `/v1/batches/${data.id}/sampling`,
                    {
                      sampleCount: Number(sampleCount),
                      totalWeightGrams: Number(sampleWeightG),
                    },
                    'Sampling saved',
                  )
                }
              />

              <SectionTitle>Harvest</SectionTitle>
              <Field
                label="Quantity kg"
                value={harvestKg}
                onChangeText={setHarvestKg}
                keyboardType="decimal-pad"
              />
              <Field
                label="Fish count"
                value={harvestCount}
                onChangeText={setHarvestCount}
                keyboardType="number-pad"
              />
              <PrimaryButton
                label={busy ? '…' : 'Log harvest'}
                disabled={busy}
                onPress={() =>
                  void postEvent(
                    `/v1/batches/${data.id}/harvest`,
                    {
                      quantityKg: Number(harvestKg),
                      fishCount: harvestCount ? Number(harvestCount) : undefined,
                      reduceHeadcount: true,
                    },
                    'Harvest saved',
                  )
                }
              />
            </>
          ) : null}

          {tab === 'history' ? (
            <>
              <SectionTitle>Event history</SectionTitle>
              {history.length === 0 ? <Muted>No events</Muted> : null}
              {history.map((h) => (
                <ListRow key={h.id} title={h.label} meta={h.meta} />
              ))}
            </>
          ) : null}
        </ScrollView>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.md, paddingBottom: 48, gap: space.sm },
  meta: { color: colors.muted, marginBottom: space.sm },
  line: { color: colors.text },
  stats: { flexDirection: 'row', flexWrap: 'wrap' },
  tabs: { marginBottom: space.sm },
  tab: {
    minHeight: tap - 8,
    paddingHorizontal: 12,
    marginRight: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  tabOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { fontWeight: '700', color: colors.text, textTransform: 'capitalize', fontSize: 13 },
  tabTextOn: { color: '#fff' },
});
