// Trânsito ao vivo (TomTom) de toda a cidade do mapa de rotas, mesmo sem rota calculada.
// O backend guarda o resultado por 10 min, então a consulta periódica não gasta cota da TomTom.

import { useEffect, useState } from "react";
import { buscarTransitoDaCidade, type IncidenteTransito } from "./api";

const INTERVALO_TRANSITO_MS = 5 * 60 * 1000;

export function useTransitoDaCidade(cidade: string | null) {
  const [carregado, setCarregado] = useState<{ cidade: string; lista: IncidenteTransito[] } | null>(
    null,
  );
  // Incrementar força uma nova consulta
  const [versao, setVersao] = useState(0);

  // CARREGAMENTO (a cada troca de cidade e a cada nova versão)
  useEffect(() => {
    if (!cidade) return;
    const controle = new AbortController();
    buscarTransitoDaCidade(cidade, controle.signal)
      .then((transito) => setCarregado({ cidade, lista: transito.incidentes }))
      .catch((err) => {
        // Mantém a última lista: o trânsito no mapa é só informativo
        if (!controle.signal.aborted) console.error("Erro ao carregar trânsito da cidade:", err);
      });
    return () => controle.abort();
  }, [cidade, versao]);

  // CONSULTA PERIÓDICA
  useEffect(() => {
    if (!cidade) return;
    const intervalo = setInterval(() => setVersao((v) => v + 1), INTERVALO_TRANSITO_MS);
    return () => clearInterval(intervalo);
  }, [cidade]);

  // Lista de outra cidade nunca aparece enquanto a nova carrega
  return carregado && carregado.cidade === cidade ? carregado.lista : [];
}
