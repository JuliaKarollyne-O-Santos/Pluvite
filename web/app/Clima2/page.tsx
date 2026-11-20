"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  MapPin,
  CloudRain,
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudFog,
  CloudDrizzle,
  CloudLightning,
  CloudSnow,
  Wind,
  Droplets,
  Sunrise,
  Sunset,
  Gauge,
  Eye,
  ShieldAlert,
  Leaf,
  Loader2,
  Thermometer,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { MUNICIPIOS, CENTRO_MUNICIPIO, normalizar } from "@/app/lib/constantes";

// Ícone da condição do tempo a partir do código da WeatherAPI (no lugar dos emojis)
const CODIGOS_TROVOADA = [1087, 1273, 1276, 1279, 1282];
const CODIGOS_NEVE = [1066, 1069, 1072, 1114, 1117, 1168, 1171, 1198, 1201, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1249, 1252, 1255, 1258, 1261, 1264];
const CODIGOS_GAROA = [1063, 1150, 1153, 1180, 1240];
const CODIGOS_NEVOA = [1030, 1135, 1147];

const iconeClima = (codigo: number, ehDia = 1): LucideIcon => {
  if (codigo === 1000) return ehDia ? Sun : Moon;
  if (codigo === 1003) return ehDia ? CloudSun : CloudMoon;
  if (codigo === 1006 || codigo === 1009) return Cloud;
  if (CODIGOS_NEVOA.includes(codigo)) return CloudFog;
  if (CODIGOS_TROVOADA.includes(codigo)) return CloudLightning;
  if (CODIGOS_NEVE.includes(codigo)) return CloudSnow;
  if (CODIGOS_GAROA.includes(codigo)) return CloudDrizzle;
  return CloudRain;
};

const formatarDiaSemana = (
  dataTexto: string,
  formato: "long" | "short" = "long",
) => {
  return new Date(dataTexto + "T00:00:00")
    .toLocaleDateString("pt-BR", { weekday: formato })
    .replace(".", "");
};

