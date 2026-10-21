# Android nativo (React Native)

O aplicativo usa React Native 0.81 sem Expo. Abra `mobile/pluvite/android` no
Android Studio para sincronizar Gradle, executar em emulador/dispositivo e
gerar builds.

## Ambiente

- Node.js 20 ou superior
- JDK 17
- Android Studio com Android SDK 36, Build Tools 36 e plataforma Android
- Emulador Android ou aparelho com depuração USB

Instale as dependências com `npm install` em `mobile/pluvite`. Execute
`npm run android` para instalar/iniciar o app em um dispositivo ativo, ou use
**Run** no Android Studio depois de abrir a pasta `android/`.

Para push Android, consulte `README.md`: Firebase Messaging exige
`android/app/google-services.json` e o backend exige uma conta de serviço FCM.
