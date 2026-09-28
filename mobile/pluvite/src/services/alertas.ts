/**
 * Contrato do alerta + acesso ao backend Python.
 *
 * O payload e o mesmo consumido pelo site (web/app/lib/alertas.ts) e montado
 * em web/app/python/backend/alerta.py.
 */

import Constants from "expo-constants";

export type Prioridade = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";

export interface Alerta {
  id: string;
  tipo: string;
  prioridade: Prioridade;
  municipio: string;
  endereco: string;
  descricao: string;
  statusatual: string;
  criado_em: string;
  origem: "openweather" | "manual" | "banco";
  titulo: string;
  mensagem: string;
  rotulo_severidade: string;
  icone: string;
  cor: string;
  botao: string;
}

/**
 * Endereco do backend de alertas.
 *
 * Em desenvolvimento com aparelho fisico, `localhost` aponta para o proprio
 * celular — por isso usamos o IP da maquina que roda o Metro (debuggerHost).
 * Para fixar manualmente, defina `extra.apiAlertas` no app.json.
 */
function descobrirApi(): string {
  const configurado = (Constants.expoConfig?.extra as { apiAlertas?: string } | undefined)
    ?.apiAlertas;
  if (configurado) return configurado;

  const host =
    Constants.expoConfig?.hostUri ??
    // Campo legado, presente em versoes antigas do Expo Go
    Constants.manifest?.debuggerHost;

  if (typeof host === "string" && host.length > 0) {
    return `http://${host.split(":")[0]}:8000`;
  }
  return "http://localhost:8000";
}

export const API_ALERTAS = descobrirApi();
export const WS_ALERTAS = `${API_ALERTAS.replace(/^http/, "ws")}/ws/alertas`;

/** Ultimo alerta ativo — chamado quando o app abre. */
export async function buscarUltimoAlerta(): Promise<Alerta | null> {
  try {
    const resposta = await fetch(`${API_ALERTAS}/api/alertas/ultimo`);
    if (!resposta.ok) return null;
    const corpo = (await resposta.json()) as { alerta: Alerta | null };
    return corpo.alerta;
  } catch (erro) {
    console.warn("[alertas] backend indisponivel:", erro);
    return null;
  }
}

/** Registra o token de push deste aparelho no backend. */
export async function registrarDispositivo(dados: {
  push_token: string;
  plataforma: string;
  auth_id?: string | null;
  municipio?: string | null;
}): Promise<boolean> {
  try {
    const resposta = await fetch(`${API_ALERTAS}/api/dispositivos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    if (!resposta.ok) return false;
    const corpo = (await resposta.json()) as { ok?: boolean };
    return corpo.ok === true;
  } catch (erro) {
    console.warn("[alertas] falha ao registrar dispositivo:", erro);
    return false;
  }
}

/** Alertas com mais de 6h nao abrem mais o modal automaticamente. */
export function alertaAindaVale(alerta: Alerta, horas = 6): boolean {
  const criadoEm = new Date(alerta.criado_em).getTime();
  if (Number.isNaN(criadoEm)) return true;
  return Date.now() - criadoEm < horas * 60 * 60 * 1000;
}
