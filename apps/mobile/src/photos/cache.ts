import * as FileSystem from 'expo-file-system';
import { apiBaseUrl } from '../api/config';
import type { FarmStore } from '../core/store';

const CONCURRENCY = 4;
const MAX_PHOTOS = 80;

async function downloadOne(
  animalId: string,
  token: string,
  dir: string,
): Promise<string | null> {
  const path = `${dir}${animalId}.jpg`;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) return path;
    const result = await FileSystem.downloadAsync(
      `${apiBaseUrl()}/v1/animals/${animalId}/photo`,
      path,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (result.status >= 200 && result.status < 300) return result.uri;
    return null;
  } catch {
    return null;
  }
}

/** Throttled photo backfill into the app document directory. */
export async function cacheAnimalPhotos(store: FarmStore): Promise<number> {
  const token = store.accessToken;
  if (!token) return 0;
  const dir = `${FileSystem.documentDirectory ?? ''}farm-photos/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);

  const candidates = [...store.animals.values()]
    .filter((a) => a.photoUrl && !a.photoLocalPath && !a.deletedAt)
    .slice(0, MAX_PHOTOS);

  let cached = 0;
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (animal) => {
        const local = await downloadOne(animal.id, token, dir);
        if (!local) return 0;
        animal.photoLocalPath = local;
        store.photos.set(animal.id, {
          animalId: animal.id,
          url: animal.photoUrl ?? '',
          localPath: local,
        });
        return 1;
      }),
    );
    cached += results.reduce<number>((a, b) => a + b, 0);
  }
  return cached;
}
