// Lógica pura da navegação em tempo real: casa a posição do GPS com o traçado da rota, mede o
// progresso, detecta saída da rota e chegada, e acha ocorrências no trecho que falta.

import {
  type Coordenada,
  diferencaRumo,
  distanciaMetros,
  distanciasAcumuladas,
  projetarNoSegmento,
  rumoEntre,
} from "@/app/lib/geo";
import type { PosicaoUsuario } from "@/app/lib/localizacao";
import type { OcorrenciaRota, ResultadoRota, ResumoOcorrencia } from "./api";

/**
 * Parâmetros da navegação (estimativas usuais de apps de GPS; ajustar com testes em campo).
 */
export const NAVEGACAO = {
  // Fora da rota: posição a mais de N m do traçado, somada à imprecisão do GPS (limitada a
  // `precisaoMaxima`), em `leiturasForaDaRota` leituras seguidas (um salto do GPS não recalcula)
  distanciaForaDaRota: 35,
  precisaoMaxima: 40,
  leiturasForaDaRota: 2,
  // Intervalo mínimo entre recálculos por desvio
  intervaloRecalculoMs: 8000,
  // Chegada: a menos de N m do destino
  distanciaChegada: 25,
  // Trechos no sentido contrário ao movimento "valem" N m a mais ao casar a posição com o traçado
  // (rotas que usam a mesma rua na ida e na volta)
  penalidadeSentidoOposto: 40,
};

export interface RotaNavegacao extends ResultadoRota {
  acumuladas: number[]; // distância do início até cada ponto de `coordenadas`
  destinoTexto: string;
}

export interface ProgressoNavegacao {
  indice: number; // segmento atual: entre coordenadas[indice] e coordenadas[indice + 1]
  ponto: Coordenada; // posição casada com o traçado
  distanciaDaRota: number; // m entre o GPS e o traçado
  foraDaRota: boolean; // esta leitura está longe demais do traçado
  percorrido: number; // m
  restante: number; // m
  tempoRestante: number; // s
  passoAtual: number; // índice da instrução sendo seguida
  distanciaProximaManobra: number; // m até o início da próxima instrução
  chegou: boolean;
}

/**
 * Prepara a resposta do backend para exibição/navegação: acrescenta a instrução de chegada e as
 * distâncias acumuladas. Num recálculo a partir do GPS, liga a posição do usuário ao início da
 * rota (o backend parte do nó mais próximo) para a navegação já começar sobre o traçado.
 */
export const prepararRota = (
  resultado: ResultadoRota,
  destinoTexto: string,
  origemGps?: Coordenada,
): RotaNavegacao => {
  let { coordenadas, instrucoes, arestas } = resultado;
  if (origemGps && distanciaMetros(origemGps, coordenadas[0]) > 3) {
    coordenadas = [origemGps, ...coordenadas];
    instrucoes = instrucoes.map((passo, i) => ({ ...passo, inicio: i === 0 ? 0 : passo.inicio + 1 }));
    arestas = arestas.map((aresta) => ({ ...aresta, inicio: aresta.inicio + 1 }));
  }

  return {
    ...resultado,
    coordenadas,
    arestas,
    instrucoes: [
      ...instrucoes,
      {
        tipo: "chegada",
        texto: "Você chegou ao destino",
        rua: destinoTexto,
        distancia: 0,
        tempo: 0,
        inicio: coordenadas.length - 1,
      },
    ],
    acumuladas: distanciasAcumuladas(coordenadas),
    destinoTexto,
  };
};

