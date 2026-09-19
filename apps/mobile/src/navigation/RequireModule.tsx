import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ModuleKey } from '@farm/contracts';
import { useAccess } from '../hooks/useAccess';
import { useLocale } from '../locale/LocaleProvider';
import type { RootStackParamList } from './types';
import { Button, Txt } from '../components/ui';
import { color } from '../theme/tokens';

export function RequireModule({
  module,
  children,
}: {
  module: ModuleKey;
  children: ReactNode;
}) {
  const { canModule } = useAccess();
  const { t } = useLocale();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (!canModule(module)) {
    return (
      <View style={styles.wrap}>
        <Txt weight="semibold" style={styles.code}>
          403
        </Txt>
        <Txt muted style={styles.body}>
          {t('errors.forbidden')}
        </Txt>
        <Button
          label={t('nav.dashboard')}
          variant="secondary"
          onPress={() => navigation.navigate('Dashboard')}
        />
      </View>
    );
  }

  return <>{children}</>;
}

export function RequireCommercial({ children }: { children: ReactNode }) {
  const { commercial } = useAccess();
  const { t } = useLocale();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (!commercial) {
    return (
      <View style={styles.wrap}>
        <Txt weight="semibold" style={styles.code}>
          403
        </Txt>
        <Txt muted style={styles.body}>
          {t('errors.forbidden')}
        </Txt>
        <Button
          label={t('nav.dashboard')}
          variant="secondary"
          onPress={() => navigation.navigate('Dashboard')}
        />
      </View>
    );
  }

  return <>{children}</>;
}

void Pressable;

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: color.surfaceSubtle,
    gap: 12,
  },
  code: { fontSize: 28 },
  body: { textAlign: 'center', marginBottom: 8 },
});
