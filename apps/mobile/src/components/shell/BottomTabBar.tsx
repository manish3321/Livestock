import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ModuleKey } from '@farm/contracts';
import { ModuleIcon, MoreGlyph } from '../ModuleIcon';
import { color, fonts, keyline, radius } from '../../theme/tokens';
import { useLocale } from '../../locale/LocaleProvider';
import { useTypeface } from '../ui';
import { useScanOverlay } from '../ScanAnywhere';

export type TabKey = 'dashboard' | 'shed' | 'inbox' | 'more';

export function BottomTabBar({
  active,
  allowed,
  onPress,
  onScan,
}: {
  active: TabKey | null;
  allowed: Set<ModuleKey>;
  onPress: (key: TabKey) => void;
  /** Prefer stack navigation — Modal overlay is unreliable under native-stack. */
  onScan?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const face = useTypeface();
  const { openScan } = useScanOverlay();
  const showScan = allowed.has('scan');

  const openScanner = () => {
    if (onScan) onScan();
    else openScan();
  };

  const tabs: Array<{
    key: TabKey;
    module?: ModuleKey;
    label: string;
  }> = [
    {
      key: 'dashboard',
      module: 'dashboard',
      label: t('nav.dashboard'),
    },
    {
      key: 'shed',
      module: 'shed',
      label: t('nav.shed'),
    },
    {
      key: 'inbox',
      module: 'inbox',
      label: t('nav.inbox'),
    },
    {
      key: 'more',
      label: t('nav.more'),
    },
  ];
  const visible = tabs.filter((tab) => tab.key === 'more' || (tab.module && allowed.has(tab.module)));
  const mid = Math.ceil(visible.length / 2);
  const left = visible.slice(0, mid);
  const right = visible.slice(mid);

  const renderTab = (tab: (typeof tabs)[number]) => {
    const on = active === tab.key;
    const tint = on ? '#FFFDF9' : color.textMuted;
    return (
      <Pressable
        key={tab.key}
        onPress={() => onPress(tab.key)}
        style={[styles.item, on && styles.itemOn]}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={tab.label}
      >
        {tab.module ? (
          <ModuleIcon module={tab.module} size={22} color={tint} />
        ) : (
          <MoreGlyph size={22} color={tint} />
        )}
        <Text
          style={[
            styles.label,
            { color: tint, fontFamily: face.bold },
            on && styles.labelOn,
          ]}
        >
          {tab.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {left.map(renderTab)}
      {showScan ? (
        <View style={styles.fabSlot}>
          <Pressable
            onPress={openScanner}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('nav.scan')}
          >
            <ModuleIcon module="scan" size={26} color="#fff" />
          </Pressable>
          <Text style={[styles.fabCaption, { fontFamily: fonts.bodyBold }]}>
            {t('nav.scan')}
          </Text>
        </View>
      ) : (
        <View style={styles.fabSpacer} />
      )}
      {right.map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.mint ?? color.surfaceMuted,
    borderTopWidth: 1.5,
    borderTopColor: color.border,
    paddingTop: 4,
    paddingHorizontal: 4,
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    gap: 2,
  },
  itemOn: {
    backgroundColor: color.brand,
  },
  label: { fontSize: 9, fontWeight: '700', textAlign: 'center' },
  labelOn: { color: '#FFFDF9' },
  fabSlot: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: -22,
  },
  fabSpacer: { width: 24 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.ember,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: color.terracottaSoft ?? '#FE884F',
    borderBottomWidth: keyline + 2,
    borderBottomColor: color.emberStrong,
  },
  fabPressed: {
    borderBottomWidth: 2,
    transform: [{ translateY: 2 }],
    backgroundColor: color.emberStrong,
  },
  fabCaption: {
    marginTop: 2,
    fontSize: 10,
    color: color.ember,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
