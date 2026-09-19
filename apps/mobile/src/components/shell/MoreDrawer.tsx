import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ModuleKey } from '@farm/contracts';
import { FarmMark, ModuleIcon } from '../ModuleIcon';
import { type NavGroup } from '../../navigation/modules';
import type { RootStackParamList } from '../../navigation/types';
import { color } from '../../theme/tokens';
import { useLocale } from '../../locale/LocaleProvider';
import { Txt } from '../ui';

export type DrawerDest =
  | { type: 'module'; module: ModuleKey }
  | { type: 'route'; route: keyof RootStackParamList; params?: object };

export function MoreDrawer({
  open,
  onClose,
  farmName,
  household,
  groups,
  activeModule,
  allowed,
  showProfit,
  showAdminMembers,
  showAdminAudit,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  farmName: string;
  household: boolean;
  groups: NavGroup[];
  activeModule?: ModuleKey;
  allowed: Set<ModuleKey>;
  showProfit: boolean;
  showAdminMembers: boolean;
  showAdminAudit: boolean;
  onNavigate: (dest: DrawerDest) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();

  return (
    <Modal visible={open} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={[styles.drawer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 88 }]}>
          <View style={styles.brandRow}>
            <FarmMark size={28} />
            <View style={{ flex: 1 }}>
              <Txt weight="display" style={styles.brand}>
                {t('appName')}
              </Txt>
              <Txt style={styles.farm} numberOfLines={1}>
                {farmName}
                {household ? ` · ${t('admin.modeHousehold')}` : ''}
              </Txt>
            </View>
          </View>

          <ScrollView style={{ flex: 1, marginTop: 8 }} showsVerticalScrollIndicator={false}>
            {groups.map((group) => {
              const items = group.modules.filter((m) => allowed.has(m));
              if (items.length === 0) return null;
              return (
                <View key={group.labelKey} style={styles.group}>
                  <Txt weight="semibold" style={styles.groupLabel}>
                    {t(group.labelKey)}
                  </Txt>
                  {items.map((m) => {
                    const on = activeModule === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => onNavigate({ type: 'module', module: m })}
                        style={[styles.navItem, on && styles.navItemActive]}
                        accessibilityRole="button"
                      >
                        <ModuleIcon module={m} size={18} color={on ? color.brandStrong : color.textSecondary} />
                        <Txt weight="medium" style={[styles.navText, on && styles.navTextOn]}>
                          {t(`nav.${m}`)}
                        </Txt>
                      </Pressable>
                    );
                  })}
                  {group.labelKey === 'nav.group.home' && allowed.has('shed') ? (
                    <>
                      <Pressable
                        onPress={() => onNavigate({ type: 'route', route: 'Cohort' })}
                        style={styles.navItem}
                      >
                        <Txt weight="medium" style={styles.navText}>
                          {t('nav.cohort')}
                        </Txt>
                      </Pressable>
                      <Pressable
                        onPress={() => onNavigate({ type: 'route', route: 'DailySheet' })}
                        style={styles.navItem}
                      >
                        <Txt weight="medium" style={styles.navText}>
                          {t('nav.dailySheet')}
                        </Txt>
                      </Pressable>
                    </>
                  ) : null}
                  {group.labelKey === 'nav.group.money' && showProfit ? (
                    <Pressable
                      onPress={() => onNavigate({ type: 'route', route: 'Profit' })}
                      style={styles.navItem}
                    >
                      <Txt weight="medium" style={styles.navText}>
                        {t('nav.profit')}
                      </Txt>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}

            {(showAdminMembers || showAdminAudit) && (
              <View style={styles.group}>
                <Txt weight="semibold" style={styles.groupLabel}>
                  {t('nav.group.admin')}
                </Txt>
                {showAdminMembers ? (
                  <Pressable
                    onPress={() =>
                      onNavigate({ type: 'route', route: 'Admin', params: { section: 'members' } })
                    }
                    style={styles.navItem}
                  >
                    <Txt weight="medium" style={styles.navText}>
                      {t('nav.members')}
                    </Txt>
                  </Pressable>
                ) : null}
                {showAdminAudit ? (
                  <Pressable
                    onPress={() =>
                      onNavigate({ type: 'route', route: 'Admin', params: { section: 'audit' } })
                    }
                    style={styles.navItem}
                  >
                    <Txt weight="medium" style={styles.navText}>
                      {t('nav.audit')}
                    </Txt>
                  </Pressable>
                ) : null}
              </View>
            )}
          </ScrollView>
        </View>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 38, 28, 0.65)' },
  drawer: {
    width: 300,
    maxWidth: '80%',
    backgroundColor: color.surface,
    borderRightWidth: 1.5,
    borderRightColor: color.border,
    paddingHorizontal: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: color.border,
  },
  brand: { fontSize: 16, color: color.textPrimary },
  farm: { fontSize: 12, marginTop: 2, color: color.textMuted },
  group: { marginBottom: 8 },
  groupLabel: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: color.textMuted,
  },
  navItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: color.brandSubtle,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  navText: { fontSize: 14, color: color.textPrimary, flex: 1 },
  navTextOn: { color: color.brandStrong, fontWeight: '600' },
});
