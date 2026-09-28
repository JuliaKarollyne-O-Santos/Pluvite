import { supabase } from '../supabase.js';
import { pontoMaisProximo, recortarPorRaio } from './geo.js';
import { arestasProximas, normalizar } from './grafo.js';
import { resolverPonto } from './roteamento.js';

/**
 * INTEGRAÇÃO FEED → ROTEAMENTO
 *
 * Cada ocorrência ativa publicada no Feed (tabela `ocorrencias`) vira um conjunto de arestas do
 * grafo com custo extra na BUSCA do caminho (roteamento.js › buscarCaminho). O tempo exibido
 * continua sendo o do modelo (modeloTempo.js): não há dado medido do atraso de cada ocorrência.
 *
 * Localização da ocorrência, em ordem de preferência:
 * 1. 'exata' — latitude/longitude gravadas pelo Feed: vias a até `raio` m do ponto;
 * 2. 'rua'   — sem coordenada (publicações antigas): a rua do grafo citada no `endereco`, inteira;
 * 3. null    — nada identificado: a ocorrência não afeta a rota.
 */

/**
 * Efeito de cada tipo de ocorrência (TIPOS_OCORRENCIA em web/app/lib/constantes.ts):
 * - efeito 'bloqueio': via intransitável; 'restricao': transitável com dificuldade (peso × fator).
 * - abrangencia 'area': todas as vias no raio (água e terra tomam o cruzamento inteiro);
 *   'via': só a rua da ocorrência dentro do raio.
 * - raio (m) em volta do ponto e validade (h): depois disso a ocorrência deixa de valer para o
 *   roteamento mesmo que a prefeitura ainda não a tenha concluído.
 * Todos os valores são ESTIMATIVA — não há medição de extensão e duração típicas na região.
 */
export const EFEITO_OCORRENCIA = {
  Acidente: { efeito: 'bloqueio', abrangencia: 'via', raio: 50, validadeHoras: 6 },
  Alagamento: { efeito: 'bloqueio', abrangencia: 'area', raio: 80, validadeHoras: 12 },
  'Árvore caída': { efeito: 'bloqueio', abrangencia: 'via', raio: 40, validadeHoras: 24 },
  'Buraco na via': { efeito: 'restricao', abrangencia: 'via', raio: 25, validadeHoras: 24 * 30, fator: 3 },
  'Deslizamento de terra': { efeito: 'bloqueio', abrangencia: 'area', raio: 60, validadeHoras: 72 },
  'Via interditada': { efeito: 'bloqueio', abrangencia: 'via', raio: 60, validadeHoras: 48 },
  Outros: { efeito: 'restricao', abrangencia: 'via', raio: 40, validadeHoras: 24, fator: 2 },
};

// Custo extra na busca por aresta bloqueada: 1 h (critério "mais rápida") ou 50 km ("mais curta").
// Maior que qualquer desvio dentro de um município, mas finito: se a origem ou o destino estiverem
// na área afetada a rota ainda existe, e a ocorrência volta em `naRota` para o front avisar.
const PENALIDADE_BLOQUEIO = { tempo: 3600, distancia: 50000 };

// Status que tiram a ocorrência do roteamento (canônico + legados, já sem acento — pluvite-domain)
const STATUS_ENCERRADOS = ['concluido', 'resolvido'];

// Com coordenada e rua no endereço, a rua é usada como referência se passar a até N m do ponto
// (o GPS de quem publica costuma cair na calçada ou na esquina)
const DISTANCIA_RUA_DO_ENDERECO = 150;

const VALIDADE_MAXIMA_HORAS = Math.max(...Object.values(EFEITO_OCORRENCIA).map((r) => r.validadeHoras));

export const regraDoTipo = (tipo) => EFEITO_OCORRENCIA[tipo] ?? EFEITO_OCORRENCIA.Outros;

// ───── IDENTIFICAÇÃO DA RUA PELO ENDEREÇO DIGITADO ─────

