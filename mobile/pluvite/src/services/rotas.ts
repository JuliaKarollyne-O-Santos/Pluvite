/**
 * Chamadas ao backend de rotas (web/app/backend/routes/rotas.js) — mesmo contrato do site
 * (web/app/lib/rotas/api.ts). O tempo de viagem é calculado no backend pelo modelo realista
 * (SKILLS/rotas-tempo-viagem); o app só exibe o resultado.
 */

import { API_ROTAS } from "../lib/configuracao";
import { normalizar } from "../lib/constantes";
import type { Coordenada } from "../lib/geo";

/** Ponto enviado ao backend: uma rua da lista ou uma coordenada (GPS / toque no mapa). */
export type Ponto = { rua: string } | { lat: number; lng: number; rumo?: number };

export type TipoManobra = "inicio" | "reto" | "direita" | "esquerda" | "retorno" | "chegada";

export interface Instrucao {
  tipo: TipoManobra;
  texto: string;
  rua: string;
  distancia: number;
  tempo: number;
  /** Índice, em `coordenadas`, do ponto onde a instrução começa */
  inicio: number;
}

export interface ResumoOcorrencia {
  id: string;
  tipo: string;
  endereco: string;
  rua: string | null;
  efeito: "bloqueio" | "restricao";
  localizacao: "exata" | "rua" | null;
  status: string;
  criadoEm: string;
}

export interface OcorrenciaRota extends ResumoOcorrencia {
  bairro: string;
  posicao: Coordenada | null;
  raio: number | null;
  arestas: number[];
  trechos: Coordenada[][];
}

export interface ResultadoRota {
  distanciaMetros: number;
  duracaoSegundos: number;
  coordenadas: Coordenada[];
  instrucoes: Instrucao[];
  ocorrencias: {
    consideradas: number;
    evitadas: ResumoOcorrencia[];
    naRota: ResumoOcorrencia[];
    indisponiveis: boolean;
  };
  transito?: { disponivel: boolean; atrasoSegundos: number } | null;
  avisos?: string[];
  alternativas?: ResultadoRota[];
}

export interface DadosCidade {
  limites: [Coordenada, Coordenada];
  ruas: string[];
}

export const ERRO_CONEXAO =
  "Não foi possível conectar ao servidor de rotas. Verifique se o backend está rodando e o endereço em src/lib/configuracao.ts.";

/** fetch lança TypeError quando o backend não responde */
export const mensagemDeErro = (erro: unknown) =>
  erro instanceof TypeError
    ? ERRO_CONEXAO
    : erro instanceof Error
      ? erro.message
      : "Erro inesperado no servidor de rotas.";

const urlCidade = (cidade: string) => `${API_ROTAS}/api/rotas/${encodeURIComponent(cidade)}`;

async function lerResposta<T>(resposta: Response, mensagemPadrao: string): Promise<T> {
  // Um proxy ou o host fora do ar podem devolver HTML em vez de JSON
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok || dados === null) throw new Error(dados?.error ?? mensagemPadrao);
  return dados as T;
}

/** Nomes normalizados (sem acento) das cidades que têm grafo viário */
export async function listarCidadesComRotas(): Promise<Set<string>> {
  const resposta = await fetch(`${API_ROTAS}/api/rotas/cidades`);
  const nomes = await lerResposta<string[]>(resposta, "Lista de cidades indisponível.");
  return new Set(nomes.map(normalizar));
}

export async function carregarDadosCidade(cidade: string) {
  return lerResposta<DadosCidade>(
    await fetch(urlCidade(cidade)),
    "Mapa indisponível para esta cidade.",
  );
}

/** `alternativas` pede até 2 rotas diferentes da principal (só no planejamento). */
export async function calcularRota(
  cidade: string,
  origem: Ponto,
  destino: Ponto,
  { alternativas = false }: { alternativas?: boolean } = {},
) {
  return lerResposta<ResultadoRota>(
    await fetch(`${urlCidade(cidade)}/calcular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origem, destino, alternativas }),
    }),
    "Não foi possível calcular a rota.",
  );
}

export async function buscarOcorrenciasDaCidade(cidade: string) {
  return lerResposta<OcorrenciaRota[]>(
    await fetch(`${urlCidade(cidade)}/ocorrencias`),
    "Não foi possível carregar as ocorrências do Feed.",
  );
}
