// Registro do trajeto para o teste em campo (/Rotas?registrar): guarda o tempo previsto pela rota e
// as leituras do GPS durante a navegação e baixa tudo em JSON no fim. O arquivo é lido por
// app/backend/scripts/calibrar-tempos.js --registros, que compara o tempo previsto com o real.

import type { PosicaoUsuario } from "@/app/lib/localizacao";
import type { ProgressoNavegacao, RotaNavegacao } from "./navegacao";

export interface AmostraRegistro {
  t: number; // ms desde 1970 (Date.now())
  lat: number;
  lng: number;
  precisao: number;
  velocidade: number | null;
  restante: number; // m até o destino, pelo traçado
  tempoRestante: number; // s previstos até o destino
  foraDaRota: boolean;
}

export interface RegistroTrajeto {
  formato: "pluvite-registro-trajeto";
  versao: 1;
  cidade: string;
  destino: string;
  simulado: boolean; // ?simular: não serve para calibrar
  inicio: string;
  fim: string | null;
  chegou: boolean;
  previsto: { duracaoSegundos: number; distanciaMetros: number };
  // Arestas do grafo da rota seguida no início: permitem reavaliar o mesmo caminho com outros parâmetros
  arestas: number[];
  recalculos: { t: number; motivo: string; duracaoSegundos: number }[];
  amostras: AmostraRegistro[];
}

// Uma amostra por segundo basta para medir o tempo; o limite evita crescer sem fim se a aba ficar aberta
const INTERVALO_AMOSTRA_MS = 1000;
const MAXIMO_AMOSTRAS = 20000;

export const criarRegistro = (cidade: string, rota: RotaNavegacao, simulado: boolean): RegistroTrajeto => ({
  formato: "pluvite-registro-trajeto",
  versao: 1,
  cidade,
  destino: rota.destinoTexto,
  simulado,
  inicio: new Date().toISOString(),
  fim: null,
  chegou: false,
  previsto: { duracaoSegundos: rota.duracaoSegundos, distanciaMetros: rota.distanciaMetros },
  arestas: rota.arestas.map((aresta) => aresta.id),
  recalculos: [],
  amostras: [],
});

export const registrarAmostra = (
  registro: RegistroTrajeto,
  posicao: PosicaoUsuario,
  progresso: ProgressoNavegacao,
) => {
  const ultima = registro.amostras[registro.amostras.length - 1];
  const agora = Date.now();
  if (registro.amostras.length >= MAXIMO_AMOSTRAS || (ultima && agora - ultima.t < INTERVALO_AMOSTRA_MS)) return;
  registro.amostras.push({
    t: agora,
    lat: Number(posicao.coordenada[0].toFixed(6)),
    lng: Number(posicao.coordenada[1].toFixed(6)),
    precisao: Math.round(posicao.precisao),
    velocidade: posicao.velocidade === null ? null : Number(posicao.velocidade.toFixed(1)),
    restante: Math.round(progresso.restante),
    tempoRestante: Math.round(progresso.tempoRestante),
    foraDaRota: progresso.foraDaRota,
  });
};

export const encerrarRegistro = (registro: RegistroTrajeto, chegou: boolean) => {
  if (registro.fim) return;
  registro.fim = new Date().toISOString();
  registro.chegou = chegou;
};

export const baixarRegistro = (registro: RegistroTrajeto) => {
  const nome = `pluvite-trajeto-${registro.cidade}-${registro.inicio.slice(0, 16).replace(/[:T]/g, "-")}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(registro)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  // Revogar na hora pode cancelar o download em alguns navegadores
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
