// Estado da rota da página /Rotas: cálculo, navegação em tempo real (GPS, saída da rota, chegada)
// e recálculo automático quando uma ocorrência do Feed atinge o trecho que falta.

import { useRef, useState } from "react";
import type { Coordenada } from "@/app/lib/geo";
import { type PosicaoUsuario, useLocalizacao } from "@/app/lib/localizacao";
import { calcularRota, mensagemDeErro, type OcorrenciaRota, type Ponto } from "./api";
import {
  NAVEGACAO,
  calcularProgresso,
  descreverOcorrencia,
  ocorrenciasNoTrajeto,
  prepararRota,
  type ProgressoNavegacao,
  type RotaNavegacao,
} from "./navegacao";
import { useOcorrenciasDaCidade } from "./useOcorrencias";

export type EtapaNavegacao = "planejamento" | "navegacao" | "chegada";

export interface AvisoRota {
  tipo: "ocorrencia" | "desvio" | "erro";
  texto: string;
  // Ids das ocorrências que motivaram o recálculo (tipo "ocorrencia")
  ocorrencias?: string[];
}

interface Trajeto {
  origem: Ponto;
  destino: Ponto;
  destinoTexto: string;
}

interface Recalculo {
  aviso: AvisoRota;
  origemGps?: Coordenada;
}

// Consulta de reserva das ocorrências (o Realtime normalmente avisa antes)
const INTERVALO_OCORRENCIAS_NAVEGANDO_MS = 20000;
const INTERVALO_OCORRENCIAS_PARADO_MS = 60000;

// O grafo só tem nós nos cruzamentos, então o backend "cola" a origem no nó mais próximo.
// Quando a origem veio do GPS ou de um clique no mapa, o traçado começa nesse ponto exato:
// sem isso o marcador verde saltava do lugar escolhido para o nó do grafo ao calcular a rota.
const coordenadaDoPonto = (ponto: Ponto): Coordenada | undefined =>
  'lat' in ponto ? [ponto.lat, ponto.lng] : undefined;

/**
 * @param velocidadeSimulacao m/s para simular o deslocamento (página aberta com ?simular), ou null
 */
