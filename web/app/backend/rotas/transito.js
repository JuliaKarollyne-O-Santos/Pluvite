import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { diferencaRumo, distanciaPontoSegmento, distanciaPontos, rumo } from './geo.js';
import { arestasProximas, normalizar } from './grafo.js';
import { PENALIDADE_BLOQUEIO } from './ocorrencias.js';

// A chave fica em web/app/backend/.env (ver SKILLS/dev-workflow), de qualquer pasta que o servidor
// seja iniciado. Variáveis já definidas no ambiente (Render, terminal) têm prioridade.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

/**
 * TRÂNSITO AO VIVO — TomTom Traffic API, Incident Details v5
 * https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/traffic-incidents/incident-details
 *
 * Uma consulta por cidade traz os incidentes atuais dentro dos limites do grafo: congestionamentos,
 * acidentes, interdições, obras, alagamentos. Cada um tem a geometria (LineString ou Point, em
 * [lng, lat], no sentido do tráfego afetado — de `from` para `to`) e, nos congestionamentos, o
 * atraso MEDIDO em relação ao fluxo livre (`delay`, s) ao longo da extensão (`length`, m).
 *
 * Diferente das ocorrências do Feed, que são relatos e mudam só a escolha do caminho:
 * - 'lentidao': o atraso medido é distribuído pelas arestas cobertas e ENTRA no tempo exibido
 *   (roteamento.js › tempoNaVia);
 * - 'bloqueio' (via fechada): o mesmo custo de bloqueio do Feed, só na busca;
 * - 'restricao' (faixa fechada, obra, acidente sem atraso informado): peso × fator, só na busca.
 *
 * Sem TOMTOM_API_KEY, com a cota do dia esgotada ou se a TomTom não responder, a rota é calculada
 * normalmente, sem trânsito ao vivo.
 */
export const TRANSITO = {
  url: 'https://api.tomtom.com/traffic/services/5/incidentDetails',
  // Plano gratuito: 2.500 consultas/mês da Traffic Incidents API (docs.tomtom.com/pricing, out/2026).
  // No máximo uma consulta por cidade a cada 10 min e 80 por dia (≈ 2.500 ÷ 31)
  validadeMs: 10 * 60 * 1000,
  limiteDiario: 80,
  esperaAposFalhaMs: 60 * 1000,
  tempoLimiteMs: 2500,
  areaMaximaKm2: 10000, // limite do bbox na API
  // Encaixe da geometria do incidente nas arestas do grafo (estimativa)
  distanciaEncaixe: 20, // m entre a linha do incidente e o eixo da aresta
  toleranciaRumo: 45, // graus: o incidente vale para um sentido da via
  passoAmostra: 15, // m entre os pontos verificados ao longo da linha
  raioPonto: 30, // m em volta de incidentes com geometria Point
  // Fator na busca para restrição sem atraso medido, por magnitudeOfDelay (0 desconhecida … 3 grave). Estimativa
  fatorRestricao: { 0: 1.5, 1: 1.2, 2: 1.5, 3: 2 },
};

// iconCategory da TomTom → nome mostrado no app
const CATEGORIAS = {
  0: 'Ocorrência de trânsito', 1: 'Acidente', 2: 'Neblina', 3: 'Condição perigosa', 4: 'Chuva',
  5: 'Gelo na pista', 6: 'Congestionamento', 7: 'Faixa interditada', 8: 'Via interditada', 9: 'Obras',
  10: 'Vento forte', 11: 'Alagamento', 14: 'Veículo quebrado',
};
const CATEGORIAS_DE_RESTRICAO = [1, 3, 7, 9, 11, 14];

// As descrições vêm em português de Portugal (pt-PT): as mais comuns, no termo usado no Brasil
const DESCRICOES_PT_BR = {
  'Encerrado/a': 'Via fechada',
  'Trabalhos na estrada': 'Obras na via',
  'Nova disposição de trabalhos na estrada': 'Mudança no trecho em obras',
  'Filas de trânsito': 'Fila de veículos',
};

const CAMPOS =
  '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,' +
  'events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,' +
  'timeValidity,probabilityOfOccurrence}}}';

export const transitoConfigurado = () => Boolean(process.env.TOMTOM_API_KEY);

