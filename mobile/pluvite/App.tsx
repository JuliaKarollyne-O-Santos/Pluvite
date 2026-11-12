import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, StatusBar, StyleSheet, View } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import Login from "./src/pages/login/page";
import Cadastro from "./src/pages/cadastro/page";
import TabNavigator from "./src/navigation/TabNavigator";
import { AlertaProvider } from "./src/context/AlertaContext";
import { supabase } from "./src/pages/lib/supabase";
import { tratarRetornoLogin } from "./src/services/auth";
import { COR } from "./src/lib/tema";

export type RootStackParamList = {
  Login: undefined;
  Cadastro: undefined;
  MainTabs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navegacao = createNavigationContainerRef<RootStackParamList>();

const irPara = (tela: "Login" | "MainTabs") => {
  if (navegacao.isReady() && navegacao.getCurrentRoute()?.name !== tela) {
    navegacao.reset({ index: 0, routes: [{ name: tela }] });
  }
};

export default function App() {
  // null = ainda verificando se há sessão salva
  const [telaInicial, setTelaInicial] = useState<"Login" | "MainTabs" | null>(null);

  // SESSÃO SALVA: abre direto nas abas se já estiver logado
  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error("Erro ao ler a sessão salva:", error);
      setTelaInicial(data.session ? "MainTabs" : "Login");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN") irPara("MainTabs");
      if (evento === "SIGNED_OUT") irPara("Login");
    });
    return () => subscription.unsubscribe();
  }, []);

  // RETORNO DO LOGIN SOCIAL (pluvite://auth)
  useEffect(() => {
    const tratar = (url: string | null) =>
      tratarRetornoLogin(url).catch((erro: unknown) => {
        console.error("Erro no retorno do login social:", erro);
        Alert.alert(
          "Login social",
          erro instanceof Error ? erro.message : "Não foi possível concluir o login.",
        );
      });

    void Linking.getInitialURL().then(tratar);
    const inscricao = Linking.addEventListener("url", ({ url }) => void tratar(url));
    return () => inscricao.remove();
  }, []);

  if (!telaInicial) {
    return (
      <View style={styles.abertura}>
        <StatusBar barStyle="light-content" backgroundColor={COR.marinho} />
        <Image source={require("./src/assets/PluviteIcon.jpg")} style={styles.logo} />
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {/* Alertas: FCM, WebSocket e consulta ao reabrir o app */}
      <AlertaProvider>
        <NavigationContainer ref={navegacao}>
          <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
          <Stack.Navigator
            initialRouteName={telaInicial}
            screenOptions={{ headerShown: false, animation: "fade" }}
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

const styles = StyleSheet.create({
  abertura: {
    flex: 1,
    backgroundColor: COR.marinho,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  logo: { width: 96, height: 96, borderRadius: 24 },
});
