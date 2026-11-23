/**
 * Regra única de risco por cidade, usada pelo card "Situação" e pelas cores do mapa
 * (Mapa/page.tsx e components/MapaValeComponent.tsx). O resumo do chatbot WhatsApp
 * (python/chatbot/resumoCidade.js) segue a mesma regra.
 *
 * Situação = ocorrências ativas do Feed + chuva (WeatherAPI): intensidade por hora e
 * acumulado previsto em 24h.
 */

export type Gravidade = "critico" | "medio" | "baixo";
export type ContagemGravidade = Record<Gravidade, number>;
export type NivelSituacao = "critico" | "atencao" | "tranquilo";
export type NivelMapa = "baixo" | "medio" | "alto" | "critico";

// INTENSIDADE DA CHUVA (em mm por hora)
export const classificarChuva = (mmPorHora: number) => {
  if (mmPorHora < 0.1) return { texto: "Sem chuva", nivel: 0 };
  if (mmPorHora < 2.5) return { texto: "Chuva fraca", nivel: 1 };
  if (mmPorHora < 7.6) return { texto: "Chuva moderada", nivel: 2 };
  if (mmPorHora < 25) return { texto: "Chuva forte", nivel: 3 };
  return { texto: "Chuva muito forte", nivel: 4 };
};

// CAMPOS DO forecast.json DA WEATHERAPI USADOS AQUI
export interface HoraPrevisao {
  time: string; // "2026-11-23 14:00"
  precip_mm?: number;
  chance_of_rain?: number;
}
export interface PrevisaoWeatherApi {
  location: { localtime: string };
  current: { precip_mm?: number; condition: { text: string } };
  forecast: { forecastday: { hour: HoraPrevisao[] }[] };
}

export interface AnaliseChuva {
  nivel: number;
  texto: string;
  linha: string;
  emAndamento: boolean;
  /** mm acumulados nas próximas 24h */
  total: number;
  /** próximas 6 horas, para a faixa de chance de chuva */
  proximasHoras: HoraPrevisao[];
}

/** Chuva agora, próxima hora com chuva e total em 24h, a partir do forecast da WeatherAPI. */
export function analisarChuva(dados: PrevisaoWeatherApi | null | undefined): AnaliseChuva {
  const vazio: AnaliseChuva = {
    nivel: 0,
    texto: "Sem chuva",
    linha: "Sem previsão de chuva",
    emAndamento: false,
    total: 0,
    proximasHoras: [],
  };
  if (!dados?.forecast?.forecastday) return vazio;

  const agoraLocal = new Date(dados.location.localtime.replace(" ", "T")).getTime();

  // Próximas 24 horas (incluindo a hora atual), juntando hoje e amanhã
  const proximas24h = dados.forecast.forecastday
    .flatMap((dia) => dia.hour)
    .filter((h) => new Date(h.time.replace(" ", "T")).getTime() > agoraLocal - 3600000)
    .slice(0, 24);

  const mmAgora = dados.current.precip_mm ?? 0;
  const mmPorHora = proximas24h.map((h) => h.precip_mm ?? 0);
  const classe = classificarChuva(Math.max(mmAgora, ...mmPorHora, 0));
  const total = mmPorHora.reduce((soma, mm) => soma + mm, 0);
  const proximasHoras = proximas24h.slice(0, 6);
  const primeiraHoraComChuva = proximas24h.find((h) => (h.precip_mm ?? 0) >= 0.1);

  if (mmAgora >= 0.1) {
    return {
      ...classe,
      linha: `${classificarChuva(mmAgora).texto} agora`,
      emAndamento: true,
      total,
      proximasHoras,
    };
  }
  if (primeiraHoraComChuva) {
    return {
      ...classe,
      linha: `${classe.texto} prevista às ${primeiraHoraComChuva.time.split(" ")[1]}`,
      emAndamento: false,
      total,
      proximasHoras,
    };
  }
  return {
    ...vazio,
    linha: `${dados.current.condition.text} · sem chuva prevista`,
    total,
    proximasHoras,
  };
}

