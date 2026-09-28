// Funções geométricas usadas pelo roteamento. Coordenadas sempre como [lat, lng].

const RAIO_TERRA = 6371000;
const RAD = Math.PI / 180;

export const distanciaMetros = (lat1, lng1, lat2, lng2) => {
  const dLat = (lat2 - lat1) * RAD;
  const dLng = (lng2 - lng1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA * Math.asin(Math.sqrt(a));
};

export const distanciaPontos = ([lat1, lng1], [lat2, lng2]) => distanciaMetros(lat1, lng1, lat2, lng2);

/**
 * Distância (m) do ponto p ao segmento a–b. Usa projeção plana local em volta de p — o erro é
 * desprezível nas distâncias usadas aqui (dezenas a centenas de metros).
 */
export const distanciaPontoSegmento = ([lat, lng], [lat1, lng1], [lat2, lng2]) => {
  const escalaLng = Math.cos(lat * RAD) * 111320;
  const escalaLat = 110540;
  const ax = (lng1 - lng) * escalaLng, ay = (lat1 - lat) * escalaLat;
  const bx = (lng2 - lng) * escalaLng, by = (lat2 - lat) * escalaLat;
  const dx = bx - ax, dy = by - ay;
  const comprimento2 = dx * dx + dy * dy;
  const t = comprimento2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / comprimento2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
};

/**
 * Ponto da polilinha mais próximo de `p`, projetado sobre o segmento mais próximo.
 * Usado para levar o ponto publicado no Feed (que cai na calçada ou na esquina) para cima do
 * eixo da via, e assim o raio da ocorrência valer de fato N metros para cada lado.
 */
export const pontoMaisProximo = (coords, [lat, lng]) => {
  const escalaLng = Math.cos(lat * RAD) * 111320;
  const escalaLat = 110540;
  let melhor = coords[0];
  let menor = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const [lat1, lng1] = coords[i - 1];
    const [lat2, lng2] = coords[i];
    const ax = (lng1 - lng) * escalaLng, ay = (lat1 - lat) * escalaLat;
    const bx = (lng2 - lng) * escalaLng, by = (lat2 - lat) * escalaLat;
    const dx = bx - ax, dy = by - ay;
    const comprimento2 = dx * dx + dy * dy;
    const t = comprimento2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / comprimento2)) : 0;
    const distancia = Math.hypot(ax + t * dx, ay + t * dy);
    if (distancia < menor) {
      menor = distancia;
      melhor = [lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t];
    }
  }
  return melhor;
};

/**
 * Pedaços da polilinha que ficam a até `raio` metros de `centro`, cortando os segmentos na borda
 * do círculo. Uma aresta do grafo vai de cruzamento a cruzamento e pode ter quilômetros: isto
 * recorta dela só o trecho realmente afetado. Devolve uma lista de polilinhas — a via pode sair
 * e voltar ao círculo — ou [] se nada estiver dentro.
 */
export const recortarPorRaio = (coords, centro, raio) => {
  const [latCentro, lngCentro] = centro;
  const escalaLng = Math.cos(latCentro * RAD) * 111320;
  const escalaLat = 110540;
  // Geometria em metros com origem no centro: dentro do círculo ⇔ x² + y² ≤ raio²
  const plano = coords.map(([lat, lng]) => [(lng - lngCentro) * escalaLng, (lat - latCentro) * escalaLat]);
  const emT = (i, t) => [
    coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t,
    coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t,
  ];

  const partes = [];
  let atual = null;
  for (let i = 0; i < plano.length - 1; i++) {
    const [ax, ay] = plano[i];
    const [bx, by] = plano[i + 1];
    const dx = bx - ax, dy = by - ay;
    const a = dx * dx + dy * dy;
    if (a === 0) continue; // ponto repetido na geometria

    // |A + t·D|² = raio² → quanto do segmento cai dentro do círculo
    const b = 2 * (ax * dx + ay * dy);
    const c = ax * ax + ay * ay - raio * raio;
    const delta = b * b - 4 * a * c;
    if (delta <= 0) { atual = null; continue; }
    const raizDelta = Math.sqrt(delta);
    const t0 = Math.max(0, (-b - raizDelta) / (2 * a));
    const t1 = Math.min(1, (-b + raizDelta) / (2 * a));
    if (t0 >= t1) { atual = null; continue; }

    // Emenda no pedaço anterior quando este segmento começa onde aquele parou
    if (atual && t0 === 0) atual.push(emT(i, t1));
    else partes.push((atual = [emT(i, t0), emT(i, t1)]));
    if (t1 < 1) atual = null; // saiu do círculo: o que vier depois começa outro pedaço
  }
  return partes;
};

// Rumo (0–360°, sentido horário a partir do norte) entre dois pontos
export const rumo = ([lat1, lng1], [lat2, lng2]) => {
  const y = Math.sin((lng2 - lng1) * RAD) * Math.cos(lat2 * RAD);
  const x =
    Math.cos(lat1 * RAD) * Math.sin(lat2 * RAD) -
    Math.sin(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.cos((lng2 - lng1) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
};

// Diferença entre rumos em (-180, 180]; positivo = virar à direita
export const diferencaRumo = (rumoChegada, rumoSaida) =>
  ((rumoSaida - rumoChegada + 540) % 360) - 180;

// Ponto que fica a ~`base` metros de pontos[0] seguindo a lista (suaviza ruído de segmentos curtos)
export const pontoAFrente = (pontos, base) => {
  let acumulado = 0;
  for (let i = 1; i < pontos.length; i++) {
    acumulado += distanciaPontos(pontos[i - 1], pontos[i]);
    if (acumulado >= base) return pontos[i];
  }
  return pontos[pontos.length - 1];
};

/**
 * Raio (m) da circunferência que passa por três pontos consecutivos da geometria.
 * Devolve Infinity para trechos retos ou pontos próximos demais (< 2 m), que só geram ruído.
 */
export const raioCurvatura = (p0, p1, p2) => {
  const escalaLng = Math.cos(p1[0] * RAD) * 111320;
  const escalaLat = 110540;
  const ax = (p0[1] - p1[1]) * escalaLng, ay = (p0[0] - p1[0]) * escalaLat;
  const bx = (p2[1] - p1[1]) * escalaLng, by = (p2[0] - p1[0]) * escalaLat;
  const a = Math.hypot(ax, ay);
  const b = Math.hypot(bx, by);
  if (a < 2 || b < 2) return Infinity;
  const c = Math.hypot(ax - bx, ay - by);
  const dobroArea = Math.abs(ax * by - ay * bx);
  if (dobroArea < 1e-6) return Infinity;
  return (a * b * c) / (2 * dobroArea);
};
