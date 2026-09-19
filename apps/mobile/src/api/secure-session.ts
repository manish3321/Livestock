import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { newDeviceId } from '../core/store';

const ACCESS_KEY = 'farm.accessToken';
const REFRESH_KEY = 'farm.refreshToken';
const DEVICE_KEY = 'farm.deviceId';

export async function loadTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return { accessToken, refreshToken };
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export async function loadOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_KEY);
  if (existing) return existing;
  const id = newDeviceId(Platform.OS === 'ios' ? 'ios' : 'android');
  await SecureStore.setItemAsync(DEVICE_KEY, id);
  return id;
}

export function loginPlatform(): 'android' | 'ios' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}
