import { diferencaRumo, distanciaMetros, pontoAFrente, rumo } from './geo.js';
import {
  custoChegada,
  custoConversao,
  custoPartida,
  custoTransicao,
  multiplicadorPico,
} from './modeloTempo.js';

// Distância máxima (m) entre o ponto informado e a via mais próxima
const DISTANCIA_MAXIMA_SNAP = 2000;

// Navegação: com o rumo do veículo, o ponto de partida é o nó mais próximo À FRENTE dele (até
// RAIO_NO_A_FRENTE m e dentro de ±TOLERANCIA_RUMO°), para a rota não começar voltando para um nó
// que já ficou para trás. A menos de DISTANCIA_SOBRE_O_NO m o veículo está no próprio nó.
const RAIO_NO_A_FRENTE = 80;
const TOLERANCIA_RUMO = 60;
const DISTANCIA_SOBRE_O_NO = 8;

/**
 * PREFERÊNCIAS do usuário: mudam só a ESCOLHA do caminho (peso na busca), nunca o tempo
 * estimado exibido, que é sempre o tempo real projetado pelo modelo.
 */
export const PREFERENCIAS_PADRAO = {
  criterio: 'rapida', // 'rapida' (menor tempo) | 'curta' (menor distância)
  evitarTerra: false,
  evitarRodovias: false,
  evitarPedagio: false,
  evitarLadeiras: false,
};
const PESO_PREFERENCIA = { evitarTerra: 4, evitarRodovias: 4, evitarPedagio: 20, evitarLadeiras: 3 };
const INCLINACAO_LADEIRA = 8; // %

// Trechos sem nome mais curtos que isso (alças, pedaços de rotatória) não viram instrução própria
const TRECHO_SEM_NOME_IGNORADO = 80;
const BASE_RUMO = 25;

// Limiares da análise de trechos (km/h) e de pontos de lentidão (s)
const VELOCIDADE_TRECHO_LENTO = 20;
const VELOCIDADE_TRECHO_RAPIDO = 50;
const ATRASO_PONTO_LENTO = 3;

const DESCRICAO_EVENTO = {
  semaforo: 'Semáforo',
  parada: 'Placa PARE',
  cruzamento: 'Cruzamento sem semáforo',
  rotatoria: 'Rotatória',
  redutor: 'Lombada / redutor de velocidade',
  travessia: 'Travessia de pedestres',
  conversao: 'Conversão',
  retorno: 'Retorno',
  passagemNivel: 'Passagem de nível',
};

// Nó com saída mais próximo de uma coordenada (busca linear — poucos milhares de nós por cidade)
const noMaisProximo = (grafo, lat, lng, candidatos = grafo.saidas.keys()) => {
  let melhor = null;
  let menorDistancia = Infinity;
  for (const id of candidatos) {
    if (!grafo.saidas.has(id)) continue;
    const no = grafo.nos.get(id);
    const d = distanciaMetros(lat, lng, no.lat, no.lng);
    if (d < menorDistancia) {
      menorDistancia = d;
      melhor = id;
    }
  }
  return { id: melhor, distancia: menorDistancia };
};

const noAFrente = (grafo, lat, lng, rumoVeiculo) => {
  let melhor = null;
  let menorDistancia = Infinity;
  for (const id of grafo.saidas.keys()) {
    const no = grafo.nos.get(id);
    const d = distanciaMetros(lat, lng, no.lat, no.lng);
    if (d > RAIO_NO_A_FRENTE || d >= menorDistancia) continue;
    const desvio = Math.abs(diferencaRumo(rumoVeiculo, rumo([lat, lng], [no.lat, no.lng])));
    if (d > DISTANCIA_SOBRE_O_NO && desvio > TOLERANCIA_RUMO) continue;
    melhor = id;
    menorDistancia = d;
  }
  return melhor;
};

/**
 * Converte o ponto enviado pelo front ({ rua } ou { lat, lng, rumo? }) em um nó do grafo.
 * Para uma rua, usa o nó dela mais próximo do "centro" da rua.
 */
