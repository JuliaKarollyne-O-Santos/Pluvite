// CALIBRAÇÃO DO TEMPO DE VIAGEM (SKILLS/rotas-tempo-viagem): compara o tempo previsto pelo modelo
// com uma referência medida e mostra o erro por horário, cidade e extensão do trajeto. Só lê dados:
// não altera PARAMETROS — o resultado orienta o ajuste dos valores marcados como "estimativa" em
// rotas/modeloTempo.js (depois do ajuste, rodar de novo e conferir os cenários de referência da skill).
//
// Referências:
//   TomTom (padrão) — Routing API com traffic=false e departAt numa quarta-feira futura: o tempo
//     típico daquele horário pelo histórico de trânsito da TomTom (historicTrafficTravelTimeInSeconds).
//     Precisa de TOMTOM_API_KEY em web/app/backend/.env. São 2 consultas por par (fora do pico e
//     pico); o plano gratuito da Routing API tem 20.000 por mês (docs.tomtom.com/pricing).
//   Registros de campo — arquivos JSON baixados em /Rotas?registrar (GUIA-TESTE-CAMPO-ROTAS.md):
//     tempo real cronometrado pelo GPS × tempo previsto na partida.
//
// Uso (na pasta web/app/backend):
//   node scripts/calibrar-tempos.js [--cidades "Taubaté,São José dos Campos"] [--pares 10] [--semente 7] [--saida resultado.json]
//   node scripts/calibrar-tempos.js --registros <pasta com os .json> [--saida resultado.json]
import dotenv from 'dotenv';
import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { distanciaMetros } from '../rotas/geo.js';
import { carregarGrafo } from '../rotas/grafo.js';
import { PARAMETROS, ehHorarioPico } from '../rotas/modeloTempo.js';
import { PREFERENCIAS_PADRAO, avaliarCaminho, buscarCaminho } from '../rotas/roteamento.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const CIDADES_PADRAO = ['Taubaté', 'São José dos Campos', 'Jacareí', 'Pindamonhangaba', 'Guaratinguetá', 'Caraguatatuba'];
const DISTANCIA_PAR = { minima: 1500, maxima: 12000 }; // m em linha reta entre origem e destino
// Rotas com extensões muito diferentes seguem corredores diferentes: o tempo não é comparável
const DIFERENCA_MAXIMA_EXTENSAO = 0.25;
const HORARIOS = [
  { nome: 'fora do pico', hora: '14:00:00' },
  { nome: 'pico', hora: '18:00:00' },
];
const INTERVALO_CONSULTAS_MS = 300;

// ───── ARGUMENTOS ─────

const lerArgumentos = (lista) => {
  const args = {};
  for (let i = 0; i < lista.length; i++) {
    if (!lista[i].startsWith('--')) continue;
    const chave = lista[i].slice(2);
    const valor = lista[i + 1] && !lista[i + 1].startsWith('--') ? lista[++i] : true;
    args[chave] = valor;
  }
  return args;
};

// ───── ESTATÍSTICA ─────

const mediana = (valores) => {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
};

// razão = previsto pelo Pluvite ÷ referência (> 1: o modelo prevê mais tempo que o medido)
const resumir = (linhas) => {
  const razoes = linhas.map((l) => l.previsto / l.referencia);
  if (razoes.length === 0) return null;
  return {
    trajetos: razoes.length,
    medianaRazao: Number(mediana(razoes).toFixed(3)),
    erroMedioPercentual: Number(((razoes.reduce((s, r) => s + Math.abs(r - 1), 0) / razoes.length) * 100).toFixed(1)),
    dentroDe20Porcento: Number(((razoes.filter((r) => Math.abs(r - 1) <= 0.2).length / razoes.length) * 100).toFixed(0)),
  };
};

const imprimirResumo = (titulo, resumo, unidade = 'trajetos') => {
  if (!resumo) return console.log(`  ${titulo.padEnd(26)} sem ${unidade}`);
  console.log(
    `  ${titulo.padEnd(26)} ${String(resumo.trajetos).padStart(3)} ${unidade} | razão mediana ${resumo.medianaRazao.toFixed(2)} | ` +
      `erro médio ${resumo.erroMedioPercentual}% | ${resumo.dentroDe20Porcento}% dentro de ±20%`,
  );
};

