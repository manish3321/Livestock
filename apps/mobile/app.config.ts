import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Farm Management',
  slug: 'farm-shed',
  version: '0.2.0',
  orientation: 'portrait',
  scheme: 'farmshed',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: 'np.evoqed.farm.shed',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: 'The camera reads ear-tag QR codes in the shed.',
      UIBackgroundModes: ['remote-notification'],
    },
  },
  android: {
    package: 'np.evoqed.farm.shed',
    permissions: ['CAMERA', 'VIBRATE', 'POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED'],
    // Dev API is http:// on LAN / 10.0.2.2 — required outside Expo Go.
    usesCleartextTraffic: true,
  },
  plugins: [
    [
      'expo-camera',
      {
        cameraPermission: 'The camera reads ear-tag QR codes in the shed.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow access to photos for animal and receipt images.',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#1B4332',
        sounds: [],
      },
    ],
    'expo-secure-store',
    'expo-sqlite',
    'expo-font',
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://evoqedlivestockfarm.vercel.app',
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? undefined,
    },
  },
  notification: {
    color: '#1B4332',
  },
});
