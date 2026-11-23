"use client";

import { useState, useEffect, type ComponentType } from "react";
import dynamic from "next/dynamic";
import {
  CircleCheckBig,
  TriangleAlert,
  CircleAlert,
  ArrowRight,
  Thermometer,
  Droplets,
  CloudRain,
  Wind,
  Sun,
  Moon,
  CloudSun,
  Search,
  ChevronDown,
  Clock,
  X,
} from "lucide-react";
import Link from "next/link";
import { supabase } from "../lib/banco";
import { CENTRO_MUNICIPIO } from "../lib/constantes";
import {
  analisarChuva,
  motivoDaChuva,
  nivelNoMapa,
  riscoDaChuva,
  situacaoDaCidade,
  NIVEIS_MAPA,
  type ContagemGravidade,
  type NivelMapa,
} from "../lib/riscoMapa";

// O dynamic() é guardado em globalThis pra o MESMO componente sobreviver aos hot reloads do
// modo desenvolvimento. Sem isso, salvar este arquivo recria o dynamic(), o React remonta o mapa
// e o Leaflet reclama "Map container is already initialized".
const MapaSemSSR: ComponentType<any> =
  (globalThis as any).__pluviteMapaVale ??
  ((globalThis as any).__pluviteMapaVale = dynamic(
    () => import("../components/MapaValeComponent"),
    {
      ssr: false,
      loading: () => (
        <div className="h-full w-full bg-slate-900 flex items-center justify-center text-white">
          <p className="animate-pulse tracking-wide text-sm font-medium">
            A carregar mapa interativo do Vale...
          </p>
        </div>
      ),
    },
  ));

// ───── GRAVIDADE DAS OCORRÊNCIAS DO FEED ─────
// O feed não tem um campo "gravidade", então ela é definida pelo TIPO da ocorrência.
// Para mudar a classificação, é só trocar os valores abaixo.
type Gravidade = "critico" | "medio" | "baixo";

const GRAVIDADE_POR_TIPO: Record<string, Gravidade> = {
  Alagamento: "critico",
  "Deslizamento de terra": "critico",
  "Árvore caída": "medio",
  "Via interditada": "medio",
  "Buraco na via": "baixo",
  Outros: "baixo",
};

// Ocorrências já concluídas não contam como alerta ativo
const STATUS_INATIVO = "Concluído";

// Remove acentos e maiúsculas pra "Sao Jose dos Campos" == "São José dos Campos"
const normalizar = (texto: string) =>
  (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// ───── BAIRRO -> CIDADE ─────
// Se alguém publicar no feed com a cidade errada (ex.: bairro Quiririm marcado como Arapeí),
// o bairro manda: a ocorrência é contada na cidade a que ele pertence.
// Para cobrir mais bairros, é só acrescentar linhas aqui (use só nomes que existam numa cidade).
const BAIRROS_POR_CIDADE: Record<string, string> = {
  [normalizar("Cecap")]: "Taubaté",
  [normalizar("Três Marias")]: "Taubaté",
  [normalizar("Quiririm")]: "Taubaté",
};

const cidadeDaOcorrencia = (oc: { cidade: string; bairro: string }) =>
  BAIRROS_POR_CIDADE[normalizar(oc.bairro)] ?? oc.cidade;

// ───── PREVISÃO DO TEMPO (mesma API da página de Clima) ─────
const WEATHER_API_KEY =
  process.env.NEXT_PUBLIC_WEATHER_API_KEY ?? "b73dd481d238464caf6232135262005";
const VALIDADE_CLIMA_MS = 10 * 60 * 1000; // reaproveita a consulta por 10 min

// Coordenadas de cada município (evita cidades homônimas de outros estados na WeatherAPI)
const COORDENADA_POR_CIDADE: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(CENTRO_MUNICIPIO).map(([nome, coordenada]) => [normalizar(nome), coordenada]),
);

