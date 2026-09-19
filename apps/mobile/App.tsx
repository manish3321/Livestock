import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Vollkorn_600SemiBold, Vollkorn_700Bold } from '@expo-google-fonts/vollkorn';
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
} from '@expo-google-fonts/noto-sans-devanagari';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FarmProvider } from './src/state/FarmProvider';
import { LocaleProvider } from './src/locale/LocaleProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { color } from './src/theme/tokens';

export default function App() {
  const [loaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Vollkorn_600SemiBold,
    Vollkorn_700Bold,
    NotoSansDevanagari_400Regular,
    NotoSansDevanagari_500Medium,
    NotoSansDevanagari_600SemiBold,
    NotoSansDevanagari_700Bold,
  });

  if (!loaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.surfaceSubtle,
        }}
      >
        <ActivityIndicator color={color.brand} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <FarmProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </FarmProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
