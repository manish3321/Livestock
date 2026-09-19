import { FlatList, Text, View } from 'react-native';
import type { ModuleKey } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { ErrorText, ListRow, LoadingBlock, Muted } from '../components/ui';
import { useCachedResource } from '../hooks/useCachedResource';
import { space } from '../theme/tokens';

type PageLike<T> = { items: T[]; total?: number };

export function ResourceListScreen<T>({
  title,
  module,
  cacheKey,
  path,
  keyExtractor,
  titleOf,
  subtitleOf,
  metaOf,
  onPress,
}: {
  title: string;
  module: ModuleKey;
  cacheKey: string;
  path: string;
  keyExtractor: (item: T) => string;
  titleOf: (item: T) => string;
  subtitleOf?: (item: T) => string | undefined;
  metaOf?: (item: T) => string | undefined;
  onPress?: (item: T) => void;
}) {
  const { data, loading, error, fromCache } = useCachedResource<PageLike<T> | T[]>(cacheKey, path);
  const items: T[] = Array.isArray(data) ? data : (data?.items ?? []);

  return (
    <AppShell title={title} module={module}>
      {loading && !data ? <LoadingBlock /> : null}
      {error && !data ? <ErrorText message={error} /> : null}
      {data ? (
        <View style={{ flex: 1 }}>
          {fromCache ? (
            <View style={{ padding: space.sm }}>
              <Muted>Cached offline · {items.length} rows</Muted>
            </View>
          ) : (
            <View style={{ padding: space.sm }}>
              <Muted>{items.length} rows</Muted>
            </View>
          )}
          <FlatList
            data={items}
            keyExtractor={keyExtractor}
            ListEmptyComponent={
              <Text style={{ padding: space.md, color: '#5c6b7a' }}>No records</Text>
            }
            renderItem={({ item }) => (
              <ListRow
                title={titleOf(item)}
                subtitle={subtitleOf?.(item)}
                meta={metaOf?.(item)}
                onPress={onPress ? () => onPress(item) : undefined}
              />
            )}
          />
        </View>
      ) : null}
    </AppShell>
  );
}
