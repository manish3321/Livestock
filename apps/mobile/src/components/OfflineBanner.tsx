import { StyleSheet, View } from 'react-native';
import { color, offlineBarHeight } from '../theme/tokens';
import { Txt } from './ui';

type ConnectivityMode = 'online' | 'offline' | 'syncing';

/** Always-on network strip — matches Kharka mockup mint “Synced” / moss offline. */
export function OfflineBanner({
  visible = true,
  label,
  mode = 'offline',
}: {
  visible?: boolean;
  label: string;
  mode?: ConnectivityMode;
}) {
  if (!visible) return null;
  const online = mode === 'online';
  const syncing = mode === 'syncing';
  return (
    <View
      style={[styles.banner, online || syncing ? styles.bannerOnline : styles.bannerOffline]}
      accessibilityRole="summary"
    >
      <View style={[styles.dot, online || syncing ? styles.dotOnline : styles.dotOffline]} />
      <Txt
        weight="semibold"
        style={[styles.text, online || syncing ? styles.textOnline : styles.textOffline]}
      >
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: Math.max(28, offlineBarHeight - 12),
    paddingHorizontal: 16,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bannerOnline: {
    backgroundColor: color.brand,
  },
  bannerOffline: {
    backgroundColor: color.emberStrong,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOnline: { backgroundColor: color.mossFixed },
  dotOffline: { backgroundColor: color.terracottaWash },
  text: { fontSize: 12, letterSpacing: 0.3, textAlign: 'center' },
  textOnline: { color: '#FFFDF9' },
  textOffline: { color: '#FFFDF9' },
});
