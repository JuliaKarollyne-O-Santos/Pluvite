/**
 * MODELO DE TEMPO DE VIAGEM DO PLUVITE
 * ====================================
 * Requisito do projeto (ver CLAUDE.md e SKILLS/rotas-tempo-viagem): o tempo estimado de uma
 * rota NÃO é comprimento ÷ limite de velocidade. Ele soma:
 *
 *   1. Deslocamento em cada via — velocidade de operação (limite × fluxo livre, limitada pelo
 *      pavimento), perfil de velocidade nas curvas e efeito da rampa (subida/descida).
 *   2. Atrasos nos nós — semáforos (Webster/HCM), PARE, dê a preferência, cruzamentos sem
 *      sinalização (hierarquia viária e preferência à direita do CTB), rotatórias, lombadas,
 *      travessias de pedestres e passagens de nível.
 *   3. Conversões — custo por ângulo (curva sigmoide do OSRM) e retorno.
 *   4. Partida e chegada — aceleração inicial e frenagem final.
 *   5. Horário de pico — multiplicadores por classe de via nas janelas da CET-SP.
 *
 * Todo número abaixo indica a fonte. "Estimativa" = valor calibrável sem medição local:
 * ajuste aqui (e só aqui) quando houver dados de campo, e registre a fonte no comentário.
 */

import { raioCurvatura, distanciaPontos } from './geo.js';

const KMH = 1 / 3.6; // km/h → m/s

export const PARAMETROS = {
  // Motoristas trafegam abaixo do limite em fluxo livre — OSRM car.lua (speed_reduction = 0,8)
  fatorFluxoLivre: 0.8,
  // Aceleração média de carro de passeio a partir da parada — ITE Traffic Engineering Handbook
  aceleracao: 1.5, // m/s²
  // Desaceleração confortável — AASHTO "Green Book" (3,4 m/s²)
  desaceleracao: 3.4, // m/s²
  gravidade: 9.81,

  // Velocidade em curva v = √(g·R·(e + f)) — AASHTO Green Book (superelevação e, atrito lateral f)
  curva: { superelevacaoUrbana: 0.04, superelevacaoRural: 0.06, atritoLateral: 0.15 },

  // Rampa: carros de passeio praticamente não perdem velocidade abaixo de ~4% (HCM);
  // coeficientes acima disso são estimativa
  rampa: {
    limiteSubida: 4, perdaPorPontoSubida: 0.035, fatorMinimoSubida: 0.55,
    limiteDescida: 6, perdaPorPontoDescida: 0.025, fatorMinimoDescida: 0.7,
    comprimentoMinimo: 60, // m — abaixo disso o ruído do SRTM (30 m) domina
    inclinacaoMaxima: 30, // % — teto contra ruído
  },

  // Semáforo — atraso uniforme de Webster (1958), usado no HCM:
  // d = 0,5·C·(1 − g/C)² / (1 − X·g/C). Ciclo típico: Manual Brasileiro de Sinalização
  // Semafórica (CONTRAN) cita 30–120 s; 90 s e as frações de verde são estimativa.
  semaforo: {
    ciclo: 90,
    verdeViaPrincipal: 0.55,
    verdeViaSecundaria: 0.4,
    verdeTravessiaPedestre: 0.7,
    saturacaoForaPico: 0.7,
    saturacaoPico: 0.9,
    raioAgrupamento: 40, // m — semáforos da mesma interseção (pistas duplas) contam uma vez
  },

  // Conversões — OSRM car.lua (turn_penalty 7,5 s, turn_bias 1,075 p/ mão direita, u_turn 20 s)
  conversao: { penalidade: 7.5, vies: 1.075, retorno: 20, anguloRetorno: 170, anguloManobra: 30 },

  // Cruzamentos sem semáforo (esperas são estimativa compatível com HCM TWSC nível A: < 10 s)
  cruzamento: {
    velocidadeCedendo: 10, // km/h ao ceder a preferência vindo da via secundária
    esperaDireita: 2, esperaCruzandoOuEsquerda: 4, // s aguardando brecha
    velocidadePreferenciaDireita: 20, esperaPreferenciaDireita: 1, // CTB art. 29, III, "c"
    esperaEsquerdaNaPrincipal: 2, // cruzar o fluxo oposto (mão direita)
    comprimentoMinimoAproximacao: 25, // m — trechos menores estão "dentro" do cruzamento
  },
  // PARE: parada total obrigatória (CTB art. 208) + observação
  parada: { pausa: 2 },
  darPreferencia: { velocidade: 15 },
  rotatoria: { velocidadeEntrada: 25, espera: 2.5 }, // estimativa (HCM rotatória nível A)
  miniRotatoria: { velocidade: 20, espera: 1.5 },
  // Passagem de nível: parar antes de transpor linha férrea é obrigatório — CTB art. 212
  passagemNivel: { pausa: 2 },
  travessiaPedestre: { espera: 1 }, // estimativa: chance de ceder a pedestre

  // Redutores de velocidade — ondulação tipo B ≤ 20 km/h e tipo A ≤ 30 km/h (CONTRAN Res. 600/2016)
  redutores: {
    bump: 20, hump: 20, yes: 20, table: 30, cushion: 30,
    chicane: 30, choker: 30, island: 30, dip: 30, rumble_strip: null,
  },

  // Horário de pico: janelas usadas pela CET-SP nos boletins de lentidão (seg–sex 7h–10h e
  // 17h–20h). Multiplicadores de tempo por classe são estimativa — substituir por dados reais
  // de tráfego (ex.: Waze for Cities/TomTom) quando disponíveis.
  pico: {
    janelas: [[7, 10], [17, 20]],
    multiplicador: { rodovia: 1.25, arterial: 1.45, local: 1.1 },
  },

  velocidadeMinima: 5, // km/h
};

