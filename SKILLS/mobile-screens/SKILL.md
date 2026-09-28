---
name: mobile-screens
description: Conventions for the Pluvite Expo 54 / React Native 0.81 app in mobile/pluvite — screen file layout, navigation (native-stack + bottom tabs), StyleSheet styling, Supabase usage, alerts and native APIs. Use when creating or editing mobile screens.
---

# Mobile screens (Expo SDK 54, React Native 0.81)

> Expo changes a lot between SDKs. Check https://docs.expo.dev/versions/v54.0.0/ before adding a native
> module, and install with `npx expo install <pkg>` so versions match the SDK.

## Structure

```
mobile/pluvite/
├── App.tsx                     Root stack: Login, Cadastro, MainTabs (RootStackParamList)
├── src/navigation/TabNavigator.tsx   Bottom tabs: Clima, Feed, Contatos, Perfil
├── src/pages/<tela>/page.tsx   One screen per folder, default export PascalCase
├── src/pages/lib/supabase.ts   Supabase client
└── src/assets/
```

New screen: `src/pages/<nome>/page.tsx` → register it in `TabNavigator` (tab with a lucide icon) or in
the stack in `App.tsx` (add the route to `RootStackParamList`). New shared components go in
`src/components/` (create it), shared constants in `src/lib/`.

## Screen skeleton

```tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin } from "lucide-react-native";
import { supabase } from "../lib/supabase";

export default function Rotas() {
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    // CARREGAMENTO INICIAL
  }, []);

  if (carregando) {
    return (
      <SafeAreaView style={styles.centro}>
        <ActivityIndicator size="large" color="#1447c4" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* CABEÇALHO */}
        <Text style={styles.headerTitle}>Rotas Seguras</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9" },
  scrollContent: { padding: 16, paddingBottom: 32 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#0f172a" },
});
```

## Rules

- `SafeAreaView` from `react-native-safe-area-context` (not from `react-native`), `edges={["top"]}` in
  tab screens (the tab bar handles the bottom inset).
- Styling only with `StyleSheet.create` at the **bottom** of the file; camelCase style names in
  Portuguese or English matching the file (`headerTitle`, `statusCard`, `publicarButton`). Colors from
  the `design-system` mobile tokens.
- Dynamic styles: array syntax `[styles.statusIconBadge, { backgroundColor: item.bg }]`.
- Touchables: `TouchableOpacity` (existing); add `accessibilityLabel` to icon-only buttons.
- Feedback: `Alert.alert("Erro", "mensagem em português")`; success with an OK action that navigates.
- Navigation: `navigation.replace("MainTabs")` after login, `navigate("Cadastro")` between auth screens.
  Type navigation with `NativeStackNavigationProp<RootStackParamList>`.
- Same state/handler naming as web (`carregando`, `handleSalvar`, `carregarDados`).
- Lists that can grow (feed, comments): use `FlatList`, not `ScrollView` + `map`.

## Data

- Supabase usage identical to web (see `supabase-data`). Mobile feed is still **mock data** — when
  wiring it, reuse the same tables and the canonical statuses/types from `pluvite-domain`
  (mobile currently uses `aguardando/andamento/resolvido`; migrate to the canonical values).
- Session persistence: configure the client with `@react-native-async-storage/async-storage`
  (`auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true }`) when adding auto-login.
- Weather on mobile uses **Open-Meteo** (no key): geocoding → forecast by lat/lon, timezone
  `America/Sao_Paulo`.

## Native features (install with `npx expo install`)

| Need | Package | Note |
|------|---------|------|
| Photo | `expo-image-picker` (installed) | Ask permission, compress (`quality: 0.7`) |
| Location | `expo-location` | Foreground permission; store lat/lng with the occurrence |
| Push | `expo-notifications` | Save the Expo push token on `cidadao` |
| Map | `react-native-maps` | Needed for the Rotas screen |
| Calls | `Linking.openURL("tel:199")` | Used in Contatos (Defesa Civil 199, Bombeiros 193, SAMU 192) |

Add any required permission text to `app.json` (`plugins` / `ios.infoPlist`) in Portuguese.
