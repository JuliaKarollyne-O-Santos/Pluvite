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

// Maior componente fortemente conexo da malha, montado na primeira consulta de cada grafo. O OSMnx
// guarda o maior componente FRACAMENTE conexo, então sobram pedaços sem ida e volta (mão única sem
// saída, acessos de condomínio): com a origem ou o destino num deles a busca não acha caminho.
const componentesPrincipais = new WeakMap();

const componentePrincipal = (grafo) => {
  let maior = componentesPrincipais.get(grafo);
  if (maior) return maior;

  // Kosaraju iterativo (recursão estouraria a pilha com dezenas de milhares de nós).
  // 1ª passada: ordem de término da busca em profundidade no sentido das vias
  const ordem = [];
  const visitado = new Set();
  for (const inicio of grafo.nos.keys()) {
    if (visitado.has(inicio)) continue;
    visitado.add(inicio);
    const pilha = [[inicio, 0]];
    while (pilha.length > 0) {
      const topo = pilha[pilha.length - 1];
      const saidas = grafo.saidas.get(topo[0]) ?? [];
      if (topo[1] < saidas.length) {
        const proximo = grafo.arestas[saidas[topo[1]++]].para;
        if (!visitado.has(proximo)) {
          visitado.add(proximo);
          pilha.push([proximo, 0]);
        }
      } else {
        ordem.push(topo[0]);
        pilha.pop();
      }
    }
  }

  // 2ª passada: no sentido contrário das vias, na ordem inversa de término — cada árvore é um componente
  const entradas = new Map();
  for (const aresta of grafo.arestas) {
    if (!entradas.has(aresta.para)) entradas.set(aresta.para, []);
    entradas.get(aresta.para).push(aresta.de);
  }
  const atribuido = new Set();
  maior = new Set();
  for (let i = ordem.length - 1; i >= 0; i--) {
    if (atribuido.has(ordem[i])) continue;
    atribuido.add(ordem[i]);
    const componente = new Set([ordem[i]]);
    const pilha = [ordem[i]];
    while (pilha.length > 0) {
      for (const anterior of entradas.get(pilha.pop()) ?? []) {
        if (atribuido.has(anterior)) continue;
        atribuido.add(anterior);
        componente.add(anterior);
        pilha.push(anterior);
      }
    }
    if (componente.size > maior.size) maior = componente;
  }

  componentesPrincipais.set(grafo, maior);
  return maior;
};

// Nó com saída mais próximo de uma coordenada (busca linear — poucos milhares de nós por cidade).
// `aceitos` (Set opcional) restringe os candidatos, ex.: ao componente principal da malha.
const noMaisProximo = (grafo, lat, lng, candidatos = grafo.saidas.keys(), aceitos = null) => {
  let melhor = null;
  let menorDistancia = Infinity;
  for (const id of candidatos) {
    if (!grafo.saidas.has(id) || (aceitos && !aceitos.has(id))) continue;
    const no = grafo.nos.get(id);
    const d = distanciaMetros(lat, lng, no.lat, no.lng);
    if (d < menorDistancia) {
      menorDistancia = d;
      melhor = id;
    }
  }
  return { id: melhor, distancia: menorDistancia };
};

