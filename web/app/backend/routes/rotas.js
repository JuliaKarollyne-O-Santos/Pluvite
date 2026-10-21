import { Router } from 'express';
import { carregarGrafo, obterIndiceArquivos } from '../rotas/grafo.js';
import { ehHorarioPico } from '../rotas/modeloTempo.js';
import {
  carregarOcorrencias,
  montarPenalidades,
  ocorrenciasDaRota,
} from '../rotas/ocorrencias.js';
import {
  PREFERENCIAS_PADRAO,
  avaliarCaminho,
  buscarAlternativas,
  buscarCaminho,
  resolverPonto,
} from '../rotas/roteamento.js';
import { aplicarTransito, obterTransito, transitoDaRota } from '../rotas/transito.js';

const router = Router();

// A partir desta distância (m) entre o ponto marcado e o nó onde a rota começa/termina, o front
// avisa que a rota parte/chega da via acessível mais próxima, e não do ponto exato
const DISTANCIA_AVISO_ENCAIXE = 150;

const formatarDistancia = (metros) =>
  metros >= 1000 ? `${(metros / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(metros)} m`;

const avisosDeEncaixe = (origem, destino) => {
  const avisos = [];
  if (origem.distancia > DISTANCIA_AVISO_ENCAIXE) {
    avisos.push(`A origem marcada fica a ${formatarDistancia(origem.distancia)} da via acessível mais próxima: a rota começa nela.`);
  }
  if (destino.distancia > DISTANCIA_AVISO_ENCAIXE) {
    avisos.push(`O destino marcado fica a ${formatarDistancia(destino.distancia)} da via acessível mais próxima: a rota termina nela.`);
  }
  return avisos;
};

// Aceita só as chaves conhecidas; o resto usa o padrão
const lerPreferencias = (corpo = {}) => {
  const preferencias = { ...PREFERENCIAS_PADRAO };
  for (const chave of Object.keys(PREFERENCIAS_PADRAO)) {
    if (chave === 'criterio') {
      if (['rapida', 'curta'].includes(corpo.criterio)) preferencias.criterio = corpo.criterio;
    } else if (typeof corpo[chave] === 'boolean') {
      preferencias[chave] = corpo[chave];
    }
  }
  return preferencias;
};

/**
 * 1. ROTA GET: Lista as cidades que possuem grafo viário disponível
 */
router.get('/cidades', async (req, res) => {
  try {
    const indice = await obterIndiceArquivos();
    return res.json([...indice.keys()]);
  } catch (err) {
    console.error("Erro ao listar grafos de rotas:", err);
    return res.status(500).json({ error: "Não foi possível acessar os mapas de rotas." });
  }
});

/**
 * 2. ROTA GET: Dados da cidade para o mapa (limites) e a lista de ruas para o autocompletar
 */
