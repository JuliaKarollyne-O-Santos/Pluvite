# Pluvite Mobile para Android

Aplicativo React Native 0.81 com projeto Android/Gradle nativo. Não usa Expo.

## Requisitos

- Node.js 20+
- JDK 17
- Android Studio com Android SDK 36 e Build Tools 36
- Emulador Android iniciado ou aparelho com depuração USB habilitada

## Instalar e executar

No terminal:

```powershell
cd mobile\pluvite
npm install
npm run android
```

Para executar pelo Android Studio:

1. Abra o Android Studio e selecione **Open**.
2. Escolha `mobile/pluvite/android`.
3. Aguarde a sincronização do Gradle terminar.
4. Selecione um emulador/aparelho e pressione **Run**.

O app usa `http://10.0.2.2:8000` para acessar o backend a partir do emulador.
Para aparelho físico, altere `API_ALERTAS` em `src/lib/configuracao.ts` para o
IP local do computador e permita a porta 8000 no firewall.

## Alertas dentro do aplicativo

O modal de emergência, semelhante ao popup do site, aparece na aba **Clima**
quando chega um alerta pelo WebSocket, quando o app volta ao primeiro plano ou
quando uma notificação é aberta. O card do alerta pode ser tocado para reabrir
o modal. O modal exibe severidade, tipo, município, endereço, prioridade,
status, descrição e a ação **Estou Ciente**.

## Push nativo Firebase (opcional)

O app pode compilar e receber alertas em primeiro plano via WebSocket sem
configuração Firebase. Para push em segundo plano:

1. Crie um projeto em Firebase Console e registre um aplicativo Android com
   package `com.pluvite.app`.
2. Baixe `google-services.json` para `android/app/google-services.json`.
3. No Firebase Console, crie/baixe uma chave JSON de conta de serviço.
   Guarde-a em `web/app/python/firebase-service-account.json`; esse arquivo é
   ignorado pelo Git e não deve ser versionado.
4. No arquivo `web/app/python/.env`, configure:

   ```dotenv
   PUSH_ATIVO=true
   FCM_SERVICE_ACCOUNT_FILE=firebase-service-account.json
   ```

5. Reinstale/recompile o app no Android Studio. Aceite a permissão de
   notificações Android quando solicitada.
6. No perfil do app, escolha um município para registrar o token FCM e
   receber notificações dessa cidade.

O token FCM é salvo em `dispositivos.push_token`. O backend o envia diretamente
ao Firebase Admin SDK; tokens Expo antigos não são compatíveis e devem ser
substituídos pela nova instalação. Se a tabela ainda contiver tokens antigos,
remova-os antes de testar o FCM:

```sql
delete from dispositivos where push_token like 'ExponentPushToken[%';
```

## Verificações

```powershell
npm run typecheck
npm start
```

O backend Python e o Firebase precisam estar configurados para validar push
remoto. Sem Firebase, valide a aparência do modal com um alerta enviado pelo
backend enquanto o app estiver aberto.