// ───── RISCO DA CHUVA: intensidade por hora + acumulado em 24h ─────
// Em encosta, o acumulado pesa tanto quanto o pico: dias de chuva moderada encharcam o solo.
// Limiares de acumulado em 24h (mm): ESTIMATIVA, na faixa usada pela Defesa Civil para
// atenção em áreas de risco; não calibrados por município do Vale.
export const LIMIARES_ACUMULADO_24H_MM = { atencao: 30, alto: 50, critico: 80 } as const;

/** 0 = sem risco · 1 = atenção · 2 = alto · 3 = crítico */
export type RiscoChuva = 0 | 1 | 2 | 3;

function riscoPelaIntensidade(chuva: AnaliseChuva): RiscoChuva {
  if (chuva.nivel >= 4) return 3; // muito forte (≥ 25 mm/h)
  if (chuva.nivel >= 3) return 1; // forte (≥ 7,6 mm/h)
  return 0;
}

function riscoPeloAcumulado(chuva: AnaliseChuva): RiscoChuva {
  if (chuva.total >= LIMIARES_ACUMULADO_24H_MM.critico) return 3;
  if (chuva.total >= LIMIARES_ACUMULADO_24H_MM.alto) return 2;
  if (chuva.total >= LIMIARES_ACUMULADO_24H_MM.atencao) return 1;
  return 0;
}

/** O maior risco entre a intensidade e o acumulado. */
export function riscoDaChuva(chuva: AnaliseChuva): RiscoChuva {
  return Math.max(riscoPelaIntensidade(chuva), riscoPeloAcumulado(chuva)) as RiscoChuva;
}

/** Frase do motivo, quando a chuva é que define a situação. */
export function motivoDaChuva(chuva: AnaliseChuva, cidade: string): string {
  if (riscoPelaIntensidade(chuva) >= riscoPeloAcumulado(chuva)) {
    return chuva.emAndamento
      ? `${chuva.texto} em andamento em ${cidade}.`
      : `${chuva.texto} prevista para ${cidade} nas próximas 24h.`;
  }
  return `${Math.round(chuva.total)} mm de chuva previstos para ${cidade} nas próximas 24h.`;
}

/** Card "Situação" da cidade. */
export function situacaoDaCidade(ativas: ContagemGravidade, riscoChuva: RiscoChuva): NivelSituacao {
  if (ativas.critico > 0 || riscoChuva >= 2) return "critico";
  if (ativas.medio > 0 || riscoChuva >= 1) return "atencao";
  return "tranquilo";
}

/**
 * Cor da cidade no mapa, derivada da mesma Situação do card:
 * tranquila → Baixo · atenção → Médio · crítica → Alto, ou Crítico quando o perigo é extremo
 * (chuva crítica sozinha, ou alerta crítico ativo junto com chuva de atenção ou pior).
 */
export function nivelNoMapa(ativas: ContagemGravidade, riscoChuva: RiscoChuva): NivelMapa {
  const situacao = situacaoDaCidade(ativas, riscoChuva);
  if (situacao === "tranquilo") return "baixo";
  if (situacao === "atencao") return "medio";
  if (riscoChuva >= 3 || (ativas.critico > 0 && riscoChuva >= 1)) return "critico";
  return "alto";
}

/** Cores da legenda "Nível de risco no mapa" (polígonos e marcadores). */
export const NIVEIS_MAPA: { nivel: NivelMapa; rotulo: string; cor: string }[] = [
  { nivel: "baixo", rotulo: "Baixo", cor: "#16a34a" },
  { nivel: "medio", rotulo: "Médio", cor: "#ea580c" },
  { nivel: "alto", rotulo: "Alto", cor: "#dc2626" },
  { nivel: "critico", rotulo: "Crítico", cor: "#7c3aed" },
];

export const COR_NIVEL_MAPA = Object.fromEntries(
  NIVEIS_MAPA.map(({ nivel, cor }) => [nivel, cor]),
) as Record<NivelMapa, string>;
