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

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
    EAS_PROJECT_ID?: string;
  }
}