export function useNavegacao(cidade: string | null, velocidadeSimulacao: number | null) {
  const [rota, setRota] = useState<RotaNavegacao | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoRota | null>(null);
  const [etapa, setEtapa] = useState<EtapaNavegacao>("planejamento");
  const [progresso, setProgresso] = useState<ProgressoNavegacao | null>(null);

  // Descarta respostas antigas quando outro cálculo começa antes da resposta voltar
  const idRequisicao = useRef(0);
  const trajeto = useRef<Trajeto | null>(null);
  const rotaPlanejada = useRef<RotaNavegacao | null>(null);
  const leiturasForaDaRota = useRef(0);
  const ultimoRecalculo = useRef(0);
  const ultimaPosicao = useRef<PosicaoUsuario | null>(null);
  // Ocorrências que já provocaram recálculo (evita laço se o backend não conseguir evitá-las)
  const ocorrenciasTratadas = useRef(new Set<string>());

  const navegando = etapa === "navegacao";

  const { ocorrencias, atualizar: atualizarOcorrencias } = useOcorrenciasDaCidade(cidade, {
    intervaloMs: navegando ? INTERVALO_OCORRENCIAS_NAVEGANDO_MS : INTERVALO_OCORRENCIAS_PARADO_MS,
    aoAtualizar: verificarOcorrencias,
  });

  const { posicao, estado: estadoLocalizacao } = useLocalizacao({
    ativa: navegando,
    simulacao:
      navegando && rota && velocidadeSimulacao
        ? { coordenadas: rota.coordenadas, velocidade: velocidadeSimulacao }
        : null,
    aoAtualizar: handlePosicao,
  });

  // CÁLCULO E RECÁLCULO (num recálculo a rota atual continua na tela se der erro)
  async function executarCalculo(
    origem: Ponto,
    destino: Ponto,
    destinoTexto: string,
    recalculo: Recalculo | null,
  ) {
    if (!cidade) return;
    const id = ++idRequisicao.current;
    setCalculando(true);
    if (recalculo) setAviso(recalculo.aviso);
    else setErro(null);

    try {
      const resultado = await calcularRota(cidade, origem, destino);
      if (id !== idRequisicao.current) return;
      const nova = prepararRota(
        resultado,
        destinoTexto,
        recalculo?.origemGps ?? coordenadaDoPonto(origem),
      );
      setRota(nova);
      // O progresso antigo se refere à rota anterior: recalcula já sobre a nova
      leiturasForaDaRota.current = 0;
      setProgresso(
        recalculo?.origemGps && ultimaPosicao.current
          ? calcularProgresso(nova, ultimaPosicao.current)
          : null,
      );
      setErro(null);
      if (recalculo?.aviso.tipo === "desvio") setAviso(null);
      // Pega ocorrências publicadas enquanto a rota era calculada
      atualizarOcorrencias();
    } catch (err) {
      if (id !== idRequisicao.current) return;
      console.error("Erro ao calcular rota:", err);
      if (recalculo) {
        setAviso({ tipo: "erro", texto: `Não foi possível recalcular a rota: ${mensagemDeErro(err)}` });
      } else {
        setRota(null);
        setErro(mensagemDeErro(err));
      }
    } finally {
      if (id === idRequisicao.current) setCalculando(false);
    }
  }

  function recalcularDaPosicao(atual: PosicaoUsuario, aviso: AvisoRota) {
    const pedido = trajeto.current;
    if (!pedido) return;
    leiturasForaDaRota.current = 0;
    ultimoRecalculo.current = Date.now();
    const [lat, lng] = atual.coordenada;
    const origem: Ponto = atual.rumo === null ? { lat, lng } : { lat, lng, rumo: atual.rumo };
    executarCalculo(origem, pedido.destino, pedido.destinoTexto, {
      aviso,
      origemGps: atual.coordenada,
    });
  }

  // NAVEGAÇÃO: cada nova posição atualiza o progresso e decide chegada ou recálculo
  function handlePosicao(atual: PosicaoUsuario) {
    if (etapa !== "navegacao" || !rota) return;
    ultimaPosicao.current = atual;
    const novo = calcularProgresso(rota, atual);
    setProgresso(novo);

    if (novo.chegou) {
      idRequisicao.current++;
      setCalculando(false);
      setAviso(null);
      setEtapa("chegada");
      return;
    }

    leiturasForaDaRota.current = novo.foraDaRota ? leiturasForaDaRota.current + 1 : 0;
    const liberado = Date.now() - ultimoRecalculo.current >= NAVEGACAO.intervaloRecalculoMs;
    if (leiturasForaDaRota.current >= NAVEGACAO.leiturasForaDaRota && liberado && !calculando) {
      recalcularDaPosicao(atual, {
        tipo: "desvio",
        texto: "Você saiu da rota. Recalculando o trajeto...",
      });
    }
  }

  // OCORRÊNCIAS: uma ocorrência nova no trecho que falta recalcula a rota desviando dela
  function verificarOcorrencias(lista: OcorrenciaRota[]) {
    const pedido = trajeto.current;
    if (!rota || !pedido || calculando || etapa === "chegada") return;
    const novas = ocorrenciasNoTrajeto(lista, rota, navegando ? progresso : null).filter(
      (o) => !ocorrenciasTratadas.current.has(o.id),
    );
    if (novas.length === 0) return;

    novas.forEach((o) => ocorrenciasTratadas.current.add(o.id));
    const aviso: AvisoRota = {
      tipo: "ocorrencia",
      texto: `Nova ocorrência no trajeto: ${novas.map(descreverOcorrencia).join("; ")}.`,
      ocorrencias: novas.map((o) => o.id),
    };
    if (navegando && posicao) recalcularDaPosicao(posicao, aviso);
    else executarCalculo(pedido.origem, pedido.destino, pedido.destinoTexto, { aviso });
  }

  // AÇÕES DA PÁGINA
  const calcular = (origem: Ponto, destino: Ponto, destinoTexto: string) => {
    trajeto.current = { origem, destino, destinoTexto };
    ocorrenciasTratadas.current = new Set();
    setAviso(null);
    executarCalculo(origem, destino, destinoTexto, null);
  };

  const limpar = () => {
    idRequisicao.current++;
    trajeto.current = null;
    rotaPlanejada.current = null;
    setRota(null);
    setCalculando(false);
    setErro(null);
    setAviso(null);
    setProgresso(null);
    setEtapa("planejamento");
  };

  const iniciarNavegacao = () => {
    if (!rota) return;
    rotaPlanejada.current = rota;
    leiturasForaDaRota.current = 0;
    ultimoRecalculo.current = 0;
    ultimaPosicao.current = null;
    ocorrenciasTratadas.current = new Set();
    setProgresso(null);
    setAviso(null);
    setEtapa("navegacao");
  };

  // Volta ao planejamento com a rota planejada (e confere de novo as ocorrências nela)
  const encerrarNavegacao = () => {
    idRequisicao.current++;
    setCalculando(false);
    setProgresso(null);
    setAviso(null);
    setEtapa("planejamento");
    if (rotaPlanejada.current) setRota(rotaPlanejada.current);
    ocorrenciasTratadas.current = new Set();
    atualizarOcorrencias();
  };

  return {
    rota,
    calculando,
    erro,
    aviso,
    etapa,
    progresso,
    posicao,
    estadoLocalizacao,
    ocorrencias,
    calcular,
    limpar,
    iniciarNavegacao,
    encerrarNavegacao,
    dispensarAviso: () => setAviso(null),
  };
}
