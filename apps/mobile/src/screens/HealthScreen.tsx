import { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import {
  CAUSE_CATEGORIES,
  DISPOSAL_METHODS,
  HEALTH_RECORD_TYPES,
  MILK_APPEARANCES,
  UDDER_METHODS,
  UDDER_SIGNS,
  type HealthCreate,
  type MortalityRecordCreate,
  type PageResult,
  type UdderCheckCreate,
} from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { AnimalIdSearch } from '../components/AnimalIdSearch';
import { ChipSelect, Field, FormActions } from '../components/forms';
import {
  Button,
  ChipRow,
  EmptyState,
  ErrorText,
  FilterChip,
  ListRow,
  LoadingBlock,
  Muted,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
} from '../components/ui';
import { toQuery } from '../api/query';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import { useLocale } from '../locale/LocaleProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import { space } from '../theme/tokens';

type Health = {
  id: string;
  title: string;
  type?: string;
  animalTag?: string | null;
  performedAt?: string;
  nextDueAt?: string | null;
};

type DueFilter = 'all' | 'overdue' | 'due_soon';
type Mode = 'list' | 'create' | 'calendar' | 'batch' | 'udder' | 'death';

export function HealthScreen() {
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const canWrite = can('health:write');
  const [mode, setMode] = useState<Mode>('list');
  const [due, setDue] = useState<DueFilter>('all');
  const [items, setItems] = useState<Health[]>([]);
  const [calendar, setCalendar] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<(typeof HEALTH_RECORD_TYPES)[number]>('VACCINATION');
  const [title, setTitle] = useState('');
  const [animalId, setAnimalId] = useState('');
  const [medicine, setMedicine] = useState('');
  const [dosage, setDosage] = useState('');
  const [method, setMethod] = useState('');
  const [vetName, setVetName] = useState('');
  const [cost, setCost] = useState('');
  const [outcome, setOutcome] = useState<'RECOVERED' | 'ONGOING' | 'FAILED' | 'CULLED' | ''>('');
  const [cmtResult, setCmtResult] = useState<'NEGATIVE' | 'TRACE' | 'ONE' | 'TWO' | 'THREE' | ''>('');
  const [milkWithhold, setMilkWithhold] = useState('');
  const [meatWithhold, setMeatWithhold] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [frequencyPerDay, setFrequencyPerDay] = useState('2');
  const [doseAmount, setDoseAmount] = useState('');
  const [route, setRoute] = useState('');
  const [temperatureC, setTemperatureC] = useState('');
  const [severity, setSeverity] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [batchId, setBatchId] = useState('');
  const [doseCount, setDoseCount] = useState('1');
  const [busy, setBusy] = useState(false);

  const [udderMethod, setUdderMethod] = useState<(typeof UDDER_METHODS)[number]>('CMT');
  const [appearance, setAppearance] = useState<(typeof MILK_APPEARANCES)[number]>('NORMAL');
  const [lf, setLf] = useState('0');
  const [rf, setRf] = useState('0');
  const [lr, setLr] = useState('0');
  const [rr, setRr] = useState('0');
  const [scc, setScc] = useState('');
  const [udderSigns, setUdderSigns] = useState('');

  const [deathAt, setDeathAt] = useState(new Date().toISOString().slice(0, 10));
  const [cause, setCause] = useState<(typeof CAUSE_CATEGORIES)[number]>('DISEASE');
  const [suspectedDisease, setSuspectedDisease] = useState('');
  const [disposal, setDisposal] = useState<(typeof DISPOSAL_METHODS)[number] | ''>('');
  const [postMortem, setPostMortem] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const path = `/v1/health-records${toQuery({
      page: 1,
      pageSize: 100,
      due,
    })}`;
    try {
      const page = await api.get<PageResult<Health>>(path);
      setItems(page.items);
      setModuleCache(store, 'health', page);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const cached = getModuleCache<PageResult<Health>>(store, 'health');
      if (cached?.items) {
        setItems(cached.items);
        setFromCache(true);
      } else setError(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [api, due, persist, store, t]);

  const loadCalendar = useCallback(async () => {
    try {
      const rows = await api.get<Array<Record<string, unknown>> | PageResult<Record<string, unknown>>>(
        '/v1/health-records/calendar',
      );
      setCalendar(Array.isArray(rows) ? rows : rows.items ?? []);
    } catch {
      setCalendar([]);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode === 'calendar') void loadCalendar();
  }, [loadCalendar, mode]);

  const create = async () => {
    setBusy(true);
    setError(null);
    const body: HealthCreate = {
      type,
      title: title.trim() || type,
      animalId: animalId.trim() || undefined,
      medicine: medicine.trim() || undefined,
      dosage: dosage.trim() || undefined,
      method: method.trim() || undefined,
      vetName: vetName.trim() || undefined,
      cost: cost.trim() ? Number(cost) : undefined,
      outcome: outcome || undefined,
      cmtResult: cmtResult || undefined,
      milkWithholdUntil: milkWithhold.trim() ? new Date(milkWithhold) : undefined,
      meatWithholdUntil: meatWithhold.trim() ? new Date(meatWithhold) : undefined,
      batchNumber: batchNumber.trim() || undefined,
      inventoryItemId: inventoryItemId.trim() || undefined,
      durationDays: durationDays.trim() ? Number(durationDays) : undefined,
      frequencyPerDay: frequencyPerDay.trim() ? Number(frequencyPerDay) : undefined,
      doseAmount: doseAmount.trim() ? Number(doseAmount) : undefined,
      route: route.trim()
        ? (route.trim() as HealthCreate['route'])
        : undefined,
      temperatureC: temperatureC.trim() ? Number(temperatureC) : undefined,
      severity: severity.trim()
        ? (severity.trim() as HealthCreate['severity'])
        : undefined,
      provisionalDiagnosis: diagnosis.trim() || undefined,
      notes: notes.trim() || symptoms.trim() || undefined,
      performedAt: new Date(),
      nextDueAt: nextDue.trim() ? new Date(nextDue) : undefined,
      followUpAt: followUpAt.trim() ? new Date(followUpAt) : undefined,
    };
    try {
      await api.post('/v1/health-records', body);
      setMode('list');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const batchVaccinate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/v1/health-records', {
        type: 'VACCINATION',
        title: title.trim() || t('health.groupVax'),
        herdBatchId: batchId.trim(),
        medicine: medicine.trim() || undefined,
        doseCount: Number(doseCount) || 1,
        inventoryItemId: inventoryItemId.trim() || undefined,
        performedAt: new Date(),
      } satisfies HealthCreate);
      setMode('list');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('health.batchFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveUdder = async () => {
    if (!animalId.trim()) {
      setError(t('health.animalRequired') !== 'health.animalRequired' ? t('health.animalRequired') : 'Animal required');
      return;
    }
    setBusy(true);
    setError(null);
    const body: UdderCheckCreate = {
      animalId: animalId.trim(),
      method: udderMethod,
      appearance,
      quarterScores: {
        LF: Number(lf) || 0,
        RF: Number(rf) || 0,
        LR: Number(lr) || 0,
        RR: Number(rr) || 0,
      },
      sccThousand: scc.trim() ? Number(scc) : undefined,
      signs: udderSigns
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as UdderCheckCreate['signs'],
    };
    try {
      await api.post('/v1/udder-checks', body);
      setMode('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const saveDeath = async () => {
    if (!animalId.trim()) {
      setError('Animal required');
      return;
    }
    setBusy(true);
    setError(null);
    const body: MortalityRecordCreate = {
      animalId: animalId.trim(),
      deathAt: new Date(deathAt),
      causeCategory: cause,
      suspectedDisease: suspectedDisease.trim() || undefined,
      disposalMethod: disposal || undefined,
      postMortemDone: postMortem,
    };
    try {
      await api.post('/v1/mortality', body);
      setMode('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell module="health">
      <PageHeader
        title={t('nav.health')}
        subtitle={t('health.subtitle')}
        actions={
          canWrite ? (
            <>
              <Button
                label={mode === 'create' ? t('common.cancel') : t('health.add')}
                onPress={() => setMode((m) => (m === 'create' ? 'list' : 'create'))}
              />
              <Button
                label={t('health.groupVax')}
                variant="secondary"
                onPress={() => setMode((m) => (m === 'batch' ? 'list' : 'batch'))}
              />
            </>
          ) : null
        }
      />
      {fromCache ? (
        <View style={styles.pad}>
          <Muted>{t('native.cached')}</Muted>
        </View>
      ) : null}
      {error ? <ErrorText message={error} /> : null}

      <View style={styles.pad}>
        <ChipRow>
          {(['all', 'overdue', 'due_soon'] as const).map((k) => (
            <FilterChip
              key={k}
              label={t(`health.due.${k}`)}
              active={due === k && mode === 'list'}
              onPress={() => {
                setDue(k);
                setMode('list');
              }}
            />
          ))}
          <FilterChip
            label={t('health.calendar')}
            active={mode === 'calendar'}
            onPress={() => setMode('calendar')}
          />
          {canWrite ? (
            <>
              <FilterChip
                label={t('health.udder') !== 'health.udder' ? t('health.udder') : 'Udder'}
                active={mode === 'udder'}
                onPress={() => setMode('udder')}
              />
              <FilterChip
                label={t('health.death') !== 'health.death' ? t('health.death') : 'Death'}
                active={mode === 'death'}
                onPress={() => setMode('death')}
              />
            </>
          ) : null}
        </ChipRow>
      </View>

      {mode === 'list' ? (
        <>
          {loading && items.length === 0 ? <LoadingBlock /> : null}
          <FlatList
            data={items}
            keyExtractor={(h) => h.id}
            ListEmptyComponent={!loading ? <EmptyState /> : null}
            renderItem={({ item }) => (
              <ListRow
                title={item.title}
                subtitle={[item.type, item.animalTag].filter(Boolean).join(' · ')}
                meta={item.nextDueAt?.slice(0, 10) ?? item.performedAt?.slice(0, 10)}
              />
            )}
          />
        </>
      ) : null}

      {mode === 'create' ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <ChipSelect label={t('health.type')} options={[...HEALTH_RECORD_TYPES]} value={type} onChange={setType} />
          <Field label={t('health.title')} value={title} onChangeText={setTitle} />
          <AnimalIdSearch value={animalId} onChange={(id) => setAnimalId(id)} />
          <Field label={t('health.medicine')} value={medicine} onChangeText={setMedicine} />
          <Field label={t('health.dosage') !== 'health.dosage' ? t('health.dosage') : 'Dosage'} value={dosage} onChangeText={setDosage} />
          <Field label={t('health.method') !== 'health.method' ? t('health.method') : 'Method'} value={method} onChangeText={setMethod} />
          <Field label={t('health.vet') !== 'health.vet' ? t('health.vet') : 'Vet'} value={vetName} onChangeText={setVetName} />
          <Field label={t('health.cost') !== 'health.cost' ? t('health.cost') : 'Cost'} value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
          <ChipSelect
            label="Outcome"
            options={['RECOVERED', 'ONGOING', 'FAILED', 'CULLED'] as const}
            value={outcome || null}
            onChange={setOutcome}
          />
          <ChipSelect
            label="CMT"
            options={['NEGATIVE', 'TRACE', 'ONE', 'TWO', 'THREE'] as const}
            value={cmtResult || null}
            onChange={setCmtResult}
          />
          <Field label="Milk withhold (YYYY-MM-DD)" value={milkWithhold} onChangeText={setMilkWithhold} autoCapitalize="none" />
          <Field label="Meat withhold (YYYY-MM-DD)" value={meatWithhold} onChangeText={setMeatWithhold} autoCapitalize="none" />
          <Field label="Batch #" value={batchNumber} onChangeText={setBatchNumber} />
          <Field label="Inventory item ID" value={inventoryItemId} onChangeText={setInventoryItemId} autoCapitalize="none" />
          <Field label="Duration days" value={durationDays} onChangeText={setDurationDays} keyboardType="number-pad" />
          <Field label="Frequency / day" value={frequencyPerDay} onChangeText={setFrequencyPerDay} keyboardType="number-pad" />
          <Field label="Dose amount" value={doseAmount} onChangeText={setDoseAmount} keyboardType="decimal-pad" />
          <Field label="Route" value={route} onChangeText={setRoute} />
          <Field label="Temp °C" value={temperatureC} onChangeText={setTemperatureC} keyboardType="decimal-pad" />
          <Field label="Severity" value={severity} onChangeText={setSeverity} />
          <Field label="Diagnosis" value={diagnosis} onChangeText={setDiagnosis} />
          <Field label={t('health.symptoms')} value={symptoms} onChangeText={setSymptoms} />
          <Field label={t('common.notes') !== 'common.notes' ? t('common.notes') : 'Notes'} value={notes} onChangeText={setNotes} multiline />
          <Field label={t('health.nextDueAt')} value={nextDue} onChangeText={setNextDue} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          <Field label="Follow-up (YYYY-MM-DD)" value={followUpAt} onChangeText={setFollowUpAt} autoCapitalize="none" />
          <FormActions>
            <PrimaryButton label={t('common.save')} onPress={() => void create()} disabled={busy} />
            <SecondaryButton label={t('common.cancel')} onPress={() => setMode('list')} />
          </FormActions>
        </ScrollView>
      ) : null}

      {mode === 'calendar' ? (
        <FlatList
          data={calendar}
          keyExtractor={(r, i) => String(r.id ?? i)}
          ListEmptyComponent={<EmptyState />}
          renderItem={({ item }) => (
            <ListRow
              title={String(item.title ?? item.type ?? t('health.nextDueAt'))}
              subtitle={String(item.animalTag ?? item.animalId ?? '')}
              meta={String(item.nextDueAt ?? item.dueAt ?? '').slice(0, 10)}
            />
          )}
        />
      ) : null}

      {mode === 'batch' && canWrite ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <SectionTitle>{t('health.groupVax')}</SectionTitle>
          <Muted>{t('health.groupVaxHelp')}</Muted>
          <Field label={t('health.herdBatch')} value={batchId} onChangeText={setBatchId} autoCapitalize="none" />
          <Field label={t('health.title')} value={title} onChangeText={setTitle} />
          <Field label={t('health.medicine')} value={medicine} onChangeText={setMedicine} />
          <Field label="Inventory item ID" value={inventoryItemId} onChangeText={setInventoryItemId} autoCapitalize="none" />
          <Field label={t('health.doseCount')} value={doseCount} onChangeText={setDoseCount} keyboardType="number-pad" />
          <PrimaryButton
            label={t('health.vaccinateN', { n: doseCount || '0' })}
            disabled={busy || !batchId.trim()}
            onPress={() => void batchVaccinate()}
          />
        </ScrollView>
      ) : null}

      {mode === 'udder' && canWrite ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <SectionTitle>Udder check</SectionTitle>
          <AnimalIdSearch value={animalId} onChange={setAnimalId} />
          <ChipSelect label="Method" options={[...UDDER_METHODS]} value={udderMethod} onChange={setUdderMethod} />
          <ChipSelect label="Appearance" options={[...MILK_APPEARANCES]} value={appearance} onChange={setAppearance} />
          <Field label="LF score" value={lf} onChangeText={setLf} keyboardType="number-pad" />
          <Field label="RF score" value={rf} onChangeText={setRf} keyboardType="number-pad" />
          <Field label="LR score" value={lr} onChangeText={setLr} keyboardType="number-pad" />
          <Field label="RR score" value={rr} onChangeText={setRr} keyboardType="number-pad" />
          <Field label="SCC (thousand)" value={scc} onChangeText={setScc} keyboardType="number-pad" />
          <Field
            label={`Signs (${UDDER_SIGNS.slice(0, 4).join(', ')}…)`}
            value={udderSigns}
            onChangeText={setUdderSigns}
            placeholder="comma-separated"
          />
          <FormActions>
            <PrimaryButton label={t('common.save')} onPress={() => void saveUdder()} disabled={busy} />
            <SecondaryButton label={t('common.cancel')} onPress={() => setMode('list')} />
          </FormActions>
        </ScrollView>
      ) : null}

      {mode === 'death' && canWrite ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <SectionTitle>Death / loss</SectionTitle>
          <AnimalIdSearch value={animalId} onChange={setAnimalId} />
          <Field label="Death date" value={deathAt} onChangeText={setDeathAt} autoCapitalize="none" />
          <ChipSelect label="Cause" options={[...CAUSE_CATEGORIES]} value={cause} onChange={setCause} />
          <Field label="Suspected disease" value={suspectedDisease} onChangeText={setSuspectedDisease} />
          <ChipSelect
            label="Disposal"
            options={[...DISPOSAL_METHODS]}
            value={disposal || null}
            onChange={setDisposal}
          />
          <ChipSelect
            label="Post-mortem"
            options={['YES', 'NO'] as const}
            value={postMortem ? 'YES' : 'NO'}
            onChange={(v) => setPostMortem(v === 'YES')}
          />
          <FormActions>
            <PrimaryButton label={t('common.save')} onPress={() => void saveDeath()} disabled={busy} />
            <SecondaryButton label={t('common.cancel')} onPress={() => setMode('list')} />
          </FormActions>
        </ScrollView>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 24, gap: space.sm },
});
