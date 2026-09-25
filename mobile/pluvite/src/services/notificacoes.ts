/**
 * ALERTA 3 (parte 1) — Push notification nativo.
 *
 * O app e Expo (SDK 54), entao usamos `expo-notifications`: o token gerado
 * aqui e entregue pelo Expo Push Service via **FCM** (Android) e **APNs**
 * (iOS). O celular toca/acende a tela mesmo com o app fechado.
 *
 * Instalacao das dependencias:
 *     cd mobile/pluvite
 *     npx expo install expo-notifications expo-device expo-constants
 *
 * Android: e necessario um build de desenvolvimento (`npx expo run:android`
 * ou EAS Build) com o google-services.json do Firebase — o Expo Go nao
 * recebe mais push remoto desde o SDK 53.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { registrarDispositivo, type Alerta } from "./alertas";

export const CANAL_ALERTAS = "alertas-emergencia";

/** Como a notificacao se comporta com o app aberto em primeiro plano. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Canal Android dedicado a emergencias: importancia maxima, som, vibracao
 * e luz — e o que faz a tela acender.
 */
async function criarCanalAndroid() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CANAL_ALERTAS, {
    name: "Alertas de emergência",
    description: "Avisos de risco climático da Defesa Civil",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 400, 200, 400],
    lightColor: "#b91c1c",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    enableVibrate: true,
    showBadge: true,
  });
}

function obterProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    // Caminho usado pelos builds do EAS
    Constants.easConfig?.projectId
  );
}

/**
 * Pede permissao, gera o Expo Push Token e registra no backend.
 * Devolve o token ou null quando nao for possivel (emulador, recusa, etc).
 */
export async function registrarParaPush(opcoes?: {
  authId?: string | null;
  municipio?: string | null;
}): Promise<string | null> {
  await criarCanalAndroid();

  if (!Device.isDevice) {
    console.warn("[push] Push notification so funciona em aparelho fisico.");
    return null;
  }

  const { status: statusAtual } = await Notifications.getPermissionsAsync();
  let status = statusAtual;

  if (status !== "granted") {
    const solicitacao = await Notifications.requestPermissionsAsync();
    status = solicitacao.status;
  }

  if (status !== "granted") {
    console.warn("[push] Permissão de notificação negada pelo usuário.");
    return null;
  }

  try {
    const projectId = obterProjectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await registrarDispositivo({
      push_token: token,
      plataforma: Platform.OS,
      auth_id: opcoes?.authId ?? null,
      municipio: opcoes?.municipio ?? null,
    });

    console.log("[push] Token registrado:", token);
    return token;
  } catch (erro) {
    console.warn(
      "[push] Não foi possível gerar o token. Configure o projectId do EAS " +
        "(npx eas init) e use um build de desenvolvimento:",
      erro,
    );
    return null;
  }
}

/** Extrai o alerta completo que o backend embute em `data` do push. */
export function extrairAlerta(
  notificacao: Notifications.Notification | Notifications.NotificationResponse,
): Alerta | null {
  const conteudo =
    "request" in notificacao
      ? notificacao.request.content
      : notificacao.notification.request.content;

  const dados = conteudo.data as { tipo_evento?: string; alerta?: Alerta } | undefined;
  if (dados?.tipo_evento === "alerta_emergencia" && dados.alerta) {
    return dados.alerta;
  }
  return null;
}

/**
 * Escuta as notificacoes: com o app aberto (`received`) e quando o usuario
 * toca na notificacao e o app abre (`response`).
 */
export function escutarNotificacoes(aoReceberAlerta: (alerta: Alerta) => void) {
  const recebida = Notifications.addNotificationReceivedListener((notificacao) => {
    const alerta = extrairAlerta(notificacao);
    if (alerta) aoReceberAlerta(alerta);
  });

  const tocada = Notifications.addNotificationResponseReceivedListener((resposta) => {
    const alerta = extrairAlerta(resposta);
    if (alerta) aoReceberAlerta(alerta);
  });

  return () => {
    recebida.remove();
    tocada.remove();
  };
}

/** App aberto pelo toque em uma notificacao enquanto estava fechado. */
export async function alertaQueAbriuOApp(): Promise<Alerta | null> {
  const ultima = await Notifications.getLastNotificationResponseAsync();
  return ultima ? extrairAlerta(ultima) : null;
}

/** Dispara uma notificacao local — atalho para testar sem backend. */
export async function notificacaoDeTeste(alerta: Alerta) {
  await criarCanalAndroid();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${alerta.icone} ${alerta.tipo.toUpperCase()} — ${alerta.municipio}`,
      body: alerta.descricao.slice(0, 120),
      sound: "default",
      data: { tipo_evento: "alerta_emergencia", alerta },
    },
    trigger: null,
  });
}
