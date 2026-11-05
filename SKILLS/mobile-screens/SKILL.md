---
name: mobile-screens
description: Conventions for the Pluvite React Native 0.81 Android app without Expo — screen layout, navigation, native Android integrations, Supabase and alert notifications.
---

# Mobile screens (React Native 0.81, Android)

The app lives in `mobile/pluvite/` and uses the React Native Community CLI. Open
`mobile/pluvite/android/` in Android Studio. Do not add Expo packages, config,
commands, or runtime APIs.

## Structure

```
mobile/pluvite/
├── App.tsx
├── index.js
├── android/                         Android Studio / Gradle project
├── src/navigation/TabNavigator.tsx
├── src/pages/<tela>/page.tsx
├── src/pages/lib/supabase.ts
└── src/{components,context,lib,services}
```

New screens go in `src/pages/<nome>/page.tsx`; register them in the existing
navigation stack or tabs. Shared UI goes in `src/components/`, and app
configuration such as the local alert API URL belongs in `src/lib/`.

## Screen conventions

- Use `SafeAreaView` from `react-native-safe-area-context`.
- Style with `StyleSheet.create` at the bottom of each screen.
- Use `TouchableOpacity` for existing touch targets and give icon-only controls
  an `accessibilityLabel`.
- Show errors in Portuguese with `Alert.alert`; check Supabase `{ data, error }`.
- Keep identifiers and user-facing text in Brazilian Portuguese.
- Use `FlatList` for unbounded lists.

## Data and alerts

- Supabase client is `src/pages/lib/supabase.ts`; it persists auth with
  AsyncStorage.
- Mobile weather uses Open-Meteo.
- Alert UI uses `AlertaEmergenciaModal` and `AlertaDestaqueCard`, fed by
  `AlertaContext` from FCM, the backend WebSocket, and `/api/alertas/ultimo`.
- Push uses `@react-native-firebase/messaging`; server sends native FCM
  notifications. Configure Android `google-services.json` and the backend
  service-account credential as documented in `mobile/pluvite/README.md`.
- Image selection uses `react-native-image-picker`.
- Android emulator backend URL is `http://10.0.2.2:8000`; a physical device
  needs the computer's LAN IP in `src/lib/configuracao.ts`.

Install native dependencies with `npm install`, then sync Gradle in Android
Studio. Do not use `npx expo install`, Expo Go, EAS, or `app.json`.
