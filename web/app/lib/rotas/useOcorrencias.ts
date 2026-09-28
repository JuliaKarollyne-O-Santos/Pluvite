// Ocorrências ativas do Feed na cidade do mapa de rotas, sempre atualizadas:
// Supabase Realtime (instantâneo) + consulta periódica de reserva (caso o Realtime não esteja
// habilitado para a tabela ou a conexão caia).

import { useEffect, useEffectEvent, useState } from "react";
import { supabase } from "@/app/lib/banco";
import { normalizar } from "@/app/lib/constantes";
import { buscarOcorrenciasDaCidade, type OcorrenciaRota } from "./api";

// Várias mudanças seguidas no banco viram uma única consulta ao backend
const ESPERA_REALTIME_MS = 800;

export function useOcorrenciasDaCidade(
  cidade: string | null,
  {
    intervaloMs,
    aoAtualizar,
  }: {
    intervaloMs: number;
    aoAtualizar: (ocorrencias: OcorrenciaRota[]) => void;
  },
) {
  const [carregadas, setCarregadas] = useState<{ cidade: string; lista: OcorrenciaRota[] } | null>(
    null,
  );
  // Incrementar força uma nova consulta
  const [versao, setVersao] = useState(0);
  const avisarAtualizacao = useEffectEvent((lista: OcorrenciaRota[]) => aoAtualizar(lista));

  // CARREGAMENTO (a cada troca de cidade e a cada nova versão)
  useEffect(() => {
    if (!cidade) return;
    const controle = new AbortController();
    buscarOcorrenciasDaCidade(cidade, controle.signal)
      .then((lista) => {
        setCarregadas({ cidade, lista });
        avisarAtualizacao(lista);
      })
      .catch((err) => {
        // Mantém a última lista: a rota continua desviando do que já era conhecido
        if (!controle.signal.aborted) console.error("Erro ao carregar ocorrências da rota:", err);
      });
    return () => controle.abort();
  }, [cidade, versao]);

  // CONSULTA PERIÓDICA
  useEffect(() => {
    if (!cidade) return;
    const intervalo = setInterval(() => setVersao((v) => v + 1), intervaloMs);
    return () => clearInterval(intervalo);
  }, [cidade, intervaloMs]);

  // VOLTA DO SEGUNDO PLANO: quem deixou a aba aberta veria o mapa desatualizado até a próxima
  // consulta periódica. Ao reexibir a aba (ou voltar o foco) busca na hora — assim as ocorrências
  // publicadas por outras pessoas enquanto a aba estava escondida já aparecem.
  useEffect(() => {
    if (!cidade) return;
    const aoVoltar = () => {
      if (document.visibilityState === "visible") setVersao((v) => v + 1);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [cidade]);

  // REALTIME: novas publicações, mudanças de status e exclusões na tabela do Feed
  useEffect(() => {
    if (!cidade) return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel(`rotas-ocorrencias-${normalizar(cidade).replace(/\s+/g, "-")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ocorrencias" }, (payload) => {
        // Exclusões só trazem o id: nesse caso recarrega de qualquer forma
        const linha = { ...payload.old, ...payload.new } as { cidade?: string };
        if (linha.cidade && normalizar(linha.cidade) !== normalizar(cidade)) return;
        clearTimeout(espera);
        espera = setTimeout(() => setVersao((v) => v + 1), ESPERA_REALTIME_MS);
      })
      .subscribe();
    return () => {
      clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, [cidade]);

  return {
    // Lista de outra cidade nunca aparece enquanto a nova carrega
    ocorrencias: carregadas && carregadas.cidade === cidade ? carregadas.lista : [],
    atualizar: () => setVersao((v) => v + 1),
  };
}