const noAFrente = (grafo, lat, lng, rumoVeiculo, aceitos = null) => {
  let melhor = null;
  let menorDistancia = Infinity;
  for (const id of grafo.saidas.keys()) {
    if (aceitos && !aceitos.has(id)) continue;
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
 * Para uma rua, usa o nó dela mais próximo do "centro" da rua. Para uma coordenada, devolve também
 * `distancia` (m) entre o ponto informado e o nó usado.
 * Com `apenasComponentePrincipal`, só aceita nós do maior componente fortemente conexo (usado quando
 * a busca falhou: ver `componentePrincipal`).
 */
export const resolverPonto = (grafo, ponto, { apenasComponentePrincipal = false } = {}) => {
  const aceitos = apenasComponentePrincipal ? componentePrincipal(grafo) : null;

  if (ponto?.rua) {
    const nosDaRua = grafo.nosPorRua.get(ponto.rua);
    if (!nosDaRua) return { erro: `Rua "${ponto.rua}" não encontrada nesta cidade.` };
    let somaLat = 0, somaLng = 0;
    for (const id of nosDaRua) {
      somaLat += grafo.nos.get(id).lat;
      somaLng += grafo.nos.get(id).lng;
    }
    const { id } = noMaisProximo(grafo, somaLat / nosDaRua.size, somaLng / nosDaRua.size, nosDaRua, aceitos);
    return id ? { id } : { erro: `Rua "${ponto.rua}" não possui trecho navegável.` };
  }

  if (Number.isFinite(ponto?.lat) && Number.isFinite(ponto?.lng)) {
    if (Number.isFinite(ponto.rumo)) {
      const id = noAFrente(grafo, ponto.lat, ponto.lng, ponto.rumo, aceitos);
      if (id) return { id };
    }
    const { id, distancia } = noMaisProximo(grafo, ponto.lat, ponto.lng, undefined, aceitos);
    if (!id || distancia > DISTANCIA_MAXIMA_SNAP) {
      return { erro: 'O ponto informado está fora da área de ruas desta cidade.' };
    }
    return { id, distancia };
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

/**
 * Tempo de deslocamento na aresta: o do modelo (com horário de pico) ou, onde o trânsito ao vivo
 * mediu lentidão (`atrasos`, transito.js), o tempo livre + o atraso medido — o maior dos dois, para
 * não somar o pico estimado e a lentidão medida duas vezes.
 */
const tempoNaVia = (aresta, pico, atrasos) => {
  const modelo = aresta.tempoLivre * multiplicadorPico(aresta, pico);
  const atraso = atrasos?.get(aresta.id);
  return atraso ? Math.max(modelo, aresta.tempoLivre + atraso) : modelo;
};

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
 * - `atrasos`: Map<idAresta, segundos> da lentidão medida pelo trânsito ao vivo (transito.js). Este é
 *   dado medido: muda a escolha E o tempo exibido (avaliarCaminho usa o mesmo `tempoNaVia`).
 * Devolve a lista de índices de arestas do caminho, ou null.
 */
export const buscarCaminho = (grafo, origemId, destinoId, { pico, preferencias, penalidades, rumoInicial, atrasos }) => {
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
    const tempo = tempoNaVia(aresta, pico, atrasos);
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
export const avaliarCaminho = (grafo, caminho, { pico, preferencias, partida, atrasos }) => {
  const arestasDoCaminho = caminho.map((id) => grafo.arestas[id]);
  const primeira = arestasDoCaminho[0];
  const ultima = arestasDoCaminho[arestasDoCaminho.length - 1];

  const composicao = {
    deslocamento: 0, semaforo: 0, parada: 0, cruzamento: 0, rotatoria: 0, redutor: 0,
    travessia: 0, conversao: 0, retorno: 0, passagemNivel: 0,
    partidaChegada: custoPartida(primeira) + custoChegada(ultima),
    transito: 0, // lentidão medida pelo trânsito ao vivo além do tempo do modelo
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
    const modelo = aresta.tempoLivre * multiplicadorPico(aresta, pico);
    const deslocamento = tempoNaVia(aresta, pico, atrasos);
    composicao.deslocamento += modelo;
    composicao.transito += deslocamento - modelo;
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

/**
 * ROTAS ALTERNATIVAS — método da penalidade (Akgün, Erkut & Batta, 2000, "On finding dissimilar
 * paths", EJOR 121): cada caminho encontrado deixa as próprias arestas `fatorPenalidade` vezes mais
 * caras e a busca é refeita. O candidato só vira alternativa se for admissível no sentido de Abraham
 * et al. (2013, "Alternative routes in road networks"): pouco trecho em comum com as rotas já
 * aceitas, tempo não muito maior que o da principal e sem zigue-zague local (`localmenteOtimo`).
 * Os limites numéricos são estimativa.
 */
export const ALTERNATIVAS = {
  maximo: 2, // além da rota principal
  tentativas: 5, // buscas extras, no máximo
  fatorPenalidade: 1.4,
  sobreposicaoMaxima: 0.7, // fração do comprimento do candidato em comum com uma rota já aceita
  esticamentoMaximo: 1.3, // tempo do candidato ≤ 130% do tempo da rota principal
  janelaOtimalidade: 0.25, // trechos de até 25% do tempo do candidato precisam ser (quase) os mais rápidos
  janelasVerificadas: 8, // pontos de partida das janelas, espalhados pelo candidato
  desvioLocalMaximo: 30, // s a mais que o melhor caminho entre as pontas do trecho
};

// Otimalidade local (teste T de Abraham et al., 2013): a penalidade às vezes empurra o candidato para
// um zigue-zague em volta de quarteirões que ninguém faria. Cada janela do candidato é comparada
// com o caminho mais rápido entre as mesmas pontas, chegando no mesmo rumo.
const localmenteOtimo = (grafo, candidato, opcoes, tempoCandidato) => {
  const arestas = candidato.map((id) => grafo.arestas[id]);
  const janela = tempoCandidato * ALTERNATIVAS.janelaOtimalidade;
  const passo = Math.max(1, Math.floor(arestas.length / ALTERNATIVAS.janelasVerificadas));
  for (let i = 0; i < arestas.length - 1; i += passo) {
    // Fim da janela pelo tempo livre das arestas (só para dimensionar; a comparação usa o modelo)
    let j = i;
    for (let acumulado = 0; j < arestas.length - 1 && acumulado < janela; j++) acumulado += arestas[j].tempoLivre;
    const rumoChegada = i > 0 ? arestas[i - 1].rumoFim : undefined;
    const melhor = buscarCaminho(grafo, arestas[i].de, arestas[j].para, { ...opcoes, rumoInicial: rumoChegada });
    if (!melhor) continue;
    const manobra = (primeira) =>
      Number.isFinite(rumoChegada) ? custoConversao(diferencaRumo(rumoChegada, primeira.rumoInicio)) : 0;
    const tempoTrecho = avaliarCaminho(grafo, candidato.slice(i, j + 1), opcoes).duracaoSegundos + manobra(arestas[i]);
    const tempoMelhor = avaliarCaminho(grafo, melhor, opcoes).duracaoSegundos + manobra(grafo.arestas[melhor[0]]);
    if (tempoTrecho - tempoMelhor > ALTERNATIVAS.desvioLocalMaximo) return false;
  }
  return true;
};

// Trecho sem sentido de circulação: a mesma via nos dois sentidos conta como trecho em comum
const chaveTrecho = ({ de, para }) => (de < para ? `${de}-${para}` : `${para}-${de}`);

const fracaoEmComum = (grafo, candidato, aceito) => {
  const trechosAceitos = new Set(aceito.map((id) => chaveTrecho(grafo.arestas[id])));
  let emComum = 0, total = 0;
  for (const id of candidato) {
    const aresta = grafo.arestas[id];
    total += aresta.comprimento;
    if (trechosAceitos.has(chaveTrecho(aresta))) emComum += aresta.comprimento;
  }
  return total > 0 ? emComum / total : 1;
};

/**
 * Até ALTERNATIVAS.maximo caminhos entre os mesmos nós, diferentes do `principal`, já avaliados pelo
 * modelo: [{ caminho, avaliacao }]. Como as preferências, a penalidade muda só a ESCOLHA dos
 * caminhos — o tempo de cada alternativa é o do modelo. Um candidato que use via afetada por
 * ocorrência do Feed (`opcoes.penalidades`) que a principal não usa é descartado: a alternativa
 * nunca pode levar para um bloqueio que a rota principal evitou.
 */
export const buscarAlternativas = (grafo, origemId, destinoId, opcoes, principal) => {
  const tempoPrincipal = avaliarCaminho(grafo, principal, opcoes).duracaoSegundos;
  const deOcorrencias = opcoes.penalidades ?? new Map();
  const naPrincipal = new Set(principal);
  const penalidades = new Map(deOcorrencias);
  const penalizar = (caminho) => {
    for (const id of caminho) {
      const atual = penalidades.get(id) ?? { fator: 1, tempo: 0, distancia: 0 };
      penalidades.set(id, { ...atual, fator: atual.fator * ALTERNATIVAS.fatorPenalidade });
    }
  };
  penalizar(principal);

  const aceitos = [principal];
  const alternativas = [];
  for (let i = 0; i < ALTERNATIVAS.tentativas && alternativas.length < ALTERNATIVAS.maximo; i++) {
    const candidato = buscarCaminho(grafo, origemId, destinoId, { ...opcoes, penalidades });
    if (!candidato) break;
    // Penaliza mesmo se for descartado, para a próxima busca procurar em outro lugar
    penalizar(candidato);
    if (candidato.some((id) => deOcorrencias.has(id) && !naPrincipal.has(id))) continue;
    if (aceitos.some((aceito) => fracaoEmComum(grafo, candidato, aceito) > ALTERNATIVAS.sobreposicaoMaxima)) continue;
    const avaliacao = avaliarCaminho(grafo, candidato, opcoes);
    if (avaliacao.duracaoSegundos > tempoPrincipal * ALTERNATIVAS.esticamentoMaximo) continue;
    if (!localmenteOtimo(grafo, candidato, opcoes, avaliacao.duracaoSegundos)) continue;
    aceitos.push(candidato);
    alternativas.push({ caminho: candidato, avaliacao });
  }
  return alternativas;
};