// Limites legais por classe — CTB art. 61 (Lei 9.503/97, redação da Lei 13.281/2016):
// urbano: trânsito rápido 80, arterial 60, coletora 40, local 30;
// rural: rodovia pista dupla 110, pista simples 100, estrada 60.
// Alças (links): velocidades do OSRM car.lua. living_street/service: estimativa.
const LIMITE_POR_CLASSE = {
  motorway: { urbano: 80, rural: 110 },
  trunk: { urbano: 80, rural: 100 },
  primary: { urbano: 60, rural: 100 },
  secondary: { urbano: 60, rural: 100 },
  tertiary: { urbano: 40, rural: 60 },
  unclassified: { urbano: 30, rural: 60 },
  residential: { urbano: 30, rural: 30 },
  road: { urbano: 30, rural: 60 },
  motorway_link: { urbano: 45, rural: 45 },
  trunk_link: { urbano: 40, rural: 40 },
  primary_link: { urbano: 30, rural: 30 },
  secondary_link: { urbano: 25, rural: 25 },
  tertiary_link: { urbano: 20, rural: 20 },
  living_street: { urbano: 20, rural: 20 },
  service: { urbano: 20, rural: 20 },
};

// Hierarquia viária usada para decidir quem tem a preferência nos cruzamentos
const HIERARQUIA = {
  motorway: 7, trunk: 6, primary: 5, secondary: 4, tertiary: 3,
  unclassified: 2, road: 2, residential: 1, living_street: 0, service: 0,
};

// Tetos de velocidade (km/h) por pavimento/estado — OSRM car.lua (surface/smoothness/tracktype)
const TETO_PAVIMENTO = {
  cement: 80, compacted: 80, fine_gravel: 80, paving_stones: 60, metal: 60, bricks: 60,
  grass: 40, wood: 40, sett: 40, grass_paver: 40, gravel: 40, unpaved: 40, ground: 40,
  dirt: 40, pebblestone: 40, cobblestone: 30, clay: 30, earth: 20, stone: 20, rocky: 20,
  sand: 20, mud: 10,
};
const TETO_CONSERVACAO = {
  intermediate: 80, bad: 40, very_bad: 20, horrible: 10, very_horrible: 5, impassable: 0,
};
const TETO_TIPO_TRILHA = { grade1: 60, grade2: 40, grade3: 30, grade4: 25, grade5: 20 };

// Pavimentos considerados "estrada de terra" para a preferência evitarTerra
const PAVIMENTOS_SEM_ASFALTO = new Set([
  'unpaved', 'compacted', 'fine_gravel', 'gravel', 'dirt', 'earth', 'ground', 'grass',
  'sand', 'mud', 'pebblestone', 'rocky', 'clay',
]);

const primeiro = (valor) => (Array.isArray(valor) ? valor[0] : valor);
const classeBase = (highway) => String(primeiro(highway) ?? 'road').replace(/_link$/, '');

export const hierarquia = (highway) => HIERARQUIA[classeBase(highway)] ?? 1;