export const resolverPonto = (grafo, ponto) => {
  if (ponto?.rua) {
    const nosDaRua = grafo.nosPorRua.get(ponto.rua);
    if (!nosDaRua) return { erro: `Rua "${ponto.rua}" não encontrada nesta cidade.` };
    let somaLat = 0, somaLng = 0;
    for (const id of nosDaRua) {
      somaLat += grafo.nos.get(id).lat;
      somaLng += grafo.nos.get(id).lng;
    }
    const { id } = noMaisProximo(grafo, somaLat / nosDaRua.size, somaLng / nosDaRua.size, nosDaRua);
    return id ? { id } : { erro: `Rua "${ponto.rua}" não possui trecho navegável.` };
  }

  if (Number.isFinite(ponto?.lat) && Number.isFinite(ponto?.lng)) {
    if (Number.isFinite(ponto.rumo)) {
      const id = noAFrente(grafo, ponto.lat, ponto.lng, ponto.rumo);
      if (id) return { id };
    }
    const { id, distancia } = noMaisProximo(grafo, ponto.lat, ponto.lng);
    if (!id || distancia > DISTANCIA_MAXIMA_SNAP) {
      return { erro: 'O ponto informado está fora da área de ruas desta cidade.' };
    }
    return { id };
  }

  return { erro: 'Ponto inválido: informe uma rua ou uma coordenada.' };
};

// Fila de prioridade (min-heap) usada pelo A*
class FilaPrioridade {
  constructor() { this.itens = []; }
  get tamanho() { return this.itens.length; }
  inserir(id, prioridade) {
    const itens = this.itens;
    itens.push({ id, prioridade });
    let i = itens.length - 1;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (itens[pai].prioridade <= itens[i].prioridade) break;
      [itens[pai], itens[i]] = [itens[i], itens[pai]];
      i = pai;
    }
  }
  remover() {
    const itens = this.itens;
    const topo = itens[0];
    const ultimo = itens.pop();
    if (itens.length > 0) {
      itens[0] = ultimo;
      let i = 0;
      for (;;) {
        const esq = 2 * i + 1, dir = esq + 1;
        let menor = i;
        if (esq < itens.length && itens[esq].prioridade < itens[menor].prioridade) menor = esq;
        if (dir < itens.length && itens[dir].prioridade < itens[menor].prioridade) menor = dir;
        if (menor === i) break;
        [itens[menor], itens[i]] = [itens[i], itens[menor]];
        i = menor;
      }
    }
    return topo;
  }
}

const fatorPreferencia = (aresta, preferencias) => {
  let fator = 1;
  if (preferencias.evitarTerra && aresta.semAsfalto) fator *= PESO_PREFERENCIA.evitarTerra;
  if (preferencias.evitarRodovias && aresta.grupo === 'rodovia') fator *= PESO_PREFERENCIA.evitarRodovias;
  if (preferencias.evitarPedagio && aresta.pedagio) fator *= PESO_PREFERENCIA.evitarPedagio;
  if (preferencias.evitarLadeiras && aresta.inclinacao >= INCLINACAO_LADEIRA) fator *= PESO_PREFERENCIA.evitarLadeiras;
  return fator;
};

/**
 * A* sobre ARESTAS (não nós): o estado é "cheguei por esta aresta", o que permite cobrar
 * conversões, semáforos e preferências que dependem de onde o veículo vem.
 *
 * Opcionais:
 * - `penalidades`: Map<idAresta, { fator, tempo, distancia }> das ocorrências do Feed
 *   (rotas/ocorrencias.js) — multiplicam o peso e somam um custo fixo (s ou m, conforme o critério).
 * - `rumoInicial`: rumo do veículo em navegação; sair da origem num sentido diferente custa a
 *   conversão equivalente (retorno se for o sentido oposto).
 * Como as preferências, os dois mudam só a ESCOLHA do caminho, nunca o tempo exibido.
 * Devolve a lista de índices de arestas do caminho, ou null.
 */