/**
 * 'bloqueio' para via fechada (ou acidente/alagamento de duração indefinida — magnitude 4), 'lentidao'
 * quando há atraso medido, 'restricao' para o que dificulta sem atraso informado e null para avisos
 * meteorológicos sem atraso, que não mudam a rota.
 */
export const efeitoDoIncidente = ({ iconCategory, magnitudeOfDelay, delay }) => {
  if (iconCategory === 8 || (magnitudeOfDelay === 4 && [1, 11].includes(iconCategory))) return 'bloqueio';
  if (delay > 0) return 'lentidao';
  if ((magnitudeOfDelay >= 1 && magnitudeOfDelay <= 3) || CATEGORIAS_DE_RESTRICAO.includes(iconCategory)) {
    return 'restricao';
  }
  return null;
};

// ───── ENCAIXE NO GRAFO ─────

// Aresta mais próxima do ponto (até distanciaEncaixe) cujo trecho ali segue o sentido do incidente.
// O sentido separa as duas mãos da via e descarta as ruas que cruzam a linha.
const arestaNoSentido = (grafo, ponto, sentido) => {
  for (const { id } of arestasProximas(grafo, ponto[0], ponto[1], TRANSITO.distanciaEncaixe)) {
    const { coords } = grafo.arestas[id];
    let segmento = 1;
    let menor = Infinity;
    for (let k = 1; k < coords.length; k++) {
      const distancia = distanciaPontoSegmento(ponto, coords[k - 1], coords[k]);
      if (distancia < menor) {
        menor = distancia;
        segmento = k;
      }
    }
    const rumoAresta = rumo(coords[segmento - 1], coords[segmento]);
    if (Math.abs(diferencaRumo(sentido, rumoAresta)) <= TRANSITO.toleranciaRumo) return id;
  }
  return null;
};

// Map<idAresta, metros cobertos> amostrando a linha do incidente a cada passoAmostra metros
const cobrirLinha = (grafo, linha) => {
  const cobertura = new Map();
  for (let i = 1; i < linha.length; i++) {
    const [a, b] = [linha[i - 1], linha[i]];
    const comprimento = distanciaPontos(a, b);
    if (comprimento === 0) continue;
    const sentido = rumo(a, b);
    const passos = Math.max(1, Math.round(comprimento / TRANSITO.passoAmostra));
    for (let k = 0; k < passos; k++) {
      const t = (k + 0.5) / passos;
      const id = arestaNoSentido(grafo, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], sentido);
      if (id !== null) cobertura.set(id, (cobertura.get(id) ?? 0) + comprimento / passos);
    }
  }
  for (const [id, metros] of cobertura) cobertura.set(id, Math.min(metros, grafo.arestas[id].comprimento));
  return cobertura;
};

// Incidente pontual: a via mais próxima, nos dois sentidos (sem a linha, não há como saber qual)
const cobrirPonto = (grafo, [lat, lng]) => {
  const proximas = arestasProximas(grafo, lat, lng, TRANSITO.raioPonto);
  if (proximas.length === 0) return new Map();
  const maisProxima = grafo.arestas[proximas[0].id];
  const cobertura = new Map();
  for (const { id } of proximas) {
    const aresta = grafo.arestas[id];
    const mesmaVia = maisProxima.nome
      ? aresta.nome === maisProxima.nome
      : (aresta.de === maisProxima.de && aresta.para === maisProxima.para) ||
        (aresta.de === maisProxima.para && aresta.para === maisProxima.de);
    if (mesmaVia) cobertura.set(id, Math.min(aresta.comprimento, 2 * TRANSITO.raioPonto));
  }
  return cobertura;
};

/**
 * Converte um incidente da TomTom no formato usado pelo roteamento e pelo mapa, ou null se ele não
 * muda a rota ou não cai em nenhuma via do grafo. Em 'lentidao', `atrasos` reparte o atraso medido
 * entre as arestas na proporção da extensão coberta de cada uma.
 */
