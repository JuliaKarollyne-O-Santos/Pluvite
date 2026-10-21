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
  // Status do Feed ("Aguardando" = relato ainda não visto pela prefeitura) e data de publicação
  status: string;
  criadoEm: string;
}

// Ocorrência ativa do Feed já ligada às vias do grafo da cidade
export interface OcorrenciaRota extends ResumoOcorrencia {
  bairro: string;
  posicao: Coordenada | null;
  raio: number | null;
  arestas: number[];
  // Geometria desenhada no mapa: só o pedaço das vias dentro do raio, não a aresta inteira
  trechos: Coordenada[][];
}

// Trânsito ao vivo (TomTom): 'lentidao' tem atraso medido, que já entra no tempo da rota;
// 'bloqueio' (via fechada) e 'restricao' (faixa fechada, obra, acidente) só mudam o caminho
export type EfeitoTransito = "lentidao" | "bloqueio" | "restricao";

export interface IncidenteTransito {
  id: string;
  tipo: string;
  descricao: string | null;
  efeito: EfeitoTransito;
  atrasoSegundos: number | null;
  extensao: number | null;
  // Onde o trânsito afetado começa e termina (nomes informados pela TomTom)
  de: string | null;
  ate: string | null;
  inicio: string | null;
  fim: string | null;
  trecho: Coordenada[];
}

export interface TransitoRota {
  // false = o backend tem chave da TomTom, mas o dado não veio agora (falha ou cota do dia)
  disponivel: boolean;
  fonte: string;
  atualizadoEm: string | null;
  // Lentidão medida que entrou no tempo desta rota (s)
  atrasoSegundos: number;
  naRota: IncidenteTransito[];
  evitados: IncidenteTransito[];
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
  // Trânsito ao vivo; null quando o backend não tem chave da TomTom configurada
  transito?: TransitoRota | null;
  // Ex.: o ponto marcado fica longe da via acessível mais próxima (a rota parte/chega dela)
  avisos?: string[];
  // Até 2 rotas diferentes da principal, no mesmo formato (só quando pedidas em calcularRota)
  alternativas?: ResultadoRota[];
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
  // Um proxy ou o host fora do ar podem devolver HTML em vez de JSON: a mensagem padrão ajuda mais
  // do que o erro de leitura ("Unexpected token <")
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok || dados === null) throw new Error(dados?.error ?? mensagemPadrao);
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

// `alternativas` pede também até 2 rotas diferentes da principal — só no planejamento: num recálculo
// da navegação basta a melhor rota a partir da posição atual
export const calcularRota = async (
  cidade: string,
  origem: Ponto,
  destino: Ponto,
  { alternativas = false }: { alternativas?: boolean } = {},
) =>
  lerResposta<ResultadoRota>(
    await fetch(`${urlCidade(cidade)}/calcular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origem, destino, alternativas }),
    }),
    "Não foi possível calcular a rota.",
  );

export const buscarOcorrenciasDaCidade = async (cidade: string, sinal?: AbortSignal) =>
  lerResposta<OcorrenciaRota[]>(
    await fetch(`${urlCidade(cidade)}/ocorrencias`, { signal: sinal }),
    "Não foi possível carregar as ocorrências do Feed.",
  );