// Abreviações comuns em endereços digitados → forma por extenso usada no OpenStreetMap
const ABREVIACOES = {
  av: 'avenida', r: 'rua', rod: 'rodovia', estr: 'estrada', est: 'estrada', al: 'alameda',
  pca: 'praca', pc: 'praca', tv: 'travessa', trav: 'travessa', lgo: 'largo', vd: 'viaduto',
  dr: 'doutor', dra: 'doutora', prof: 'professor', profa: 'professora', eng: 'engenheiro',
  pres: 'presidente', gov: 'governador', cel: 'coronel', gen: 'general', cap: 'capitao',
  ten: 'tenente', sen: 'senador', dep: 'deputado', ver: 'vereador', pe: 'padre', sto: 'santo',
  sta: 'santa', cmte: 'comandante', mal: 'marechal', brig: 'brigadeiro',
};
const TIPOS_DE_VIA = new Set([
  'rua', 'avenida', 'rodovia', 'estrada', 'alameda', 'praca', 'travessa', 'largo', 'viaduto',
  'via', 'acesso', 'marginal', 'ponte', 'viela', 'beco', 'caminho', 'servidao', 'passagem',
]);
const MARCAS_DE_NUMERO = new Set(['n', 'no', 'num', 'numero', 'nr', 'km']);

const palavrasNormalizadas = (texto) =>
  normalizar(String(texto ?? '').replace(/[.,;:º°ª]/g, ' '))
    .split(' ')
    .filter(Boolean)
    .map((palavra) => ABREVIACOES[palavra] ?? palavra);