export const mapearIncidente = (grafo, incidente) => {
  const propriedades = incidente?.properties ?? {};
  const efeito = efeitoDoIncidente(propriedades);
  const { type: tipoGeometria, coordinates: coordenadas } = incidente?.geometry ?? {};
  if (!efeito || !Array.isArray(coordenadas)) return null;

  let linha = [];
  if (tipoGeometria === 'LineString') linha = coordenadas.map(([lng, lat]) => [lat, lng]);
  else if (tipoGeometria === 'Point') linha = [[coordenadas[1], coordenadas[0]]];
  if (linha.length === 0 || linha.some((p) => !p.every(Number.isFinite))) return null;

  const cobertura = linha.length === 1 ? cobrirPonto(grafo, linha[0]) : cobrirLinha(grafo, linha);
  if (cobertura.size === 0) return null;

  let atrasos = null;
  if (efeito === 'lentidao') {
    const coberto = [...cobertura.values()].reduce((soma, metros) => soma + metros, 0);
    atrasos = new Map([...cobertura].map(([id, metros]) => [id, (propriedades.delay * metros) / coberto]));
  }

  const descricoes = (propriedades.events ?? [])
    .map((evento) => evento?.description)
    .filter(Boolean)
    .map((descricao) => DESCRICOES_PT_BR[descricao] ?? descricao);
  return {
    id: String(propriedades.id ?? `${tipoGeometria}:${linha[0].join(',')}`),
    tipo: CATEGORIAS[propriedades.iconCategory] ?? CATEGORIAS[0],
    descricao: [...new Set(descricoes)].join(' · ') || null,
    efeito,
    gravidade: propriedades.magnitudeOfDelay ?? 0,
    atrasoSegundos: efeito === 'lentidao' ? Math.round(propriedades.delay) : null,
    extensao: Math.round(propriedades.length ?? 0) || null,
    de: propriedades.from ?? null,
    ate: propriedades.to ?? null,
    inicio: propriedades.startTime ?? null,
    fim: propriedades.endTime ?? null,
    arestas: [...cobertura.keys()],
    atrasos,
    trecho: linha,
  };
};

// ───── CONSULTA À TOMTOM (com cache e cota) ─────

const cache = new Map(); // cidade → { buscadoEm, incidentes, mapeados: WeakMap<grafo, []> }
const tentativas = new Map(); // cidade → { emAndamento, proximaTentativa }
const cota = { dia: '', consultas: 0 };

const dentroDaCota = () => {
  const hoje = new Date().toISOString().slice(0, 10);
  if (cota.dia !== hoje) Object.assign(cota, { dia: hoje, consultas: 0 });
  return cota.consultas < TRANSITO.limiteDiario;
};

const areaKm2 = ([[minLat, minLng], [maxLat, maxLng]]) =>
  ((maxLat - minLat) * 110.54) * ((maxLng - minLng) * 111.32 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));

// A URL leva a chave: nunca registrar a URL nem repassar o erro bruto do fetch
const consultarTomTom = async ([[minLat, minLng], [maxLat, maxLng]]) => {
  const parametros = new URLSearchParams({
    key: process.env.TOMTOM_API_KEY,
    bbox: [minLng, minLat, maxLng, maxLat].join(','),
    fields: CAMPOS,
    language: 'pt-PT', // a API não tem pt-BR (responde HTTP 400 "Unsupported language parameter value")
    timeValidityFilter: 'present',
  });
  let resposta;
  try {
    resposta = await fetch(`${TRANSITO.url}?${parametros}`, {
      headers: { 'Accept-Encoding': 'gzip' },
      signal: AbortSignal.timeout(TRANSITO.tempoLimiteMs),
    });
  } catch (err) {
    throw new Error(err?.name === 'TimeoutError' ? 'sem resposta da TomTom no tempo limite' : 'falha de rede ao consultar a TomTom');
  }
  if (!resposta.ok) throw new Error(`TomTom respondeu HTTP ${resposta.status}`);
  const { incidents } = await resposta.json();
  return (incidents ?? []).filter((incidente) => incidente?.properties?.probabilityOfOccurrence !== 'improbable');
};

// Resultado mais recente da cidade, consultando de novo quando venceu (respeitando cota e falhas)
const incidentesDaCidade = async (cidade, limites) => {
  const atual = cache.get(cidade);
  if (atual && Date.now() - atual.buscadoEm < TRANSITO.validadeMs) return atual;

  const tentativa = tentativas.get(cidade) ?? {};
  if (tentativa.emAndamento) return tentativa.emAndamento;
  if (Date.now() < (tentativa.proximaTentativa ?? 0) || !dentroDaCota()) return atual ?? null;
  if (areaKm2(limites) > TRANSITO.areaMaximaKm2) return null;

  cota.consultas++;
  tentativa.emAndamento = consultarTomTom(limites)
    .then((incidentes) => {
      const novo = { buscadoEm: Date.now(), incidentes, mapeados: new WeakMap() };
      cache.set(cidade, novo);
      return novo;
    })
    .catch((err) => {
      console.error(`Trânsito ao vivo indisponível em ${cidade}: ${err.message}`);
      tentativa.proximaTentativa = Date.now() + TRANSITO.esperaAposFalhaMs;
      return atual ?? null; // último resultado, mesmo vencido (o front mostra o horário)
    })
    .finally(() => {
      tentativa.emAndamento = null;
    });
  tentativas.set(cidade, tentativa);
  return tentativa.emAndamento;
};