async function buscarClimaCidade(cidade: string): Promise<any> {
  const coordenada = COORDENADA_POR_CIDADE[normalizar(cidade)];
  // Pelas coordenadas; sem elas, pelo nome com estado/país e depois só o nome
  const consultas = coordenada
    ? [`${coordenada[0]},${coordenada[1]}`]
    : [`${cidade}, São Paulo, Brazil`, cidade];
  for (const q of consultas) {
    const res = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(q)}&days=2&aqi=no&alerts=no&lang=pt`,
    );
    if (res.ok) return res.json();
  }
  throw new Error(`Sem dados de clima para ${cidade}`);
}

const SEM_OCORRENCIAS: ContagemGravidade = { critico: 0, medio: 0, baixo: 0 };

// ───── VISUAL DO CARD CONFORME A SITUAÇÃO ─────
const ESTILO_SITUACAO = {
  critico: {
    Icone: TriangleAlert,
    titulo: "Situação crítica",
    iconeFundo: "bg-red-100",
    iconeCor: "text-red-500",
    caixa: "bg-red-50 border-red-200 text-red-800",
    caixaIcone: "text-red-600",
    caixaTexto: "text-red-800",
  },
  atencao: {
    Icone: CircleAlert,
    titulo: "Situação de atenção",
    iconeFundo: "bg-yellow-100",
    iconeCor: "text-yellow-600",
    caixa: "bg-amber-50 border-amber-200 text-amber-900",
    caixaIcone: "text-amber-600",
    caixaTexto: "text-amber-800",
  },
  tranquilo: {
    Icone: CircleCheckBig,
    titulo: "Situação tranquila",
    iconeFundo: "bg-green-100",
    iconeCor: "text-green-500",
    caixa: "bg-green-50 border-green-200 text-green-800",
    caixaIcone: "text-green-600",
    caixaTexto: "text-green-800",
  },
} as const;

// Texto relativo ("há 15 minutos") igual ao do feed
const tempoRelativo = (dataIso: string) => {
  const minutos = Math.floor((Date.now() - new Date(dataIso).getTime()) / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
};

// Mesmas cores de status do feed
const ESTILO_STATUS: Record<string, string> = {
  Aguardando: "bg-red-50 text-red-700 border-red-200",
  "Em Andamento": "bg-amber-50 text-amber-800 border-amber-200",
  Visualizado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Concluído: "bg-slate-100 text-slate-600 border-slate-200",
};

const COR_GRAVIDADE: Record<Gravidade, string> = {
  critico: "bg-red-500",
  medio: "bg-amber-500",
  baixo: "bg-emerald-500",
};

const plural = (n: number, singular: string, pluralTxt: string) =>
  `${n} ${n === 1 ? singular : pluralTxt}`;

export default function PluviteVale() {
  const [localAberto, setLocalAberto] = useState<string | null>(null);
  const [dadosBairros, setDadosBairros] = useState<any>(null);
  const [buscaCidade, setBuscaCidade] = useState("");
  const [cidadeSelecionada, setCidadeSelecionada] = useState("");
  const [painelAberto, setPainelAberto] = useState(false);

  // Ocorrências vindas do mesmo banco do feed (só os campos necessários)
  const [ocorrencias, setOcorrencias] = useState<
    {
      id: string;
      tipo: string;
      cidade: string;
      bairro: string;
      status: string;
      criado_em: string;
    }[]
  >([]);
  const [carregandoOcorrencias, setCarregandoOcorrencias] = useState(true);

  // Previsão do tempo (WeatherAPI) por cidade, com cache. Chave: nome normalizado.
  // dados null = a consulta falhou (a cidade é colorida só pelas ocorrências)
  const [climaWeather, setClimaWeather] = useState<{
    [key: string]: { dados: any | null; ts: number };
  }>({});
  const [erroClima, setErroClima] = useState(false);

  // CARREGAMENTO DOS DADOS GEOGRÁFICOS DO MAPA
  useEffect(() => {
    fetch("/map.json")
      .then((res) => res.json())
      .then((data) => setDadosBairros(data))
      .catch((err) => console.error("Erro ao carregar o mapa JSON:", err));
  }, []);

  // CARREGAMENTO DAS OCORRÊNCIAS DO FEED + ATUALIZAÇÃO EM TEMPO REAL
  useEffect(() => {
    const carregarOcorrencias = async () => {
      const { data, error } = await supabase
        .from("ocorrencias")
        .select("id, tipo, cidade, bairro, status, criado_em");

      if (error) {
        console.error("Erro ao carregar ocorrências do feed:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
      } else {
        setOcorrencias(data || []);
      }
      setCarregandoOcorrencias(false);
    };

    carregarOcorrencias();

    // Quando alguém publica/atualiza/apaga uma ocorrência no feed, recarrega os números.
    // (Precisa do Realtime ativado para a tabela "ocorrencias" no Supabase.)
    const canalOcorrencias = supabase
      .channel("canal-ocorrencias-mapa")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ocorrencias" },
        () => carregarOcorrencias(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalOcorrencias);
    };
  }, []);

  // PREVISÃO DO TEMPO DE TODAS AS CIDADES (cores do mapa), renovada a cada 10 min
  useEffect(() => {
    let cancelado = false;
    const carregarClimaDoVale = () => {
      for (const cidade of Object.keys(CENTRO_MUNICIPIO)) {
        buscarClimaCidade(cidade)
          .then((dados) => ({ dados, ts: Date.now() }))
          .catch((e) => {
            console.error(`Erro ao buscar clima de ${cidade}:`, e);
            return { dados: null, ts: Date.now() };
          })
          .then((entrada) => {
            if (!cancelado) {
              setClimaWeather((prev) => ({ ...prev, [normalizar(cidade)]: entrada }));
            }
          });
      }
    };
    carregarClimaDoVale();
    const intervalo = setInterval(carregarClimaDoVale, VALIDADE_CLIMA_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  // BUSCA DA PREVISÃO DO TEMPO DA CIDADE ABERTA (se ainda não veio, falhou ou venceu)
  useEffect(() => {
    if (!localAberto) return;
    const cidade = localAberto;
    setErroClima(false);

    const emCache = climaWeather[normalizar(cidade)];
    if (emCache?.dados && Date.now() - emCache.ts < VALIDADE_CLIMA_MS) return;

    let cancelado = false;
    const buscar = async () => {
      try {
        const dados = await buscarClimaCidade(cidade);
        if (!cancelado) {
          setClimaWeather((prev) => ({
            ...prev,
            [normalizar(cidade)]: { dados, ts: Date.now() },
          }));
        }
      } catch (e) {
        console.error("Erro ao buscar clima:", e);
        if (!cancelado) setErroClima(true);
      }
    };
    buscar();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localAberto]);

  // TRATAMENTO E EXTRAÇÃO DOS DADOS DE CLIMA DA CIDADE SELECIONADA
  const climaCidadeAberta = localAberto ? climaWeather[normalizar(localAberto)]?.dados : null;
  const temperaturaAtual = climaCidadeAberta?.current?.temp_c?.toFixed(1);
  const umidade = climaCidadeAberta?.current?.humidity;
  const sensacao = climaCidadeAberta?.current?.feelslike_c?.toFixed(0);
  const vento = climaCidadeAberta?.current?.wind_kph?.toFixed(0);
  const indiceUV = climaCidadeAberta?.current?.uv;
  const condicaoAtual: string = climaCidadeAberta?.current?.condition?.text ?? "";
  const hoje = climaCidadeAberta?.forecast?.forecastday?.[0]?.day;
  const atualizadoAs: string = climaCidadeAberta?.current?.last_updated?.split(" ")[1] ?? "";

  // Chuva agora / prevista, total em 24h e próximas 6 horas (lib/riscoMapa.ts)
  const chuva = analisarChuva(climaCidadeAberta);
  const chuvaTotal = chuva.total;
  const proximasHoras = chuva.proximasHoras;

  // CONTAGEM DAS OCORRÊNCIAS DA CIDADE ABERTA, DIRETO DO FEED
  // - "contagem": todas as publicações da cidade (todos os bairros), separadas por gravidade
  // - "ativas": só as que ainda não foram concluídas (alimentam a "Situação")
  const contagem = { critico: 0, medio: 0, baixo: 0 };
  const ativas = { critico: 0, medio: 0, baixo: 0 };
  let resolvidas = 0;
  const ocorrenciasDaCidade = localAberto
    ? ocorrencias
      .filter(
        (oc) =>
          normalizar(cidadeDaOcorrencia(oc)) === normalizar(localAberto),
      )
      .sort(
        (a, b) =>
          new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
      )
    : [];
  for (const oc of ocorrenciasDaCidade) {
    const gravidade = GRAVIDADE_POR_TIPO[oc.tipo] ?? "baixo";
    contagem[gravidade]++;
    if (oc.status === STATUS_INATIVO) resolvidas++;
    else ativas[gravidade]++;
  }
  const recentes = ocorrenciasDaCidade.slice(0, 3);
  const totalAtivas = ativas.critico + ativas.medio + ativas.baixo;

  // RESUMO DO VALE INTEIRO (todas as cidades), mostrado na legenda
  const ativasVale = ocorrencias.filter((oc) => oc.status !== STATUS_INATIVO);
  const criticasVale = ativasVale.filter(
    (oc) => (GRAVIDADE_POR_TIPO[oc.tipo] ?? "baixo") === "critico",
  ).length;
  const cidadesAfetadas = new Set(
    ativasVale.map((oc) => normalizar(cidadeDaOcorrencia(oc))),
  ).size;

  // SITUAÇÃO GERAL DA CIDADE (alertas ativos do feed + intensidade da chuva)
  const nivelSituacao = situacaoDaCidade(ativas, riscoDaChuva(chuva));

  // NÍVEL DE CADA CIDADE NO MAPA — mesma regra do card acima, para as 39 cidades.
  // Sem entrada = ainda carregando (marcador cinza)
  const ativasPorCidade: Record<string, ContagemGravidade> = {};
  for (const oc of ativasVale) {
    const chave = normalizar(cidadeDaOcorrencia(oc));
    ativasPorCidade[chave] ??= { critico: 0, medio: 0, baixo: 0 };
    ativasPorCidade[chave][GRAVIDADE_POR_TIPO[oc.tipo] ?? "baixo"]++;
  }
  const nivelPorCidade: Record<string, NivelMapa> = {};
  if (!carregandoOcorrencias) {
    for (const [chave, entrada] of Object.entries(climaWeather)) {
      nivelPorCidade[chave] = nivelNoMapa(
        ativasPorCidade[chave] ?? SEM_OCORRENCIAS,
        riscoDaChuva(analisarChuva(entrada.dados)),
      );
    }
  }

  const estiloSituacao = ESTILO_SITUACAO[nivelSituacao];
  const IconeSituacao = estiloSituacao.Icone;

  const mensagemChuva = motivoDaChuva(chuva, localAberto ?? "");

  const sufixoResolvidas =
    resolvidas > 0
      ? ` ${plural(resolvidas, "ocorrência já resolvida", "ocorrências já resolvidas")}.`
      : "";

  let mensagemSituacao = `Nenhum alerta ativo para ${localAberto} no momento.${sufixoResolvidas}`;
  if (nivelSituacao === "critico") {
    mensagemSituacao =
      ativas.critico > 0
        ? `${plural(ativas.critico, "alerta crítico ativo", "alertas críticos ativos")} em ${localAberto}.${sufixoResolvidas}`
        : mensagemChuva;
  } else if (nivelSituacao === "atencao") {
    mensagemSituacao =
      ativas.medio > 0
        ? `${plural(ativas.medio, "alerta de gravidade média ativo", "alertas de gravidade média ativos")} em ${localAberto}. Fique atento.${sufixoResolvidas}`
        : mensagemChuva;
  } else if (ativas.baixo > 0) {
    mensagemSituacao = `Apenas ${plural(ativas.baixo, "alerta de baixa gravidade ativo", "alertas de baixa gravidade ativos")} em ${localAberto}.${sufixoResolvidas}`;
  }

  // Enquanto as ocorrências carregam, mostra "–" no lugar dos números
  const valorContador = (n: number) => (carregandoOcorrencias ? "–" : n);

  return (
    // TELA CHEIA abaixo da navbar (tela-cheia no globals.css): a página não rola e nenhuma caixa
    // passa da largura do celular (antes a coluna da esquerda ia até 428px e alargava a página)
    <main className="tela-cheia overflow-hidden bg-slate-900">
      {/* RENDERIZAÇÃO DO COMPONENTE DE MAPA */}
      {dadosBairros ? (
        <MapaSemSSR
          bairrosDados={dadosBairros}
          setLocalAberto={setLocalAberto}
          cidadeSelecionada={cidadeSelecionada}
          nivelPorCidade={nivelPorCidade}
        />
      ) : (
        <div className="h-full w-full bg-slate-900 flex items-center justify-center text-white">
          <p className="animate-pulse tracking-wide text-sm font-medium">
            Carregando dados geográficos...
          </p>
        </div>
      )}

      {/* COLUNA ESQUERDA: RESUMO DO VALE + LEGENDA + SELEÇÃO E BUSCA DE MUNICÍPIOS
          Gaveta embaixo no celular (some enquanto o card de uma cidade está aberto, para as duas
          não se empilharem) e coluna à esquerda, ao lado do zoom, no computador */}
      <div
        className={`absolute z-[9999] inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[calc(100%-1.5rem)] flex flex-col gap-2 md:inset-x-auto md:bottom-auto md:top-2.5 md:left-14 md:w-72 md:max-h-[calc(100%-1.25rem)] ${localAberto ? "max-md:hidden" : ""}`}
      >
        {/* RESUMO DO VALE + LEGENDA DOS NÍVEIS */}
        <div className="bg-white rounded-lg shadow-lg border border-slate-200 w-full shrink-0 overflow-hidden">
          <div className="px-4 pt-3.5 pb-3 bg-[#0b1f6e] text-white">
            <p className="text-[11px] font-medium uppercase tracking-wider text-blue-100/80">
              Vale do Paraíba · agora
            </p>
            <div className="mt-2 grid grid-cols-3 divide-x divide-white/15">
              {[
                { rotulo: "Ativas", valor: ativasVale.length },
                { rotulo: "Críticas", valor: criticasVale },
                { rotulo: "Cidades", valor: cidadesAfetadas },
              ].map((item) => (
                <div key={item.rotulo} className="px-2 first:pl-0">
                  <p className="text-xl font-semibold tabular-nums leading-tight">
                    {carregandoOcorrencias ? "–" : item.valor}
                  </p>
                  <p className="text-[11px] text-blue-100/80">{item.rotulo}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50">
            <p className="text-[11px] text-slate-500 mb-1.5">Nível de risco no mapa</p>
            <div className="flex items-center justify-between gap-2">
              {NIVEIS_MAPA.map((n) => (
                <span key={n.rotulo} className="flex items-center gap-1.5 text-xs text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: n.cor }} />
                  {n.rotulo}
                </span>
              ))}
            </div>
          </div>
        </div>

        {dadosBairros && (
          <div className="min-h-0 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <button
              onClick={() => setPainelAberto(!painelAberto)}
              aria-expanded={painelAberto}
              className="w-full shrink-0 flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Municípios monitorados</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {dadosBairros.features?.length ?? 0} cidades · selecione para ver detalhes
                </p>
              </div>
              <ChevronDown
                size={16}
                className={`text-slate-500 shrink-0 transition-transform ${painelAberto ? "rotate-180" : ""}`}
              />
            </button>

            {painelAberto && (
              <>
                <div className="px-3 pb-3 border-b border-slate-200">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar cidade..."
                      value={buscaCidade}
                      onChange={(e) => setBuscaCidade(e.target.value)}
                      className="w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 text-sm outline-none focus:border-[#0b1f6e] focus:ring-2 focus:ring-[#0b1f6e]/15"
                    />
                  </div>
                  {cidadeSelecionada && (
                    <div className="mt-2 flex items-center justify-between rounded-md bg-slate-100 px-3 py-1.5 text-sm">
                      <span className="font-medium text-slate-800 truncate">{cidadeSelecionada}</span>
                      <button
                        onClick={() => {
                          setCidadeSelecionada("");
                          setBuscaCidade("");
                        }}
                        className="text-slate-500 hover:text-slate-900 cursor-pointer"
                        title="Limpar seleção"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* No celular a lista é mais baixa para o mapa continuar aparecendo acima da gaveta */}
                <div className="min-h-0 flex-1 max-h-[350px] max-md:max-h-[35dvh] overflow-y-auto py-1">
                  {dadosBairros.features
                    ?.filter((feature: any) => {
                      const nome =
                        feature.properties.NM_MUN ||
                        feature.properties.name ||
                        feature.properties.NM_MUNICIPIO ||
                        "";
                      return nome
                        .toLowerCase()
                        .includes(buscaCidade.toLowerCase());
                    })
                    .sort((a: any, b: any) => {
                      const nomeA =
                        a.properties.NM_MUN ||
                        a.properties.name ||
                        a.properties.NM_MUNICIPIO;
                      const nomeB =
                        b.properties.NM_MUN ||
                        b.properties.name ||
                        b.properties.NM_MUNICIPIO;
                      return nomeA.localeCompare(nomeB);
                    })
                    .map((feature: any, index: number) => {
                      const nome =
                        feature.properties.NM_MUN ||
                        feature.properties.name ||
                        feature.properties.NM_MUNICIPIO;
                      const ativasCidade = ativasVale.filter(
                        (oc) => normalizar(cidadeDaOcorrencia(oc)) === normalizar(nome),
                      ).length;

                      return (
                        <button
                          key={index}
                          onClick={() => {
                            setCidadeSelecionada(nome);
                            setLocalAberto(nome);
                          }}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors cursor-pointer ${cidadeSelecionada === nome
                            ? "bg-slate-100 text-slate-900 font-medium"
                            : "text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                          <span className="truncate">{nome}</span>
                          {ativasCidade > 0 && (
                            <span className="shrink-0 text-[11px] font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                              {ativasCidade} {ativasCidade === 1 ? "ativa" : "ativas"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* CARD DA CIDADE SELECIONADA: gaveta embaixo no celular, à direita no computador */}
      <div className="absolute z-[9999] inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[calc(100%-1.5rem)] flex flex-col md:inset-x-auto md:bottom-auto md:top-4 md:right-4 md:w-[380px] md:max-h-[calc(100%-2rem)]">
        {localAberto && (
          <div className="relative bg-white w-full min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-lg shadow-2xl border border-slate-200 flex flex-col">
            {/* CABEÇALHO */}
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3.5 border-b border-slate-200">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Município monitorado
                </p>
                <h2 className="text-lg font-semibold text-slate-900 leading-tight truncate mt-0.5">
                  {localAberto}
                </h2>
                {atualizadoAs && (
                  <p className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                    <Clock size={12} />
                    Clima atualizado às {atualizadoAs}
                  </p>
                )}
              </div>
              <button
                onClick={() => setLocalAberto(null)}
                className="p-1.5 -mr-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer transition-colors"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            {/* SITUAÇÃO */}
            <div className={`mx-5 mt-4 px-3.5 py-3 border rounded-md ${estiloSituacao.caixa}`}>
              <div className="flex items-center gap-2">
                <IconeSituacao size={16} className={estiloSituacao.caixaIcone} />
                <h3 className="font-semibold text-sm">{estiloSituacao.titulo}</h3>
              </div>
              <p className={`mt-1 text-xs leading-relaxed ${estiloSituacao.caixaTexto}`}>
                {mensagemSituacao}
              </p>
            </div>

            {/* CLIMA */}
            <section className="px-5 pt-4">
              <h3 className="text-xs font-medium text-slate-500 mb-2">Clima agora</h3>
              {climaCidadeAberta ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-3xl font-semibold text-slate-900 tabular-nums leading-none">
                        {temperaturaAtual}°
                      </p>
                      <p className="text-xs text-slate-600 mt-1.5">
                        {condicaoAtual}
                        {sensacao !== undefined && ` · sensação de ${sensacao}°`}
                      </p>
                    </div>
                    {hoje && (
                      <div className="text-right text-xs text-slate-600 tabular-nums">
                        <p>
                          Máx. <span className="font-medium text-slate-900">{Math.round(hoje.maxtemp_c)}°</span>
                          {"  "}Mín. <span className="font-medium text-slate-900">{Math.round(hoje.mintemp_c)}°</span>
                        </p>
                        <p className="mt-0.5">Chance de chuva hoje: {hoje.daily_chance_of_rain}%</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-4 rounded-md border border-slate-200 divide-x divide-slate-200">
                    {[
                      { Icone: Droplets, valor: `${umidade}%`, rotulo: "Umidade", cor: "text-sky-600" },
                      { Icone: CloudRain, valor: `${chuvaTotal.toFixed(1)} mm`, rotulo: "Chuva 24h", cor: "text-blue-700" },
                      { Icone: Wind, valor: `${vento} km/h`, rotulo: "Vento", cor: "text-teal-600" },
                      { Icone: Sun, valor: indiceUV ?? "–", rotulo: "Índice UV", cor: "text-amber-500" },
                    ].map((m) => (
                      <div key={m.rotulo} className="px-2 py-2 text-center">
                        <m.Icone size={14} className={`mx-auto ${m.cor}`} />
                        <p className="text-[13px] font-medium text-slate-900 mt-1 tabular-nums whitespace-nowrap">{m.valor}</p>
                        <p className="text-[11px] text-slate-500">{m.rotulo}</p>
                      </div>
                    ))}
                  </div>

                  <p className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                    <Thermometer size={13} className="text-orange-500 shrink-0" />
                    {chuva.linha}
                  </p>

                  {proximasHoras.length > 0 && (
                    <div className="grid grid-cols-6 gap-1 [@media(max-height:700px)]:hidden">
                      {proximasHoras.map((h: any) => {
                        const chance = h.chance_of_rain ?? 0;
                        const IconeHora =
                          chance >= 60 ? CloudRain : chance >= 30 ? CloudSun : h.is_day ? Sun : Moon;
                        return (
                          <div key={h.time} className="flex flex-col items-center py-1.5">
                            <span className="text-[11px] text-slate-500 tabular-nums">
                              {h.time.split(" ")[1]}
                            </span>
                            <IconeHora size={16} className={`my-1 ${chance >= 30 ? "text-[#0f35a0]" : "text-slate-400"}`} />
                            <span className="text-[11px] font-medium text-slate-700 tabular-nums">{chance}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 rounded-md bg-slate-50 border border-slate-200 p-3">
                  {erroClima
                    ? "Não foi possível carregar o clima desta cidade."
                    : "Carregando dados do clima..."}
                </p>
              )}
            </section>

            {/* OCORRÊNCIAS */}
            <section className="px-5 pt-4">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-xs font-medium text-slate-500">Ocorrências registradas</h3>
                <span className="text-[11px] text-slate-500">
                  {carregandoOcorrencias ? "" : `${totalAtivas} ativas · ${resolvidas} resolvidas`}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { rotulo: "Críticas", valor: contagem.critico, cor: "bg-red-500", card: "bg-red-50 border-red-200" },
                  { rotulo: "Médias", valor: contagem.medio, cor: "bg-amber-500", card: "bg-amber-50 border-amber-200" },
                  { rotulo: "Baixas", valor: contagem.baixo, cor: "bg-emerald-500", card: "bg-emerald-50 border-emerald-200" },
                ].map((c) => (
                  <div key={c.rotulo} className={`rounded-md border px-3 py-2 ${c.card}`}>
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span className={`w-1.5 h-1.5 rounded-full ${c.cor}`} />
                      {c.rotulo}
                    </p>
                    <p className="text-lg font-semibold text-slate-900 tabular-nums leading-tight mt-0.5">
                      {valorContador(c.valor)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* ÚLTIMAS OCORRÊNCIAS */}
            <section className="px-5 pt-4 [@media(max-height:600px)]:hidden">
              <h3 className="text-xs font-medium text-slate-500 mb-1">Mais recentes</h3>
              {carregandoOcorrencias ? (
                <p className="text-xs text-slate-500 py-2">Carregando...</p>
              ) : recentes.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  Nenhuma publicação em {localAberto} ainda.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentes.map((oc) => (
                    <li key={oc.id}>
                      <Link
                        href={`/Feed?ocorrencia=${oc.id}`}
                        className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-md hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${COR_GRAVIDADE[GRAVIDADE_POR_TIPO[oc.tipo] ?? "baixo"]}`}
                          />
                          <div className="min-w-0 leading-tight">
                            <p className="text-[13px] font-medium text-slate-900 truncate">{oc.tipo}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {oc.bairro} · {tempoRelativo(oc.criado_em)}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded border shrink-0 ${ESTILO_STATUS[oc.status] ?? ESTILO_STATUS.Concluído}`}
                        >
                          {oc.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="p-5 pt-4">
              <Link
                href={`/Feed?local=${encodeURIComponent(localAberto)}`}
                className="bg-[#0b1f6e] w-full rounded-md text-white flex items-center justify-center py-2.5 text-[13px] font-medium hover:bg-[#0f35a0] transition-colors gap-1.5 cursor-pointer"
              >
                Ver publicações de {localAberto}
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
