// =====================================
// RESUMO DA CIDADE PARA O WHATSAPP
// Mesmas regras do painel da cidade no Mapa (web/app/Mapa/page.tsx):
// situação = ocorrências ativas do Feed + intensidade da chuva (WeatherAPI,
// a mesma API da página de Clima).
// =====================================
const COORDENADAS = require("../municipios.json");

const VALIDADE_CLIMA_MS = 10 * 60 * 1000; // reaproveita a consulta por 10 min
const climaEmCache = new Map();

// Mesma classificação do Mapa: o Feed não tem "gravidade", ela vem do tipo
const GRAVIDADE_POR_TIPO = {
  Alagamento: "critico",
  "Deslizamento de terra": "critico",
  "Árvore caída": "medio",
  "Via interditada": "medio",
  "Buraco na via": "baixo",
  Outros: "baixo",
};
const STATUS_INATIVO = "Concluído";

const normalizar = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Bairro manda na cidade (igual ao Mapa): ocorrência com cidade errada vai para a certa
const BAIRROS_POR_CIDADE = {
  [normalizar("Cecap")]: "Taubaté",
  [normalizar("Três Marias")]: "Taubaté",
  [normalizar("Quiririm")]: "Taubaté",
};
const cidadeDaOcorrencia = (oc) => BAIRROS_POR_CIDADE[normalizar(oc.bairro)] ?? oc.cidade;

const classificarChuva = (mmPorHora) => {
  if (mmPorHora < 0.1) return { texto: "Sem chuva", nivel: 0 };
  if (mmPorHora < 2.5) return { texto: "Chuva fraca", nivel: 1 };
  if (mmPorHora < 7.6) return { texto: "Chuva moderada", nivel: 2 };
  if (mmPorHora < 25) return { texto: "Chuva forte", nivel: 3 };
  return { texto: "Chuva muito forte", nivel: 4 };
};

// Acumulado em 24h (mm): ESTIMATIVA, igual a LIMIARES_ACUMULADO_24H_MM em web/app/lib/riscoMapa.ts
const LIMIARES_ACUMULADO_24H_MM = { atencao: 30, alto: 50, critico: 80 };

// 0 = sem risco · 1 = atenção · 2 = alto · 3 = crítico (maior entre intensidade e acumulado)
const riscoPelaIntensidade = (chuva) => (chuva.nivel >= 4 ? 3 : chuva.nivel >= 3 ? 1 : 0);
const riscoPeloAcumulado = (chuva) =>
  chuva.total >= LIMIARES_ACUMULADO_24H_MM.critico ? 3
    : chuva.total >= LIMIARES_ACUMULADO_24H_MM.alto ? 2
      : chuva.total >= LIMIARES_ACUMULADO_24H_MM.atencao ? 1
        : 0;
const riscoDaChuva = (chuva) => Math.max(riscoPelaIntensidade(chuva), riscoPeloAcumulado(chuva));

const plural = (n, singular, pluralTxt) => `${n} ${n === 1 ? singular : pluralTxt}`;
const numero = (valor, casas = 0) =>
  Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

function tempoRelativo(dataIso) {
  const minutos = Math.floor((Date.now() - new Date(dataIso).getTime()) / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${plural(minutos, "minuto", "minutos")}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${plural(horas, "hora", "horas")}`;
  return `há ${plural(Math.floor(horas / 24), "dia", "dias")}`;
}

// BUSCA DO CLIMA (WeatherAPI pelas coordenadas do municipios.json)
async function buscarClima(municipio) {
  const chave = process.env.WEATHER_API_KEY;
  if (!chave) throw new Error("WEATHER_API_KEY não configurada no .env");
  const emCache = climaEmCache.get(municipio);
  if (emCache && Date.now() - emCache.ts < VALIDADE_CLIMA_MS) return emCache.dados;

  const [lat, lon] = COORDENADAS[municipio];
  const resposta = await fetch(
    `https://api.weatherapi.com/v1/forecast.json?key=${chave}&q=${lat},${lon}` +
      "&days=2&aqi=no&alerts=no&lang=pt",
    { signal: AbortSignal.timeout(15000) },
  );
  if (!resposta.ok) throw new Error(`WeatherAPI respondeu ${resposta.status}`);
  const dados = await resposta.json();
  climaEmCache.set(municipio, { dados, ts: Date.now() });
  return dados;
}

