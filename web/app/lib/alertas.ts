import { supabase } from "@/app/lib/banco";

/**
 * Contrato compartilhado com o backend Python de alertas.
 *
 * O payload e montado em web/app/python/backend/alerta.py e segue o mesmo
 * modelo do pop-up original (notificacao_popup/popups.py).
 */

export type Prioridade =
  | "Zona Segura"
  | "Atenção Crítica"
  | "Estado de Alerta"
  | "Alerta Máximo";

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
  /** `[CRITICA] Alerta de Enchente - Taubate` */
  titulo: string;
  /** Texto completo, no formato do pop-up de desktop */
  mensagem: string;
  /** `ALERTA VERMELHO — Perigo Extremo` */
  rotulo_severidade: string;
  icone: string;
  cor: string;
  botao: string;
}

export interface EventoAlerta {
  evento: "alerta_emergencia" | "conectado" | "pong";
  dados: Alerta | { mensagem: string } | null;
}

/** http://localhost:8000 por padrao — troque via .env.local do Next */
export const API_ALERTAS =
  process.env.NEXT_PUBLIC_API_ALERTAS ?? "http://localhost:8000";

/** ws://localhost:8000/ws/alertas derivado da URL da API */
export const WS_ALERTAS =
  process.env.NEXT_PUBLIC_WS_ALERTAS ??
  `${API_ALERTAS.replace(/^http/, "ws")}/ws/alertas`;

export interface EntradaAlertaManual {
  tipo: string;
  prioridade: Prioridade;
  municipio: string;
  endereco?: string;
  descricao: string;
}

export interface RelatorioDisparo {
  ok: boolean;
  simulacao?: boolean;
  persistido: boolean;
  alerta: Alerta;
  canais: {
    web: { ok: boolean; entregues?: number; conectados?: number };
    whatsapp: { ok: boolean; enviados?: number; total?: number; motivo?: string };
    push: { ok: boolean; enviados?: number; total?: number; motivo?: string };
  };
}

export interface RegistroHistoricoAlerta {
  id: number | string;
  tipo: string;
  prioridade: Prioridade;
  municipio: string | null;
  endereco: string | null;
  descricao: string | null;
  statusatual: string;
  origem: string | null;
  criado_em: string;
}

export interface StatusCanaisAlerta {
  whatsapp_configurado: boolean;
  whatsapp_motivo: string | null;
  whatsapp_chatbot: { online: boolean; conectado: boolean; erro?: string } | null;
  push_configurado: boolean;
  push_motivo: string | null;
  navegadores_conectados: number;
}

async function cabecalhosAutenticados(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Erro ao recuperar sessão para alertas:", error.message);
    throw new Error("Não foi possível validar sua sessão. Entre novamente.");
  }
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Gatilho MANUAL: o backend grava no Supabase e dispara os 3 canais
 * (pop-up do site, WhatsApp e push no app) simultaneamente.
 * Vai com o token de sessão do Supabase: o backend só aceita contas de servidor
 * (para o próprio município) e da equipe (admin).
 */
export async function dispararAlertaManual(
  entrada: EntradaAlertaManual,
): Promise<RelatorioDisparo> {
  const headers = await cabecalhosAutenticados();
  const resposta = await fetch(`${API_ALERTAS}/api/alertas/disparar`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      endereco: "Toda a área do município",
      statusatual: "Ativo",
      ...entrada,
    }),
  });

  if (!resposta.ok) {
    // FastAPI devolve { detail: "mensagem" } (ou uma lista, quando o formulário é inválido)
    const corpo = await resposta.json().catch(() => null);
    const detalhe = typeof corpo?.detail === "string" ? corpo.detail : "dados inválidos";
    throw new Error(`Backend recusou o disparo (${resposta.status}): ${detalhe}`);
  }

  return resposta.json();
}

export async function simularAlertaManual(
  entrada: EntradaAlertaManual,
): Promise<RelatorioDisparo> {
  const resposta = await fetch(`${API_ALERTAS}/api/alertas/simular`, {
    method: "POST",
    headers: await cabecalhosAutenticados(),
    body: JSON.stringify({
      endereco: "Toda a área do município",
      statusatual: "Ativo",
      ...entrada,
    }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error(`Backend recusou a simulação (${resposta.status}): ${detalhe}`);
  }

  return resposta.json();
}

export async function buscarHistoricoAlertas(
  municipio?: string,
): Promise<RegistroHistoricoAlerta[]> {
  const parametros = new URLSearchParams({ limite: "100" });
  if (municipio) parametros.set("municipio", municipio);
  const resposta = await fetch(`${API_ALERTAS}/api/alertas/historico?${parametros}`, {
    headers: await cabecalhosAutenticados(),
    cache: "no-store",
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error(`Não foi possível carregar o histórico (${resposta.status}): ${detalhe}`);
  }
  const corpo = (await resposta.json()) as { alertas: RegistroHistoricoAlerta[] };
  return corpo.alertas;
}

export async function buscarStatusCanais(): Promise<StatusCanaisAlerta> {
  const resposta = await fetch(`${API_ALERTAS}/api/status`, { cache: "no-store" });
  if (!resposta.ok) {
    throw new Error(`Não foi possível consultar os canais (${resposta.status}).`);
  }
  return resposta.json();
}

/** Ultimo alerta conhecido — usado por quem abre o site depois do evento. */
export async function buscarUltimoAlerta(): Promise<Alerta | null> {
  const resposta = await fetch(`${API_ALERTAS}/api/alertas/ultimo`, {
    cache: "no-store",
  });
  if (!resposta.ok) return null;
  const corpo = (await resposta.json()) as { alerta: Alerta | null };
  return corpo.alerta;
}
