import { Pressable, StyleSheet, View } from 'react-native';
import { color, fonts, radius, space } from '../../theme/tokens';
import { FarmMark } from '../ModuleIcon';
import { Txt } from '../ui';

export function TopBar({
  farmName,
  todayLabel,
  onLocale,
  localeLabel,
  onProfile,
  profileLabel,
  userInitial,
}: {
  farmName: string;
  todayLabel: string;
  onLocale: () => void;
  localeLabel: string;
  onProfile: () => void;
  profileLabel: string;
  userInitial?: string;
}) {
  const showEn = localeLabel === 'नेपाली' || localeLabel.toLowerCase().includes('ne');

  return (
    <View style={styles.header}>
      <FarmMark size={36} />
      <View style={styles.meta}>
        <Txt weight="bold" style={styles.farm} numberOfLines={1}>
          {farmName}
        </Txt>
        <Txt muted style={styles.date} numberOfLines={1}>
          {todayLabel}
        </Txt>
      </View>

      <Pressable
        onPress={onLocale}
        style={styles.localeToggle}
        accessibilityRole="button"
        accessibilityLabel={localeLabel}
      >
        <Txt weight="bold" style={[styles.localeOpt, showEn && styles.localeOptOn]}>
          EN
        </Txt>
        <Txt muted style={styles.localeSep}>
          |
        </Txt>
        <Txt weight="bold" style={[styles.localeOpt, !showEn && styles.localeOptOn]}>
          ने
        </Txt>
      </Pressable>

      <Pressable
        onPress={onProfile}
        style={styles.notify}
        accessibilityRole="button"
        accessibilityLabel={profileLabel}
      >
        {userInitial ? (
          <Txt weight="bold" style={styles.notifyInitial}>
            {userInitial}
          </Txt>
        ) : (
          <Txt weight="bold" style={styles.notifyGlyph}>
            ⋯
          </Txt>
        )}
        <View style={styles.notifyDot} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.mint ?? color.surfaceMuted,
    borderBottomWidth: 1.5,
    borderBottomColor: color.border,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    gap: 8,
    minHeight: 56,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    borderLeftWidth: 1.5,
    borderLeftColor: color.border,
    paddingLeft: 10,
  },
  farm: { fontSize: 13, color: color.brandStrong, letterSpacing: -0.2 },
  date: { fontSize: 10, fontWeight: '500' },
  localeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: color.outline ?? color.border,
    backgroundColor: color.surface,
    gap: 4,
  },
  localeOpt: { fontSize: 12, color: color.textMuted, fontFamily: fonts.bodyBold },
  localeOptOn: { color: color.brand },
  localeSep: { fontSize: 12, color: color.outline ?? color.textMuted },
  notify: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifyInitial: { color: color.brand, fontSize: 13 },
  notifyGlyph: { fontSize: 18, color: color.brand, lineHeight: 20 },
  notifyDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.ember,
    borderWidth: 1.5,
    borderColor: color.surface,
  },
});
