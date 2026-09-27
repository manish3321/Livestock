import { vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android', constants: {} },
  NativeModules: {},
}));
