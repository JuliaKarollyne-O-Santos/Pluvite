import { Router } from 'express';
import { carregarGrafo, obterIndiceArquivos } from '../rotas/grafo.js';
import { ehHorarioPico } from '../rotas/modeloTempo.js';
import {
  carregarOcorrencias,
  montarPenalidades,
  ocorrenciasNoCaminho,
  resumirOcorrencia,
} from '../rotas/ocorrencias.js';
import {
  PREFERENCIAS_PADRAO,
  avaliarCaminho,
  buscarCaminho,
  resolverPonto,
} from '../rotas/roteamento.js';

const router = Router();

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
 * vias afetadas por ocorrências ativas do Feed
 * Corpo: {
 *   origem: { rua } | { lat, lng, rumo? }, destino: { rua } | { lat, lng },
 *   partida?: ISO 8601 (padrão: agora — define horário de pico),
 *   preferencias?: { criterio: 'rapida'|'curta', evitarTerra, evitarRodovias, evitarPedagio, evitarLadeiras }
 * }
 * `rumo` (graus, navegação em andamento) faz a rota partir para a frente do veículo.
 */
router.post('/:cidade/calcular', async (req, res) => {
  try {
    const grafo = await carregarGrafo(req.params.cidade);
    if (!grafo) return res.status(404).json({ error: "Mapa de rotas indisponível para esta cidade." });

    const origem = resolverPonto(grafo, req.body?.origem);
    if (origem.erro) return res.status(400).json({ error: `Origem: ${origem.erro}` });
    const destino = resolverPonto(grafo, req.body?.destino);
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

    const caminho = buscarCaminho(grafo, origem.id, destino.id, { ...opcoes, penalidades });
    if (!caminho) {
      return res.status(404).json({ error: "Não foi possível encontrar uma rota entre esses pontos." });
    }

    // Ocorrências que o caminho não consegue evitar e as que ele evitou (estavam no caminho que
    // seria escolhido sem elas — um segundo A*, só quando há alguma via penalizada)
    const naRota = ocorrenciasNoCaminho(ocorrencias, caminho);
    let evitadas = [];
    if (penalidades.size > 0) {
      const idsNaRota = new Set(naRota.map((o) => o.id));
      const caminhoSemOcorrencias = buscarCaminho(grafo, origem.id, destino.id, opcoes) ?? [];
      evitadas = ocorrenciasNoCaminho(ocorrencias, caminhoSemOcorrencias).filter((o) => !idsNaRota.has(o.id));
    }

    return res.json({
      ...avaliarCaminho(grafo, caminho, opcoes),
      ocorrencias: {
        consideradas: ocorrencias.filter((o) => o.localizacao).length,
        evitadas: evitadas.map(resumirOcorrencia),
        naRota: naRota.map(resumirOcorrencia),
        indisponiveis: ocorrenciasIndisponiveis,
      },
    });
  } catch (err) {
    console.error("Erro ao calcular rota:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

export default router;
