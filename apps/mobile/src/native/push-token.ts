import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Native FCM/APNs token when available (EAS / dev client with google-services),
 * otherwise Expo push token (works in Expo Go for testing via Expo Push API).
 */
export async function getPushToken(): Promise<string | undefined> {
  if (!Device.isDevice && Platform.OS !== 'android') {
    // Android emulator can still register; iOS simulator cannot.
    return undefined;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== 'granted') return undefined;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('farm-critical', {
      name: 'Critical farm alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C62828',
    });
    await Notifications.setNotificationChannelAsync('farm-default', {
      name: 'Farm reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  try {
    const device = await Notifications.getDevicePushTokenAsync();
    if (typeof device.data === 'string' && device.data.length > 0) {
      return device.data;
    }
  } catch {
    /* Fall through to Expo token (Expo Go). */
  }

  try {
    const projectId =
      Constants.easConfig?.projectId ??
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const expo = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return expo.data;
  } catch {
    return undefined;
  }
}