export const grupoDaVia = (highway) => {
  const classe = classeBase(highway);
  if (classe === 'motorway' || classe === 'trunk') return 'rodovia';
  if (['primary', 'secondary', 'tertiary'].includes(classe)) return 'arterial';
  return 'local';
};

export const semAsfalto = (surface) =>
  [surface].flat().some((s) => PAVIMENTOS_SEM_ASFALTO.has(s));

// "60", "60 km/h", "40;60" → menor valor numérico; "BR:urban", "none" → null (usa CTB)
const lerMaxspeed = (maxspeed) => {
  const numeros = [maxspeed].flat().filter(Boolean)
    .flatMap((v) => String(v).split(/[;|]/))
    .map((v) => (v.trim() === 'walk' ? 10 : parseFloat(v)))
    .filter((n) => Number.isFinite(n) && n > 0);
  return numeros.length ? Math.min(...numeros) : null;
};

/**
 * Limite de velocidade (km/h) e sua fonte: tag maxspeed do OSM ou valor legal do CTB.
 */
export const limiteDaVia = (atributos, urbano) => {
  const doOsm = lerMaxspeed(atributos.maxspeed);
  if (doOsm) return { limite: doOsm, fonte: 'OSM' };
  const classe = String(primeiro(atributos.highway) ?? 'road');
  const tabela = LIMITE_POR_CLASSE[classe] ?? LIMITE_POR_CLASSE.road;
  return { limite: urbano ? tabela.urbano : tabela.rural, fonte: 'CTB' };
};

/**
 * Velocidade de operação (km/h) em fluxo livre: limite × fator de fluxo livre, limitada pelo
 * pavimento, estado de conservação e tipo de trilha. 0 = via intransitável.
 */
export const velocidadeOperacao = (atributos, limite) => {
  const tetos = [
    ...[atributos.surface].flat().map((s) => TETO_PAVIMENTO[s]),
    ...[atributos.smoothness].flat().map((s) => TETO_CONSERVACAO[s]),
    ...[atributos.tracktype].flat().map((s) => TETO_TIPO_TRILHA[s]),
  ].filter((v) => v !== undefined);
  return Math.min(limite * PARAMETROS.fatorFluxoLivre, ...tetos);
};

// Fator de tempo pela rampa: > 1 = mais lento que no plano
export const fatorRampa = (comprimento, subida = 0, descida = 0) => {
  const { rampa } = PARAMETROS;
  const variacao = subida + descida;
  if (comprimento < rampa.comprimentoMinimo || variacao <= 0) return { fator: 1, inclinacao: 0 };

  const inclinacao = Math.min((variacao / comprimento) * 100, rampa.inclinacaoMaxima);
  const parteSubida = subida / variacao;
  const velSubida = inclinacao <= rampa.limiteSubida ? 1 : Math.max(
    rampa.fatorMinimoSubida, 1 - rampa.perdaPorPontoSubida * (inclinacao - rampa.limiteSubida));
  const velDescida = inclinacao <= rampa.limiteDescida ? 1 : Math.max(
    rampa.fatorMinimoDescida, 1 - rampa.perdaPorPontoDescida * (inclinacao - rampa.limiteDescida));

  return {
    fator: parteSubida / velSubida + (1 - parteSubida) / velDescida,
    inclinacao: Math.round(inclinacao * 10) / 10,
  };
};

/**
 * Tempo (s) para percorrer a geometria de uma via em fluxo livre.
 * Monta um perfil de velocidade: cada vértice é limitado pela curva (AASHTO) e o veículo
 * acelera/freia entre eles com as taxas de PARAMETROS (passadas para frente e para trás).
 */
