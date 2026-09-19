import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PageResult } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
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
} from '../components/ui';
import { toQuery } from '../api/query';
import { useAccess } from '../hooks/useAccess';
import { useFarm } from '../state/FarmProvider';
import { getModuleCache, setModuleCache } from '../offline/module-cache';
import { useLocale } from '../locale/LocaleProvider';
import type { RootStackParamList } from '../navigation/types';
import { space } from '../theme/tokens';

type Batch = {
  id: string;
  name: string;
  kind?: string;
  category?: string;
  currentCount?: number;
  initialCount?: number;
};

export function BatchesScreen() {
  return <BatchKindList kind="LIVESTOCK" titleKey="nav.batches" module="batches" cacheKey="batches" />;
}

export function GroupsScreen() {
  return <BatchKindList kind="POULTRY" titleKey="nav.groups" module="groups" cacheKey="groups" />;
}

export function FishScreen() {
  return <BatchKindList kind="FISH" titleKey="nav.fish" module="fish" cacheKey="fish" />;
}

function BatchKindList({
  kind,
  titleKey,
  module,
  cacheKey,
}: {
  kind: 'LIVESTOCK' | 'POULTRY' | 'FISH';
  titleKey: string;
  module: 'batches' | 'groups' | 'fish';
  cacheKey: string;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useLocale();
  const { api, store, persist } = useFarm();
  const { can } = useAccess();
  const canWrite =
    can('animals:write') || can('groups:write') || can('fish:write');

  const [items, setItems] = useState<Batch[]>(() => {
    const cached = getModuleCache<PageResult<Batch>>(store, cacheKey);
    return cached?.items ?? [];
  });
  const [category, setCategory] = useState<string | undefined>();
  const [loading, setLoading] = useState(items.length === 0);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = Array.from(
    new Set(items.map((b) => b.category).filter(Boolean) as string[]),
  );

  const load = useCallback(async () => {
    setLoading(true);
    const path = `/v1/batches${toQuery({
      page: 1,
      pageSize: 100,
      kind,
      category,
    })}`;
    try {
      const page = await api.get<PageResult<Batch>>(path);
      setItems(page.items);
      setModuleCache(store, cacheKey, page);
      persist();
      setFromCache(false);
      setError(null);
    } catch {
      const cached = getModuleCache<PageResult<Batch>>(store, cacheKey);
      if (cached?.items) {
        setItems(cached.items);
        setFromCache(true);
      } else setError('Could not load batches');
    } finally {
      setLoading(false);
    }
  }, [api, cacheKey, category, kind, persist, store]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell module={module}>
      <PageHeader
        title={t(titleKey)}
        subtitle={
          module === 'groups' ? t('groups.subtitle') : module === 'fish' ? t('fish.subtitle') : t('batches.subtitle')
        }
        actions={
          canWrite ? (
            <Button
              label={module === 'groups' ? t('groups.add') : module === 'fish' ? t('fish.add') : t('batches.add')}
              onPress={() => navigation.navigate('BatchNew', { kind })}
            />
          ) : null
        }
      />
      <View style={styles.pad}>
        {fromCache ? <Muted>Cached offline</Muted> : null}
        {error ? <ErrorText message={error} /> : null}
        {categories.length > 0 ? (
          <ChipRow>
            <FilterChip
              label={t('common.filterAll')}
              active={!category}
              onPress={() => setCategory(undefined)}
            />
            {categories.map((c) => (
              <FilterChip
                key={c}
                label={c}
                active={category === c}
                onPress={() => setCategory(category === c ? undefined : c)}
              />
            ))}
          </ChipRow>
        ) : null}
      </View>
      {loading && items.length === 0 ? <LoadingBlock /> : null}
      <FlatList
        data={items}
        keyExtractor={(b) => b.id}
            ListEmptyComponent={!loading ? <EmptyState /> : null}
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={[item.kind, item.category].filter(Boolean).join(' · ')}
            meta={String(item.currentCount ?? item.initialCount ?? '')}
            onPress={() => navigation.navigate('BatchDetail', { id: item.id })}
          />
        )}
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingTop: 8, gap: space.sm },
});