router.get('/:cidade', async (req, res) => {
  try {
    const grafo = await carregarGrafo(req.params.cidade);
    if (!grafo) return res.status(404).json({ error: "Mapa de rotas indisponível para esta cidade." });
    return res.json({ limites: grafo.limites, ruas: grafo.ruas });
  } catch (err) {
    console.error("Erro ao carregar grafo da cidade:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

/**
 * 3. ROTA GET: Ocorrências ativas do Feed na cidade, já ligadas às vias do grafo
 * (localização, efeito na rota, arestas afetadas e a geometria delas para o mapa)
 */
router.get('/:cidade/ocorrencias', async (req, res) => {
  try {
    const grafo = await carregarGrafo(req.params.cidade);
    if (!grafo) return res.status(404).json({ error: "Mapa de rotas indisponível para esta cidade." });
    return res.json(await carregarOcorrencias(grafo, req.params.cidade));
  } catch (err) {
    console.error("Erro ao carregar ocorrências da cidade:", err);
    return res.status(500).json({ error: "Não foi possível carregar as ocorrências do Feed." });
  }
});

/**
 * 4. ROTA POST: Calcula a rota e projeta o tempo de viagem com o modelo realista, desviando das
 * vias afetadas por ocorrências ativas do Feed e, com TOMTOM_API_KEY, considerando o trânsito ao
 * vivo (lentidão medida entra no tempo; vias fechadas são evitadas)
 * Corpo: {
 *   origem: { rua } | { lat, lng, rumo? }, destino: { rua } | { lat, lng },
 *   partida?: ISO 8601 (padrão: agora — define horário de pico),
 *   preferencias?: { criterio: 'rapida'|'curta', evitarTerra, evitarRodovias, evitarPedagio, evitarLadeiras },
 *   alternativas?: true — inclui `alternativas` (até 2 rotas diferentes, no mesmo formato)
 * }
 * `rumo` (graus, navegação em andamento) faz a rota partir para a frente do veículo.
 */
router.post('/:cidade/calcular', async (req, res) => {
  try {
    const grafo = await carregarGrafo(req.params.cidade);
    if (!grafo) return res.status(404).json({ error: "Mapa de rotas indisponível para esta cidade." });

    let origem = resolverPonto(grafo, req.body?.origem);
    if (origem.erro) return res.status(400).json({ error: `Origem: ${origem.erro}` });
    let destino = resolverPonto(grafo, req.body?.destino);
    if (destino.erro) return res.status(400).json({ error: `Destino: ${destino.erro}` });

    if (origem.id === destino.id) {
      return res.status(400).json({ error: "Origem e destino são o mesmo ponto." });
    }

    const partida = req.body?.partida ? new Date(req.body.partida) : new Date();
    if (Number.isNaN(partida.getTime())) {
      return res.status(400).json({ error: "Horário de partida inválido." });
    }

    const opcoes = {
      pico: ehHorarioPico(partida),
      preferencias: lerPreferencias(req.body?.preferencias),
      partida,
      rumoInicial: Number.isFinite(req.body?.origem?.rumo) ? req.body.origem.rumo : undefined,
    };

    // Sem o Supabase a rota ainda é calculada, só não desvia das ocorrências (o front avisa)
    let ocorrencias = [];
    let ocorrenciasIndisponiveis = false;
    try {
      ocorrencias = await carregarOcorrencias(grafo, req.params.cidade);
    } catch (err) {
      console.error("Erro ao carregar ocorrências para a rota:", err);
      ocorrenciasIndisponiveis = true;
    }
    const penalidades = montarPenalidades(ocorrencias);

    // Trânsito ao vivo: null sem chave configurada; uma falha nunca impede o cálculo da rota
    let transito = null;
    try {
      transito = await obterTransito(req.params.cidade, grafo);
    } catch (err) {
      console.error("Erro ao obter o trânsito ao vivo:", err);
      transito = { disponivel: false, atualizadoEm: null, incidentes: [] };
    }
    opcoes.atrasos = aplicarTransito(transito, penalidades);

    let caminho = buscarCaminho(grafo, origem.id, destino.id, { ...opcoes, penalidades });
    if (!caminho) {
      // Origem ou destino num pedaço da malha sem ida e volta (mão única sem saída, acesso de
      // condomínio): refaz o encaixe só no componente principal, onde todo par de nós tem caminho
      const origemAcessivel = resolverPonto(grafo, req.body.origem, { apenasComponentePrincipal: true });
      const destinoAcessivel = resolverPonto(grafo, req.body.destino, { apenasComponentePrincipal: true });
      if (!origemAcessivel.erro && !destinoAcessivel.erro && origemAcessivel.id !== destinoAcessivel.id) {
        caminho = buscarCaminho(grafo, origemAcessivel.id, destinoAcessivel.id, { ...opcoes, penalidades });
        if (caminho) {
          origem = origemAcessivel;
          destino = destinoAcessivel;
        }
      }
    }
    if (!caminho) {
      return res.status(404).json({ error: "Não foi possível encontrar uma rota entre esses pontos." });
    }

    // Ocorrências e incidentes de trânsito que cada caminho não consegue evitar e os que ele evitou
    // (estavam no caminho que seria escolhido sem eles — um segundo A*, só quando há algum)
    const caminhoSemOcorrencias =
      penalidades.size > 0 || opcoes.atrasos.size > 0
        ? (buscarCaminho(grafo, origem.id, destino.id, { ...opcoes, atrasos: undefined }) ?? [])
        : [];
    const consideradas = ocorrencias.filter((o) => o.localizacao).length;
    const avisos = avisosDeEncaixe(origem, destino);
    const montarRota = (trajeto, avaliacao) => ({
      ...avaliacao,
      ocorrencias: {
        consideradas,
        ...ocorrenciasDaRota(ocorrencias, trajeto, caminhoSemOcorrencias),
        indisponiveis: ocorrenciasIndisponiveis,
      },
      transito: transitoDaRota(transito, trajeto, caminhoSemOcorrencias, avaliacao.analise.composicaoTempo.transito),
      avisos,
    });

    const resposta = montarRota(caminho, avaliarCaminho(grafo, caminho, opcoes));
    if (req.body?.alternativas === true) {
      resposta.alternativas = buscarAlternativas(grafo, origem.id, destino.id, { ...opcoes, penalidades }, caminho)
        .map(({ caminho: alternativa, avaliacao }) => montarRota(alternativa, avaliacao));
    }
    return res.json(resposta);
  } catch (err) {
    console.error("Erro ao calcular rota:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

export default router;