export const calcularProgresso = (
  rota: RotaNavegacao,
  posicao: PosicaoUsuario,
): ProgressoNavegacao => {
  const { coordenadas, acumuladas, instrucoes } = rota;
  const p = posicao.coordenada;

  // Segmento do traçado mais próximo, desfavorecendo os que vão no sentido contrário ao movimento
  let melhor = { indice: 0, t: 0, ponto: coordenadas[0], distancia: Infinity, pontuacao: Infinity };
  for (let i = 0; i < coordenadas.length - 1; i++) {
    const projecao = projetarNoSegmento(p, coordenadas[i], coordenadas[i + 1]);
    let pontuacao = projecao.distancia;
    if (
      posicao.rumo !== null &&
      acumuladas[i + 1] - acumuladas[i] > 2 &&
      Math.abs(diferencaRumo(rumoEntre(coordenadas[i], coordenadas[i + 1]), posicao.rumo)) > 100
    ) {
      pontuacao += NAVEGACAO.penalidadeSentidoOposto;
    }
    if (pontuacao < melhor.pontuacao) melhor = { indice: i, ...projecao, pontuacao };
  }

  const total = acumuladas[acumuladas.length - 1];
  const inicioSegmento = acumuladas[melhor.indice];
  const percorrido = inicioSegmento + melhor.t * (acumuladas[melhor.indice + 1] - inicioSegmento);
  const restante = Math.max(0, total - percorrido);

  // Instrução atual: a última que começa até o segmento atual (a de chegada começa no último ponto)
  let passoAtual = 0;
  instrucoes.forEach((passo, k) => {
    if (passo.inicio <= melhor.indice) passoAtual = k;
  });
  const passo = instrucoes[passoAtual];
  const proximo = instrucoes[passoAtual + 1];
  const inicioPasso = acumuladas[passo.inicio];
  const fimPasso = proximo ? acumuladas[proximo.inicio] : total;

  // Tempo restante: fração que falta da instrução atual + as seguintes (tempos do modelo realista)
  const fracaoRestante =
    fimPasso > inicioPasso ? Math.min(1, Math.max(0, (fimPasso - percorrido) / (fimPasso - inicioPasso))) : 0;
  let tempoRestante = passo.tempo * fracaoRestante;
  for (let k = passoAtual + 1; k < instrucoes.length; k++) tempoRestante += instrucoes[k].tempo;

  const limite = NAVEGACAO.distanciaForaDaRota + Math.min(posicao.precisao, NAVEGACAO.precisaoMaxima);
  const foraDaRota = melhor.distancia > limite;
  const chegou =
    (restante <= NAVEGACAO.distanciaChegada && !foraDaRota) ||
    distanciaMetros(p, coordenadas[coordenadas.length - 1]) <= NAVEGACAO.distanciaChegada;

  return {
    indice: melhor.indice,
    ponto: melhor.ponto,
    distanciaDaRota: melhor.distancia,
    foraDaRota,
    percorrido,
    restante,
    tempoRestante,
    passoAtual,
    distanciaProximaManobra: proximo ? Math.max(0, fimPasso - percorrido) : restante,
    chegou,
  };
};

// Traçado dividido na posição atual: o que já foi percorrido e o que falta
export const dividirTracado = (rota: RotaNavegacao, progresso: ProgressoNavegacao) => ({
  percorrido: [...rota.coordenadas.slice(0, progresso.indice + 1), progresso.ponto],
  restante: [progresso.ponto, ...rota.coordenadas.slice(progresso.indice + 1)],
});

// Ids das arestas do grafo que ainda faltam percorrer (todas, se não há progresso)
const arestasRestantes = (rota: RotaNavegacao, progresso: ProgressoNavegacao | null) => {
  const indiceAtual = progresso?.indice ?? 0;
  const ids = new Set<number>();
  rota.arestas.forEach((aresta, k) => {
    const fim = rota.arestas[k + 1]?.inicio ?? rota.coordenadas.length - 1;
    if (fim > indiceAtual) ids.add(aresta.id);
  });
  return ids;
};

/**
 * Ocorrências que atingem o trecho que falta e que a rota atual não levou em conta (as que ela
 * não conseguiu evitar já vêm em `ocorrencias.naRota` e não disparam novo recálculo).
 */
export const ocorrenciasNoTrajeto = (
  ocorrencias: OcorrenciaRota[],
  rota: RotaNavegacao,
  progresso: ProgressoNavegacao | null,
) => {
  const restantes = arestasRestantes(rota, progresso);
  const conhecidas = new Set(rota.ocorrencias.naRota.map((o) => o.id));
  return ocorrencias.filter(
    (o) => !conhecidas.has(o.id) && o.arestas.some((id) => restantes.has(id)),
  );
};

export const descreverOcorrencia = (ocorrencia: ResumoOcorrencia) =>
  `${ocorrencia.tipo} — ${ocorrencia.rua ?? ocorrencia.endereco}`;
