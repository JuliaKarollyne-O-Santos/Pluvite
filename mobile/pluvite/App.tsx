import { StatusBar } from "react-native";
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
      {/* Alertas: FCM, WebSocket e consulta ao reabrir o app */}
      <AlertaProvider>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
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