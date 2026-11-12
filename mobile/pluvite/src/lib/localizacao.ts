// LOCALIZAÇÃO (GPS) — permissão Android + leitura única + acompanhamento contínuo.
// Usado pela navegação em Rotas e pelo "usar minha localização" do Feed.

import { PermissionsAndroid, Platform } from "react-native";
import Geolocation, { type GeolocationResponse } from "@react-native-community/geolocation";

import type { Coordenada } from "./geo";

export interface PosicaoUsuario {
  coordenada: Coordenada;
  /** raio de incerteza (m) informado pelo GPS */
  precisao: number;
  /** direção do movimento (graus a partir do norte), quando o GPS informa */
  rumo: number | null;
  /** m/s */
  velocidade: number | null;
}

Geolocation.setRNConfiguration({
  skipPermissionRequests: true,
  authorizationLevel: "whenInUse",
  locationProvider: "auto",
});

const paraPosicao = ({ coords }: GeolocationResponse): PosicaoUsuario => ({
  coordenada: [coords.latitude, coords.longitude],
  precisao: coords.accuracy,
  rumo: coords.heading != null && coords.heading >= 0 ? coords.heading : null,
  velocidade: coords.speed != null && coords.speed >= 0 ? coords.speed : null,
});

/** Pede a permissão de localização (Android 6+). true = concedida. */
export async function pedirPermissaoLocalizacao(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const resultado = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: "Localização",
      message: "O Pluvite usa sua localização para traçar rotas seguras e marcar ocorrências.",
      buttonPositive: "Permitir",
      buttonNegative: "Agora não",
    },
  );
  return resultado === PermissionsAndroid.RESULTS.GRANTED;
}

/** Leitura única da posição atual. Lança Error com mensagem em português. */
export async function obterPosicaoAtual(): Promise<PosicaoUsuario> {
  if (!(await pedirPermissaoLocalizacao())) {
    throw new Error("Permita o acesso à localização nas configurações do Android.");
  }
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (posicao) => resolve(paraPosicao(posicao)),
      (erro) => {
        console.warn("[localizacao] Falha ao obter posição:", erro);
        reject(
          new Error(
            erro.code === 3
              ? "O GPS demorou para responder. Tente em um local aberto."
              : "Não foi possível obter sua localização. Verifique se o GPS está ligado.",
          ),
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });
}

/** Acompanha a posição até a função devolvida ser chamada. */
export function acompanharPosicao(
  aoAtualizar: (posicao: PosicaoUsuario) => void,
  aoFalhar: (mensagem: string) => void,
): () => void {
  const id = Geolocation.watchPosition(
    (posicao) => aoAtualizar(paraPosicao(posicao)),
    (erro) => {
      console.warn("[localizacao] Falha no acompanhamento:", erro);
      aoFalhar("Sinal de GPS perdido. Tentando novamente...");
    },
    { enableHighAccuracy: true, distanceFilter: 5, interval: 2000, fastestInterval: 1000 },
  );
  return () => Geolocation.clearWatch(id);
}
