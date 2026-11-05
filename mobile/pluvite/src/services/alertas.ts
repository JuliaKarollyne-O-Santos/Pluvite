/**
 * Contrato do alerta + acesso ao backend Python.
 *
 * O payload e o mesmo consumido pelo site (web/app/lib/alertas.ts) e montado
 * em web/app/python/backend/alerta.py.
 */

import { API_ALERTAS } from "../lib/configuracao";

export type Prioridade =
  | "Zona Segura"
  | "Atenção Crítica"
  | "Estado de Alerta"
  | "Alerta Máximo"
  | "BAIXA"
  | "MEDIA"
  | "ALTA"
  | "CRITICA";

export interface Alerta {
  id: string;
  tipo: string;
  prioridade: Prioridade;
  municipio: string;
  endereco: string;
  descricao: string;
  statusatual: string;
  criado_em: string;
  origem: "openweather" | "openweather_mock" | "manual" | "simulacao" | "banco";
  titulo: string;
  mensagem: string;
  rotulo_severidade: string;
  icone: string;
  cor: string;
  botao: string;
}

export function urlWebSocketAlertas(municipio: string): string {
  const parametros = new URLSearchParams({ municipio });
  return `${API_ALERTAS.replace(/^http/, "ws")}/ws/alertas?${parametros}`;
}

/** Ultimo alerta ativo — chamado quando o app abre. */
export async function buscarUltimoAlerta(
  municipio: string | null,
): Promise<Alerta | null> {
  if (!municipio) return null;
  try {
    const parametros = new URLSearchParams({ municipio });
    const resposta = await fetch(
      `${API_ALERTAS}/api/alertas/ultimo?${parametros}`,
    );
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
