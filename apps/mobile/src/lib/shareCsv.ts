import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiBaseUrl } from '../api/config';

/** Download an authenticated CSV (or text) API path and open the share sheet. */
export async function shareCsv(
  path: string,
  filename: string,
  getAccessToken: () => string | null,
): Promise<void> {
  const token = getAccessToken();
  const url = `${apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const target = `${FileSystem.cacheDirectory ?? ''}${filename}`;
  const result = await FileSystem.downloadAsync(url, target, {
    headers: {
      Accept: 'text/csv,text/plain,*/*',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(result.uri, {
    mimeType: 'text/csv',
    dialogTitle: filename,
  });
}