// "Av. Návrik Feres Aguiar, 1500 - Centro" → "avenida navrik feres aguiar"
const logradouroDoEndereco = (endereco) => {
  const trecho = String(endereco ?? '').split(/,| - | – |\(|\//)[0];
  const palavras = palavrasNormalizadas(trecho);
  const nome = [];
  for (let i = 0; i < palavras.length; i++) {
    const palavra = palavras[i];
    // Corta no número do imóvel ("... Aguiar 1500"), mas não em nomes como "Rua 1" ou "Rua 7 de Setembro"
    const ehNumero = /^\d/.test(palavra) && palavras[i + 1] !== 'de';
    if ((ehNumero || MARCAS_DE_NUMERO.has(palavra)) && nome.length >= 2) break;
    nome.push(palavra);
  }
  return nome.join(' ');
};

const semTipoDeVia = (nome) => {
  const palavras = nome.split(' ');
  return palavras.length > 1 && TIPOS_DE_VIA.has(palavras[0]) ? palavras.slice(1).join(' ') : nome;
};

// Nomes das ruas do grafo já normalizados, montados uma vez por grafo
const indicesDeRuas = new WeakMap();
const indiceDeRuas = (grafo) => {
  let indice = indicesDeRuas.get(grafo);
  if (indice) return indice;
  indice = { exato: new Map(), semTipo: new Map(), lista: [] };
  for (const nome of grafo.ruas) {
    const normalizado = palavrasNormalizadas(nome).join(' ');
    indice.exato.set(normalizado, nome);
    const nucleo = semTipoDeVia(normalizado);
    if (!indice.semTipo.has(nucleo)) indice.semTipo.set(nucleo, []);
    indice.semTipo.get(nucleo).push(nome);
    indice.lista.push({ nome, normalizado, palavras: normalizado.split(' ').length });
  }
  indicesDeRuas.set(grafo, indice);
  return indice;
};

/**
 * Nome (como está no grafo) da rua citada no endereço de uma ocorrência, ou null.
 * Tenta o nome exato, depois o nome sem o tipo de via ("Navrik Feres Aguiar") e, por fim, o
 * nome completo de alguma rua dentro de um texto livre ("em frente à Avenida X, perto do...").
 */
export const encontrarRua = (grafo, endereco) => {
  const alvo = logradouroDoEndereco(endereco);
  if (alvo.length < 3) return null;
  const { exato, semTipo, lista } = indiceDeRuas(grafo);
  if (exato.has(alvo)) return exato.get(alvo);

  const candidatas = semTipo.get(semTipoDeVia(alvo)) ?? [];
  if (candidatas.length === 1) return candidatas[0];

  const texto = ` ${palavrasNormalizadas(endereco).join(' ')} `;
  let melhor = null;
  for (const rua of lista) {
    if (rua.palavras < 3 || !texto.includes(` ${rua.normalizado} `)) continue;
    if (!melhor || rua.normalizado.length > melhor.normalizado.length) melhor = rua;
  }
  if (melhor) return melhor.nome;

  // Apelido da via: "Dutra" ou "Via Dutra" para "Rodovia Presidente Dutra". Só vale quando o
  // termo aparece como palavra inteira em UMA única via da cidade — com duas ou mais seria
  // palpite, e bloquear a rua errada é pior do que não localizar a ocorrência.
  const apelido = semTipoDeVia(alvo);
  if (apelido.length >= 4) {
    const candidatas = lista.filter((rua) => ` ${rua.normalizado} `.includes(` ${apelido} `));
    if (candidatas.length === 1) return candidatas[0].nome;
  }
  return null;
};

// ───── ARESTAS AFETADAS ─────

/**
 * Abrangência 'via': só a rua da ocorrência — a do endereço, se passar perto; senão a mais próxima.
 * Devolve também o `centro`: o ponto projetado sobre o eixo da via, a partir do qual o raio é
 * medido (o ponto publicado costuma cair na calçada ou na esquina, e medir dali encolheria ou
 * esticaria o trecho conforme o erro do GPS).
 */
const arestasDaVia = (grafo, lat, lng, raio, ruaDoEndereco) => {
  const daRua = ruaDoEndereco ? new Set(grafo.arestasPorRua.get(ruaDoEndereco)) : null;
  const naRua = daRua
    ? arestasProximas(grafo, lat, lng, Math.max(raio, DISTANCIA_RUA_DO_ENDERECO))
        .filter((p) => daRua.has(p.id))
    : [];
  const proximas = naRua.length > 0 ? naRua : arestasProximas(grafo, lat, lng, raio);
  if (proximas.length === 0) return { ids: [], centro: null };

  const maisProxima = grafo.arestas[proximas[0].id];
  const centro = pontoMaisProximo(maisProxima.coords, [lat, lng]);
  const nomeDaVia = naRua.length > 0 ? ruaDoEndereco : maisProxima.nome;
  const daViaAfetada = nomeDaVia ? new Set(grafo.arestasPorRua.get(nomeDaVia)) : null;

  const ids = arestasProximas(grafo, centro[0], centro[1], raio)
    .filter(({ id }) => {
      if (daViaAfetada) return daViaAfetada.has(id);
      // Via sem nome: a aresta mais próxima e a do sentido contrário
      const a = grafo.arestas[id];
      return (a.de === maisProxima.de && a.para === maisProxima.para) ||
        (a.de === maisProxima.para && a.para === maisProxima.de);
    })
    .map((p) => p.id);

  return { ids, centro };
};

/**
 * Geometria afetada para o mapa (um traço por trecho, sem repetir o sentido contrário).
 * Com `recorte`, desenha só o pedaço da aresta dentro do raio em vez da aresta inteira: uma
 * aresta do OSMnx vai de cruzamento a cruzamento e em Taubaté chega a 5,6 km, o que pintaria a
 * rua toda de vermelho. Sem coordenada (localização 'rua') não há onde recortar.
 */
const trechosAfetados = (grafo, ids, recorte) => {
  const vistos = new Set();
  const trechos = [];
  for (const id of ids) {
    const { de, para, coords } = grafo.arestas[id];
    const chave = de < para ? `${de}-${para}` : `${para}-${de}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    if (recorte) trechos.push(...recortarPorRaio(coords, recorte.centro, recorte.raio));
    else trechos.push(coords);
  }
  return trechos;
};

const coordenadaValida = (valor) => valor !== null && valor !== undefined && Number.isFinite(Number(valor));

/**
 * Converte uma linha de `ocorrencias` no formato usado pelo roteamento e pelo mapa (camelCase):
 * localização identificada, arestas afetadas e a geometria delas.
 */
export const mapearOcorrencia = (grafo, linha) => {
  const regra = regraDoTipo(linha.tipo);
  const rua = encontrarRua(grafo, linha.endereco);
  let localizacao = null;
  let posicao = null;
  let arestas = [];
  // Círculo de onde a geometria desenhada é recortada; null quando a rua foi achada pelo endereço
  let recorte = null;

  if (coordenadaValida(linha.latitude) && coordenadaValida(linha.longitude)) {
    const lat = Number(linha.latitude);
    const lng = Number(linha.longitude);
    // Em 'area' o raio vale em volta do próprio ponto; em 'via', em volta do eixo da rua
    let centro = [lat, lng];
    if (regra.abrangencia === 'area') {
      arestas = arestasProximas(grafo, lat, lng, regra.raio).map((p) => p.id);
    } else {
      const daVia = arestasDaVia(grafo, lat, lng, regra.raio, rua);
      arestas = daVia.ids;
      if (daVia.centro) centro = daVia.centro;
    }
    if (arestas.length > 0) {
      localizacao = 'exata';
      posicao = [lat, lng];
      recorte = { centro, raio: regra.raio };
    }
  }

  // Sem coordenada (ou ponto longe de qualquer via): a rua citada no endereço, inteira
  if (!localizacao && rua) {
    arestas = grafo.arestasPorRua.get(rua) ?? [];
    const { id } = resolverPonto(grafo, { rua });
    if (arestas.length > 0 && id) {
      localizacao = 'rua';
      const no = grafo.nos.get(id);
      posicao = [no.lat, no.lng];
    }
  }

  return {
    id: linha.id,
    tipo: linha.tipo,
    endereco: linha.endereco ?? '',
    bairro: linha.bairro ?? '',
    status: linha.status,
    criadoEm: linha.criado_em,
    efeito: regra.efeito,
    localizacao,
    rua,
    posicao,
    raio: localizacao === 'exata' ? regra.raio : null,
    arestas,
    trechos: trechosAfetados(grafo, arestas, recorte),
  };
};

// ───── LEITURA NO SUPABASE ─────

const COLUNAS = 'id, tipo, cidade, bairro, endereco, status, criado_em';
let avisouSemColunasDeLocalizacao = false;

/**
 * Ocorrências do Feed que ainda valem para o roteamento na cidade: não concluídas e dentro da
 * validade do tipo. Funciona antes da migração de latitude/longitude (cai para o endereço).
 */
export const buscarOcorrenciasAtivas = async (cidade) => {
  const maisAntiga = new Date(Date.now() - VALIDADE_MAXIMA_HORAS * 3600 * 1000).toISOString();
  const consultar = (colunas) =>
    supabase
      .from('ocorrencias')
      .select(colunas)
      .eq('cidade', cidade)
      .gte('criado_em', maisAntiga)
      .order('criado_em', { ascending: false });

  let { data, error } = await consultar(`${COLUNAS}, latitude, longitude`);
  if (error?.code === '42703') {
    // Coluna inexistente: supabase/migrations/20260923120000_ocorrencias_localizacao.sql não aplicada
    if (!avisouSemColunasDeLocalizacao) {
      console.warn("Tabela ocorrencias sem latitude/longitude — usando só o endereço. Aplique a migração em supabase/migrations/.");
      avisouSemColunasDeLocalizacao = true;
    }
    ({ data, error } = await consultar(COLUNAS));
  }
  if (error) throw new Error(`Supabase (ocorrências): ${error.message}`);

  const agora = Date.now();
  return data.filter((linha) => {
    if (STATUS_ENCERRADOS.includes(normalizar(linha.status ?? ''))) return false;
    const validade = regraDoTipo(linha.tipo).validadeHoras * 3600 * 1000;
    return agora - new Date(linha.criado_em).getTime() <= validade;
  });
};

export const carregarOcorrencias = async (grafo, cidade) =>
  (await buscarOcorrenciasAtivas(cidade)).map((linha) => mapearOcorrencia(grafo, linha));

// ───── USO NO CÁLCULO DA ROTA ─────

/** Map<idAresta, { fator, tempo, distancia }> consumido por buscarCaminho. */
export const montarPenalidades = (ocorrencias) => {
  const penalidades = new Map();
  for (const ocorrencia of ocorrencias) {
    const regra = regraDoTipo(ocorrencia.tipo);
    for (const id of ocorrencia.arestas) {
      const atual = penalidades.get(id) ?? { fator: 1, tempo: 0, distancia: 0 };
      if (regra.efeito === 'bloqueio') {
        atual.tempo = PENALIDADE_BLOQUEIO.tempo;
        atual.distancia = PENALIDADE_BLOQUEIO.distancia;
      } else {
        atual.fator = Math.max(atual.fator, regra.fator);
      }
      penalidades.set(id, atual);
    }
  }
  return penalidades;
};

// Ocorrências que afetam alguma aresta do caminho (lista de ids de arestas)
export const ocorrenciasNoCaminho = (ocorrencias, caminho) => {
  const noCaminho = new Set(caminho);
  return ocorrencias.filter((ocorrencia) => ocorrencia.arestas.some((id) => noCaminho.has(id)));
};

export const resumirOcorrencia = ({ id, tipo, endereco, rua, efeito, localizacao }) => ({
  id, tipo, endereco, rua, efeito, localizacao,
});
