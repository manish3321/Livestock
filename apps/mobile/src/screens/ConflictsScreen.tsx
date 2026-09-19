import { ScrollView, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { acceptServerConflict } from '../core/scan-round';
import { AppShell } from '../components/AppShell';
import { Button, EmptyState, ListRow, PageHeader } from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useFarm } from '../state/FarmProvider';
import type { RootStackParamList } from '../navigation/types';
import { space } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Conflicts'>;

export function ConflictsScreen({ navigation }: Props) {
  const { store, revision, persist } = useFarm();
  const { t } = useLocale();
  void revision;

  return (
    <AppShell module="shed">
      <PageHeader
        title={t('native.conflicts')}
        backLabel={t('nav.shed')}
        onBack={() => navigation.navigate('Shed')}
      />
      <ScrollView contentContainerStyle={styles.pad}>
        {store.conflicts.length === 0 ? <EmptyState message={t('native.noConflicts')} /> : null}
        {store.conflicts.map((c) => (
          <ListRow
            key={c.id}
            title={c.entityId.slice(0, 8)}
            onPress={() => {
              acceptServerConflict(store, c.id);
              persist();
            }}
            meta={t('native.acceptServer')}
          />
        ))}
        <Button label={t('nav.shed')} variant="secondary" onPress={() => navigation.navigate('Shed')} />
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingBottom: 32, gap: space.sm },
});