export const tempoPerfilVelocidade = (coords, velocidadeKmh, urbano) => {
  const { curva, gravidade, aceleracao, desaceleracao, velocidadeMinima } = PARAMETROS;
  const vMax = Math.max(velocidadeKmh, velocidadeMinima) * KMH;
  const fatorCurva = gravidade * ((urbano ? curva.superelevacaoUrbana : curva.superelevacaoRural) + curva.atritoLateral);

  const n = coords.length;
  const limite = new Array(n).fill(vMax);
  for (let i = 1; i < n - 1; i++) {
    const raio = raioCurvatura(coords[i - 1], coords[i], coords[i + 1]);
    if (Number.isFinite(raio)) {
      limite[i] = Math.max(velocidadeMinima * KMH, Math.min(vMax, Math.sqrt(fatorCurva * raio)));
    }
  }

  const trechos = [];
  for (let i = 1; i < n; i++) trechos.push(distanciaPontos(coords[i - 1], coords[i]));

  // Passada para frente (aceleração) e para trás (frenagem): v² ≤ v₀² + 2·a·s
  const v = [...limite];
  for (let i = 1; i < n; i++) {
    v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * aceleracao * trechos[i - 1]));
  }
  for (let i = n - 2; i >= 0; i--) {
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * desaceleracao * trechos[i]));
  }

  let tempo = 0;
  let velocidadeMinimaNoTrecho = vMax;
  for (let i = 1; i < n; i++) {
    tempo += (2 * trechos[i - 1]) / (v[i - 1] + v[i]); // aceleração constante no trecho
    velocidadeMinimaNoTrecho = Math.min(velocidadeMinimaNoTrecho, v[i]);
  }
  return { tempo, velocidadeMinimaCurva: velocidadeMinimaNoTrecho / KMH };
};

// Horário de pico em America/Sao_Paulo (janelas da CET-SP, dias úteis)
export const ehHorarioPico = (data = new Date()) => {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(data).map((p) => [p.type, p.value]),
  );
  if (partes.weekday === 'Sat' || partes.weekday === 'Sun') return false;
  const hora = Number(partes.hour) + Number(partes.minute) / 60;
  return PARAMETROS.pico.janelas.some(([inicio, fim]) => hora >= inicio && hora < fim);
};

export const multiplicadorPico = (aresta, pico) =>
  pico ? PARAMETROS.pico.multiplicador[aresta.grupo] : 1;

// Tempo perdido (s) ao reduzir de v1 para u e voltar a v2 (m/s), comparado a manter a velocidade
export const perdaReducao = (v1, v2, u) => {
  const { aceleracao, desaceleracao } = PARAMETROS;
  const frenagem = v1 > u ? (v1 - u) ** 2 / (2 * desaceleracao * v1) : 0;
  const retomada = v2 > u ? (v2 - u) ** 2 / (2 * aceleracao * v2) : 0;
  return frenagem + retomada;
};

// Custo de conversão (s) pelo ângulo — curva sigmoide do OSRM; ângulo > 0 = direita
export const custoConversao = (angulo) => {
  const { penalidade, vies, retorno, anguloRetorno } = PARAMETROS.conversao;
  if (Math.abs(angulo) >= anguloRetorno) return retorno;
  if (angulo >= 0) return penalidade / (1 + Math.exp(-((13 / vies) * angulo / 180 - 6.5 * vies)));
  return penalidade / (1 + Math.exp(-((13 * vies) * -angulo / 180 - 6.5 / vies)));
};

// Atraso médio (s) num semáforo — Webster/HCM
export const atrasoSemaforo = (fracaoVerde, pico) => {
  const { ciclo, saturacaoPico, saturacaoForaPico } = PARAMETROS.semaforo;
  const x = pico ? saturacaoPico : saturacaoForaPico;
  return (0.5 * ciclo * (1 - fracaoVerde) ** 2) / (1 - x * fracaoVerde);
};

// Controles de nó com direção (semáforo/PARE com direction=forward|backward) valem só nesse sentido
const valeNoSentido = (no, aresta) => {
  const direcao = no.direcao;
  if (!direcao || direcao === 'both') return true;
  return direcao === 'forward' ? !aresta.invertida : aresta.invertida;
};

/**
 * Custo (s) de passar pelo nó `no` vindo da aresta `entrada` e saindo pela `saida`.
 * Se `registro` for passado, cada atraso é anotado ({ tipo, segundos }) para a análise da rota.
 */