/**
 * Trânsito ao vivo da cidade já encaixado no grafo:
 * - null quando TOMTOM_API_KEY não está configurada (o front não mostra nada);
 * - { disponivel: false } quando está configurada mas não há dado (falha, cota);
 * - { disponivel: true, atualizadoEm, incidentes } caso contrário.
 */
export const obterTransito = async (cidade, grafo) => {
  if (!transitoConfigurado()) return null;
  const resultado = await incidentesDaCidade(normalizar(cidade), grafo.limites);
  if (!resultado) return { disponivel: false, atualizadoEm: null, incidentes: [] };
  if (!resultado.mapeados.has(grafo)) {
    resultado.mapeados.set(grafo, resultado.incidentes.map((i) => mapearIncidente(grafo, i)).filter(Boolean));
  }
  return {
    disponivel: true,
    atualizadoEm: new Date(resultado.buscadoEm).toISOString(),
    incidentes: resultado.mapeados.get(grafo),
  };
};

// ───── USO NO CÁLCULO DA ROTA ─────

/**
 * Soma os bloqueios e restrições do trânsito às `penalidades` do Feed (o Map é alterado) e devolve
 * Map<idAresta, segundos> com os atrasos medidos, consumido por buscarCaminho e avaliarCaminho.
 */
export const aplicarTransito = (transito, penalidades) => {
  const atrasos = new Map();
  for (const incidente of transito?.incidentes ?? []) {
    if (incidente.efeito === 'lentidao') {
      for (const [id, segundos] of incidente.atrasos) atrasos.set(id, (atrasos.get(id) ?? 0) + segundos);
      continue;
    }
    for (const id of incidente.arestas) {
      const atual = penalidades.get(id) ?? { fator: 1, tempo: 0, distancia: 0 };
      if (incidente.efeito === 'bloqueio') {
        atual.tempo = PENALIDADE_BLOQUEIO.tempo;
        atual.distancia = PENALIDADE_BLOQUEIO.distancia;
      } else {
        atual.fator = Math.max(atual.fator, TRANSITO.fatorRestricao[incidente.gravidade] ?? TRANSITO.fatorRestricao[0]);
      }
      penalidades.set(id, atual);
    }
  }
  return atrasos;
};

const resumirIncidente = ({ id, tipo, descricao, efeito, atrasoSegundos, extensao, de, ate, inicio, fim, trecho }) => ({
  id, tipo, descricao, efeito, atrasoSegundos, extensao, de, ate, inicio, fim, trecho,
});

const incidentesNoCaminho = (incidentes, caminho) => {
  const noCaminho = new Set(caminho);
  return incidentes.filter((incidente) => incidente.arestas.some((id) => noCaminho.has(id)));
};

/**
 * Trânsito de um caminho para a resposta: `naRota` (o caminho passa por eles), `evitados` (estavam no
 * caminho que seria escolhido sem ocorrências nem trânsito) e o atraso medido que entrou no tempo.
 */
export const transitoDaRota = (transito, caminho, caminhoBase, atrasoSegundos) => {
  if (!transito) return null;
  const naRota = incidentesNoCaminho(transito.incidentes, caminho);
  const idsNaRota = new Set(naRota.map((incidente) => incidente.id));
  const evitados = incidentesNoCaminho(transito.incidentes, caminhoBase).filter((i) => !idsNaRota.has(i.id));
  return {
    disponivel: transito.disponivel,
    fonte: 'TomTom',
    atualizadoEm: transito.atualizadoEm,
    atrasoSegundos: Math.round(atrasoSegundos ?? 0),
    naRota: naRota.map(resumirIncidente),
    evitados: evitados.map(resumirIncidente),
  };
};
