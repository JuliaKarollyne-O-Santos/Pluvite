"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/banco";
import {
  Loader2,
  MapPin,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { MUNICIPIOS } from "@/app/lib/constantes";

interface OcorrenciaAdmin {
  id: string;
  tipo: string;
  cidade: string;
  bairro: string;
  endereco: string;
  descricao: string | null;
  imagem_url: string | null;
  status: string;
  criado_em: string;
  cidadao?: { nome_completo: string | null; email: string | null } | null;
}

// Aba "Moderação do Feed" do painel /Adm — a equipe Pluvite vê as ocorrências
// de todos os municípios (o Feed público já mostra isso ao cidadão) e remove
// publicações falsas, duplicadas ou impróprias. Diferente do painel da
// prefeitura (/Prefeituras), aqui não muda status — só remove.
export default function PainelModeracao() {
  const router = useRouter();

  const [ocorrencias, setOcorrencias] = useState<OcorrenciaAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [cidadeFiltro, setCidadeFiltro] = useState("");

  const obterTokenSessao = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const carregarOcorrencias = async () => {
    setCarregando(true);
    setErro("");
    try {
      const token = await obterTokenSessao();
      if (!token) {
        router.replace("/login");
        return;
      }
      const resposta = await fetch("/api/admin/ocorrencias", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const resultado = await resposta.json();
      if (!resposta.ok) {
        setErro(resultado.error || "Não foi possível carregar as ocorrências.");
        return;
      }
      setOcorrencias(resultado);
    } catch (e) {
      setErro("Erro inesperado ao carregar as ocorrências.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarOcorrencias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemover = async (ocorrencia: OcorrenciaAdmin) => {
    const confirmar = window.confirm(
      `Remover a publicação "${ocorrencia.tipo}" em ${ocorrencia.bairro}, ${ocorrencia.cidade}? Essa ação não pode ser desfeita.`,
    );
    if (!confirmar) return;

    setRemovendoId(ocorrencia.id);
    try {
      const token = await obterTokenSessao();
      if (!token) {
        router.replace("/login");
        return;
      }

      const resposta = await fetch(
        `/api/admin/ocorrencias?id=${ocorrencia.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!resposta.ok) {
        const resultado = await resposta.json();
        alert(resultado.error || "Não foi possível remover essa publicação.");
        return;
      }

      setOcorrencias((prev) => prev.filter((o) => o.id !== ocorrencia.id));
    } catch (e) {
      alert("Erro inesperado ao remover a publicação.");
    } finally {
      setRemovendoId(null);
    }
  };

  const ocorrenciasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ocorrencias.filter((o) => {
      if (cidadeFiltro && o.cidade !== cidadeFiltro) return false;
      if (!termo) return true;
      const texto =
        `${o.tipo} ${o.bairro} ${o.endereco} ${o.descricao ?? ""} ${o.cidadao?.nome_completo ?? ""}`.toLowerCase();
      return texto.includes(termo);
    });
  }, [ocorrencias, busca, cidadeFiltro]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Moderação do Feed
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Ocorrências de todos os municípios. Remova publicações falsas,
          duplicadas ou impróprias relatadas pela comunidade.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por tipo, bairro, endereço ou autor..."
            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#091f75] focus:ring-2 focus:ring-[#091f75]/10"
          />
        </div>
        <select
          value={cidadeFiltro}
          onChange={(e) => setCidadeFiltro(e.target.value)}
          className="sm:w-56 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#091f75] focus:ring-2 focus:ring-[#091f75]/10"
        >
          <option value="">Todas as cidades</option>
          {MUNICIPIOS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl p-3.5">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-[#091f75]" />
        </div>
      ) : ocorrenciasFiltradas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center text-xs font-semibold text-slate-400">
          Nenhuma ocorrência encontrada para esses filtros.
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-500">
            {ocorrenciasFiltradas.length}{" "}
            {ocorrenciasFiltradas.length === 1
              ? "ocorrência"
              : "ocorrências"}
          </p>

          {ocorrenciasFiltradas.map((o) => (
            <div
              key={o.id}
              className="flex items-start gap-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-4"
            >
              {o.imagem_url ? (
                <img
                  src={o.imagem_url}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover shrink-0 bg-slate-100"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                  <ShieldAlert size={20} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                    {o.tipo}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {o.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <MapPin size={11} className="shrink-0" />
                  {o.endereco} · {o.bairro} · {o.cidade}
                </p>
                {o.descricao && (
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                    {o.descricao}
                  </p>
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  {o.cidadao?.nome_completo || "Cidadão"}
                  {o.cidadao?.email ? ` · ${o.cidadao.email}` : ""}
                </p>
              </div>

              <button
                onClick={() => handleRemover(o)}
                disabled={removendoId === o.id}
                title="Remover publicação"
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer disabled:opacity-50"
              >
                {removendoId === o.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}