const agrupar = (linhas, chave) => {
  const grupos = new Map();
  for (const linha of linhas) {
    const valor = chave(linha);
    if (!grupos.has(valor)) grupos.set(valor, []);
    grupos.get(valor).push(linha);
  }
  return grupos;
};

const faixaDeExtensao = (metros) => (metros < 4000 ? 'até 4 km' : metros < 8000 ? '4 a 8 km' : 'mais de 8 km');

// ───── REFERÊNCIA TOMTOM ─────

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// Próxima quarta-feira a pelo menos 2 dias (data local de São Paulo, sem horário de verão desde 2019)
const proximaQuarta = () => {
  const dia = new Date(Date.now() - 3 * 3600 * 1000);
  dia.setUTCDate(dia.getUTCDate() + 2);
  while (dia.getUTCDay() !== 3) dia.setUTCDate(dia.getUTCDate() + 1);
  return dia.toISOString().slice(0, 10);
};

// A URL leva a chave: os erros mostram só o status HTTP
const consultarTomTom = async ([lat1, lng1], [lat2, lng2], partidaLocal, tentativa = 1) => {
  const parametros = new URLSearchParams({
    key: process.env.TOMTOM_API_KEY,
    travelMode: 'car',
    routeType: 'fastest',
    traffic: 'false', // ignora o trânsito de agora; o histórico do horário continua valendo
    departAt: partidaLocal, // sem fuso: a TomTom usa o fuso da origem
    computeTravelTimeFor: 'all',
    routeRepresentation: 'summaryOnly',
  });
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${lat1},${lng1}:${lat2},${lng2}/json?${parametros}`;
  let resposta;
  try {
    resposta = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error('falha de rede ao consultar a TomTom');
  }
  if (resposta.status === 429 && tentativa < 3) {
    await esperar(2000 * tentativa);
    return consultarTomTom([lat1, lng1], [lat2, lng2], partidaLocal, tentativa + 1);
  }
  if (!resposta.ok) throw new Error(`TomTom respondeu HTTP ${resposta.status}`);
  const resumo = (await resposta.json()).routes?.[0]?.summary;
  if (!resumo) throw new Error('resposta da TomTom sem rota');
  return {
    extensao: resumo.lengthInMeters,
    tempo: resumo.historicTrafficTravelTimeInSeconds ?? resumo.travelTimeInSeconds,
    tempoSemTransito: resumo.noTrafficTravelTimeInSeconds ?? null,
  };
};

// Pares origem → destino reprodutíveis (gerador congruencial com semente)
const sortearPares = (grafo, quantidade, semente) => {
  let estado = semente;
  const aleatorio = () => (estado = (estado * 16807) % 2147483647) / 2147483647;
  const nos = [...grafo.saidas.keys()];
  const opcoes = { pico: false, preferencias: { ...PREFERENCIAS_PADRAO } };
  const pares = [];
  for (let tentativa = 0; tentativa < quantidade * 40 && pares.length < quantidade; tentativa++) {
    const origem = nos[Math.floor(aleatorio() * nos.length)];
    const destino = nos[Math.floor(aleatorio() * nos.length)];
    const [a, b] = [grafo.nos.get(origem), grafo.nos.get(destino)];
    const reta = distanciaMetros(a.lat, a.lng, b.lat, b.lng);
    if (reta < DISTANCIA_PAR.minima || reta > DISTANCIA_PAR.maxima) continue;
    if (buscarCaminho(grafo, origem, destino, opcoes)) pares.push({ origem, destino });
  }
  return pares;
};

const calibrarComTomTom = async (args) => {
  if (!process.env.TOMTOM_API_KEY) {
    console.log('TOMTOM_API_KEY não configurada em web/app/backend/.env — veja GUIA-TESTE-CAMPO-ROTAS.md (seção "Chave da TomTom").');
    process.exitCode = 1;
    return null;
  }
  const cidades = typeof args.cidades === 'string' ? args.cidades.split(',').map((c) => c.trim()) : CIDADES_PADRAO;
  const quantidade = Number(args.pares) > 0 ? Number(args.pares) : 10;
  const semente = Number(args.semente) > 0 ? Number(args.semente) : 7;
  const data = proximaQuarta();
  console.log(`Referência: TomTom (histórico de trânsito de ${data}, quarta-feira) · ${quantidade} pares por cidade · semente ${semente}`);
  console.log(`Consultas previstas: até ${cidades.length * quantidade * HORARIOS.length}\n`);

  const linhas = [];
  for (const cidade of cidades) {
    const grafo = await carregarGrafo(cidade);
    if (!grafo) {
      console.log(`${cidade}: sem grafo — ignorada`);
      continue;
    }
    const pares = sortearPares(grafo, quantidade, semente);
    let falhas = 0;
    for (const { origem, destino } of pares) {
      for (const horario of HORARIOS) {
        const partidaLocal = `${data}T${horario.hora}`;
        const partida = new Date(`${partidaLocal}-03:00`);
        const opcoes = { pico: ehHorarioPico(partida), preferencias: { ...PREFERENCIAS_PADRAO }, partida };
        const caminho = buscarCaminho(grafo, origem, destino, opcoes);
        if (!caminho) continue;
        const nosso = avaliarCaminho(grafo, caminho, opcoes);
        try {
          const tomtom = await consultarTomTom(nosso.coordenadas[0], nosso.coordenadas[nosso.coordenadas.length - 1], partidaLocal);
          linhas.push({
            cidade,
            horario: horario.nome,
            extensao: nosso.distanciaMetros,
            extensaoReferencia: tomtom.extensao,
            previsto: nosso.duracaoSegundos,
            referencia: tomtom.tempo,
            referenciaSemTransito: tomtom.tempoSemTransito,
            comparavel: Math.abs(nosso.distanciaMetros - tomtom.extensao) / tomtom.extensao <= DIFERENCA_MAXIMA_EXTENSAO,
          });
        } catch (err) {
          falhas++;
          console.error(`  ${cidade}: ${err.message}`);
          if (/HTTP 40[13]/.test(err.message)) {
            console.log('Chave recusada pela TomTom (confira se a Routing API está liberada na sua conta).');
            return { linhas, interrompido: true };
          }
        }
        await esperar(INTERVALO_CONSULTAS_MS);
      }
    }
    console.log(`${cidade}: ${pares.length} pares, ${falhas} falha(s)`);
  }
  return { linhas, interrompido: false };
};

// ───── REFERÊNCIA: REGISTROS DO TESTE EM CAMPO ─────

const caminhoValido = (grafo, arestas) =>
  Array.isArray(arestas) && arestas.length > 0 &&
  arestas.every((id, i) => grafo.arestas[id] && (i === 0 || grafo.arestas[arestas[i - 1]].para === grafo.arestas[id].de));

const calibrarComRegistros = async (pasta) => {
  const arquivos = (await readdir(pasta)).filter((nome) => nome.toLowerCase().endsWith('.json'));
  console.log(`Referência: ${arquivos.length} registro(s) de campo em ${pasta}\n`);
  const linhas = [];
  const amostrasRestante = [];
  for (const nome of arquivos) {
    let registro;
    try {
      registro = JSON.parse(await readFile(path.join(pasta, nome), 'utf8'));
    } catch {
      console.log(`  ${nome}: não é um JSON válido — ignorado`);
      continue;
    }
    if (registro?.formato !== 'pluvite-registro-trajeto') {
      console.log(`  ${nome}: não é um registro do Pluvite — ignorado`);
      continue;
    }
    if (registro.simulado) {
      console.log(`  ${nome}: navegação simulada (?simular) — ignorado`);
      continue;
    }
    if (!registro.chegou || !registro.fim) {
      console.log(`  ${nome}: trajeto encerrado antes da chegada — ignorado`);
      continue;
    }
    const inicio = Date.parse(registro.inicio);
    const fim = Date.parse(registro.fim);
    const real = (fim - inicio) / 1000;

    // Mesmo caminho reavaliado com os PARAMETROS atuais (mostra o efeito de um ajuste já feito)
    let previstoAtual = null;
    const grafo = await carregarGrafo(registro.cidade);
    if (grafo && caminhoValido(grafo, registro.arestas)) {
      const partida = new Date(inicio);
      previstoAtual = avaliarCaminho(grafo, registro.arestas, {
        pico: ehHorarioPico(partida), preferencias: { ...PREFERENCIAS_PADRAO }, partida,
      }).duracaoSegundos;
    }

    linhas.push({
      arquivo: nome,
      cidade: registro.cidade,
      horario: ehHorarioPico(new Date(inicio)) ? 'pico' : 'fora do pico',
      extensao: registro.previsto.distanciaMetros,
      previsto: registro.previsto.duracaoSegundos,
      previstoComParametrosAtuais: previstoAtual,
      referencia: real,
      recalculos: registro.recalculos?.length ?? 0,
      comparavel: (registro.recalculos?.length ?? 0) === 0,
    });
    // Previsão do tempo restante ao longo do trajeto (uma amostra por minuto)
    let ultima = -Infinity;
    for (const amostra of registro.amostras ?? []) {
      if (amostra.t - ultima < 60000 || amostra.foraDaRota) continue;
      ultima = amostra.t;
      const restanteReal = (fim - amostra.t) / 1000;
      if (restanteReal >= 60) amostrasRestante.push({ previsto: amostra.tempoRestante, referencia: restanteReal });
    }
  }
  return { linhas, amostrasRestante, interrompido: false };
};

// ───── RELATÓRIO ─────

const relatar = ({ linhas, amostrasRestante }, fonte) => {
  const comparaveis = linhas.filter((l) => l.comparavel);
  console.log(`\nTrajetos: ${linhas.length} · comparáveis: ${comparaveis.length}` +
    (fonte === 'tomtom'
      ? ` (extensão até ${DIFERENCA_MAXIMA_EXTENSAO * 100}% diferente da rota da TomTom)`
      : ' (sem recálculo no caminho)'));
  console.log('razão = tempo previsto pelo Pluvite ÷ referência (> 1: o modelo prevê mais tempo que o medido)\n');
  imprimirResumo('TODOS', resumir(comparaveis));
  for (const [horario, grupo] of agrupar(comparaveis, (l) => l.horario)) imprimirResumo(horario, resumir(grupo));
  for (const [faixa, grupo] of agrupar(comparaveis, (l) => faixaDeExtensao(l.extensao))) imprimirResumo(faixa, resumir(grupo));
  for (const [cidade, grupo] of agrupar(comparaveis, (l) => l.cidade)) imprimirResumo(cidade, resumir(grupo));
  if (amostrasRestante?.length) imprimirResumo('tempo restante previsto', resumir(amostrasRestante), 'leituras');

  // Ponto de partida para o ajuste: o deslocamento é ~inversamente proporcional a fatorFluxoLivre e
  // o pico multiplica o deslocamento. É aproximado (semáforos e conversões não escalam junto):
  // ajustar, rodar de novo e conferir os cenários de referência da skill antes de aceitar.
  const fora = resumir(comparaveis.filter((l) => l.horario === 'fora do pico'));
  const pico = resumir(comparaveis.filter((l) => l.horario === 'pico'));
  console.log('\nLeitura: calibrado quando a razão mediana fica entre 0,90 e 1,10 e pelo menos 70% dos trajetos ficam dentro de ±20%.');
  if (fora && fora.trajetos >= 10 && Math.abs(fora.medianaRazao - 1) > 0.1) {
    const sugerido = Math.min(1, PARAMETROS.fatorFluxoLivre * fora.medianaRazao);
    console.log(`Sugestão (aproximada): fatorFluxoLivre ${PARAMETROS.fatorFluxoLivre} → ${sugerido.toFixed(2)} em rotas/modeloTempo.js.`);
  }
  if (fora && pico && pico.trajetos >= 10 && Math.abs(pico.medianaRazao / fora.medianaRazao - 1) > 0.1) {
    console.log(`Sugestão (aproximada): multiplicar PARAMETROS.pico.multiplicador por ${(1 / (pico.medianaRazao / fora.medianaRazao)).toFixed(2)}.`);
  }
  if (!fora || fora.trajetos < 10) console.log('Poucos trajetos para sugerir ajuste (mínimo 10 por horário).');
};

const args = lerArgumentos(process.argv.slice(2));
const fonte = args.registros ? 'registros' : 'tomtom';
const resultado = fonte === 'registros'
  ? await calibrarComRegistros(String(args.registros))
  : await calibrarComTomTom(args);

if (resultado) {
  relatar(resultado, fonte);
  if (typeof args.saida === 'string') {
    await writeFile(args.saida, JSON.stringify({ fonte, geradoEm: new Date().toISOString(), ...resultado }, null, 2));
    console.log(`\nResultado salvo em ${args.saida}`);
  }
}
