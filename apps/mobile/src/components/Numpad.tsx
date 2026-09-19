import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, fonts, keyline, radius } from '../theme/tokens';
import { useLocale } from '../locale/LocaleProvider';

export function Numpad({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { locale } = useLocale();
  const face = locale === 'ne' ? fonts.neBold : fonts.bodyExtraBold;
  return (
    <View style={styles.padGrid}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'C'].map((ch) => (
        <Pressable
          key={ch}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
          onPress={() => onChange(ch === 'C' ? '' : value.length >= 5 ? value : value + ch)}
          accessibilityRole="button"
          accessibilityLabel={ch === 'C' ? 'Clear' : ch}
        >
          <Text style={[styles.keyText, { fontFamily: face }]}>{ch}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  padGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 16 },
  key: {
    width: '31%',
    flexGrow: 1,
    minHeight: 64,
    backgroundColor: color.border,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: keyline,
    borderBottomColor: '#C8BFA8',
  },
  keyPressed: {
    borderBottomWidth: 1,
    transform: [{ translateY: 2 }],
    backgroundColor: color.surfaceMuted,
  },
  keyText: { fontSize: 26, fontWeight: '800', color: color.textPrimary, letterSpacing: -0.5 },
});
