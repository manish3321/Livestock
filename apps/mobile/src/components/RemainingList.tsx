import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CachedAnimal } from '../core/store';

const TAP = 52;

export function RemainingList({
  animals,
  showPhotos,
  onPick,
}: {
  animals: CachedAnimal[];
  showPhotos: boolean;
  onPick: (animal: CachedAnimal) => void;
}) {
  return (
    <ScrollView style={styles.list}>
      {animals.map((a) => (
        <Pressable key={a.id} style={styles.row} onPress={() => onPick(a)}>
          <View style={styles.left}>
            {showPhotos && (a.photoLocalPath || a.photoUrl) ? (
              <Image source={{ uri: a.photoLocalPath ?? a.photoUrl! }} style={styles.thumb} />
            ) : null}
            <Text style={styles.strong}>{a.shortNo ?? a.tag}</Text>
          </View>
          <Text style={styles.muted}>{a.name ?? a.penName ?? ''}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  row: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#d7d2c8',
    paddingVertical: 4,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { width: 40, height: 40, borderRadius: 6 },
  strong: { fontSize: 22, fontWeight: '700', color: '#1a2e1a' },
  muted: { color: '#3d4a3d', fontSize: 16, fontWeight: '500' },
});
