"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  MapPin,
  CloudRain,
  Sun,
  Wind,
  Droplets,
  Sunrise,
  Sunset,
  Gauge,
  Eye,
  ShieldAlert,
  Leaf,
  Loader2,
} from "lucide-react";
import { MUNICIPIOS, CENTRO_MUNICIPIO, normalizar } from "@/app/lib/constantes";

const CLIMA_EMOJIS: { [key: number]: string } = {
  1000: "☀️",
  1003: "⛅",
  1006: "☁️",
  1009: "☁️",
  1030: "🌫️",
  1063: "🌦️",
  1066: "❄️",
  1069: "🌨️",
  1072: "🌨️",
  1087: "⛈️",
  1114: "❄️",
  1117: "❄️",
  1135: "🌫️",
  1147: "🌫️",
  1150: "🌦️",
  1153: "🌦️",
  1168: "🌨️",
  1171: "🌨️",
  1180: "🌦️",
  1183: "🌧️",
  1186: "🌧️",
  1189: "🌧️",
  1192: "🌧️",
  1195: "🌧️",
  1198: "🌨️",
  1201: "🌨️",
  1204: "🌨️",
  1207: "🌨️",
  1210: "❄️",
  1213: "❄️",
  1216: "❄️",
  1219: "❄️",
  1222: "❄️",
  1225: "❄️",
  1237: "🧊",
  1240: "🌦️",
  1243: "🌧️",
  1246: "🌧️",
  1249: "🌨️",
  1252: "🌨️",
  1255: "❄️",
  1258: "❄️",
  1261: "🧊",
  1264: "🧊",
  1273: "⛈️",
  1276: "⛈️",
  1279: "⛈️",
  1282: "⛈️",
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
      <div className="h-[calc(100dvh-var(--altura-navbar))] flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="animate-spin" size={28} />
          <p className="text-sm font-medium">Carregando previsão...</p>
        </div>
      </div>
    );
  }

  const { location, current, forecast } = cidadeAtual;
  const hoje = forecast.forecastday[0];
  const uv = nivelUV(current.uv);
  const aqi = current.air_quality?.["us-epa-index"];
  const aqiTexto = ["", "Boa", "Moderada", "Ruim p/ sensíveis", "Ruim", "Muito ruim", "Perigosa"][aqi] ?? null;

  return (
    <main className="min-h-[calc(100dvh-var(--altura-navbar))] w-full bg-gradient-to-br from-slate-50 to-blue-50 pt-5 sm:pt-8 pb-10 sm:pb-12 flex flex-col items-center gap-4 sm:gap-6 px-4 sm:px-6 lg:px-10 xl:px-14">
      {/* CABEÇALHO */}
      <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Previsão do Tempo</h1>
          <p className="text-sm text-gray-400">
            Atualizado às {formatarHora(location.localtime)}
          </p>
        </div>

        {/* BARRA PESQUISA */}
        {/* min-w-0 no campo: sem ele o input não encolhe e empurra o botão para fora da tela no celular */}
        <form
          role="search"
          onSubmit={handleBuscar}
          className="w-full sm:w-96 bg-white rounded-full p-1.5 flex items-center gap-2 shadow-sm border border-gray-200 focus-within:ring-2 focus-within:ring-[#2a68e2]/30 transition-all"
        >
          <Search size={18} className="ml-3 shrink-0 text-gray-400" aria-hidden="true" />
          <input
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Buscar cidade"
            placeholder="Buscar cidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="flex-1 min-w-0 w-full text-sm outline-none text-gray-700 bg-transparent"
          />
          <button
            type="submit"
            disabled={carregando}
            className="shrink-0 min-w-[5rem] flex items-center justify-center bg-[#2a68e2] rounded-full text-white px-4 py-2 text-sm font-semibold hover:bg-[#1d54c4] active:scale-95 transition-all cursor-pointer disabled:opacity-60"
          >
            {carregando ? <Loader2 className="animate-spin" size={16} /> : "Buscar"}
          </button>
        </form>
      </div>

      {erro && (
        <div className="w-full bg-red-50 border border-red-200 text-red-600 text-sm font-medium px-4 py-2.5 rounded-xl">
          {erro}
        </div>
      )}

      {/* GRID */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* ESQUERDA */}
        <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
          {/* CARD PRINCIPAL */}
          {/* Nome da cidade ocupa a largura toda: ao lado do emoji, nomes longos como
              "Pindamonhangaba" quebravam no meio da palavra no celular */}
          <div className="relative p-5 sm:p-8 bg-gradient-to-br from-[#2a68e2] to-[#1a4fb8] rounded-3xl shadow-lg shadow-blue-200 overflow-hidden">
            <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-white/80">
                <MapPin size={20} className="shrink-0" />
                <h2 className="text-xl min-[340px]:text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight break-words min-w-0">
                  {location.name}
                </h2>
              </div>
              <p className="text-xs text-blue-100 font-medium mt-0.5 ml-7">
                {location.region}, {location.country}
              </p>
            </div>

            <div className="relative z-10 mt-4 flex justify-between items-center gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-100 capitalize">
                  {formatarDiaSemana(hoje.date, "long")}
                </p>
                <p className="text-xs text-blue-100/80 font-medium mt-0.5">
                  {formatarDataCompleta(hoje.date)}
                </p>
                <h3 className="text-6xl font-bold mt-4 sm:mt-5 text-white mb-4 sm:mb-6 tracking-tight">
                  {Math.round(current.temp_c)}°
                </h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-blue-100 mb-4">
                  <span className="whitespace-nowrap">Máx: {Math.round(hoje.day.maxtemp_c)}°</span>
                  <span className="whitespace-nowrap">Mín: {Math.round(hoje.day.mintemp_c)}°</span>
                  <span className="whitespace-nowrap">Sensação: {Math.round(current.feelslike_c)}°</span>
                </div>
                <p className="text-sm font-medium text-white px-3 py-1.5 bg-white/15 rounded-xl w-fit capitalize backdrop-blur-sm">
                  {current.condition.text}
                </p>
              </div>

              <span className="shrink-0 text-7xl sm:text-9xl select-none sm:pr-2 drop-shadow-lg">
                {CLIMA_EMOJIS[current.condition.code] || "☀️"}
              </span>
            </div>
          </div>

          {/* PREVISÃO POR HORA */}
          {proximasHoras.length > 0 && (
            <div className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <span className="text-sm font-bold text-gray-800 block mb-3">
                Nas próximas horas
              </span>
              <div className="flex gap-2 overflow-x-auto snap-x pb-1">
                {proximasHoras.map((h) => (
                  <div
                    key={h.time}
                    className="shrink-0 snap-start flex flex-col items-center gap-1 p-3 rounded-xl bg-gray-50 border border-gray-100 min-w-[64px] text-center"
                  >
                    <span className="text-xs font-semibold text-gray-500">
                      {formatarHora(h.time)}
                    </span>
                    <span className="text-xl select-none">
                      {CLIMA_EMOJIS[h.condition.code] || "☀️"}
                    </span>
                    <span className="text-xs font-bold text-gray-800">
                      {Math.round(h.temp_c)}°
                    </span>
                    <span className="text-[10px] text-blue-500 font-medium">
                      {h.chance_of_rain}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PRÓXIMOS DIAS */}
          <div className="p-5 pb-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <span className="text-sm font-bold text-gray-800 block mb-3">
              Próximos 2 dias
            </span>
            <div className="flex flex-col gap-1">
              {forecast.forecastday.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-2 py-2.5 rounded-xl bg-zinc-50 border border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-xs font-bold text-gray-600 capitalize w-20">
                    {idx === 0 ? "Hoje" : formatarDiaSemana(item.date, "short")}
                  </span>
                  <span className="text-2xl select-none">
                    {CLIMA_EMOJIS[item.day.condition.code] || "☀️"}
                  </span>
                  <span className="text-xs text-gray-400 flex items-center gap-1 w-14">
                    <CloudRain size={12} className="shrink-0" /> {item.day.daily_chance_of_rain}%
                  </span>
                  <div className="flex items-center gap-2 w-20 justify-end">
                    <span className="text-xs text-gray-400">
                      {Math.round(item.day.mintemp_c)}°
                    </span>
                    <span className="text-xs font-bold text-gray-800">
                      {Math.round(item.day.maxtemp_c)}°
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DIREITA */}
        <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
          {/* MAIS INFORMAÇÕES */}
          <div className="p-5 sm:p-9.5 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <span className="text-sm font-bold text-gray-800 block mb-4">
              Detalhes de hoje
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#256ffe] p-3 min-[360px]:p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <CloudRain size={16} className="shrink-0" />
                  <span className="text-xs">Chuva</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {hoje.day.daily_chance_of_rain}%
                </span>
              </div>

              <div className="bg-[#ef8608] p-3 min-[360px]:p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <Sun size={16} className="shrink-0" />
                  <span className="text-xs">Sensação</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {Math.round(current.feelslike_c)}°C
                </span>
              </div>

              <div className="bg-[#0db94a] p-3 min-[360px]:p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <Wind size={16} className="shrink-0" />
                  <span className="text-xs">Vento</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {Math.round(current.wind_kph)} km/h
                </span>
              </div>

              <div className="bg-[#14b681] p-3 min-[360px]:p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <Droplets size={16} className="shrink-0" />
                  <span className="text-xs">Umidade</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {Math.round(current.humidity)}%
                </span>
              </div>

              <div className="bg-slate-600 p-3 min-[360px]:p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <Gauge size={16} className="shrink-0" />
                  <span className="text-xs">Pressão</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {Math.round(current.pressure_mb)} mb
                </span>
              </div>

              <div className="bg-cyan-600 p-3 min-[360px]:p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <Eye size={16} className="shrink-0" />
                  <span className="text-xs">Visibilidade</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {current.vis_km} km
                </span>
              </div>
            </div>

            {/* UV E QUALIDADE DO AR (rótulo em cima e valor embaixo, como os do sol: lado a lado
                não cabia no celular e o texto vazava do quadro) */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className={`p-3 rounded-xl flex items-center gap-2 ${uv.cor}`}>
                <ShieldAlert size={18} className="shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold opacity-80">Índice UV · {current.uv}</p>
                  <p className="text-sm font-bold leading-tight">{uv.texto}</p>
                </div>
              </div>

              {aqiTexto && (
                <div className="p-3 rounded-xl flex items-center gap-2 bg-gray-50 text-gray-600">
                  <Leaf size={18} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-gray-400">Qualidade do ar</p>
                    <p className="text-sm font-bold leading-tight">{aqiTexto}</p>
                  </div>
                </div>
              )}
            </div>

            {/* SOL */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="p-3 rounded-xl bg-amber-50 flex items-center gap-2">
                <Sunrise size={18} className="shrink-0 text-amber-500" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium">Nascer do sol</p>
                  <p className="text-sm font-bold text-gray-700">{formatarHoraAstro(hoje.astro.sunrise)}</p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-orange-50 flex items-center gap-2">
                <Sunset size={18} className="shrink-0 text-orange-500" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium">Pôr do sol</p>
                  <p className="text-sm font-bold text-gray-700">{formatarHoraAstro(hoje.astro.sunset)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* OUTRAS CIDADES */}
          <div className="p-5 sm:p-8 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <span className="text-sm font-bold text-gray-700 block mb-3">
              Outras cidades próximas
            </span>
            <div className="flex flex-col gap-2">
              {ubatuba && (
                <button
                  onClick={() => handleOutraCidade("Ubatuba")}
                  className="w-full flex justify-between items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-700 text-sm">Ubatuba</h4>
                    <span className="text-xs text-gray-400 capitalize">
                      {ubatuba.current.condition.text}
                    </span>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-700">
                      {Math.round(ubatuba.current.temp_c)}°
                    </span>
                    <span className="text-2xl">
                      {CLIMA_EMOJIS[ubatuba.current.condition.code] || "☀️"}
                    </span>
                  </div>
                </button>
              )}

              {aparecida && (
                <button
                  onClick={() => handleOutraCidade("Aparecida")}
                  className="w-full flex justify-between items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-700 text-sm">Aparecida</h4>
                    <span className="text-xs text-gray-400 capitalize">
                      {aparecida.current.condition.text}
                    </span>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-700">
                      {Math.round(aparecida.current.temp_c)}°
                    </span>
                    <span className="text-2xl">
                      {CLIMA_EMOJIS[aparecida.current.condition.code] || "☀️"}
                    </span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}