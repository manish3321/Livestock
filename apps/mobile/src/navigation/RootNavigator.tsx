import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { useFarm } from '../state/FarmProvider';
import { ScanAnywhere, ScanOverlayProvider } from '../components/ScanAnywhere';
import { LoginScreen } from '../screens/LoginScreen';
import { ShedScreen } from '../screens/HomeScreen';
import { RoundScreen } from '../screens/RoundScreen';
import { TankDeliveryScreen } from '../screens/TankDeliveryScreen';
import { ConflictsScreen } from '../screens/ConflictsScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { ExpensesScreen } from '../screens/ExpensesScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { AnimalsScreen } from '../screens/AnimalsScreen';
import { AnimalDetailScreen } from '../screens/AnimalDetailScreen';
import { AnimalNewScreen, AnimalEditScreen } from '../screens/AnimalFormScreen';
import { AnimalsImportScreen } from '../screens/AnimalsImportScreen';
import { AnimalsTagsScreen } from '../screens/AnimalsTagsScreen';
import { BatchesScreen } from '../screens/BatchesScreen';
import { BatchDetailScreen } from '../screens/BatchDetailScreen';
import { BatchFormScreen } from '../screens/BatchFormScreen';
import { GroupsScreen } from '../screens/GroupsScreen';
import { FishScreen } from '../screens/FishScreen';
import { ScanHubScreen } from '../screens/ScanHubScreen';
import { HealthScreen } from '../screens/HealthScreen';
import { BreedingScreen } from '../screens/BreedingScreen';
import { ProductionScreen } from '../screens/ProductionScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { InventoryScreen } from '../screens/InventoryScreen';
import { RevenueScreen } from '../screens/RevenueScreen';
import { PnlScreen } from '../screens/PnlScreen';
import { ProfitScreen } from '../screens/ProfitScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { AdminScreen } from '../screens/AdminScreen';
import { CohortScreen } from '../screens/CohortScreen';
import { DailySheetScreen } from '../screens/DailySheetScreen';
import type { RootStackParamList } from './types';
import { color } from '../theme/tokens';

enableScreens();

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Native React Native app — Dashboard first; no WebView primary. */
export function RootNavigator() {
  const { ready, store, revision } = useFarm();
  void revision;
  const signedIn = Boolean(store.accessToken);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.surfaceSubtle,
        }}
      >
        <ActivityIndicator size="large" color={color.brand} />
      </View>
    );
  }

  return (
    <NavigationContainer
      linking={{
        prefixes: ['farmshed://', 'https://farm.local'],
        config: {
          screens: {
            AnimalDetail: {
              path: 'scan/a/:id',
              parse: { id: (id: string) => id },
            },
            BatchDetail: {
              path: 'scan/b/:id',
              parse: { id: (id: string) => id },
            },
            Dashboard: '',
            Shed: 'shed',
            Scan: 'scan',
            Inbox: 'inbox',
          },
        },
      }}
    >
      {signedIn ? (
        <ScanOverlayProvider>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="Shed" component={ShedScreen} />
            <Stack.Screen name="Round" component={RoundScreen} />
            <Stack.Screen name="TankDelivery" component={TankDeliveryScreen} />
            <Stack.Screen name="Conflicts" component={ConflictsScreen} />
            <Stack.Screen name="Inbox" component={InboxScreen} />
            <Stack.Screen name="Expenses" component={ExpensesScreen} />
            <Stack.Screen name="Animals" component={AnimalsScreen} />
            <Stack.Screen name="AnimalNew" component={AnimalNewScreen} />
            <Stack.Screen name="AnimalEdit" component={AnimalEditScreen} />
            <Stack.Screen name="AnimalDetail" component={AnimalDetailScreen} />
            <Stack.Screen name="AnimalsImport" component={AnimalsImportScreen} />
            <Stack.Screen name="AnimalsTags" component={AnimalsTagsScreen} />
            <Stack.Screen name="Batches" component={BatchesScreen} />
            <Stack.Screen name="BatchNew" component={BatchFormScreen} />
            <Stack.Screen name="BatchDetail" component={BatchDetailScreen} />
            <Stack.Screen name="Groups" component={GroupsScreen} />
            <Stack.Screen name="Fish" component={FishScreen} />
            <Stack.Screen name="Scan" component={ScanHubScreen} />
            <Stack.Screen name="Health" component={HealthScreen} />
            <Stack.Screen name="Breeding" component={BreedingScreen} />
            <Stack.Screen name="Production" component={ProductionScreen} />
            <Stack.Screen name="Feed" component={FeedScreen} />
            <Stack.Screen name="Inventory" component={InventoryScreen} />
            <Stack.Screen name="Revenue" component={RevenueScreen} />
            <Stack.Screen name="Pnl" component={PnlScreen} />
            <Stack.Screen name="Profit" component={ProfitScreen} />
            <Stack.Screen name="Reports" component={ReportsScreen} />
            <Stack.Screen name="Admin" component={AdminScreen} />
            <Stack.Screen name="Cohort" component={CohortScreen} />
            <Stack.Screen name="DailySheet" component={DailySheetScreen} />
          </Stack.Navigator>
          <ScanAnywhere />
        </ScanOverlayProvider>
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
