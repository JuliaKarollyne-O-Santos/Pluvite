import { readFile, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { distanciaMetros, distanciaPontoSegmento, pontoAFrente, rumo } from './geo.js';
import {
  PARAMETROS,
  fatorRampa,
  grupoDaVia,
  hierarquia,
  limiteDaVia,
  semAsfalto,
  tempoPerfilVelocidade,
  velocidadeOperacao,
} from './modeloTempo.js';

// Grafos gerados por Rotas/gerar_grafos.py (OSM + elevação SRTM) na raiz do repositório
const PASTA_ROTAS =
  process.env.ROTAS_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../Rotas');

// Guarda poucos grafos na memória: o de São José dos Campos sozinho tem dezenas de MB
const LIMITE_CACHE = 4;
const cacheGrafos = new Map();

// Distância usada para medir a direção na chegada/saída de uma via
const BASE_RUMO = 25;
// Área urbana: janela de ~1,5 km (célula de ~500 m + vizinhas) com pelo menos N interseções
// (estimativa para escolher entre o limite urbano e o rural do CTB quando a via não tem
// maxspeed). A janela evita classificar como rural avenidas com poucos cruzamentos.
const TAMANHO_CELULA_URBANA = 0.005;
const INTERSECOES_AREA_URBANA = 30;
const TAMANHO_CELULA_SEMAFORO = 0.0005;
// Grade (~220 m) do índice espacial de arestas usado para achar as vias perto de um ponto
const TAMANHO_CELULA_ARESTAS = 0.002;

// Remove acentos e maiúsculas — "São José dos Campos" e "sao_jose_dos_campos" viram a mesma chave
export const normalizar = (texto) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_]+/g, ' ').trim();

const primeiro = (valor) => (Array.isArray(valor) ? valor[0] : valor);

// "LINESTRING (lng lat, lng lat, ...)" → [[lat, lng], ...]
const lerGeometria = (wkt) => {
  const miolo = wkt.slice(wkt.indexOf('(') + 1, wkt.lastIndexOf(')'));
  return miolo.split(',').map((par) => {
    const [lng, lat] = par.trim().split(/\s+/).map(Number);
    return [lat, lng];
  });
};

/**
 * Mapa "nome normalizado da cidade" → arquivo do grafo, montado a partir da pasta.
 */
let indiceArquivos = null;
export const obterIndiceArquivos = async () => {
  if (indiceArquivos) return indiceArquivos;
  const arquivos = await readdir(PASTA_ROTAS);
  indiceArquivos = new Map(
    arquivos
      .filter((arq) => arq.endsWith('_graph.json'))
      .map((arq) => [normalizar(arq.replace('_graph.json', '')), arq]),
  );
  return indiceArquivos;
};

const chaveCelula = (lat, lng, tamanho) => `${Math.floor(lat / tamanho)}:${Math.floor(lng / tamanho)}`;

const vizinhosDaCelula = (lat, lng, tamanho) => {
  const li = Math.floor(lat / tamanho);
  const lj = Math.floor(lng / tamanho);
  const chaves = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) chaves.push(`${li + i}:${lj + j}`);
  return chaves;
};

// Agrupa semáforos próximos (mesma interseção) e marca nós de cruzamento vizinhos a semáforos
const processarSemaforos = (nos) => {
  const raio = PARAMETROS.semaforo.raioAgrupamento;
  const grade = new Map();
  const semaforos = [...nos.entries()].filter(([, no]) => no.semaforo);
  for (const [id, no] of semaforos) {
    const chave = chaveCelula(no.lat, no.lng, TAMANHO_CELULA_SEMAFORO);
    if (!grade.has(chave)) grade.set(chave, []);
    grade.get(chave).push(id);
  }
  const proximos = (no) =>
    vizinhosDaCelula(no.lat, no.lng, TAMANHO_CELULA_SEMAFORO)
      .flatMap((chave) => grade.get(chave) ?? [])
      .filter((id) => {
        const outro = nos.get(id);
        return distanciaMetros(no.lat, no.lng, outro.lat, outro.lng) <= raio;
      });

  // União simples: cada semáforo herda o menor id de agrupamento entre os vizinhos
  const pai = new Map(semaforos.map(([id]) => [id, id]));
  const raiz = (id) => (pai.get(id) === id ? id : raiz(pai.get(id)));
  for (const [id, no] of semaforos) {
    for (const outro of proximos(no)) pai.set(raiz(outro), raiz(id));
  }
  for (const [id, no] of semaforos) no.agrupamentoSemaforo = raiz(id);

  for (const no of nos.values()) {
    if (no.grau >= 3 && !no.semaforo && proximos(no).length > 0) no.pertoDeSemaforo = true;
  }
};

