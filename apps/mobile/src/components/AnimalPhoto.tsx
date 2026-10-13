import { useState } from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { apiBaseUrl } from '../api/config';
import { useFarm } from '../state/FarmProvider';
import { color } from '../theme/tokens';

const SPECIES_PICTURE: Record<string, string> = {
  BUFFALO: '🐃',
  COW: '🐄',
  GOAT: '🐐',
  PIG: '🐖',
  SHEEP: '🐑',
  POULTRY: '🐔',
  CHICKEN: '🐔',
  LAYER: '🐔',
  BROILER: '🐓',
  DUCK: '🦆',
  FISH: '🐟',
  RABBIT: '🐇',
};

/** Picture key for a batch: poultry and fish categories are free text, so fall back to the batch kind. */
export function batchPictureKind(kind?: string | null, category?: string | null): string {
  const cat = (category ?? '').toUpperCase();
  if (cat && SPECIES_PICTURE[cat]) return cat;
  if (kind === 'FISH') return 'FISH';
  if (kind === 'POULTRY') return cat.includes('DUCK') ? 'DUCK' : 'POULTRY';
  return cat;
}

/**
 * Animal photo for quick recognition in the shed. The API photo endpoint needs the
 * bearer token, so remote images carry it; offline we prefer the cached file.
 * Without a photo, a species picture still gives the worker a visual cue.
 */
export function AnimalPhoto({
  animalId,
  photoUrl,
  species,
  size = 56,
  style,
}: {
  animalId?: string | null;
  photoUrl?: string | null;
  species?: string | null;
  size?: number;
  style?: ViewStyle;
}) {
  const { store } = useFarm();
  const [failed, setFailed] = useState(false);
  const cached = animalId ? store.animals.get(animalId) : undefined;
  const local = cached?.photoLocalPath ?? (animalId ? store.photos.get(animalId)?.localPath : null);
  const remote = photoUrl ?? cached?.photoUrl ?? null;
  const kind = (species ?? cached?.species ?? '').toUpperCase();

  const box = { width: size, height: size, borderRadius: Math.round(size / 6) };

  if (!failed && (local || remote)) {
    const source = local
      ? { uri: local }
      : {
          uri: remote!.startsWith('http') ? remote! : `${apiBaseUrl()}${remote}`,
          headers: store.accessToken ? { Authorization: `Bearer ${store.accessToken}` } : undefined,
        };
    return (
      <Image
        source={source}
        style={[styles.photo, box, style as object]}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View style={[styles.placeholder, box, style]}>
      <Text style={{ fontSize: Math.round(size * 0.55) }}>{SPECIES_PICTURE[kind] ?? '🐾'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: color.border },
  placeholder: {
    backgroundColor: color.mint,
    borderWidth: 1.5,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
