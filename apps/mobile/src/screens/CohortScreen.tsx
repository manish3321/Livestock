import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MarkerCohortDto } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Muted,
  PageHeader,
  SectionHead,
  Txt,
} from '../components/ui';
import { useCachedResource } from '../hooks/useCachedResource';
import { MODULE_CACHE_PATHS } from '../offline/module-cache';
import { useLocale } from '../locale/LocaleProvider';
import type { RootStackParamList } from '../navigation/types';
import { color, radius, space } from '../theme/tokens';

export function CohortScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useLocale();
  const { data, loading, error, fromCache, reload } = useCachedResource<MarkerCohortDto>(
    'cohort',
    MODULE_CACHE_PATHS.cohort,
  );
  const groups = data?.groups ?? [];

  return (
    <AppShell module="shed">
      <PageHeader
        title={t('cohort.title')}
        subtitle={t('cohort.subtitle')}
        backLabel={t('nav.shed')}
        onBack={() => navigation.navigate('Shed')}
      />
      {fromCache || error ? <Muted>{t('cohort.offline')}</Muted> : null}
      {loading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState onRetry={() => void reload()} /> : null}
      {data && groups.length === 0 ? <EmptyState message={t('cohort.empty')} /> : null}
      {data ? (
        <ScrollView contentContainerStyle={styles.pad}>
          {groups.map((group) => (
            <View key={group.meaning} style={styles.group}>
              <SectionHead
                title={`${t(`cohort.meaning.${group.meaning}`)} · ${t(`cohort.color.${group.color}`)}`}
              />
              {group.animals.map((a) => (
                <View key={a.markerId} style={styles.row}>
                  {a.photoUrl ? (
                    <Image source={{ uri: a.photoUrl }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Txt weight="semibold">{(a.shortNo ?? '?').slice(0, 1)}</Txt>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Txt weight="display" style={styles.short}>
                      {a.shortNo ?? a.herdNumber ?? '—'}
                    </Txt>
                    <Muted>
                      {a.shed ?? t('cohort.noPen')}
                      {a.name ? ` · ${a.name}` : ''}
                    </Muted>
                    {a.validUntil ? (
                      <Muted>{t('cohort.until', { date: a.validUntil.slice(0, 10) })}</Muted>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 48 },
  group: { marginBottom: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: color.surfaceMuted },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  short: { fontSize: 20 },
});
