// Chamadas ao backend de rotas (app/backend/routes/rotas.js) e os tipos das respostas.

import { API_URL } from "@/app/lib/api";
import type { Coordenada } from "@/app/lib/geo";

// Ponto enviado ao backend: uma rua escolhida na lista ou uma coordenada (GPS / clique no mapa).
// Em navegação, `rumo` (graus) faz a rota partir para a frente do veículo.
export type Ponto = { rua: string } | { lat: number; lng: number; rumo?: number };

export type TipoManobra = "inicio" | "reto" | "direita" | "esquerda" | "retorno" | "chegada";

export interface Instrucao {
  tipo: TipoManobra;
  texto: string;
  rua: string;
  distancia: number;
  tempo: number;
  // Índice, em `coordenadas`, do ponto onde a instrução começa
  inicio: number;
}

export type EfeitoOcorrencia = "bloqueio" | "restricao";
// 'exata' = coordenada publicada no Feed; 'rua' = rua inteira citada no endereço
export type LocalizacaoOcorrencia = "exata" | "rua" | null;

export interface ResumoOcorrencia {
  id: string;
  tipo: string;
  endereco: string;
  rua: string | null;
  efeito: EfeitoOcorrencia;
  localizacao: LocalizacaoOcorrencia;
}

// Ocorrência ativa do Feed já ligada às vias do grafo da cidade
export interface OcorrenciaRota extends ResumoOcorrencia {
  bairro: string;
  status: string;
  criadoEm: string;
  posicao: Coordenada | null;
  raio: number | null;
  arestas: number[];
  // Geometria desenhada no mapa: só o pedaço das vias dentro do raio, não a aresta inteira
  trechos: Coordenada[][];
}

export interface ResultadoRota {
  distanciaMetros: number;
  duracaoSegundos: number;
  coordenadas: Coordenada[];
  instrucoes: Instrucao[];
  // Arestas do grafo percorridas e onde cada uma começa em `coordenadas`
  arestas: { id: number; inicio: number }[];
  ocorrencias: {
    consideradas: number;
    evitadas: ResumoOcorrencia[];
    naRota: ResumoOcorrencia[];
    indisponiveis: boolean;
  };
}

export interface DadosCidade {
  limites: [Coordenada, Coordenada];
  ruas: string[];
}

export const ERRO_CONEXAO =
  "Não foi possível conectar ao servidor de rotas. Verifique se o backend está rodando (npm run dev).";

// fetch lança TypeError quando o backend não responde
export const mensagemDeErro = (err: unknown) =>
  err instanceof TypeError
    ? ERRO_CONEXAO
    : err instanceof Error
      ? err.message
      : "Erro inesperado no servidor de rotas.";

const urlCidade = (cidade: string) => `${API_URL}/api/rotas/${encodeURIComponent(cidade)}`;

const lerResposta = async <T>(resposta: Response, mensagemPadrao: string): Promise<T> => {
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.error ?? mensagemPadrao);
  return dados as T;
};

// Nomes normalizados (sem acento) das cidades que têm grafo viário
export const listarCidadesComRotas = async () => {
  const resposta = await fetch(`${API_URL}/api/rotas/cidades`);
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return (await resposta.json()) as string[];
};

export const carregarDadosCidade = async (cidade: string) =>
  lerResposta<DadosCidade>(await fetch(urlCidade(cidade)), "Mapa indisponível para esta cidade.");

export const calcularRota = async (cidade: string, origem: Ponto, destino: Ponto) =>
  lerResposta<ResultadoRota>(
    await fetch(`${urlCidade(cidade)}/calcular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origem, destino }),
    }),
    "Não foi possível calcular a rota.",
  );

export const buscarOcorrenciasDaCidade = async (cidade: string, sinal?: AbortSignal) =>
  lerResposta<OcorrenciaRota[]>(
    await fetch(`${urlCidade(cidade)}/ocorrencias`, { signal: sinal }),
    "Não foi possível carregar as ocorrências do Feed.",
  );
