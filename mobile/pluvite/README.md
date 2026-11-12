# Pluvite Mobile para Android

Aplicativo React Native 0.81 com projeto Android/Gradle nativo. **Não usa Expo.**
O código é editado no VS Code; o Android Studio fornece o SDK, o JDK e o emulador.

## Telas

| Aba | O que faz | Fonte dos dados |
|-----|-----------|-----------------|
| Clima | Previsão atual + 6 dias, cidades próximas, card/modal de alerta, botão do WhatsApp | Open-Meteo, backend Python de alertas |
| Rotas | Rota segura entre ruas/GPS/ponto no mapa, alternativas, navegação com recálculo | Backend Express (`/api/rotas`) |
| Feed | Ocorrências com filtros, publicação com foto e GPS, curtidas, comentários, tempo real | Supabase (`ocorrencias`, `curtidas`, `comentarios`, Storage) |
| Contatos | Serviços de emergência + contato pessoal do perfil | Supabase (`cidadao`) |
| Perfil | Dados, informações médicas, contato de emergência, município dos alertas | Supabase (`cidadao`, Storage `avatars`) |

Login/Cadastro usam Supabase Auth (e-mail e senha) e login social pelo navegador
(Google/Facebook, retorno em `pluvite://auth`). A sessão fica salva no AsyncStorage.

## Requisitos

- Node.js 20+
- **JDK 17** (o Gradle 8.14 do projeto não roda com Java 25+)
- Android Studio com Android SDK 36, Build Tools 36 e NDK 27.1.12297006
- Emulador Android iniciado ou aparelho com depuração USB habilitada

## Instalar e executar

```powershell
cd mobile\pluvite
npm install
npm start          # terminal 1: Metro
npm run android    # terminal 2: compila, instala e abre no emulador/aparelho
```

Pelo Android Studio: **Open** → `mobile/pluvite/android` → aguarde o Gradle sync →
escolha o emulador → **Run** (o Metro precisa estar rodando com `npm start`).

## Configuração (`src/lib/configuracao.ts`)

| Constante | Padrão | Para quê |
|-----------|--------|----------|
| `API_ALERTAS` | `http://10.0.2.2:8000` | Backend Python de alertas (WebSocket, push FCM) |
| `API_ROTAS` | `http://10.0.2.2:3001` | Backend Express de rotas |
| `WHATSAPP_ALERTAS` | número do chatbot | Botão "Alertas pelo WhatsApp" |
| `REDIRECT_LOGIN_SOCIAL` | `pluvite://auth` | Retorno do login Google/Facebook |

`10.0.2.2` é o computador visto de dentro do emulador. Em aparelho físico, troque
pelo IP local da máquina (ex.: `http://192.168.0.10:3001`) ou pela URL publicada
no Render, e libere as portas 3001 e 8000 no firewall do Windows.

Para testar Rotas, rode o site/backend junto: `cd web && npm run dev` (Express em :3001).

## Login social (Google / Facebook)

O app usa o mesmo provedor OAuth do Supabase que o site, abrindo o navegador.
Passos manuais:

1. Supabase → Authentication → URL Configuration → **Redirect URLs**: adicione `pluvite://auth`.
2. Google Cloud Console → credencial OAuth do tipo **Aplicativo da Web** já usada pelo
   Supabase: confira se o URI de redirecionamento autorizado é
   `https://<projeto>.supabase.co/auth/v1/callback`.
3. Facebook Developers: mesma URL de callback do Supabase em "URIs de redirecionamento do OAuth válidos".

Sem o passo 1, o navegador volta para o site em vez do app.

## Alertas dentro do aplicativo

O modal de emergência aparece na aba **Clima** quando chega um alerta pelo WebSocket,
quando o app volta ao primeiro plano ou quando uma notificação é aberta. O card do
alerta reabre o modal, e o modal tem o botão **Receber atualizações pelo WhatsApp**.
O botão vermelho do WhatsApp no cabeçalho ganha um ponto amarelo quando o município
do cidadão está em alerta.

## Push nativo Firebase (opcional)

O app compila e recebe alertas em primeiro plano via WebSocket sem Firebase. Para push
em segundo plano:

1. Crie um projeto no Firebase Console e registre um app Android com package `com.pluvite.app`.
2. Baixe `google-services.json` para `android/app/google-services.json` (ignorado pelo Git).
3. No Firebase Console, baixe uma chave JSON de conta de serviço e salve em
   `web/app/python/firebase-service-account.json` (ignorado pelo Git).
4. Em `web/app/python/.env`:

   ```dotenv
   PUSH_ATIVO=true
   FCM_SERVICE_ACCOUNT_FILE=firebase-service-account.json
   ```

5. Recompile o app e aceite a permissão de notificações.
6. No Perfil → Notificações, escolha o município para registrar o token FCM.

Tokens Expo antigos não são compatíveis com FCM. Se existirem, remova-os:

```sql
delete from dispositivos where push_token like 'ExponentPushToken[%';
```

## Verificações

```powershell
npm run typecheck
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output %TEMP%\teste.bundle
```
