/**
 * Contrato compartilhado com o backend Python de alertas.
 *
 * O payload e montado em web/app/python/backend/alerta.py e segue o mesmo
 * modelo do pop-up original (notificacao_popup/popups.py).
 */

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

/** Token administrativo exigido pelo backend em producao (opcional em dev) */
const ADMIN_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";

export interface EntradaAlertaManual {
  tipo: string;
  prioridade: Prioridade;
  municipio: string;
  endereco?: string;
  descricao: string;
}

export interface RelatorioDisparo {
  ok: boolean;
  persistido: boolean;
  alerta: Alerta;
  canais: {
    web: { ok: boolean; entregues?: number; conectados?: number };
    whatsapp: { ok: boolean; enviados?: number; total?: number; motivo?: string };
    push: { ok: boolean; enviados?: number; total?: number; motivo?: string };
  };
}

/**
 * Gatilho MANUAL: o backend grava no Supabase e dispara os 3 canais
 * (pop-up do site, WhatsApp e push no app) simultaneamente.
 */
export async function dispararAlertaManual(
  entrada: EntradaAlertaManual,
): Promise<RelatorioDisparo> {
  const resposta = await fetch(`${API_ALERTAS}/api/alertas/disparar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ADMIN_TOKEN ? { "X-Pluvite-Token": ADMIN_TOKEN } : {}),
    },
    body: JSON.stringify({
      endereco: "Toda a área do município",
      statusatual: "Ativo",
      ...entrada,
    }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error(`Backend recusou o disparo (${resposta.status}): ${detalhe}`);
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
