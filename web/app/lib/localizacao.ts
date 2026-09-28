// Localização do usuário: leitura única (botões "usar minha localização") e acompanhamento
// contínuo para a navegação, com um modo de simulação para demonstrar sem sair do lugar.

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import {
  type Coordenada,
  distanciaAoLongo,
  distanciaMetros,
  distanciasAcumuladas,
  pontoNaDistancia,
  rumoEntre,
} from "@/app/lib/geo";

export interface PosicaoUsuario {
  coordenada: Coordenada;
  precisao: number; // raio de incerteza (m) informado pelo GPS
  rumo: number | null; // direção do movimento (graus a partir do norte)
  velocidade: number | null; // m/s
}

export type EstadoLocalizacao =
  | "desligada"
  | "buscando"
  | "ativa"
  | "negada"
  | "falha"
  | "indisponivel";

// Trajeto percorrido no modo simulação (velocidade em m/s)
export interface TrajetoSimulado {
  coordenadas: Coordenada[];
  velocidade: number;
}

// Parado, o GPS não informa rumo (ou informa ruído): o rumo passa a ser medido pelo deslocamento
const VELOCIDADE_MINIMA_RUMO_GPS = 1; // m/s
const DESLOCAMENTO_MINIMO_RUMO = 4; // m
const INTERVALO_SIMULACAO_MS = 1000;

const semAssinatura = () => () => {};
const temGeolocalizacao = () => "geolocation" in navigator;

// Leitura única da posição (ex.: origem da rota, local de uma ocorrência no Feed)
export const obterPosicaoAtual = () =>
  new Promise<Coordenada>((resolve, reject) => {
    if (!temGeolocalizacao()) {
      reject(new Error("Seu navegador não permite obter a localização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve([coords.latitude, coords.longitude]),
      reject,
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });

/**
 * Acompanha a posição enquanto `ativa`. Com `simulacao`, em vez do GPS o "veículo" percorre o
 * trajeto dado na velocidade dada (e continua do ponto mais próximo quando o trajeto muda).
 * `aoAtualizar` é chamado a cada nova posição — é onde a navegação reage (progresso, desvio).
 */
export function useLocalizacao({
  ativa,
  simulacao,
  aoAtualizar,
}: {
  ativa: boolean;
  simulacao: TrajetoSimulado | null;
  aoAtualizar: (posicao: PosicaoUsuario) => void;
}) {
  const [posicao, setPosicao] = useState<PosicaoUsuario | null>(null);
  const [falha, setFalha] = useState<"negada" | "falha" | null>(null);
  const anterior = useRef<PosicaoUsuario | null>(null);
  const suportada = useSyncExternalStore(semAssinatura, temGeolocalizacao, () => true);

  const receber = useEffectEvent((leitura: PosicaoUsuario) => {
    const ultima = anterior.current;
    let rumo = leitura.rumo;
    if (rumo === null && ultima) {
      rumo =
        distanciaMetros(ultima.coordenada, leitura.coordenada) >= DESLOCAMENTO_MINIMO_RUMO
          ? rumoEntre(ultima.coordenada, leitura.coordenada)
          : ultima.rumo;
    }
    const nova = { ...leitura, rumo };
    anterior.current = nova;
    setPosicao(nova);
    setFalha(null);
    aoAtualizar(nova);
  });

  // Ao desligar, a próxima navegação começa sem a posição antiga
  useEffect(() => {
    if (!ativa) return;
    return () => {
      anterior.current = null;
      setPosicao(null);
      setFalha(null);
    };
  }, [ativa]);

  // GPS DO APARELHO
  const simulando = simulacao !== null;
  useEffect(() => {
    if (!ativa || simulando || !temGeolocalizacao()) return;
    const id = navigator.geolocation.watchPosition(
      ({ coords }) =>
        receber({
          coordenada: [coords.latitude, coords.longitude],
          precisao: coords.accuracy,
          rumo:
            coords.heading !== null &&
            !Number.isNaN(coords.heading) &&
            (coords.speed ?? 0) >= VELOCIDADE_MINIMA_RUMO_GPS
              ? coords.heading
              : null,
          velocidade: coords.speed,
        }),
      // Timeout não encerra o acompanhamento: o navegador continua tentando
      (erro) => setFalha(erro.code === erro.PERMISSION_DENIED ? "negada" : "falha"),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [ativa, simulando]);

  // SIMULAÇÃO
  const coordenadasSimuladas = simulacao?.coordenadas ?? null;
  const velocidadeSimulada = simulacao?.velocidade ?? 0;
  useEffect(() => {
    if (!ativa || !coordenadasSimuladas || coordenadasSimuladas.length < 2) return;
    const acumuladas = distanciasAcumuladas(coordenadasSimuladas);
    const total = acumuladas[acumuladas.length - 1];
    // Depois de um recálculo, continua de onde o "veículo" estava, agora sobre o trajeto novo
    let percorrido = anterior.current
      ? distanciaAoLongo(coordenadasSimuladas, acumuladas, anterior.current.coordenada)
      : 0;

    const avancar = () => {
      const { ponto, rumo } = pontoNaDistancia(coordenadasSimuladas, acumuladas, percorrido);
      receber({ coordenada: ponto, precisao: 5, rumo, velocidade: velocidadeSimulada });
      percorrido = Math.min(total, percorrido + (velocidadeSimulada * INTERVALO_SIMULACAO_MS) / 1000);
    };
    const primeira = setTimeout(avancar, 0);
    const intervalo = setInterval(avancar, INTERVALO_SIMULACAO_MS);
    return () => {
      clearTimeout(primeira);
      clearInterval(intervalo);
    };
  }, [ativa, coordenadasSimuladas, velocidadeSimulada]);

  let estado: EstadoLocalizacao = "desligada";
  if (ativa) {
    if (!simulando && !suportada) estado = "indisponivel";
    else estado = falha ?? (posicao ? "ativa" : "buscando");
  }

  return { posicao: ativa ? posicao : null, estado };
}
