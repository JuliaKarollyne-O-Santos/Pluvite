import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { CloudSun, Globe, Phone, Route, User } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Clima from "../pages/clima/page";
import Rotas from "../pages/rotas/page";
import Feed from "../pages/feed/page";
import Contatos from "../pages/contatos/page";
import Perfil from "../pages/perfil/page";
import { COR } from "../lib/tema";

export type AbasParamList = {
  Clima: undefined;
  Rotas: undefined;
  Feed: undefined;
  Contatos: undefined;
  Perfil: undefined;
};

const Tab = createBottomTabNavigator<AbasParamList>();

// Mesma ordem e ícones da navbar2 do site (Clima, Rotas, Feed) + Contatos e Perfil
export default function TabNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#ffffff",
        tabBarInactiveTintColor: "rgba(255,255,255,0.55)",
        tabBarActiveBackgroundColor: "rgba(255,255,255,0.1)",
        tabBarStyle: {
          backgroundColor: COR.marinho,
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 6,
          borderTopWidth: 0,
          elevation: 12,
        },
        tabBarItemStyle: { borderRadius: 12, marginHorizontal: 3 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tab.Screen
        name="Clima"
        component={Clima}
        options={{ tabBarIcon: ({ color }) => <CloudSun color={color} size={20} /> }}
      />
      <Tab.Screen
        name="Rotas"
        component={Rotas}
        options={{ tabBarIcon: ({ color }) => <Route color={color} size={20} /> }}
      />
      <Tab.Screen
        name="Feed"
        component={Feed}
        options={{ tabBarIcon: ({ color }) => <Globe color={color} size={20} /> }}
      />
      <Tab.Screen
        name="Contatos"
        component={Contatos}
        options={{ tabBarIcon: ({ color }) => <Phone color={color} size={20} /> }}
      />
      <Tab.Screen
        name="Perfil"
        component={Perfil}
        options={{ tabBarIcon: ({ color }) => <User color={color} size={20} /> }}
      />
    </Tab.Navigator>
  );
}
