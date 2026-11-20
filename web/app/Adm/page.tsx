"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/banco";
import {
  Activity,
  BellRing,
  Building2,
  FileText,
  Smartphone,
  Users,
  Loader2,
  Rss,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import PainelPrefeituras from "./Painelprefeituras";
import PainelModeracao from "./Painelmoderacao";
import PainelPrioridades from "./Painelprioridades";

type EstadoAcesso = "verificando" | "negado" | "autorizado";
type Aba = "prefeituras" | "moderacao" | "prioridades";

const ABAS: { id: Aba; label: string; icon: any }[] = [
  { id: "prefeituras", label: "Prefeituras", icon: Building2 },
  { id: "moderacao", label: "Moderação do Feed", icon: Rss },
  { id: "prioridades", label: "Níveis de Risco", icon: SlidersHorizontal },
];

// Painel interno da equipe Pluvite (não é o painel da prefeitura — esse é
// /Prefeituras). Só quem está logado com uma conta cadastrada na tabela
// "admin" chega até aqui (ver verificação abaixo, e a checagem espelhada no
// servidor em web/app/api/criar-servidor e web/app/api/admin/*).
export default function AdminPage() {
  const router = useRouter();

  const [estadoAcesso, setEstadoAcesso] = useState<EstadoAcesso>("verificando");
  const [mensagemNegado, setMensagemNegado] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<Aba>("prefeituras");
  const [resumo, setResumo] = useState<Record<string, number> | null>(null);

  // Volta ao painel na mesma sessão: abre na hora (sem a tela de carregamento piscando)
  // e confirma o acesso em segundo plano
  useLayoutEffect(() => {
    if (sessionStorage.getItem("pluvite-admin") === "1") setEstadoAcesso("autorizado");
  }, []);

  useEffect(() => {
    verificarAcesso();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verificarAcesso = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      sessionStorage.removeItem("pluvite-admin");
      router.replace("/login");
      return;
    }

    const { data: adminRow, error } = await supabase
      .from("admin")
      .select("id")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (error || !adminRow) {
      sessionStorage.removeItem("pluvite-admin");
      setEstadoAcesso("negado");
      setMensagemNegado(
        "Essa conta não tem acesso ao painel de administração da Pluvite.",
      );
      return;
    }

    sessionStorage.setItem("pluvite-admin", "1");
    setEstadoAcesso("autorizado");
    carregarResumo();
  };

  // Números do topo; se a rota falhar (ex.: sem a chave de serviço no servidor), mostra "–"
  const carregarResumo = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const resposta = await fetch("/api/admin/resumo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resposta.ok) setResumo(await resposta.json());
    } catch (erro) {
      console.error("Erro ao carregar resumo do admin:", erro);
    }
  };

  if (estadoAcesso === "verificando") {
    return (
      <main className="min-h-dvh -mt-[var(--altura-navbar)] w-full flex items-center justify-center bg-fundo p-4">
        <Loader2 size={24} className="animate-spin text-[#091f75]" />
      </main>
    );
  }

  if (estadoAcesso === "negado") {
    return (
      <main className="min-h-dvh -mt-[var(--altura-navbar)] w-full flex items-center justify-center bg-fundo p-4">
        <div className="w-full max-w-sm bg-white rounded-lg border border-slate-200 p-6 sm:p-8 space-y-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <ShieldAlert size={22} />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
            Acesso restrito
          </h1>
          <p className="text-xs text-slate-500">{mensagemNegado}</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-[#091f75] hover:bg-[#0f2a8f] text-white text-sm font-semibold py-2.5 rounded-xl transition cursor-pointer"
          >
            Voltar para o login
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen -mt-[var(--altura-navbar)] w-full font-sans text-slate-800 bg-fundo">

      {/* No celular a sidebar vira a barra superior fixa (64px, TOPBAR_MOBILE_ALTURA): sem recuo
          lateral e com espaço no topo para as abas não ficarem escondidas atrás dela */}
      <div
        className="pt-24 md:pt-8 md:px-6 pb-16"
      >
        <div className="max-w-5xl mx-auto px-6 md:px-4 space-y-6">
          {/* CABEÇALHO */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Equipe Pluvite</p>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mt-1">Administração</h1>
              <p className="text-sm text-slate-500 mt-1">
                Gerencie prefeituras, modere o feed e ajuste os níveis de risco da plataforma.
              </p>
            </div>
            <Link
              href="/Servidor/Emitir"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0b1f6e] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0f35a0] shrink-0"
            >
              <BellRing size={16} />
              Emitir alerta
            </Link>
          </div>

          {/* NÚMEROS DA PLATAFORMA */}
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { rotulo: "Cidadãos", valor: resumo?.cidadaos, Icone: Users, cor: "bg-blue-50 border-blue-200 text-blue-700" },
              { rotulo: "Prefeituras", valor: resumo?.prefeituras, Icone: Building2, cor: "bg-indigo-50 border-indigo-200 text-indigo-700" },
              { rotulo: "Ocorrências", valor: resumo?.ocorrencias, Icone: FileText, cor: "bg-white border-slate-200 text-slate-700" },
              { rotulo: "Em aberto", valor: resumo?.ocorrenciasAtivas, Icone: Activity, cor: "bg-amber-50 border-amber-200 text-amber-700" },
              { rotulo: "Alertas (24h)", valor: resumo?.alertas24h, Icone: BellRing, cor: "bg-red-50 border-red-200 text-red-700" },
              { rotulo: "Aparelhos c/ push", valor: resumo?.dispositivos, Icone: Smartphone, cor: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            ].map(({ rotulo, valor, Icone, cor }) => (
              <div key={rotulo} className={`rounded-lg border px-4 py-4 ${cor}`}>
                <Icone size={17} />
                <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-3 leading-none">
                  {valor ?? "–"}
                </p>
                <p className="text-xs text-slate-500 mt-1.5">{rotulo}</p>
              </div>
            ))}
          </section>

          {/* Abas do painel admin */}
          <div className="border-b border-slate-200 flex items-center gap-1 overflow-x-auto max-w-full">
            {ABAS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setAbaAtiva(id)}
                className={`relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer
                  ${
                    abaAtiva === id
                      ? "text-slate-900 after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-[#0b1f6e]"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {abaAtiva === "prefeituras" && <PainelPrefeituras />}
          {abaAtiva === "moderacao" && <PainelModeracao />}
          {abaAtiva === "prioridades" && <PainelPrioridades />}
        </div>
      </div>
    </div>
  );
}