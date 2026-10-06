import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AuthUser } from '@farm/contracts';
import { color, radius, space } from '../../theme/tokens';
import { useLocale } from '../../locale/LocaleProvider';
import { SmsPhoneCard } from '../SmsPhoneCard';
import { Button, Txt } from '../ui';

export function ProfileSheet({
  open,
  user,
  online,
  onClose,
  onSignOut,
}: {
  open: boolean;
  user: AuthUser | null;
  online: boolean;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  if (!user) return null;

  const rows: Array<{ label: string; value: string }> = [
    { label: t('admin.email'), value: user.email },
    { label: t('admin.role'), value: t(`common.role.${user.role}`) },
    {
      label: t('profile.farm'),
      value: `${user.farmName} · ${
        user.farmMode === 'HOUSEHOLD' ? t('admin.modeHousehold') : t('admin.modeCommercial')
      }`,
    },
    {
      label: t('profile.connection'),
      value: online ? t('native.onlineBanner') : t('native.offlineBanner'),
    },
  ];

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.head}>
              <View style={styles.avatar}>
                <Txt weight="bold" style={styles.avatarText}>
                  {user.name.slice(0, 1).toUpperCase()}
                </Txt>
              </View>
              <View style={styles.headText}>
                <Txt weight="display" style={styles.name} numberOfLines={1}>
                  {user.name}
                </Txt>
                <Txt muted numberOfLines={1}>
                  {t(`common.role.${user.role}`)}
                </Txt>
              </View>
            </View>

            <View style={styles.rows}>
              {rows.map((row) => (
                <View key={row.label} style={styles.row}>
                  <Txt muted style={styles.rowLabel}>
                    {row.label}
                  </Txt>
                  <Txt weight="medium" style={styles.rowValue}>
                    {row.value}
                  </Txt>
                </View>
              ))}
            </View>

            <SmsPhoneCard />

            <View style={styles.actions}>
              <Button label={t('nav.logout')} variant="danger" onPress={onSignOut} />
              <Button label={t('common.close')} variant="ghost" onPress={onClose} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20, 38, 28, 0.65)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.border,
    paddingTop: space.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    marginBottom: space.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 16,
    marginBottom: space.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: color.surface, fontSize: 20 },
  headText: { flex: 1, gap: 2 },
  name: { fontSize: 20, color: color.textPrimary },
  rows: {
    marginHorizontal: 16,
    marginBottom: space.md,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.md,
  },
  row: {
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    gap: 2,
  },
  rowLabel: { fontSize: 12 },
  rowValue: { fontSize: 15, color: color.textPrimary },
  actions: { paddingHorizontal: 16, gap: space.sm, marginTop: space.sm },
});