export const custoTransicao = (no, entrada, saida, pico, registro) => {
  const P = PARAMETROS;
  const v1 = entrada.velocidadeMs;
  const v2 = saida.velocidadeMs;
  let total = 0;
  const anotar = (tipo, segundos) => {
    if (segundos <= 0) return;
    total += segundos;
    registro?.push({ tipo, segundos });
  };

  const angulo = ((saida.rumoInicio - entrada.rumoFim + 540) % 360) - 180;
  const manobra = Math.abs(angulo) < P.conversao.anguloManobra ? 'reto' : angulo > 0 ? 'direita' : 'esquerda';
  const retorno = saida.para === entrada.de || Math.abs(angulo) >= P.conversao.anguloRetorno;
  const esperaBrecha = manobra === 'direita' ? P.cruzamento.esperaDireita : P.cruzamento.esperaCruzandoOuEsquerda;
  const vindoDaSecundaria =
    entrada.rank < no.rankMax && entrada.comprimento >= P.cruzamento.comprimentoMinimoAproximacao;

  let controlado = false;

  // SEMÁFORO (um por interseção, mesmo em pista dupla)
  if (no.semaforo && no.agrupamentoSemaforo !== entrada.agrupamentoOrigem && valeNoSentido(no, entrada)) {
    const fracaoVerde = no.travessiaSemaforizada
      ? P.semaforo.verdeTravessiaPedestre
      : entrada.rank >= no.rankMax ? P.semaforo.verdeViaPrincipal : P.semaforo.verdeViaSecundaria;
    anotar('semaforo', atrasoSemaforo(fracaoVerde, pico));
    controlado = true;
  }

  // PARE (explícito no OSM) — parada total obrigatória
  if (!controlado && no.tipo === 'stop' && valeNoSentido(no, entrada) && (no.direcao || vindoDaSecundaria || no.rankMin === no.rankMax)) {
    anotar('parada', perdaReducao(v1, v2, 0) + P.parada.pausa + esperaBrecha);
    controlado = true;
  }

  // DÊ A PREFERÊNCIA (explícito)
  if (!controlado && no.tipo === 'give_way' && valeNoSentido(no, entrada)) {
    anotar('cruzamento', perdaReducao(v1, v2, P.darPreferencia.velocidade * KMH) + esperaBrecha);
    controlado = true;
  }

  // PASSAGEM DE NÍVEL — CTB art. 212
  if (no.passagemNivel) {
    anotar('passagemNivel', perdaReducao(v1, v2, 0) + P.passagemNivel.pausa);
  }

  // ROTATÓRIAS
  if (no.tipo === 'mini_roundabout') {
    anotar('rotatoria', perdaReducao(v1, v2, P.miniRotatoria.velocidade * KMH) + P.miniRotatoria.espera);
    controlado = true;
  } else if (saida.rotatoria && !entrada.rotatoria) {
    anotar('rotatoria', perdaReducao(v1, v2, P.rotatoria.velocidadeEntrada * KMH) + P.rotatoria.espera);
    controlado = true;
  }

  // CRUZAMENTO SEM SINALIZAÇÃO — hierarquia viária / preferência à direita (CTB art. 29).
  // Nós a poucos metros de um semáforo (mapeado na aproximação) são tratados como semaforizados.
  if (!controlado && !no.pertoDeSemaforo && no.grau >= 3 && !(entrada.rotatoria && saida.rotatoria)) {
    if (vindoDaSecundaria) {
      anotar('cruzamento', perdaReducao(v1, v2, P.cruzamento.velocidadeCedendo * KMH) + esperaBrecha);
    } else if (no.rankMin === no.rankMax && entrada.grupo !== 'rodovia') {
      anotar('cruzamento',
        perdaReducao(v1, v2, P.cruzamento.velocidadePreferenciaDireita * KMH) + P.cruzamento.esperaPreferenciaDireita);
    } else if (manobra === 'esquerda') {
      anotar('cruzamento', P.cruzamento.esperaEsquerdaNaPrincipal);
    }
  }

  // REDUTORES DE VELOCIDADE (lombadas, faixas elevadas...)
  if (no.redutor !== undefined) {
    const velocidade = P.redutores[no.redutor] ?? P.redutores.yes;
    if (velocidade) anotar('redutor', perdaReducao(v1, v2, velocidade * KMH));
  }

  // TRAVESSIA DE PEDESTRES sem semáforo
  if (no.tipo === 'crossing' && !no.semaforo) anotar('travessia', P.travessiaPedestre.espera);

  // CONVERSÃO (só em interseções; dentro da rotatória a curva já está na geometria)
  if (retorno) {
    anotar('retorno', P.conversao.retorno + perdaReducao(v1, v2, 0));
  } else if (no.grau >= 3 && !(entrada.rotatoria && saida.rotatoria)) {
    anotar('conversao', custoConversao(angulo));
  }

  return total;
};

// Aceleração a partir do repouso na saída e frenagem até parar na chegada
export const custoPartida = (aresta) => aresta.velocidadeMs / (2 * PARAMETROS.aceleracao);
export const custoChegada = (aresta) => aresta.velocidadeMs / (2 * PARAMETROS.desaceleracao);
