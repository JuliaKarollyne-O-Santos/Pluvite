import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Login from './src/pages/login/page';
import Cadastro from './src/pages/cadastro/page';
import TabNavigator from './src/navigation/TabNavigator';
import { AlertaProvider } from './src/context/AlertaContext';

export type RootStackParamList = {
  Login: undefined;
  Cadastro: undefined;
  MainTabs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Alertas de emergencia: push (FCM/APNs) + WebSocket + consulta ao abrir */}
      <AlertaProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: false,
            animation: "none",
          }}
        >
          <Stack.Screen name="Login" component={Login} />
          <Stack.Screen name="Cadastro" component={Cadastro} />
          <Stack.Screen name="MainTabs" component={TabNavigator} />
        </Stack.Navigator>
      </NavigationContainer>
      </AlertaProvider>
    </SafeAreaProvider>
  );
}