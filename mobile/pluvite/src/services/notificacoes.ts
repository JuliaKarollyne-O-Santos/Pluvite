/**
 * Push nativo Android via Firebase Cloud Messaging.
 *
 * O Google Services configura o aplicativo a partir de
 * android/app/google-services.json. Sem esse arquivo, o restante do app
 * continua funcionando, mas o registro de push fica indisponivel.
 */

import { PermissionsAndroid, Platform } from "react-native";
import messaging, {
  FirebaseMessagingTypes,
} from "@react-native-firebase/messaging";

import { registrarDispositivo, type Alerta } from "./alertas";

export const CANAL_ALERTAS = "alertas-emergencia";

function ehAlerta(valor: unknown): valor is Alerta {
  if (typeof valor !== "object" || valor === null) return false;
  const dados = valor as Record<string, unknown>;
  return (
    typeof dados.id === "string" &&
    typeof dados.tipo === "string" &&
    typeof dados.municipio === "string" &&
    typeof dados.criado_em === "string"
  );
}

function extrairAlerta(mensagem: FirebaseMessagingTypes.RemoteMessage): Alerta | null {
  const dados = mensagem.data;
  if (dados?.tipo_evento !== "alerta_emergencia" || !dados.alerta) return null;

  try {
    const alerta: unknown =
      typeof dados.alerta === "string" ? JSON.parse(dados.alerta) : dados.alerta;
    return ehAlerta(alerta) ? alerta : null;
  } catch (erro) {
    console.error("[push] Dados do alerta FCM inválidos:", erro);
  }
  return null;
}

async function pedirPermissaoAndroid(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (Number(Platform.Version) < 33) return true;

  const permissao = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  return permissao === PermissionsAndroid.RESULTS.GRANTED;
}

/** Solicita permissão, registra o token FCM no backend e devolve o token. */
export async function registrarParaPush(opcoes?: {
  authId?: string | null;
  municipio?: string | null;
}): Promise<string | null> {
  if (!(await pedirPermissaoAndroid())) {
    console.warn("[push] Permissão de notificações não concedida ou plataforma não suportada.");
    return null;
  }

  try {
    const autorizado = await messaging().hasPermission();
    if (autorizado !== messaging.AuthorizationStatus.AUTHORIZED &&
        autorizado !== messaging.AuthorizationStatus.PROVISIONAL) {
      console.warn("[push] Firebase Messaging não tem autorização para notificações.");
      return null;
    }

    const token = await messaging().getToken();
    const registrado = await registrarDispositivo({
      push_token: token,
      plataforma: Platform.OS,
      auth_id: opcoes?.authId ?? null,
      municipio: opcoes?.municipio ?? null,
    });

    if (!registrado) {
      console.warn("[push] Token FCM gerado, mas o backend não confirmou o registro.");
      return null;
    }

    console.log("[push] Token FCM registrado.");
    return token;
  } catch (erro) {
    console.warn(
      "[push] Não foi possível obter o token FCM. Confira Firebase e google-services.json:",
      erro,
    );
    return null;
  }
}

/** Observa alertas recebidos com o app aberto ou aberto pela notificação. */
export function escutarNotificacoes(aoReceberAlerta: (alerta: Alerta) => void) {
  try {
    const recebida = messaging().onMessage(async (mensagem) => {
      const alerta = extrairAlerta(mensagem);
      if (alerta) aoReceberAlerta(alerta);
    });

    const tocada = messaging().onNotificationOpenedApp((mensagem) => {
      const alerta = extrairAlerta(mensagem);
      if (alerta) aoReceberAlerta(alerta);
    });

    return () => {
      recebida();
      tocada();
    };
  } catch (erro) {
    console.warn("[push] Firebase não configurado; alertas em primeiro plano continuam via WebSocket.", erro);
    return () => {};
  }
}

/** Lê o alerta da notificação que iniciou o app, se houver. */
export async function alertaQueAbriuOApp(): Promise<Alerta | null> {
  try {
    const mensagem = await messaging().getInitialNotification();
    return mensagem ? extrairAlerta(mensagem) : null;
  } catch (erro) {
    console.warn("[push] Não foi possível ler a notificação que abriu o app:", erro);
    return null;
  }
}
