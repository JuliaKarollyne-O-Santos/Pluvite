// Funções geométricas do front (mesma convenção do backend em app/backend/rotas/geo.js):
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

// Rumo (0–360°, sentido horário a partir do norte) de a para b
export const rumoEntre = ([lat1, lng1]: Coordenada, [lat2, lng2]: Coordenada) => {
  const y = Math.sin((lng2 - lng1) * RAD) * Math.cos(lat2 * RAD);
  const x =
    Math.cos(lat1 * RAD) * Math.sin(lat2 * RAD) -
    Math.sin(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.cos((lng2 - lng1) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
};

// Diferença entre rumos em (-180, 180]; positivo = virar à direita
export const diferencaRumo = (rumoAtual: number, rumoNovo: number) =>
  ((rumoNovo - rumoAtual + 540) % 360) - 180;

/**
 * Projeção do ponto p no segmento a–b (plano local em volta de p, suficiente para dezenas de
 * metros): ponto projetado, fração t do segmento (0 = a, 1 = b) e distância de p até ele.
 */
export const projetarNoSegmento = (p: Coordenada, a: Coordenada, b: Coordenada) => {
  const escalaLng = Math.cos(p[0] * RAD) * 111320;
  const escalaLat = 110540;
  const ax = (a[1] - p[1]) * escalaLng;
  const ay = (a[0] - p[0]) * escalaLat;
  const dx = (b[1] - a[1]) * escalaLng;
  const dy = (b[0] - a[0]) * escalaLat;
  const comprimento2 = dx * dx + dy * dy;
  const t = comprimento2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / comprimento2)) : 0;
  const ponto: Coordenada = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return { ponto, t, distancia: Math.hypot(ax + t * dx, ay + t * dy) };
};

// Distância acumulada do início da polilinha até cada ponto
export const distanciasAcumuladas = (pontos: Coordenada[]) => {
  const acumuladas = [0];
  for (let i = 1; i < pontos.length; i++) {
    acumuladas.push(acumuladas[i - 1] + distanciaMetros(pontos[i - 1], pontos[i]));
  }
  return acumuladas;
};

// Distância percorrida (ao longo da polilinha) até o ponto dela mais próximo de p
export const distanciaAoLongo = (pontos: Coordenada[], acumuladas: number[], p: Coordenada) => {
  let melhor = { distancia: Infinity, percorrido: 0 };
  for (let i = 0; i < pontos.length - 1; i++) {
    const { t, distancia } = projetarNoSegmento(p, pontos[i], pontos[i + 1]);
    if (distancia < melhor.distancia) {
      melhor = { distancia, percorrido: acumuladas[i] + t * (acumuladas[i + 1] - acumuladas[i]) };
    }
  }
  return melhor.percorrido;
};

// Ponto e rumo a `distancia` metros do início da polilinha
export const pontoNaDistancia = (pontos: Coordenada[], acumuladas: number[], distancia: number) => {
  let i = 0;
  while (i < pontos.length - 2 && acumuladas[i + 1] < distancia) i++;
  const trecho = acumuladas[i + 1] - acumuladas[i];
  const t = trecho > 0 ? Math.max(0, Math.min(1, (distancia - acumuladas[i]) / trecho)) : 1;
  const [a, b] = [pontos[i], pontos[i + 1]];
  const ponto: Coordenada = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return { ponto, rumo: rumoEntre(a, b) };
};
