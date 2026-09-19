import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ANIMAL_STATUS_LABEL,
  ANIMAL_STATUSES,
  SPECIES,
  SPECIES_LABEL,
  type AnimalDto,
  type AnimalStatus,
  type PageResult,
  type Species,
} from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { AnimalActionGrid } from '../components/AnimalActionGrid';
import { speciesCode } from '../components/ModuleIcon';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Txt,
  inputStyle,
  useTypeface,
} from '../components/ui';
import { toQuery } from '../api/query';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import { printHtml, tableHtml } from '../lib/printHtml';
import { shareCsv } from '../lib/shareCsv';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import { useLocale } from '../locale/LocaleProvider';
import type { RootStackParamList } from '../navigation/types';
import { color, space } from '../theme/tokens';

export function AnimalsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const { t } = useLocale();
  const face = useTypeface();
  const canWrite = can('animals:write');
  const canExport = can('export:data');

  const [species, setSpecies] = useState<Species | null>(null);
  const [speciesCounts, setSpeciesCounts] = useState<Partial<Record<Species, number>>>({});
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AnimalStatus | ''>('');
  const [items, setItems] = useState<AnimalDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const searching = q.trim().length > 0;
  const showPicker = !species && !searching;

  const loadCounts = useCallback(async () => {
    const entries = await Promise.all(
      SPECIES.map(async (s) => {
        try {
          const page = await api.get<PageResult<AnimalDto>>(
            `/v1/animals${toQuery({ page: 1, pageSize: 1, species: s })}`,
          );
          return [s, page.total] as const;
        } catch {
          return [s, 0] as const;
        }
      }),
    );
    setSpeciesCounts(Object.fromEntries(entries));
  }, [api]);

  const load = useCallback(async () => {
    if (!species && !q.trim()) {
      setItems([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    const path = `/v1/animals${toQuery({
      page: 1,
      pageSize: 200,
      sort: 'tag',
      order: 'asc',
      q: q.trim() || undefined,
      species: species ?? undefined,
      status: status || undefined,
    })}`;
    try {
      const page = await api.get<PageResult<AnimalDto>>(path);
      setItems(page.items);
      setTotal(page.total);
      setModuleCache(store, 'animals', page);
      persist();
    } catch {
      const cached = getModuleCache<PageResult<AnimalDto>>(store, 'animals');
      if (cached?.items) {
        setItems(cached.items);
        setTotal(cached.total);
      } else setError(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [api, persist, q, species, status, store, t]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async () => {
    try {
      await shareCsv('/v1/animals/export.csv', 'animals.csv', () => store.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  const exportPdf = async () => {
    try {
      const html = tableHtml(
        ['Tag', 'Name', 'Species', 'Status'],
        items.map((a) => [a.tag, a.name ?? '', a.species, a.status]),
      );
      await printHtml(t('nav.animals'), html);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  const listHeader = (
    <View>
      <PageHeader
        title={species ? SPECIES_LABEL[species] : t('nav.animals')}
        subtitle={showPicker ? t('animals.chooseKindHint') : t('animals.subtitle')}
        backLabel={!showPicker ? t('animals.backToKinds') : undefined}
        onBack={
          !showPicker
            ? () => {
                setSpecies(null);
                setQ('');
                setStatus('');
                setExpanded(null);
              }
            : undefined
        }
        actions={
          <>
            {canWrite ? (
              <Button
                label={t('animals.import')}
                variant="secondary"
                onPress={() => navigation.navigate('AnimalsImport')}
              />
            ) : null}
            <Button
              label={t('animals.printTags')}
              variant="secondary"
              onPress={() => navigation.navigate('AnimalsTags')}
            />
            {canExport ? (
              <>
                <Button
                  label={t('animals.exportCsv')}
                  variant="secondary"
                  onPress={() => void exportCsv()}
                />
                <Button label="PDF" variant="secondary" onPress={() => void exportPdf()} />
              </>
            ) : null}
          </>
        }
      />

      <TextInput
        style={[inputStyle(face), { marginBottom: 12 }]}
        placeholder={t('animals.searchPlaceholder')}
        placeholderTextColor={color.textMuted}
        value={q}
        onChangeText={(v) => {
          setQ(v);
          setExpanded(null);
        }}
        autoCapitalize="characters"
      />

      {!showPicker ? (
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setStatus('')}
            style={[styles.filter, !status && styles.filterOn]}
          >
            <Txt
              weight="medium"
              style={{ color: !status ? '#fff' : color.textSecondary, fontSize: 13 }}
            >
              {t('animals.anyStatus')}
            </Txt>
          </Pressable>
          {ANIMAL_STATUSES.map((s) => (
            <Pressable
              key={s}
              onPress={() => setStatus(status === s ? '' : s)}
              style={[styles.filter, status === s && styles.filterOn]}
            >
              <Txt
                weight="medium"
                style={{ color: status === s ? '#fff' : color.textSecondary, fontSize: 13 }}
              >
                {t(`enum.animalStatus.${s}`, { defaultValue: ANIMAL_STATUS_LABEL[s] })}
              </Txt>
            </Pressable>
          ))}
        </View>
      ) : null}

      {showPicker ? (
        <View style={styles.pickGrid}>
          {SPECIES.map((s) => (
            <Pressable key={s} style={styles.speciesPick} onPress={() => setSpecies(s)}>
              <Txt weight="display" style={styles.glyph}>
                {speciesCode(s)}
              </Txt>
              <Txt weight="semibold">{SPECIES_LABEL[s]}</Txt>
              <Txt weight="display" style={styles.pickCount}>
                {speciesCounts[s] ?? 0}
              </Txt>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!showPicker && loading && items.length === 0 ? <LoadingState /> : null}
      {!showPicker && error && items.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : null}
      {!showPicker && !loading ? (
        <Txt muted style={{ marginBottom: 12, fontWeight: '600' }}>
          {total > items.length
            ? t('animals.showingFirst', { shown: items.length, total })
            : t('animals.resultCount', { count: total })}
        </Txt>
      ) : null}
    </View>
  );

  return (
    <AppShell module="animals">
      <View style={styles.root}>
        {showPicker ? (
          <View style={styles.pad}>{listHeader}</View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(row) => row.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={!loading ? <EmptyState /> : null}
            renderItem={({ item: row }) => (
              <HerdRow
                row={row}
                showSpecies={!species}
                open={expanded === row.id}
                onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
              />
            )}
          />
        )}
        {canWrite ? (
          <View style={styles.fabWrap}>
            <Button
              fab
              label={`+ ${t('animals.add')}`}
              onPress={() =>
                navigation.navigate('AnimalNew', species ? { species } : undefined)
              }
            />
          </View>
        ) : null}
      </View>
    </AppShell>
  );
}

function HerdRow({
  row,
  showSpecies,
  open,
  onToggle,
}: {
  row: AnimalDto;
  showSpecies: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useLocale();
  const label = row.herdNumber ?? row.tag;
  const name = row.name?.trim();

  return (
    <View style={[styles.herdRow, open && styles.herdOpen]}>
      <Pressable onPress={onToggle} style={styles.herdToggle} accessibilityRole="button">
        <Txt weight="display" style={styles.herdId}>
          {label}
        </Txt>
        <Txt muted numberOfLines={1} style={styles.herdName}>
          {name || SPECIES_LABEL[row.species]}
          {showSpecies && name ? ` · ${SPECIES_LABEL[row.species]}` : ''}
        </Txt>
        <Chip
          status={row.status}
          label={t(`enum.animalStatus.${row.status}`, {
            defaultValue: ANIMAL_STATUS_LABEL[row.status],
          })}
        />
        <Txt muted style={{ fontSize: 13 }}>
          {row.currentWeightKg != null ? `${row.currentWeightKg} kg` : '—'}
        </Txt>
        <Txt muted>{open ? '▴' : '▾'}</Txt>
      </Pressable>
      {open ? (
        <View style={styles.herdPanel}>
          <View style={styles.herdSnap}>
            <Txt muted style={{ fontSize: 13 }}>
              {t('animals.breed')}: {row.breed || '—'}
            </Txt>
            <Txt muted style={{ fontSize: 13 }}>
              {t('animals.shed')}: {row.shed || '—'}
            </Txt>
            {row.isPregnant ? <Txt style={{ fontSize: 13 }}>{t('enum.animalStatus.PREGNANT')}</Txt> : null}
            {row.gender === 'FEMALE' || row.gender === 'MALE' ? (
              <Txt muted style={{ fontSize: 13 }}>
                {row.gender === 'FEMALE' ? t('animals.female') : t('animals.male')}
              </Txt>
            ) : null}
          </View>
          <AnimalActionGrid animalId={row.id} compact />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.sm },
  list: { flex: 1 },
  listContent: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filter: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: color.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterOn: { backgroundColor: color.brand },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  speciesPick: {
    width: '48%',
    flexGrow: 1,
    minHeight: 92,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    gap: 4,
  },
  glyph: { fontSize: 15, letterSpacing: 0.6, color: color.brand },
  pickCount: { fontSize: 22, color: color.brand },
  herdRow: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  herdOpen: { borderColor: color.brand },
  herdToggle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  herdId: { fontSize: 17, minWidth: 48 },
  herdName: { flex: 1, minWidth: 80, fontSize: 14 },
  herdPanel: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: color.border },
  herdSnap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 10 },
  fabWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
});