// BUSCA DAS OCORRÊNCIAS DO FEED (Supabase REST, mesma tabela do Mapa)
async function buscarOcorrencias() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const chave = process.env.SUPABASE_KEY;
  if (!url || !chave) throw new Error("SUPABASE_URL/SUPABASE_KEY ausentes no .env");
  const resposta = await fetch(
    `${url}/rest/v1/ocorrencias?select=tipo,cidade,bairro,status,criado_em&order=criado_em.desc`,
    {
      headers: { apikey: chave, Authorization: `Bearer ${chave}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!resposta.ok) throw new Error(`Supabase respondeu ${resposta.status}`);
  return resposta.json();
}

// CHUVA: agora, próxima hora com chuva e total das próximas 24h (igual ao Mapa)
function analisarChuva(clima) {
  const agoraLocal = new Date(clima.location.localtime.replace(" ", "T")).getTime();
  const proximas24h = clima.forecast.forecastday
    .flatMap((dia) => dia.hour)
    .filter((h) => new Date(h.time.replace(" ", "T")).getTime() > agoraLocal - 3600000)
    .slice(0, 24);

  const mmAgora = clima.current.precip_mm ?? 0;
  const mmPorHora = proximas24h.map((h) => h.precip_mm ?? 0);
  const classe = classificarChuva(Math.max(mmAgora, ...mmPorHora, 0));
  const total = mmPorHora.reduce((soma, mm) => soma + mm, 0);
  const primeiraComChuva = proximas24h.find((h) => (h.precip_mm ?? 0) >= 0.1);

  if (mmAgora >= 0.1) {
    return { ...classe, total, emAndamento: true, linha: `${classificarChuva(mmAgora).texto} agora` };
  }
  if (primeiraComChuva) {
    return {
      ...classe,
      total,
      emAndamento: false,
      linha: `${classe.texto} prevista às ${primeiraComChuva.time.split(" ")[1]}`,
    };
  }
  return { nivel: 0, texto: "Sem chuva", total, emAndamento: false, linha: "Sem chuva prevista" };
}

/** Texto do resumo da cidade, já formatado para o WhatsApp. Nunca lança erro. */
async function montarResumoCidade(municipio) {
  const [resultadoClima, resultadoOcorrencias] = await Promise.allSettled([
    buscarClima(municipio),
    buscarOcorrencias(),
  ]);
  const clima = resultadoClima.status === "fulfilled" ? resultadoClima.value : null;
  if (!clima) console.error(`❌ Clima de ${municipio} indisponível:`, resultadoClima.reason);
  if (resultadoOcorrencias.status === "rejected") {
    console.error("❌ Ocorrências indisponíveis:", resultadoOcorrencias.reason);
  }

  // OCORRÊNCIAS DA CIDADE
  const daCidade =
    resultadoOcorrencias.status === "fulfilled"
      ? resultadoOcorrencias.value.filter(
          (oc) => normalizar(cidadeDaOcorrencia(oc)) === normalizar(municipio),
        )
      : null;
  const ativasLista = (daCidade || []).filter((oc) => oc.status !== STATUS_INATIVO);
  const ativas = { critico: 0, medio: 0, baixo: 0 };
  for (const oc of ativasLista) ativas[GRAVIDADE_POR_TIPO[oc.tipo] ?? "baixo"]++;

  // SITUAÇÃO (mesma regra do Mapa: ocorrências + intensidade e acumulado da chuva)
  const chuva = clima ? analisarChuva(clima) : null;
  const riscoChuva = chuva ? riscoDaChuva(chuva) : 0;
  let situacao = { icone: "🟢", titulo: "Situação tranquila" };
  if (ativas.critico > 0 || riscoChuva >= 2) situacao = { icone: "🔴", titulo: "Situação crítica" };
  else if (ativas.medio > 0 || riscoChuva >= 1) situacao = { icone: "🟡", titulo: "Situação de atenção" };

  const motivos = [];
  if (ativas.critico) motivos.push(plural(ativas.critico, "alerta crítico ativo", "alertas críticos ativos"));
  if (ativas.medio) motivos.push(plural(ativas.medio, "alerta de gravidade média", "alertas de gravidade média"));
  if (ativas.baixo) motivos.push(plural(ativas.baixo, "alerta de baixa gravidade", "alertas de baixa gravidade"));
  if (riscoChuva >= 1) {
    motivos.push(
      riscoPelaIntensidade(chuva) >= riscoPeloAcumulado(chuva)
        ? `${chuva.texto.toLowerCase()} ${chuva.emAndamento ? "em andamento" : "prevista nas próximas 24h"}`
        : `${Math.round(chuva.total)} mm de chuva previstos nas próximas 24h`,
    );
  }
  let detalheSituacao = motivos.length ? `${motivos.join(", ")}.` : "Nenhum alerta ativo no momento.";
  if (daCidade === null) detalheSituacao = "Ocorrências do Feed indisponíveis agora.";

  // MONTAGEM DA MENSAGEM
  const hora = clima?.current?.last_updated?.split(" ")[1];
  const linhas = [
    `📍 *${municipio}*${hora ? ` — atualizado às ${hora}` : ""}`,
    "",
    `${situacao.icone} *${situacao.titulo}*`,
    detalheSituacao,
    "",
  ];

  if (clima) {
    const atual = clima.current;
    const hoje = clima.forecast.forecastday[0].day;
    linhas.push(
      "🌤️ *Clima agora*",
      `🌡️ ${numero(atual.temp_c, 1)} °C (sensação ${numero(atual.feelslike_c)} °C) · ${atual.condition.text}`,
      `💧 Umidade ${atual.humidity}% · 💨 Vento ${numero(atual.wind_kph)} km/h · ☀️ UV ${numero(atual.uv)}`,
      `🌧️ ${chuva.linha}${chuva.total >= 0.1 ? ` · ${numero(chuva.total, 1)} mm nas próximas 24h` : ""}`,
      `📅 Hoje: mín ${numero(hoje.mintemp_c)}° / máx ${numero(hoje.maxtemp_c)}° · ${hoje.daily_chance_of_rain}% de chance de chuva`,
      "",
    );
  } else {
    linhas.push("🌤️ Clima indisponível no momento.", "");
  }

  if (ativasLista.length) {
    linhas.push(`⚠️ *Ocorrências ativas no Feed (${ativasLista.length})*`);
    for (const oc of ativasLista.slice(0, 3)) {
      linhas.push(`• ${oc.tipo}${oc.bairro ? ` — ${oc.bairro}` : ""} (${tempoRelativo(oc.criado_em)})`);
    }
    if (ativasLista.length > 3) linhas.push(`• e mais ${ativasLista.length - 3} no Feed`);
    linhas.push("");
  }

  const site = (process.env.PLUVITE_SITE_URL || "https://pluvite.vercel.app").replace(/\/+$/, "");
  linhas.push(`🗺️ Mapa completo: ${site}/Mapa`);
  return linhas.join("\n");
}

module.exports = { montarResumoCidade };