export const buscarCaminho = (grafo, origemId, destinoId, { pico, preferencias, penalidades, rumoInicial }) => {
  const { arestas, saidas, nos } = grafo;
  const alvo = nos.get(destinoId);
  const porTempo = preferencias.criterio !== 'curta';

  // Heurística admissível: distância em linha reta (÷ maior velocidade do grafo, se por tempo).
  // Continua admissível com as penalidades, que só aumentam o custo.
  const heuristica = (noId) => {
    const no = nos.get(noId);
    const d = distanciaMetros(no.lat, no.lng, alvo.lat, alvo.lng);
    return porTempo ? d / grafo.velocidadeMaximaMs : d;
  };
  const pesoAresta = (aresta, transicao) => {
    const tempo = aresta.tempoLivre * multiplicadorPico(aresta, pico);
    const ocorrencia = penalidades?.get(aresta.id);
    const fator = fatorPreferencia(aresta, preferencias) * (ocorrencia?.fator ?? 1);
    const peso = porTempo
      ? transicao + tempo * fator
      : aresta.comprimento * fator + 0.01 * (tempo + transicao);
    if (!ocorrencia) return peso;
    return peso + (porTempo ? ocorrencia.tempo : ocorrencia.distancia);
  };

  const custo = new Float64Array(arestas.length).fill(Infinity);
  const anterior = new Int32Array(arestas.length).fill(-1);
  const fechada = new Uint8Array(arestas.length);
  const fila = new FilaPrioridade();

  for (const id of saidas.get(origemId) ?? []) {
    const aresta = arestas[id];
    const manobraInicial = Number.isFinite(rumoInicial)
      ? custoConversao(diferencaRumo(rumoInicial, aresta.rumoInicio))
      : 0;
    custo[id] = pesoAresta(aresta, porTempo ? custoPartida(aresta) + manobraInicial : 0);
    fila.inserir(id, custo[id] + heuristica(aresta.para));
  }

  while (fila.tamanho > 0) {
    const { id } = fila.remover();
    if (fechada[id]) continue;
    fechada[id] = 1;

    const entrada = arestas[id];
    if (entrada.para === destinoId) {
      const caminho = [];
      for (let atual = id; atual !== -1; atual = anterior[atual]) caminho.push(atual);
      return caminho.reverse();
    }

    const no = nos.get(entrada.para);
    for (const proximo of saidas.get(entrada.para) ?? []) {
      if (fechada[proximo]) continue;
      const saida = arestas[proximo];
      const novoCusto = custo[id] + pesoAresta(saida, custoTransicao(no, entrada, saida, pico));
      if (novoCusto < custo[proximo]) {
        custo[proximo] = novoCusto;
        anterior[proximo] = id;
        fila.inserir(proximo, novoCusto + heuristica(saida.para));
      }
    }
  }
  return null;
};

const descreverManobra = (rumoAnterior, rumoNovo) => {
  const delta = diferencaRumo(rumoAnterior, rumoNovo);
  if (Math.abs(delta) < 30) return { tipo: 'reto', texto: 'Continue em frente' };
  if (Math.abs(delta) > 150) return { tipo: 'retorno', texto: 'Faça o retorno' };
  return delta > 0
    ? { tipo: 'direita', texto: 'Vire à direita' }
    : { tipo: 'esquerda', texto: 'Vire à esquerda' };
};

const kmh = (metros, segundos) => (segundos > 0 ? Math.round((metros / segundos) * 3.6) : 0);

// Agrupa trechos consecutivos da mesma rua em instruções estilo GPS, com tempo por instrução.
// `inicio` é o índice, em `coordenadas`, do ponto onde a instrução começa (usado na navegação).
const montarInstrucoes = (trechos) => {
  const instrucoes = [];
  for (const { aresta, tempo, inicio } of trechos) {
    const atual = instrucoes[instrucoes.length - 1];
    const absorver =
      atual && (atual.rua === aresta.nome || (!aresta.nome && aresta.comprimento < TRECHO_SEM_NOME_IGNORADO));
    if (absorver) {
      atual.distancia += aresta.comprimento;
      atual.tempo += tempo;
      atual.pontos.push(...aresta.coords.slice(1));
      continue;
    }

    let manobra = { tipo: 'inicio', texto: 'Siga' };
    if (atual) {
      const fim = atual.pontos;
      manobra = descreverManobra(
        rumo(pontoAFrente([...fim].reverse(), BASE_RUMO), fim[fim.length - 1]),
        rumo(aresta.coords[0], pontoAFrente(aresta.coords, BASE_RUMO)),
      );
    }
    instrucoes.push({ ...manobra, rua: aresta.nome, distancia: aresta.comprimento, tempo, inicio, pontos: [...aresta.coords] });
  }
  return instrucoes.map(({ tipo, texto, rua, distancia, tempo, inicio }) => ({
    tipo,
    texto,
    rua: rua ?? 'via sem nome',
    distancia: Math.round(distancia),
    tempo: Math.round(tempo),
    velocidadeMedia: kmh(distancia, tempo),
    inicio,
  }));
};

