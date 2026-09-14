declare module 'react-native' {
  /* Native components are supplied by React Native at runtime; CI typechecks against this shim. */
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export const View: any;
  export const Text: any;
  export const Pressable: any;
  export const TextInput: any;
  export const ScrollView: any;
  export const Image: any;
  export const StyleSheet: { create: <T>(s: T) => T };
  export const Vibration: { vibrate: (ms: number) => void };
  export const Platform: { OS: 'android' | 'ios' };
}

declare module 'expo' {
  export function registerRootComponent(fn: unknown): void;
}

declare module 'expo-camera' {
  export const CameraView: unknown;
  export function useCameraPermissions(): [{ granted: boolean } | null, () => Promise<unknown>];
}

declare module 'expo-sqlite' {
  export function openDatabaseSync(name: string): {
    execSync(sql: string): void;
    getAllSync<T>(sql: string, params?: unknown[]): T[];
    runSync(sql: string, params?: unknown[]): void;
  };
}

declare module '@notifee/react-native' {
  const notifee: {
    requestPermission(): Promise<unknown>;
    createChannel(c: { id: string; name: string; importance?: number }): Promise<string>;
    createTriggerNotification(
      notification: { id: string; title: string; body: string; android: { channelId: string } },
      trigger: { type: number; timestamp: number },
    ): Promise<string>;
    cancelAllNotifications(): Promise<void>;
  };
  export default notifee;
  export const TriggerType: { TIMESTAMP: number };
  export const AndroidImportance: { HIGH: number; DEFAULT: number };
}