const montarGrafo = (bruto) => {
  const nos = new Map();
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  const intersecoesPorCelula = new Map();

  for (const no of bruto.nodes) {
    const tipo = no.highway ?? null;
    const direcao = no['traffic_signals:direction'] ?? no.direction;
    nos.set(no.id, {
      lat: no.y,
      lng: no.x,
      elevacao: no.elevacao ?? null,
      grau: no.street_count ?? 2,
      tipo,
      direcao: ['forward', 'backward', 'both'].includes(direcao) ? direcao : null,
      semaforo: tipo === 'traffic_signals' || no.crossing === 'traffic_signals',
      travessiaSemaforizada: tipo === 'crossing' && no.crossing === 'traffic_signals',
      redutor: no.traffic_calming && no.traffic_calming !== 'no' ? no.traffic_calming : undefined,
      passagemNivel: no.railway === 'level_crossing' || tipo === 'level_crossing',
      rankMax: 0,
      rankMin: Infinity,
    });
    minLat = Math.min(minLat, no.y); maxLat = Math.max(maxLat, no.y);
    minLng = Math.min(minLng, no.x); maxLng = Math.max(maxLng, no.x);
    if ((no.street_count ?? 0) >= 3) {
      const chave = chaveCelula(no.y, no.x, TAMANHO_CELULA_URBANA);
      intersecoesPorCelula.set(chave, (intersecoesPorCelula.get(chave) ?? 0) + 1);
    }
  }

  const ehUrbano = (no) =>
    vizinhosDaCelula(no.lat, no.lng, TAMANHO_CELULA_URBANA)
      .reduce((soma, chave) => soma + (intersecoesPorCelula.get(chave) ?? 0), 0) >= INTERSECOES_AREA_URBANA;

  processarSemaforos(nos);

  const arestas = [];
  const saidas = new Map();
  const nosPorRua = new Map();
  const arestasPorRua = new Map();
  let velocidadeMaximaMs = 0;

  for (const bruta of bruto.edges ?? bruto.links) {
    const origem = nos.get(bruta.source);
    const destino = nos.get(bruta.target);
    if (!origem || !destino) continue;

    let coords = bruta.geometry
      ? lerGeometria(bruta.geometry)
      : [[origem.lat, origem.lng], [destino.lat, destino.lng]];
    // Garante que a geometria vá da origem para o destino da aresta
    const [pLat, pLng] = coords[0];
    if (distanciaMetros(pLat, pLng, destino.lat, destino.lng) < distanciaMetros(pLat, pLng, origem.lat, origem.lng)) {
      coords = coords.reverse();
    }

    const urbano = ehUrbano(origem) || ehUrbano(destino);
    const { limite, fonte } = limiteDaVia(bruta, urbano);
    const velocidadeKmh = velocidadeOperacao(bruta, limite);
    if (velocidadeKmh <= 0) continue; // smoothness=impassable

    const perfil = tempoPerfilVelocidade(coords, velocidadeKmh, urbano);
    const rampa = fatorRampa(bruta.length, bruta.subida, bruta.descida);
    const rank = hierarquia(bruta.highway);
    const nomes = [bruta.name].flat().filter(Boolean);
    const juncao = primeiro(bruta.junction);

    const aresta = {
      id: arestas.length,
      de: bruta.source,
      para: bruta.target,
      comprimento: bruta.length,
      nome: nomes[0] ?? null,
      coords,
      classe: String(primeiro(bruta.highway)),
      grupo: grupoDaVia(bruta.highway),
      rank,
      limite,
      fonteLimite: fonte,
      velocidadeKmh,
      velocidadeMs: velocidadeKmh / 3.6,
      // Tempo em fluxo livre: perfil com curvas × efeito da rampa
      tempoLivre: perfil.tempo * rampa.fator,
      velocidadeMinimaCurva: perfil.velocidadeMinimaCurva,
      inclinacao: rampa.inclinacao,
      subida: bruta.subida ?? 0,
      descida: bruta.descida ?? 0,
      semAsfalto: semAsfalto(bruta.surface),
      pedagio: primeiro(bruta.toll) === 'yes',
      rotatoria: juncao === 'roundabout' || juncao === 'circular',
      invertida: Boolean(primeiro(bruta.reversed)),
      urbano,
      rumoInicio: rumo(coords[0], pontoAFrente(coords, BASE_RUMO)),
      rumoFim: rumo(pontoAFrente([...coords].reverse(), BASE_RUMO), coords[coords.length - 1]),
      agrupamentoOrigem: origem.agrupamentoSemaforo,
    };
    arestas.push(aresta);
    velocidadeMaximaMs = Math.max(velocidadeMaximaMs, aresta.velocidadeMs);

    if (!saidas.has(aresta.de)) saidas.set(aresta.de, []);
    saidas.get(aresta.de).push(aresta.id);

    for (const no of [origem, destino]) {
      no.rankMax = Math.max(no.rankMax, rank);
      no.rankMin = Math.min(no.rankMin, rank);
    }
    for (const nome of nomes) {
      if (!nosPorRua.has(nome)) nosPorRua.set(nome, new Set());
      nosPorRua.get(nome).add(aresta.de).add(aresta.para);
      if (!arestasPorRua.has(nome)) arestasPorRua.set(nome, []);
      arestasPorRua.get(nome).push(aresta.id);
    }
  }

  return {
    nos,
    arestas,
    saidas,
    nosPorRua,
    arestasPorRua,
    velocidadeMaximaMs,
    temElevacao: bruto.nodes.some((no) => no.elevacao != null),
    ruas: [...nosPorRua.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    limites: [[minLat, minLng], [maxLat, maxLng]],
  };
};

// Índice espacial das arestas (célula da grade → ids), montado na primeira consulta de cada grafo
const indicesEspaciais = new WeakMap();

const indiceEspacial = (grafo) => {
  let indice = indicesEspaciais.get(grafo);
  if (indice) return indice;
  indice = new Map();
  for (const aresta of grafo.arestas) {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const [lat, lng] of aresta.coords) {
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    }
    for (let i = Math.floor(minLat / TAMANHO_CELULA_ARESTAS); i <= Math.floor(maxLat / TAMANHO_CELULA_ARESTAS); i++) {
      for (let j = Math.floor(minLng / TAMANHO_CELULA_ARESTAS); j <= Math.floor(maxLng / TAMANHO_CELULA_ARESTAS); j++) {
        const chave = `${i}:${j}`;
        if (!indice.has(chave)) indice.set(chave, []);
        indice.get(chave).push(aresta.id);
      }
    }
  }
  indicesEspaciais.set(grafo, indice);
  return indice;
};

