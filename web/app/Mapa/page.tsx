"use client";

import { useState, useEffect, type ComponentType } from "react";
import dynamic from "next/dynamic";
import {
  CircleCheckBig,
  Users,
  TriangleAlert,
  CircleAlert,
  CircleCheck,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { supabase } from "../lib/banco";

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
        <div className="h-screen w-full bg-slate-900 flex items-center justify-center text-white">
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

// ───── INTENSIDADE DA CHUVA (em mm por hora) ─────
const classificarChuva = (mmPorHora: number) => {
  if (mmPorHora < 0.1) return { texto: "Sem chuva", nivel: 0 };
  if (mmPorHora < 2.5) return { texto: "Chuva fraca", nivel: 1 };
  if (mmPorHora < 7.6) return { texto: "Chuva moderada", nivel: 2 };
  if (mmPorHora < 25) return { texto: "Chuva forte", nivel: 3 };
  return { texto: "Chuva muito forte", nivel: 4 };
};

// ───── VISUAL DO CARD CONFORME A SITUAÇÃO ─────
type NivelSituacao = "critico" | "atencao" | "tranquilo";

const ESTILO_SITUACAO = {
  critico: {
    Icone: TriangleAlert,
    titulo: "Situação crítica",
    iconeFundo: "bg-red-100",
    iconeCor: "text-red-500",
    caixa: "bg-red-50 border-red-200 text-red-800",
    caixaIcone: "text-red-600",
    caixaTexto: "text-red-700/90",
  },
  atencao: {
    Icone: CircleAlert,
    titulo: "Situação de atenção",
    iconeFundo: "bg-yellow-100",
    iconeCor: "text-yellow-600",
    caixa: "bg-yellow-50 border-yellow-200 text-yellow-800",
    caixaIcone: "text-yellow-600",
    caixaTexto: "text-yellow-700/90",
  },
  tranquilo: {
    Icone: CircleCheckBig,
    titulo: "Situação tranquila",
    iconeFundo: "bg-green-100",
    iconeCor: "text-green-500",
    caixa: "bg-green-50 border-green-200 text-green-800",
    caixaIcone: "text-green-600",
    caixaTexto: "text-green-700/90",
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
  medio: "bg-yellow-500",
  baixo: "bg-green-500",
};

const plural = (n: number, singular: string, pluralTxt: string) =>
  `${n} ${n === 1 ? singular : pluralTxt}`;

export default function PluviteVale() {
  const [localAberto, setLocalAberto] = useState<string | null>(null);
  const [dadosBairros, setDadosBairros] = useState<any>(null);
  const [exibirAlerta, setExibirAlerta] = useState(false);
  const [buscaCidade, setBuscaCidade] = useState("");
  const [cidadeSelecionada, setCidadeSelecionada] = useState("");
  const [painelAberto, setPainelAberto] = useState(false);
  const [climaPorCidade, setClimaPorCidade] = useState<{ [key: string]: any }>(
    {},
  );

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

  // Previsão do tempo (WeatherAPI) por cidade, com cache
  const [climaWeather, setClimaWeather] = useState<{
    [key: string]: { dados: any; ts: number };
  }>({});
  const [erroClima, setErroClima] = useState(false);

  const [dadosAlerta, setDadosAlerta] = useState<{
    cidade: string;
    condicao: string;
    temperatura: string;
    nome: string;
  } | null>(null);

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

  // BUSCA DA PREVISÃO DO TEMPO DA CIDADE ABERTA (WeatherAPI, como na página de Clima)
  useEffect(() => {
    if (!localAberto) return;
    const cidade = localAberto;
    setErroClima(false);

    const emCache = climaWeather[cidade];
    if (emCache && Date.now() - emCache.ts < VALIDADE_CLIMA_MS) return;

    let cancelado = false;
    const buscar = async () => {
      try {
        // Primeiro com estado/país pra não confundir com cidade homônima; depois só o nome
        const consultas = [`${cidade}, São Paulo, Brazil`, cidade];
        let dados: any = null;
        for (const q of consultas) {
          const res = await fetch(
            `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(q)}&days=2&aqi=no&alerts=no&lang=pt`,
          );
          if (res.ok) {
            dados = await res.json();
            break;
          }
        }
        if (!dados) throw new Error("Sem dados de clima");
        if (!cancelado) {
          setClimaWeather((prev) => ({
            ...prev,
            [cidade]: { dados, ts: Date.now() },
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

  // CONFIGURAÇÃO DO CANAL DE REALTIME DO SUPABASE
  useEffect(() => {
    const idCidadaoLogado = 1;
    const nomeCidadaoLogado = "Quezia";

    const canalRealtimes = supabase
      .channel("canal-pluvite")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alertas_tempo_real" },
        (payload) => {
          const novoAlerta = payload.new;
          if (novoAlerta.id_cidadao === idCidadaoLogado) {
            setDadosAlerta({
              cidade: novoAlerta.cidade_alerta,
              condicao: novoAlerta.condicao,
              temperatura: novoAlerta.temperatura,
              nome: nomeCidadaoLogado,
            });
            setExibirAlerta(true);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalRealtimes);
    };
  }, []);

  // TRATAMENTO E EXTRAÇÃO DOS DADOS DE CLIMA DA CIDADE SELECIONADA
  const climaCidadeAberta = localAberto ? climaWeather[localAberto]?.dados : null;
  const temperaturaAtual = climaCidadeAberta?.current?.temp_c?.toFixed(1);
  const umidade = climaCidadeAberta?.current?.humidity;

  let chuvaTotal = 0; // mm acumulados nas próximas 24h
  let proximasHoras: any[] = []; // próximas 6 horas, pra faixa de chance de chuva
  let chuva = {
    nivel: 0,
    texto: "Sem chuva",
    linha: "Sem previsão de chuva",
    emAndamento: false,
  };

  if (climaCidadeAberta) {
    const agoraLocal = new Date(
      climaCidadeAberta.location.localtime.replace(" ", "T"),
    ).getTime();

    // Próximas 24 horas (incluindo a hora atual), juntando hoje e amanhã
    const proximas24h: any[] = climaCidadeAberta.forecast.forecastday
      .flatMap((dia: any) => dia.hour)
      .filter(
        (h: any) =>
          new Date(h.time.replace(" ", "T")).getTime() > agoraLocal - 3600000,
      )
      .slice(0, 24);

    const mmAgora: number = climaCidadeAberta.current.precip_mm ?? 0;
    const mmPorHora: number[] = proximas24h.map((h: any) => h.precip_mm ?? 0);
    const mmMax = Math.max(mmAgora, ...mmPorHora, 0);
    chuvaTotal = mmPorHora.reduce((soma, mm) => soma + mm, 0);
    proximasHoras = proximas24h.slice(0, 6);

    const classe = classificarChuva(mmMax);
    const primeiraHoraComChuva = proximas24h.find(
      (h: any) => (h.precip_mm ?? 0) >= 0.1,
    );

    if (mmAgora >= 0.1) {
      chuva = {
        nivel: classe.nivel,
        texto: classe.texto,
        linha: `${classificarChuva(mmAgora).texto} agora`,
        emAndamento: true,
      };
    } else if (primeiraHoraComChuva) {
      chuva = {
        nivel: classe.nivel,
        texto: classe.texto,
        linha: `${classe.texto} prevista às ${primeiraHoraComChuva.time.split(" ")[1]}`,
        emAndamento: false,
      };
    } else {
      chuva = {
        nivel: 0,
        texto: "Sem chuva",
        linha: `${climaCidadeAberta.current.condition.text} · sem chuva prevista`,
        emAndamento: false,
      };
    }
  }

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
  const recentes = ocorrenciasDaCidade.slice(0, 2);

  // RESUMO DO VALE INTEIRO (todas as cidades), mostrado na legenda
  const ativasVale = ocorrencias.filter((oc) => oc.status !== STATUS_INATIVO);
  const criticasVale = ativasVale.filter(
    (oc) => (GRAVIDADE_POR_TIPO[oc.tipo] ?? "baixo") === "critico",
  ).length;
  const cidadesAfetadas = new Set(
    ativasVale.map((oc) => normalizar(cidadeDaOcorrencia(oc))),
  ).size;

  // SITUAÇÃO GERAL DA CIDADE (alertas ativos do feed + intensidade da chuva)
  let nivelSituacao: NivelSituacao = "tranquilo";
  if (ativas.critico > 0 || chuva.nivel >= 4) nivelSituacao = "critico";
  else if (ativas.medio > 0 || chuva.nivel >= 3) nivelSituacao = "atencao";

  const estiloSituacao = ESTILO_SITUACAO[nivelSituacao];
  const IconeSituacao = estiloSituacao.Icone;

  const mensagemChuva = chuva.emAndamento
    ? `${chuva.texto} em andamento em ${localAberto}.`
    : `${chuva.texto} prevista para ${localAberto} nas próximas 24h.`;

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
    <main className="h-screen w-full relative  mt-10">
      {/* RENDERIZAÇÃO DO COMPONENTE DE MAPA */}
      {dadosBairros ? (
        <MapaSemSSR
          bairrosDados={dadosBairros}
          setLocalAberto={setLocalAberto}
          cidadeSelecionada={cidadeSelecionada}
          climaPorCidade={climaPorCidade}
          setClimaPorCidade={setClimaPorCidade}
        />
      ) : (
        <div className="h-screen w-full bg-slate-900 flex items-center justify-center text-white">
          <p className="animate-pulse tracking-wide text-sm font-medium">
            A ler dados geográficos...
          </p>
        </div>
      )}

      {/* COLUNA ESQUERDA: LEGENDA DE GRAVIDADE + SELEÇÃO E BUSCA DE MUNICÍPIOS */}
      <div className="absolute top-10 left-35 z-[9999] w-72 flex flex-col gap-2">
        {/* BLOCO DE LEGENDA DOS NÍVEIS DE GRAVIDADE */}
        <div className="bg-white/95 p-3 rounded-xl shadow-xl border border-slate-200 w-full">
          <h4 className="text-xs font-bold text-slate-800 mb-2">
            Nível de gravidade dos alertas de chuva:
          </h4>
          <div className="flex flex-row gap-2 justify-between">
            <div className="flex items-center gap-1.5">
              <span
                className="rounded-full bg-[#16a34a] border border-black inline-block shrink-0"
                style={{ width: "14px", height: "14px" }}
              ></span>
              <span className="text-[11px] text-slate-700 font-medium">
                Baixo
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className="rounded-full bg-[#ea580c] border border-black inline-block shrink-0"
                style={{ width: "14px", height: "14px" }}
              ></span>
              <span className="text-[11px] text-slate-700 font-medium">
                Médio
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className="rounded-full bg-[#dc2626] border border-black inline-block shrink-0"
                style={{ width: "14px", height: "14px" }}
              ></span>
              <span className="text-[11px] text-slate-700 font-medium">
                Alto
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className="rounded-full bg-[#7c3aed] border border-black inline-block shrink-0"
                style={{ width: "14px", height: "14px" }}
              ></span>
              <span className="text-[11px] text-slate-700 font-medium">
                Crítico
              </span>
            </div>
          </div>

          {!carregandoOcorrencias && (
            <p className="mt-2.5 pt-2.5 border-t border-slate-200 text-[11px] text-slate-600 font-medium">
              {ativasVale.length === 0
                ? "Nenhuma ocorrência ativa no Vale agora."
                : `${plural(ativasVale.length, "ocorrência ativa", "ocorrências ativas")} em ${plural(cidadesAfetadas, "cidade", "cidades")}${criticasVale > 0 ? `, ${plural(criticasVale, "crítica", "críticas")}` : ""}.`}
            </p>
          )}
        </div>


        {dadosBairros && (
          <>
            <button
              onClick={() => setPainelAberto(!painelAberto)}
              className="w-full rounded-xl bg-white p-4 shadow-xl text-left border border-slate-200"
            >
              <h2 className="font-bold text-slate-800">Municípios Monitorados</h2>
              <p className="text-xs text-slate-500 mt-1 cursor-pointer">
                Veja informações da sua cidade!{" "}
                <span className="text-red-500 font-bold">clique aqui</span>
              </p>
            </button>

            {painelAberto && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="p-3">
                  <input
                    type="text"
                    placeholder="Digite sua cidade..."
                    value={buscaCidade}
                    onChange={(e) => setBuscaCidade(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
                  />
                </div>

                {cidadeSelecionada && (
                  <div className="px-3 pb-3">
                    <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm cursor-pointer">
                      <span className="font-medium text-red-600">
                        {cidadeSelecionada}
                      </span>
                      <button
                        onClick={() => {
                          setCidadeSelecionada("");
                          setBuscaCidade("");
                        }}
                        className="text-red-600 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                <div className="max-h-[350px] overflow-y-auto">
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

                      return (
                        <button
                          key={index}
                          onClick={() => {
                            setCidadeSelecionada(nome);
                            setLocalAberto(nome);
                          }}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-100 transition cursor-pointer ${cidadeSelecionada === nome
                            ? "bg-red-50 text-red-600 font-semibold"
                            : ""
                            }`}
                        >
                          <div className="h-3 w-3 rounded-full bg-red-500" />
                          <span>{nome}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* CONTAINER LATERAL DIREITO FIXO: só o card da cidade selecionada */}
      <div className="absolute top-12 right-4 z-[9999] flex flex-col gap-3 w-[360px]">
        {/* BLOCO DE CARD INFORMATIVO DE DETALHES DA CIDADE SELECIONADA
            Compacto pra caber na tela sem barra de rolagem. Em telas baixas, a faixa de horas
            e a lista de ocorrências somem sozinhas (o resto continua igual). */}
        {localAberto && (
          <div className="relative bg-white w-full max-h-[calc(100vh-9rem)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-2xl p-4 shadow-2xl border border-slate-100 flex flex-col gap-3">
            <button
              onClick={() => setLocalAberto(null)}
              className="absolute top-3 right-3.5 text-zinc-400 hover:text-zinc-800 cursor-pointer text-sm"
              title="Fechar"
            >
              ✕
            </button>

            {/* CABEÇALHO */}
            <div className="flex items-center gap-3 pr-6">
              <div
                className={`w-10 h-10 ${estiloSituacao.iconeFundo} rounded-xl flex items-center justify-center shrink-0`}
              >
                <IconeSituacao className={estiloSituacao.iconeCor} size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 leading-tight truncate">
                  {localAberto}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-1.5 py-px rounded border border-zinc-200 text-zinc-500 font-bold text-[10px] tracking-wide bg-white">
                    Monitorado
                  </span>
                  <span className="flex items-center gap-1 text-zinc-400 text-[11px] font-medium">
                    <Users size={12} />
                    Dados Regionais
                  </span>
                </div>
              </div>
            </div>

            {/* CLIMA */}
            {climaCidadeAberta ? (
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex flex-col gap-2.5">
                <div className="grid grid-cols-3 text-center">
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      🌡️ {temperaturaAtual}°C
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Temperatura
                    </p>
                  </div>
                  <div className="border-x border-slate-200">
                    <p className="text-sm font-bold text-slate-800">
                      💧 {umidade}%
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Umidade</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      🌧️ {chuvaTotal.toFixed(1)} mm
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Chuva em 24h
                    </p>
                  </div>
                </div>

                <p className="text-[11px] font-medium text-blue-700 bg-blue-50 rounded-lg px-2.5 py-1.5">
                  ✨ {chuva.linha}
                </p>

                {proximasHoras.length > 0 && (
                  <div className="grid grid-cols-6 gap-1 [@media(max-height:700px)]:hidden">
                    {proximasHoras.map((h: any) => {
                      const chance = h.chance_of_rain ?? 0;
                      const emoji =
                        chance >= 60
                          ? "🌧️"
                          : chance >= 30
                            ? "🌦️"
                            : h.is_day
                              ? "☀️"
                              : "🌙";
                      return (
                        <div
                          key={h.time}
                          className="flex flex-col items-center rounded-lg bg-white border border-slate-100 py-1"
                        >
                          <span className="text-[10px] text-slate-500 font-medium">
                            {h.time.split(" ")[1]}
                          </span>
                          <span className="text-sm leading-tight">{emoji}</span>
                          <span className="text-[10px] font-bold text-blue-600">
                            {chance}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 rounded-xl bg-slate-50 border border-slate-100 p-3">
                {erroClima
                  ? "Não foi possível carregar o clima desta cidade."
                  : "Carregando dados do clima..."}
              </p>
            )}

            {/* CONTADORES POR GRAVIDADE (direto do feed) */}
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  rotulo: "Críticos",
                  valor: contagem.critico,
                  Icone: TriangleAlert,
                  classe: "bg-red-50 border-red-200 text-red-700",
                },
                {
                  rotulo: "Médios",
                  valor: contagem.medio,
                  Icone: CircleAlert,
                  classe: "bg-yellow-50 border-yellow-200 text-yellow-700",
                },
                {
                  rotulo: "Baixos",
                  valor: contagem.baixo,
                  Icone: CircleCheck,
                  classe: "bg-green-50 border-green-200 text-green-700",
                },
              ].map((c) => (
                <div
                  key={c.rotulo}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-2 ${c.classe}`}
                >
                  <c.Icone size={18} className="shrink-0" />
                  <div className="leading-tight">
                    <div className="text-lg font-bold">
                      {valorContador(c.valor)}
                    </div>
                    <p className="text-[10px] font-medium">{c.rotulo}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* SITUAÇÃO */}
            <div
              className={`px-3 py-2.5 w-full border rounded-xl flex flex-col ${estiloSituacao.caixa}`}
            >
              <div className="flex items-center gap-1.5">
                <IconeSituacao size={15} className={estiloSituacao.caixaIcone} />
                <h3 className="font-bold text-sm">{estiloSituacao.titulo}</h3>
              </div>
              <p
                className={`mt-0.5 text-xs leading-snug ${estiloSituacao.caixaTexto}`}
              >
                {mensagemSituacao}
              </p>
            </div>

            {/* ÚLTIMAS OCORRÊNCIAS */}
            <div className="flex flex-col gap-1.5 [@media(max-height:600px)]:hidden">
              <h3 className="text-xs font-bold text-slate-800">
                Últimas ocorrências
              </h3>
              {carregandoOcorrencias ? (
                <p className="text-xs text-slate-400">Carregando...</p>
              ) : recentes.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Nenhuma publicação em {localAberto} ainda.
                </p>
              ) : (
                recentes.map((oc) => (
                  <Link
                    key={oc.id}
                    href={`/Feed?ocorrencia=${oc.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-1.5 hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${COR_GRAVIDADE[GRAVIDADE_POR_TIPO[oc.tipo] ?? "baixo"]}`}
                      />
                      <div className="min-w-0 leading-tight">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {oc.tipo}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {oc.bairro} • {tempoRelativo(oc.criado_em)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${ESTILO_STATUS[oc.status] ?? ESTILO_STATUS.Concluído}`}
                    >
                      {oc.status}
                    </span>
                  </Link>
                ))
              )}
            </div>

            <Link
              href={`/Feed?local=${encodeURIComponent(localAberto)}`}
              className="bg-slate-900 w-full rounded-xl text-white flex items-center justify-center p-2.5 text-xs font-semibold hover:bg-slate-800 transition-all gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              Ver postagens de {localAberto}
              <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
