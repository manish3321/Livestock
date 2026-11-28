import { StyleSheet, Text } from 'react-native';
import { fonts } from '../../theme/tokens';

/** Red superscript count — matches web `.nav-count-sup`. */
export function NavSup({ count }: { count: number }) {
  if (count <= 0) return null;
  return <Text style={styles.sup}>{count > 99 ? '99+' : String(count)}</Text>;
}

const styles = StyleSheet.create({
  sup: {
    color: '#ff5252',
    fontSize: 10,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    lineHeight: 12,
    marginLeft: 2,
    transform: [{ translateY: -4 }],
  },
});
