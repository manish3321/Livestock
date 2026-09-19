import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { herdRowActions, visibleAnimalActions, type AnimalActionGroup } from '../lib/animal-actions';
import { useAccess } from '../hooks/useAccess';
import { useLocale } from '../locale/LocaleProvider';
import type { RootStackParamList } from '../navigation/types';
import { Button, SectionHead } from './ui';

const GROUPS: AnimalActionGroup[] = ['record', 'breeding', 'more'];

export function AnimalActionGrid({
  animalId,
  onNavigate,
  compact = false,
}: {
  animalId: string;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const { t } = useLocale();
  const { can } = useAccess();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const actions = compact ? herdRowActions(animalId, can) : visibleAnimalActions(animalId, can);

  const go = (dest: { name: keyof RootStackParamList; params?: object }) => {
    onNavigate?.();
    const nav = navigation as { navigate: (name: string, params?: object) => void };
    nav.navigate(dest.name, dest.params);
  };

  if (compact) {
    return (
      <View style={styles.compact}>
        {actions.map((action) => (
          <Button
            key={action.id}
            label={t(action.labelKey)}
            variant={action.id === 'profile' ? 'primary' : 'secondary'}
            onPress={() => go(action.dest)}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {GROUPS.map((group) => {
        const items = actions.filter((a) => a.group === group);
        if (items.length === 0) return null;
        return (
          <View key={group}>
            <SectionHead title={t(`qr.group.${group}`)} />
            <View style={styles.grid}>
              {items.map((action) => (
                <View key={action.id} style={styles.tile}>
                  <Button
                    label={t(action.labelKey)}
                    variant={
                      group === 'breeding' ? 'urgent' : group === 'more' ? 'secondary' : 'primary'
                    }
                    block
                    field={group === 'record' || group === 'breeding'}
                    onPress={() => go(action.dest)}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1 },
});
