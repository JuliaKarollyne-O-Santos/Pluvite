"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/banco";
import { AlertTriangle, Check, Info, Loader2 } from "lucide-react";
import {
  CORES_PRIORIDADE,
  PRIORIDADE_POR_TIPO_PADRAO,
  PRIORIDADES,
  TIPOS_OCORRENCIA,
  type Prioridade,
} from "@/app/lib/constantes";

// Aba "Níveis de Risco" do painel /Adm — define qual prioridade (Zona Segura
// → Alerta Máximo) cada tipo de ocorrência recebe no painel da prefeitura
// (/Prefeituras). Antes esse mapeamento era fixo no código; agora fica
// salvo em "config_prioridades" e pode ser mudado por aqui.
export default function PainelPrioridades() {
  const router = useRouter();

  const [config, setConfig] = useState<Record<string, Prioridade>>(
    PRIORIDADE_POR_TIPO_PADRAO,
  );
  const [carregando, setCarregando] = useState(true);
  const [usandoPadrao, setUsandoPadrao] = useState(false);
  const [salvandoTipo, setSalvandoTipo] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const obterTokenSessao = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const carregarConfig = async () => {
    setCarregando(true);
    setErro("");
    try {
      const token = await obterTokenSessao();
      if (!token) {
        router.replace("/login");
        return;
      }
      const resposta = await fetch("/api/admin/config-prioridades", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const resultado = await resposta.json();
      if (!resposta.ok) {
        setErro(resultado.error || "Não foi possível carregar a configuração.");
        return;
      }
      setConfig(resultado.config);
      setUsandoPadrao(Boolean(resultado.usandoPadrao));
    } catch (e) {
      setErro("Erro inesperado ao carregar a configuração.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMudarPrioridade = async (
    tipo: string,
    novaPrioridade: Prioridade,
  ) => {
    const anterior = config[tipo];
    setConfig((prev) => ({ ...prev, [tipo]: novaPrioridade }));
    setSalvandoTipo(tipo);

    try {
      const token = await obterTokenSessao();
      if (!token) {
        router.replace("/login");
        return;
      }

      const resposta = await fetch("/api/admin/config-prioridades", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tipo, prioridade: novaPrioridade }),
      });

      if (!resposta.ok) {
        const resultado = await resposta.json();
        alert(resultado.error || "Não foi possível salvar essa mudança.");
        setConfig((prev) => ({ ...prev, [tipo]: anterior }));
        return;
      }

      setUsandoPadrao(false);
    } catch (e) {
      alert("Erro inesperado ao salvar.");
      setConfig((prev) => ({ ...prev, [tipo]: anterior }));
    } finally {
      setSalvandoTipo(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Níveis de Risco
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Defina qual prioridade cada tipo de ocorrência recebe no painel da
          prefeitura. Isso muda a cor e a urgência mostradas para quem
          despacha as equipes.
        </p>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl p-3.5">
          {erro}
        </div>
      )}

      {usandoPadrao && !erro && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-xl p-3.5">
          <Info size={15} className="shrink-0 mt-0.5" />
          <span>
            A tabela <code className="font-mono">config_prioridades</code>{" "}
            ainda não existe no Supabase — mostrando os valores padrão (só
            leitura por enquanto). Rode{" "}
            <code className="font-mono">
              supabase/migrations/20260923200000_painel_admin.sql
            </code>{" "}
            no SQL Editor do seu projeto pra poder editar por aqui.
          </span>
        </div>
      )}

      {carregando ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-[#091f75]" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {TIPOS_OCORRENCIA.map((tipo) => {
            const prioridadeAtual = config[tipo] || "Zona Segura";
            const cor = CORES_PRIORIDADE[prioridadeAtual];

            return (
              <div
                key={tipo}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cor }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {tipo}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {PRIORIDADES.map((p) => {
                    const selecionada = p === prioridadeAtual;
                    return (
                      <button
                        key={p}
                        onClick={() =>
                          !usandoPadrao && handleMudarPrioridade(tipo, p)
                        }
                        disabled={usandoPadrao || salvandoTipo === tipo}
                        title={usandoPadrao ? "Rode a migration pra editar" : p}
                        className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                          selecionada
                            ? "text-white border-transparent"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                        }`}
                        style={
                          selecionada
                            ? { backgroundColor: CORES_PRIORIDADE[p] }
                            : undefined
                        }
                      >
                        {selecionada &&
                          (salvandoTipo === tipo ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Check size={11} />
                          ))}
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 text-slate-500 text-xs rounded-xl p-3.5">
        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
        <span>
          Essa configuração define a prioridade por <strong>tipo</strong> de
          ocorrência (ex: todo "Alagamento" vira "Estado de Alerta"). Ainda
          não há um cálculo automático por volume de chuva — isso está listado
          como pendência no ROADMAP (Fase 3).
        </span>
      </div>
    </div>
  );
}