const formatarDataCompleta = (dataTexto: string) => {
  return new Date(dataTexto + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

// A WeatherAPI manda "2026-11-12 08:00"; o Safari do iPhone não entende o espaço (Invalid Date)
const lerDataHora = (dataHoraTexto: string) =>
  new Date(dataHoraTexto.replace(" ", "T"));

const formatarHora = (dataHoraTexto: string) => {
  return lerDataHora(dataHoraTexto).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Nascer/pôr do sol vem como "06:21 PM" mesmo com lang=pt; converte para 24h ("18:21")
const formatarHoraAstro = (horaTexto: string) => {
  const partes = horaTexto.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!partes) return horaTexto;
  let hora = Number(partes[1]) % 12;
  if (partes[3].toUpperCase() === "PM") hora += 12;
  return `${String(hora).padStart(2, "0")}:${partes[2]}`;
};

const nivelUV = (uv: number) => {
  if (uv <= 2) return { texto: "Baixo", cor: "text-green-600 bg-green-50" };
  if (uv <= 5) return { texto: "Moderado", cor: "text-yellow-600 bg-yellow-50" };
  if (uv <= 7) return { texto: "Alto", cor: "text-orange-600 bg-orange-50" };
  if (uv <= 10) return { texto: "Muito alto", cor: "text-red-600 bg-red-50" };
  return { texto: "Extremo", cor: "text-purple-600 bg-purple-50" };
};

// Uma hora da previsão da WeatherAPI (só os campos usados na página)
interface HoraPrevisao {
  time: string;
  temp_c: number;
  chance_of_rain: number;
  condition: { code: number };
}

export default function ClimaPage() {
  const [busca, setBusca] = useState("");
  const [cidadeAtual, setCidadeAtual] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ubatuba, setUbatuba] = useState<any>(null);
  const [aparecida, setAparecida] = useState<any>(null);

  const API_KEY = "b73dd481d238464caf6232135262005";

  const BuscarCidade = async (nomeCidade: string) => {
    if (!nomeCidade) return;
    // Município do Vale: busca pela coordenada do centro. Pelo nome a WeatherAPI errava 19 dos 39
    // (homônimos e acentos: "Cruzeiro" virava Cruzeiro do Sul/AC, "São José dos Campos" uma cidade
    // da Paraíba, "Guaratinguetá" dava erro). Fora do Vale vai o nome sem acento, que ela acerta mais.
    const municipio = MUNICIPIOS.find((m) => normalizar(m) === normalizar(nomeCidade));
    const consulta = municipio
      ? CENTRO_MUNICIPIO[municipio].join(",")
      : normalizar(nomeCidade);
    try {
      setErro(null);
      setCarregando(true);
      const resposta = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${API_KEY}&q=${encodeURIComponent(consulta)}&days=7&aqi=yes&alerts=no&lang=pt`,
      );
      if (!resposta.ok) throw new Error();
      const dados = await resposta.json();
      // Pela coordenada a API devolve o lugar mais próximo (Areias -> "Pirangai, Rio de Janeiro")
      if (municipio) {
        dados.location.name = municipio;
        dados.location.region = "São Paulo";
        dados.location.country = "Brasil";
      }
      setCidadeAtual(dados);
    } catch {
      setErro("Cidade não encontrada. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  };

  const BuscarOutrasCidades = async () => {
    try {
      const [ubatubaRes, aparecidaRes] = await Promise.all([
        fetch(
          `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=Ubatuba&lang=pt`,
        ),
        fetch(
          `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=Aparecida&lang=pt`,
        ),
      ]);
      setUbatuba(await ubatubaRes.json());
      setAparecida(await aparecidaRes.json());
    } catch (erro) {
      console.log(erro);
    }
  };

  useEffect(() => {
    BuscarCidade("Taubaté");
    BuscarOutrasCidades();
  }, []);

  // Enter/"Buscar" no teclado do celular: fecha o teclado para mostrar o resultado
  const handleBuscar = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    BuscarCidade(busca.trim());
  };

  // No celular "Outras cidades" fica no fim da página: volta ao topo para ver a cidade escolhida
  const handleOutraCidade = (nomeCidade: string) => {
    BuscarCidade(nomeCidade);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Próximas 8 horas, emendando com amanhã quando o dia está acabando (à noite sobravam 1 ou 2)
  const proximasHoras = useMemo((): HoraPrevisao[] => {
    if (!cidadeAtual) return [];
    const agora = lerDataHora(cidadeAtual.location.localtime);
    const dias: { hour: HoraPrevisao[] }[] = cidadeAtual.forecast.forecastday.slice(0, 2);
    return dias
      .flatMap((dia) => dia.hour)
      .filter((h) => lerDataHora(h.time) >= agora)
      .slice(0, 8);
  }, [cidadeAtual]);

  if (!cidadeAtual) {
    return (
      <div className="h-[calc(100dvh-var(--altura-navbar))] flex items-center justify-center bg-fundo">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="animate-spin" size={24} />
          <p className="text-sm">Carregando previsão...</p>
        </div>
      </div>
    );
  }

  const { location, current, forecast } = cidadeAtual;
  const hoje = forecast.forecastday[0];
  const uv = nivelUV(current.uv);
  const aqi = current.air_quality?.["us-epa-index"];
  const aqiTexto = ["", "Boa", "Moderada", "Ruim p/ sensíveis", "Ruim", "Muito ruim", "Perigosa"][aqi] ?? null;
  const IconeAgora = iconeClima(current.condition.code, current.is_day);

  // Faixa de temperatura da semana, para desenhar a barra de mín./máx. de cada dia
  const minSemana = Math.min(...forecast.forecastday.map((d: any) => d.day.mintemp_c));
  const maxSemana = Math.max(...forecast.forecastday.map((d: any) => d.day.maxtemp_c));
  const faixa = Math.max(maxSemana - minSemana, 1);

  const detalhes: { Icone: LucideIcon; rotulo: string; valor: string; extra?: string; cor: string }[] = [
    { Icone: CloudRain, rotulo: "Chance de chuva", valor: `${hoje.day.daily_chance_of_rain}%`, extra: `${hoje.day.totalprecip_mm} mm previstos`, cor: "bg-blue-50 border-blue-200 text-blue-700" },
    { Icone: Thermometer, rotulo: "Sensação térmica", valor: `${Math.round(current.feelslike_c)}°C`, cor: "bg-orange-50 border-orange-200 text-orange-700" },
    { Icone: Wind, rotulo: "Vento", valor: `${Math.round(current.wind_kph)} km/h`, extra: current.wind_dir ? `Direção ${current.wind_dir}` : undefined, cor: "bg-teal-50 border-teal-200 text-teal-700" },
    { Icone: Droplets, rotulo: "Umidade", valor: `${Math.round(current.humidity)}%`, cor: "bg-sky-50 border-sky-200 text-sky-700" },
    { Icone: Gauge, rotulo: "Pressão", valor: `${Math.round(current.pressure_mb)} hPa`, cor: "bg-slate-100 border-slate-200 text-slate-700" },
    { Icone: Eye, rotulo: "Visibilidade", valor: `${current.vis_km} km`, cor: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  ];

  const outrasCidades = [
    { nome: "Ubatuba", dados: ubatuba },
    { nome: "Aparecida", dados: aparecida },
  ].filter((c) => c.dados?.current);

  return (
    <main className="min-h-[calc(100dvh-var(--altura-navbar))] w-full bg-fundo pt-6 sm:pt-8 pb-10 sm:pb-12 px-4 sm:px-6 lg:px-10">
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-5">
        {/* CABEÇALHO */}
        <div className="w-full flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Previsão do tempo</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Atualizado às {formatarHora(location.localtime)} · dados WeatherAPI
            </p>
          </div>

          {/* BARRA PESQUISA */}
          {/* min-w-0 no campo: sem ele o input não encolhe e empurra o botão para fora da tela no celular */}
          <form
            role="search"
            onSubmit={handleBuscar}
            className="w-full sm:w-96 bg-white rounded-md p-1 flex items-center gap-2 border border-slate-300 focus-within:border-[#0b1f6e] focus-within:ring-2 focus-within:ring-[#0b1f6e]/15 transition"
          >
            <Search size={16} className="ml-2.5 shrink-0 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              enterKeyHint="search"
              autoComplete="off"
              aria-label="Buscar cidade"
              placeholder="Buscar cidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="flex-1 min-w-0 w-full text-sm outline-none text-slate-800 bg-transparent"
            />
            <button
              type="submit"
              disabled={carregando}
              className="shrink-0 min-w-[5rem] flex items-center justify-center bg-[#0b1f6e] rounded text-white px-4 py-1.5 text-sm font-medium hover:bg-[#0f35a0] transition-colors cursor-pointer disabled:opacity-60"
            >
              {carregando ? <Loader2 className="animate-spin" size={16} /> : "Buscar"}
            </button>
          </form>
        </div>

        {erro && (
          <div className="w-full bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-md">
            {erro}
          </div>
        )}

        {/* GRID */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* ESQUERDA */}
          <div className="lg:col-span-3 flex flex-col gap-5 min-w-0">
            {/* CARD PRINCIPAL */}
            <section className="bg-[#0b1f6e] rounded-lg p-6 sm:p-7 text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm text-blue-100/80">
                    <MapPin size={14} className="shrink-0" />
                    {location.region}, {location.country}
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight break-words mt-1">
                    {location.name}
                  </h2>
                  <p className="text-sm text-blue-100/80 mt-1 capitalize">
                    {formatarDiaSemana(hoje.date, "long")}, {formatarDataCompleta(hoje.date)}
                  </p>
                </div>
                <IconeAgora size={56} strokeWidth={1.25} className="shrink-0 text-white/90" />
              </div>

              <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-6xl font-semibold tracking-tight tabular-nums leading-none">
                    {Math.round(current.temp_c)}°
                  </p>
                  <p className="text-base text-white mt-2 capitalize">{current.condition.text}</p>
                </div>
                <dl className="grid grid-cols-3 gap-6 text-sm">
                  <div>
                    <dt className="text-blue-100/70 text-xs">Máxima</dt>
                    <dd className="font-medium tabular-nums">{Math.round(hoje.day.maxtemp_c)}°</dd>
                  </div>
                  <div>
                    <dt className="text-blue-100/70 text-xs">Mínima</dt>
                    <dd className="font-medium tabular-nums">{Math.round(hoje.day.mintemp_c)}°</dd>
                  </div>
                  <div>
                    <dt className="text-blue-100/70 text-xs">Sensação</dt>
                    <dd className="font-medium tabular-nums">{Math.round(current.feelslike_c)}°</dd>
                  </div>
                </dl>
              </div>
            </section>

            {/* PREVISÃO POR HORA */}
            {proximasHoras.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900 px-5 pt-4 pb-3 border-b border-slate-200">
                  Próximas horas
                </h3>
                <div className="flex overflow-x-auto snap-x divide-x divide-slate-100">
                  {proximasHoras.map((h) => {
                    const IconeHora = iconeClima(h.condition.code, (h as any).is_day ?? 1);
                    return (
                      <div
                        key={h.time}
                        className="shrink-0 snap-start flex-1 flex flex-col items-center gap-1.5 px-3 py-4 min-w-[72px] text-center"
                      >
                        <span className="text-xs text-slate-500 tabular-nums">{formatarHora(h.time)}</span>
                        <IconeHora size={20} className={h.chance_of_rain >= 30 ? "text-[#0f35a0]" : "text-amber-500"} />
                        <span className="text-sm font-medium text-slate-900 tabular-nums">
                          {Math.round(h.temp_c)}°
                        </span>
                        <span className={`text-[11px] tabular-nums ${h.chance_of_rain >= 30 ? "text-[#0f35a0] font-medium" : "text-slate-400"}`}>
                          {h.chance_of_rain}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* PRÓXIMOS DIAS */}
            <section className="bg-white rounded-lg border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 px-5 pt-4 pb-3 border-b border-slate-200">
                Próximos dias
              </h3>
              <ul className="divide-y divide-slate-100">
                {forecast.forecastday.map((item: any, idx: number) => {
                  const IconeDia = iconeClima(item.day.condition.code);
                  const inicio = ((item.day.mintemp_c - minSemana) / faixa) * 100;
                  const largura = ((item.day.maxtemp_c - item.day.mintemp_c) / faixa) * 100;
                  return (
                    <li key={idx} className="grid grid-cols-[5rem_1.5rem_1fr_3.5rem] sm:grid-cols-[6rem_1.5rem_4rem_1fr] items-center gap-3 px-5 py-3">
                      <span className="text-sm text-slate-700 capitalize">
                        {idx === 0 ? "Hoje" : formatarDiaSemana(item.date, "short")}
                      </span>
                      <IconeDia size={18} className={item.day.daily_chance_of_rain >= 30 ? "text-[#0f35a0]" : "text-amber-500"} />
                      <span className="text-xs text-slate-500 flex items-center gap-1 tabular-nums max-sm:order-last max-sm:justify-end">
                        <CloudRain size={12} className="shrink-0" /> {item.day.daily_chance_of_rain}%
                      </span>
                      <div className="flex items-center gap-2.5 text-sm tabular-nums max-sm:hidden">
                        <span className="text-slate-500 w-8 text-right">{Math.round(item.day.mintemp_c)}°</span>
                        <div className="relative flex-1 h-1.5 rounded-full bg-slate-100">
                          <div
                            className="absolute h-full rounded-full bg-gradient-to-r from-sky-400 to-orange-400"
                            style={{ left: `${inicio}%`, width: `${Math.max(largura, 4)}%` }}
                          />
                        </div>
                        <span className="text-slate-900 font-medium w-8">{Math.round(item.day.maxtemp_c)}°</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          {/* DIREITA */}
          <div className="lg:col-span-2 flex flex-col gap-5 min-w-0">
            {/* DETALHES DE HOJE */}
            <section className="bg-white rounded-lg border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 px-5 pt-4 pb-3 border-b border-slate-200">
                Detalhes de hoje
              </h3>
              <div className="grid grid-cols-2 gap-2.5 p-4">
                {detalhes.map((d) => (
                  <div key={d.rotulo} className={`rounded-md border px-3.5 py-3 ${d.cor}`}>
                    <p className="flex items-center gap-1.5 text-xs font-medium">
                      <d.Icone size={14} className="shrink-0" />
                      {d.rotulo}
                    </p>
                    <p className="text-lg font-semibold text-slate-900 mt-1.5 tabular-nums">{d.valor}</p>
                    {d.extra && <p className="text-[11px] text-slate-600 mt-0.5">{d.extra}</p>}
                  </div>
                ))}
              </div>

              {/* UV, QUALIDADE DO AR E SOL */}
              <dl className="border-t border-slate-200 divide-y divide-slate-100 text-sm">
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="flex items-center gap-2 text-slate-600">
                    <ShieldAlert size={15} className="text-violet-500" /> Índice UV
                  </dt>
                  <dd className="flex items-center gap-2">
                    <span className="tabular-nums text-slate-900 font-medium">{current.uv}</span>
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${uv.cor}`}>{uv.texto}</span>
                  </dd>
                </div>
                {aqiTexto && (
                  <div className="flex items-center justify-between px-5 py-3">
                    <dt className="flex items-center gap-2 text-slate-600">
                      <Leaf size={15} className="text-emerald-600" /> Qualidade do ar
                    </dt>
                    <dd className="text-slate-900 font-medium">{aqiTexto}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="flex items-center gap-2 text-slate-600">
                    <Sunrise size={15} className="text-amber-500" /> Nascer do sol
                  </dt>
                  <dd className="text-slate-900 font-medium tabular-nums">{formatarHoraAstro(hoje.astro.sunrise)}</dd>
                </div>
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="flex items-center gap-2 text-slate-600">
                    <Sunset size={15} className="text-orange-500" /> Pôr do sol
                  </dt>
                  <dd className="text-slate-900 font-medium tabular-nums">{formatarHoraAstro(hoje.astro.sunset)}</dd>
                </div>
              </dl>
            </section>

            {/* OUTRAS CIDADES */}
            {outrasCidades.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900 px-5 pt-4 pb-3 border-b border-slate-200">
                  Outras cidades da região
                </h3>
                <ul className="divide-y divide-slate-100">
                  {outrasCidades.map(({ nome, dados }) => {
                    const IconeCidade = iconeClima(dados.current.condition.code, dados.current.is_day);
                    return (
                      <li key={nome}>
                        <button
                          onClick={() => handleOutraCidade(nome)}
                          className="w-full flex justify-between items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{nome}</p>
                            <p className="text-xs text-slate-500 capitalize truncate">{dados.current.condition.text}</p>
                          </div>
                          <div className="shrink-0 flex items-center gap-3 text-slate-600">
                            <IconeCidade size={18} />
                            <span className="text-sm font-medium text-slate-900 tabular-nums w-8 text-right">
                              {Math.round(dados.current.temp_c)}°
                            </span>
                            <ChevronRight size={15} className="text-slate-300" />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
