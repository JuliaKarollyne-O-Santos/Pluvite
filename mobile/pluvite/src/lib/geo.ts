// Funções geométricas — mesma convenção do site (web/app/lib/geo.ts):
// coordenadas sempre como [lat, lng] e distâncias em metros.

export type Coordenada = [number, number];

const RAIO_TERRA = 6371000;
const RAD = Math.PI / 180;

export const distanciaMetros = ([lat1, lng1]: Coordenada, [lat2, lng2]: Coordenada) => {
  const dLat = (lat2 - lat1) * RAD;
  const dLng = (lng2 - lng1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA * Math.asin(Math.sqrt(a));
};

/** Projeção do ponto p no segmento a–b (plano local): fração t (0 = a, 1 = b) e distância até ele. */
const projetarNoSegmento = (p: Coordenada, a: Coordenada, b: Coordenada) => {
  const escalaLng = Math.cos(p[0] * RAD) * 111320;
  const escalaLat = 110540;
  const ax = (a[1] - p[1]) * escalaLng;
  const ay = (a[0] - p[0]) * escalaLat;
  const dx = (b[1] - a[1]) * escalaLng;
  const dy = (b[0] - a[0]) * escalaLat;
  const comprimento2 = dx * dx + dy * dy;
  const t = comprimento2 === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / comprimento2));
  const px = ax + t * dx;
  const py = ay + t * dy;
  return { t, distancia: Math.sqrt(px * px + py * py) };
};

/**
 * Onde a posição está sobre a linha da rota: índice do segmento mais próximo,
 * distância até a linha e metros que faltam até o fim.
 */
export const localizarNaRota = (posicao: Coordenada, linha: Coordenada[]) => {
  if (linha.length < 2) {
    return { segmento: 0, distanciaDaRota: 0, restante: 0 };
  }
  let melhor = { segmento: 0, distancia: Infinity, t: 0 };
  for (let i = 0; i < linha.length - 1; i++) {
    const { t, distancia } = projetarNoSegmento(posicao, linha[i], linha[i + 1]);
    if (distancia < melhor.distancia) melhor = { segmento: i, distancia, t };
  }
  const { segmento, t } = melhor;
  let restante = distanciaMetros(linha[segmento], linha[segmento + 1]) * (1 - t);
  for (let i = segmento + 1; i < linha.length - 1; i++) {
    restante += distanciaMetros(linha[i], linha[i + 1]);
  }
  return { segmento, distanciaDaRota: melhor.distancia, restante };
};

/** "850 m" / "3,4 km" */
export const formatarDistancia = (metros: number) =>
  metros < 1000
    ? `${Math.max(0, Math.round(metros / 10) * 10)} m`
    : `${(metros / 1000).toFixed(1).replace(".", ",")} km`;

/** "4 min" / "1 h 12 min" */
export const formatarDuracao = (segundos: number) => {
  const minutos = Math.max(1, Math.round(segundos / 60));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
};