/**
 * Arestas cuja geometria passa a até `raio` metros do ponto, da mais próxima para a mais distante:
 * [{ id, distancia }].
 */
export const arestasProximas = (grafo, lat, lng, raio) => {
  const indice = indiceEspacial(grafo);
  const dLat = raio / 110540;
  const dLng = raio / (111320 * Math.cos((lat * Math.PI) / 180));
  const vistas = new Set();
  const proximas = [];
  for (let i = Math.floor((lat - dLat) / TAMANHO_CELULA_ARESTAS); i <= Math.floor((lat + dLat) / TAMANHO_CELULA_ARESTAS); i++) {
    for (let j = Math.floor((lng - dLng) / TAMANHO_CELULA_ARESTAS); j <= Math.floor((lng + dLng) / TAMANHO_CELULA_ARESTAS); j++) {
      for (const id of indice.get(`${i}:${j}`) ?? []) {
        if (vistas.has(id)) continue;
        vistas.add(id);
        const { coords } = grafo.arestas[id];
        let menor = Infinity;
        for (let k = 1; k < coords.length; k++) {
          menor = Math.min(menor, distanciaPontoSegmento([lat, lng], coords[k - 1], coords[k]));
        }
        if (menor <= raio) proximas.push({ id, distancia: menor });
      }
    }
  }
  return proximas.sort((a, b) => a.distancia - b.distancia);
};

export const carregarGrafo = async (cidade) => {
  const indice = await obterIndiceArquivos();
  const arquivo = indice.get(normalizar(cidade));
  if (!arquivo) return null;

  if (!cacheGrafos.has(arquivo)) {
    // Guarda a Promise para que requisições simultâneas não leiam o mesmo arquivo duas vezes
    const promessa = readFile(path.join(PASTA_ROTAS, arquivo), 'utf-8').then((texto) =>
      montarGrafo(JSON.parse(texto)),
    );
    promessa.catch(() => cacheGrafos.delete(arquivo));
    cacheGrafos.set(arquivo, promessa);
    if (cacheGrafos.size > LIMITE_CACHE) {
      cacheGrafos.delete(cacheGrafos.keys().next().value);
    }
  }
  return cacheGrafos.get(arquivo);
};
