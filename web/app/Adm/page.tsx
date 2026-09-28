"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/banco";
import {
  Building2,
  Loader2,
  Rss,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import Navbar3 from "../components/sidebar";
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
  const [sidebarExpandida, setSidebarExpandida] = useState(false);

  useEffect(() => {
    verificarAcesso();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verificarAcesso = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: adminRow, error } = await supabase
      .from("admin")
      .select("id")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (error || !adminRow) {
      setEstadoAcesso("negado");
      setMensagemNegado(
        "Essa conta não tem acesso ao painel de administração da Pluvite.",
      );
      return;
    }

    setEstadoAcesso("autorizado");
  };

  if (estadoAcesso === "verificando") {
    return (
      <main className="min-h-screen w-full flex items-center justify-center bg-[#f4f5f7] p-4">
        <Loader2 size={24} className="animate-spin text-[#091f75]" />
      </main>
    );
  }

  if (estadoAcesso === "negado") {
    return (
      <main className="min-h-screen w-full flex items-center justify-center bg-[#f4f5f7] p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <ShieldAlert size={22} />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">
            Acesso restrito
          </h1>
          <p className="text-xs text-slate-500">{mensagemNegado}</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-[#091f75] hover:bg-[#0f2a8f] text-white text-sm font-bold py-2.5 rounded-xl transition cursor-pointer"
          >
            Voltar para o login
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen -mt-15 w-full font-sans text-slate-800 bg-[#f4f5f7]">
      <Navbar3 expandida={sidebarExpandida} onToggle={setSidebarExpandida} />

      <div
        className={`pt-8 pr-6 md:pr-10 pb-16 transition-all duration-300 ease-in-out ${
          sidebarExpandida ? "pl-64" : "pl-[84px]"
        }`}
      >
        <div className="max-w-4xl mx-auto px-6 md:px-4 space-y-6">
          {/* Abas do painel admin */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-fit overflow-x-auto max-w-full">
            {ABAS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setAbaAtiva(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all cursor-pointer
                  ${
                    abaAtiva === id
                      ? "bg-[#091f75] text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50"
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