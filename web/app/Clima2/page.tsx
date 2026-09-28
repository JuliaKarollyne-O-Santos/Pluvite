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
  Loader2,
} from "lucide-react";

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

const formatarHora = (dataHoraTexto: string) => {
  return new Date(dataHoraTexto).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const nivelUV = (uv: number) => {
  if (uv <= 2) return { texto: "Baixo", cor: "text-green-600 bg-green-50" };
  if (uv <= 5) return { texto: "Moderado", cor: "text-yellow-600 bg-yellow-50" };
  if (uv <= 7) return { texto: "Alto", cor: "text-orange-600 bg-orange-50" };
  if (uv <= 10) return { texto: "Muito alto", cor: "text-red-600 bg-red-50" };
  return { texto: "Extremo", cor: "text-purple-600 bg-purple-50" };
};

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
    try {
      setErro(null);
      setCarregando(true);
      const resposta = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${API_KEY}&q=${nomeCidade}&days=7&aqi=yes&alerts=no&lang=pt`,
      );
      if (!resposta.ok) throw new Error();
      const dados = await resposta.json();
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

  const horasRestantesHoje = useMemo(() => {
    if (!cidadeAtual) return [];
    const agora = new Date(cidadeAtual.location.localtime);
    return cidadeAtual.forecast.forecastday[0].hour
      .filter((h: any) => new Date(h.time) >= agora)
      .slice(0, 8);
  }, [cidadeAtual]);

  if (!cidadeAtual) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
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
    <main className="min-h-screen w-full overflow-y-auto bg-gradient-to-br from-slate-50 to-blue-50 pt-8 pb-12 flex flex-col items-center gap-6 px-4 sm:px-6 lg:px-10 xl:px-14">
      {/* CABEÇALHO */}
      <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Previsão do Tempo</h1>
          <p className="text-sm text-gray-400">
            Atualizado às {formatarHora(location.localtime.replace(" ", "T"))}
          </p>
        </div>

        {/* BARRA PESQUISA */}
        <div className="w-full sm:w-96 bg-white rounded-full p-1.5 flex items-center shadow-sm border border-gray-200 focus-within:ring-2 focus-within:ring-[#2a68e2]/30 transition-all">
          <Search size={18} className="ml-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && BuscarCidade(busca)}
            className="flex-1 ml-2 text-sm outline-none text-gray-700 bg-transparent"
          />
          <button
            onClick={() => BuscarCidade(busca)}
            disabled={carregando}
            className="bg-[#2a68e2] rounded-full text-white px-4 py-2 text-sm font-semibold hover:bg-[#1d54c4] active:scale-95 transition-all cursor-pointer disabled:opacity-60"
          >
            {carregando ? <Loader2 className="animate-spin" size={16} /> : "Buscar"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="w-full bg-red-50 border border-red-200 text-red-600 text-sm font-medium px-4 py-2.5 rounded-xl">
          {erro}
        </div>
      )}

      {/* GRID */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ESQUERDA */}
        <div className="flex flex-col gap-6">
          {/* CARD PRINCIPAL */}
          <div className="relative p-6 sm:p-8 bg-gradient-to-br from-[#2a68e2] to-[#1a4fb8] rounded-3xl shadow-lg shadow-blue-200 flex justify-between items-center overflow-hidden">
            <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-white/80">
                <MapPin size={20} />
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {location.name}
                </h2>
              </div>
              <p className="text-xs text-blue-100 font-medium mt-0.5 ml-7">
                {location.region}, {location.country}
              </p>

              <div className="mt-4">
                <p className="text-sm font-semibold text-blue-100 capitalize">
                  {formatarDiaSemana(hoje.date, "long")}
                </p>
                <p className="text-xs text-blue-100/80 font-medium mt-0.5">
                  {formatarDataCompleta(hoje.date)}
                </p>
                <h3 className="text-6xl font-bold mt-5 text-white mb-6 tracking-tight">
                  {Math.round(current.temp_c)}°
                </h3>
                <div className="flex gap-4 text-xs font-semibold text-blue-100 mb-4">
                  <span>Máx: {Math.round(hoje.day.maxtemp_c)}°</span>
                  <span>Mín: {Math.round(hoje.day.mintemp_c)}°</span>
                  <span>Sensação: {Math.round(current.feelslike_c)}°</span>
                </div>
                <p className="text-sm font-medium text-white px-3 py-1.5 bg-white/15 rounded-xl w-fit capitalize backdrop-blur-sm">
                  {current.condition.text}
                </p>
              </div>
            </div>

            <span className="relative z-10 text-8xl sm:text-9xl select-none pr-2 drop-shadow-lg">
              {CLIMA_EMOJIS[current.condition.code] || "☀️"}
            </span>
          </div>

          {/* PREVISÃO POR HORA */}
          {horasRestantesHoje.length > 0 && (
            <div className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <span className="text-sm font-bold text-gray-800 block mb-3">
                Nas próximas horas
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {horasRestantesHoje.map((h: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl bg-gray-50 border border-gray-100 min-w-[64px] text-center"
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
              Próximos 7 dias
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
                    <CloudRain size={12} /> {item.day.daily_chance_of_rain}%
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
        <div className="flex flex-col gap-6">
          {/* MAIS INFORMAÇÕES */}
          <div className="p-5 sm:p-9.5 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <span className="text-sm font-bold text-gray-800 block mb-4">
              Detalhes de hoje
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#256ffe] p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <CloudRain size={16} />
                  <span className="text-xs">Chuva</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {hoje.day.daily_chance_of_rain}%
                </span>
              </div>

              <div className="bg-[#ef8608] p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <Sun size={16} />
                  <span className="text-xs">Sensação</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {Math.round(current.feelslike_c)}°C
                </span>
              </div>

              <div className="bg-[#0db94a] p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <Wind size={16} />
                  <span className="text-xs">Vento</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {Math.round(current.wind_kph)} km/h
                </span>
              </div>

              <div className="bg-[#14b681] p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <Droplets size={16} />
                  <span className="text-xs">Umidade</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {Math.round(current.humidity)}%
                </span>
              </div>

              <div className="bg-slate-600 p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <Gauge size={16} />
                  <span className="text-xs">Pressão</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {Math.round(current.pressure_mb)} mb
                </span>
              </div>

              <div className="bg-cyan-600 p-4 rounded-xl flex flex-col justify-between h-24 hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 text-white/90">
                  <Eye size={16} />
                  <span className="text-xs">Visibilidade</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {current.vis_km} km
                </span>
              </div>
            </div>

            {/* UV E QUALIDADE DO AR */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className={`p-3 rounded-xl flex items-center justify-between ${uv.cor}`}>
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} />
                  <span className="text-xs font-semibold">Índice UV</span>
                </div>
                <span className="text-sm font-bold">
                  {current.uv} · {uv.texto}
                </span>
              </div>

              {aqiTexto && (
                <div className="p-3 rounded-xl flex items-center justify-between bg-gray-50 text-gray-600">
                  <span className="text-xs font-semibold">Qualidade do ar</span>
                  <span className="text-sm font-bold">{aqiTexto}</span>
                </div>
              )}
            </div>

            {/* SOL */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="p-3 rounded-xl bg-amber-50 flex items-center gap-2">
                <Sunrise size={18} className="text-amber-500" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium">Nascer do sol</p>
                  <p className="text-sm font-bold text-gray-700">{hoje.astro.sunrise}</p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-orange-50 flex items-center gap-2">
                <Sunset size={18} className="text-orange-500" />
                <div>
                  <p className="text-[10px] text-gray-400 font-medium">Pôr do sol</p>
                  <p className="text-sm font-bold text-gray-700">{hoje.astro.sunset}</p>
                </div>
              </div>
            </div>
          </div>

          {/* OUTRAS CIDADES */}
          <div className="p-8 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <span className="text-sm font-bold text-gray-700 block mb-3">
              Outras cidades próximas
            </span>
            <div className="flex flex-col gap-2">
              {ubatuba && (
                <button
                  onClick={() => BuscarCidade("Ubatuba")}
                  className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors text-left"
                >
                  <div>
                    <h4 className="font-bold text-gray-700 text-sm">Ubatuba</h4>
                    <span className="text-xs text-gray-400 capitalize">
                      {ubatuba.current.condition.text}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
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
                  onClick={() => BuscarCidade("Aparecida")}
                  className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors text-left"
                >
                  <div>
                    <h4 className="font-bold text-gray-700 text-sm">Aparecida</h4>
                    <span className="text-xs text-gray-400 capitalize">
                      {aparecida.current.condition.text}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
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