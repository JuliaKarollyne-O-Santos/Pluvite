// TOKENS VISUAIS — mesmos valores do site (SKILLS/design-system).
// Use estes nomes no StyleSheet em vez de repetir hex soltos.

import { AlertTriangle, CheckCircle, Eye, Wrench } from "lucide-react-native";
import type { StatusOcorrencia } from "./constantes";

export const COR = {
  /** navbar2 / sidebar do site */
  marinho: "#091c4b",
  /** destaques, banners e listas */
  primaria: "#091f75",
  /** botões de envio (login/cadastro) */
  botao: "#0d1b54",
  /** botões secundários e links */
  azul: "#0f35a0",
  foco: "#0f2a8f",
  destaque: "#2a68e2",
  fundo: "#f8fafc",
  fundoPagina: "#f4f5f7",
  card: "#ffffff",
  borda: "#e2e8f0",
  bordaSuave: "#f1f5f9",
  texto: "#0f172a",
  textoForte: "#1e293b",
  textoMedio: "#334155",
  textoSuave: "#64748b",
  textoApagado: "#94a3b8",
  perigo: "#dc2626",
  sucesso: "#059669",
  whatsapp: "#0fa84a",
} as const;

/** Pares de cores dos status (mesmos do badge do site) */
export const STATUS_ESTILO: Record<
  StatusOcorrencia,
  { bg: string; borda: string; texto: string; icone: typeof AlertTriangle }
> = {
  Aguardando: { bg: "#fef2f2", borda: "#fecaca", texto: "#b91c1c", icone: AlertTriangle },
  Visualizado: { bg: "#ecfdf5", borda: "#a7f3d0", texto: "#047857", icone: Eye },
  "Em Andamento": { bg: "#fffbeb", borda: "#fde68a", texto: "#92400e", icone: Wrench },
  Concluído: { bg: "#f1f5f9", borda: "#e2e8f0", texto: "#475569", icone: CheckCircle },
};

/** Sombra leve dos cards (shadow-sm do Tailwind) */
export const SOMBRA = {
  shadowColor: "#0f172a",
  shadowOpacity: 0.06,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