const arredondar = (valor, casas = 0) => Math.round(valor * 10 ** casas) / 10 ** casas;

/**
 * Recalcula o caminho escolhido com o modelo completo e monta a resposta: tempo total,
 * instruções e a ANÁLISE (composição do tempo, pontos lentos, relevo, limites).
 */
export const avaliarCaminho = (grafo, caminho, { pico, preferencias, partida }) => {
  const arestasDoCaminho = caminho.map((id) => grafo.arestas[id]);
  const primeira = arestasDoCaminho[0];
  const ultima = arestasDoCaminho[arestasDoCaminho.length - 1];

  const composicao = {
    deslocamento: 0, semaforo: 0, parada: 0, cruzamento: 0, rotatoria: 0, redutor: 0,
    travessia: 0, conversao: 0, retorno: 0, passagemNivel: 0,
    partidaChegada: custoPartida(primeira) + custoChegada(ultima),
  };
  const eventos = [];
  const trechos = [];
  // Índice em `coordenadas` onde cada aresta começa (a 1ª entra inteira; as demais sem o ponto repetido)
  let inicio = 0;

  arestasDoCaminho.forEach((aresta, i) => {
    let transicao = 0;
    if (i > 0) {
      const no = grafo.nos.get(aresta.de);
      const registro = [];
      transicao = custoTransicao(no, arestasDoCaminho[i - 1], aresta, pico, registro);
      for (const { tipo, segundos } of registro) {
        composicao[tipo] += segundos;
        eventos.push({ tipo, segundos, coordenada: [no.lat, no.lng], rua: aresta.nome ?? arestasDoCaminho[i - 1].nome });
      }
    }
    const deslocamento = aresta.tempoLivre * multiplicadorPico(aresta, pico);
    composicao.deslocamento += deslocamento;
    trechos.push({ aresta, tempo: deslocamento + transicao, inicio });
    inicio += aresta.coords.length - 1;
  });
  trechos[0].tempo += custoPartida(primeira);
  trechos[trechos.length - 1].tempo += custoChegada(ultima);

  const duracao = Object.values(composicao).reduce((soma, s) => soma + s, 0);
  const distancia = arestasDoCaminho.reduce((soma, a) => soma + a.comprimento, 0);
  const instrucoes = montarInstrucoes(trechos);

  const contar = (tipo, minimo = 0) => eventos.filter((e) => e.tipo === tipo && e.segundos >= minimo).length;

  // Limites de velocidade por rua (ponderados pela extensão percorrida)
  const limitesPorRua = new Map();
  let extensaoLimiteOsm = 0;
  for (const aresta of arestasDoCaminho) {
    const chave = `${aresta.nome ?? 'via sem nome'}|${aresta.limite}|${aresta.fonteLimite}`;
    const item = limitesPorRua.get(chave) ?? {
      rua: aresta.nome ?? 'via sem nome', limite: aresta.limite, fonte: aresta.fonteLimite, extensao: 0,
    };
    item.extensao += aresta.comprimento;
    limitesPorRua.set(chave, item);
    if (aresta.fonteLimite === 'OSM') extensaoLimiteOsm += aresta.comprimento;
  }

  const altitudes = grafo.temElevacao
    ? [primeira.de, ...arestasDoCaminho.map((a) => a.para)]
        .map((id) => grafo.nos.get(id).elevacao)
        .filter((h) => h != null)
    : [];

  const analise = {
    contexto: {
      partida: partida.toISOString(),
      horarioPico: pico,
      preferencias,
      dadosElevacao: grafo.temElevacao,
    },
    velocidadeMedia: kmh(distancia, duracao),
    composicaoTempo: Object.fromEntries(Object.entries(composicao).map(([k, v]) => [k, arredondar(v)])),
    contagens: {
      semaforos: contar('semaforo'),
      paradasObrigatorias: contar('parada'),
      cruzamentosSemSemaforo: contar('cruzamento'),
      rotatorias: contar('rotatoria'),
      redutores: contar('redutor'),
      travessias: contar('travessia'),
      passagensNivel: contar('passagemNivel'),
      conversoes: contar('conversao', 2),
      retornos: contar('retorno'),
    },
    pontosLentos: eventos
      .filter((e) => e.segundos >= ATRASO_PONTO_LENTO)
      .sort((a, b) => b.segundos - a.segundos)
      .slice(0, 10)
      .map((e) => ({
        tipo: e.tipo,
        descricao: DESCRICAO_EVENTO[e.tipo],
        rua: e.rua ?? 'via sem nome',
        atrasoSegundos: arredondar(e.segundos, 1),
        coordenada: e.coordenada,
      })),
    trechosLentos: instrucoes
      .filter((t) => t.distancia >= 100 && t.velocidadeMedia < VELOCIDADE_TRECHO_LENTO)
      .map(({ rua, distancia, tempo, velocidadeMedia }) => ({ rua, distancia, tempo, velocidadeMedia })),
    trechosRapidos: instrucoes
      .filter((t) => t.distancia >= 100 && t.velocidadeMedia >= VELOCIDADE_TRECHO_RAPIDO)
      .map(({ rua, distancia, tempo, velocidadeMedia }) => ({ rua, distancia, tempo, velocidadeMedia })),
    relevo: {
      subidaTotal: Math.round(arestasDoCaminho.reduce((s, a) => s + a.subida, 0)),
      descidaTotal: Math.round(arestasDoCaminho.reduce((s, a) => s + a.descida, 0)),
      altitudeMinima: altitudes.length ? Math.round(Math.min(...altitudes)) : null,
      altitudeMaxima: altitudes.length ? Math.round(Math.max(...altitudes)) : null,
      inclinacaoMaxima: Math.max(0, ...arestasDoCaminho.map((a) => a.inclinacao)),
      trechosIngremes: arestasDoCaminho
        .filter((a) => a.inclinacao >= INCLINACAO_LADEIRA)
        .sort((a, b) => b.inclinacao - a.inclinacao)
        .slice(0, 5)
        .map((a) => ({ rua: a.nome ?? 'via sem nome', inclinacao: a.inclinacao, comprimento: Math.round(a.comprimento) })),
    },
    limitesVelocidade: {
      percentualInformadoOsm: distancia > 0 ? Math.round((extensaoLimiteOsm / distancia) * 100) : 0,
      porRua: [...limitesPorRua.values()]
        .sort((a, b) => b.extensao - a.extensao)
        .slice(0, 10)
        .map((item) => ({ ...item, extensao: Math.round(item.extensao) })),
    },
    viasSemAsfalto: Math.round(arestasDoCaminho.filter((a) => a.semAsfalto).reduce((s, a) => s + a.comprimento, 0)),
  };

  const coordenadas = [];
  for (const aresta of arestasDoCaminho) {
    coordenadas.push(...(coordenadas.length ? aresta.coords.slice(1) : aresta.coords));
  }

  return {
    distanciaMetros: Math.round(distancia),
    duracaoSegundos: Math.round(duracao),
    coordenadas,
    instrucoes,
    // Arestas do grafo percorridas e onde cada uma começa em `coordenadas`: o front cruza com as
    // arestas afetadas por ocorrências do Feed para saber se o trecho que falta ficou impedido
    arestas: trechos.map((trecho) => ({ id: trecho.aresta.id, inicio: trecho.inicio })),
    analise,
  };
};
