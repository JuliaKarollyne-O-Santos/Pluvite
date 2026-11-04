"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/banco";
import Link from "next/link";

export default function RedefinirSenha() {
  const router = useRouter();

  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (senha !== confirmarSenha) {
      alert("As senhas não coincidem!");
      return;
    }

    if (senha.length < 6) {
      alert("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setCarregando(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: senha,
      });

      if (error) throw error;

      setSucesso(true);
      
      setTimeout(() => {
        router.push("/login");
      }, 3000);

    } catch (error: any) {
      alert(`Erro ao atualizar senha: ${error.message || error}`);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <main className="min-h-dvh w-full flex items-center justify-center -mt-[var(--altura-navbar)] bg-slate-50 p-4 font-sans antialiased relative overflow-hidden">
      
      {/* Elementos visuais de fundo */}
      <div className="absolute -top-[50px] -left-15 w-72 h-72 bg-[#0f35a0]/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute top-[400px] -left-35 w-96 h-96 bg-[#0f35a0]/8 rounded-full pointer-events-none" />
      <div className="absolute bottom-10 left-1/3 w-48 h-48 bg-[#0f35a0]/5 rounded-full blur-xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-[#0f35a0]/5 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute top-1/2 right-10 w-24 h-24 bg-[#0f35a0]/8 rounded-full blur-sm pointer-events-none" />

      {/* Container de Grid - Duas colunas em telas médias/grandes */}
      <div className="w-full max-w-[1000px] grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center relative z-10">
        
        {/* LADO ESQUERDO: TEXTOS INFORMATIVOS */}
        <div className="text-slate-900 space-y-6 text-center md:text-left flex flex-col items-center md:items-start">
          <h1 className="text-5xl uppercase lg:text-6xl font-black tracking-tight leading-tight text-black">
            Plataforma
            <div className="flex flex-row items-center justify-center md:justify-start">
              <img
                src="/pluvite-xl.png"
                alt="Pluvite"
                className="w-15 h-15 -ml-3 mt-2 -mr-2 rounded-xl select-none object-cover"
                draggable="false"
              />
              luvite
            </div>
          </h1>

          <p className="text-slate-700 text-base sm:text-lg max-w-md font-medium leading-relaxed">
            Monitore, previna e gerencie dados pluviais com precisão em tempo
            real. Apoiando a gestão pública e a segurança do cidadão.
          </p>

          <div className="hidden md:flex items-center gap-4 text-xs text-[#0f35a0] font-bold uppercase tracking-wider">
            <span>• Monitoramento Inteligente</span>
            <span>• Dados Precisos</span>
          </div>
        </div>

        {/* LADO DIREITO: CARD DE REDEFINIÇÃO */}
        <div className="w-full max-w-[450px] mx-auto bg-white rounded-2xl shadow-2xl shadow-slate-900/60 border border-slate-200 p-8">
          {!sucesso ? (
            <>
              <div className="mb-8 text-center md:text-left">
                <h2 className="text-2xl font-bold text-slate-800">
                  Nova Senha
                </h2>
                <p className="text-sm text-slate-600 mt-2">
                  Crie uma senha forte para proteger sua conta no Pluvite.
                </p>
              </div>

              <form onSubmit={handleUpdatePassword} className="space-y-5">
                {/* Campo Nova Senha */}
                <div className="relative flex items-center">
                  <input
                    type={mostrarSenha ? "text" : "password"}
                    required
                    disabled={carregando}
                    placeholder="Nova senha"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="w-full bg-slate-50 text-sm text-black rounded-xl px-4 py-3 pr-12 border border-slate-200 focus:border-blue-900 focus:bg-white outline-none transition-all disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha(!mostrarSenha)}
                    className="absolute right-4 text-slate-400 hover:text-slate-600"
                  >
                    {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Campo Confirmar Senha */}
                <div className="relative">
                  <input
                    type={mostrarSenha ? "text" : "password"}
                    required
                    disabled={carregando}
                    placeholder="Confirme a nova senha"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    className="w-full bg-slate-50 text-sm text-black rounded-xl px-4 py-3 border border-slate-200 focus:border-blue-900 focus:bg-white outline-none transition-all disabled:opacity-60"
                  />
                </div>

                <button
                  type="submit"
                  disabled={carregando}
                  className="w-full bg-[#0d1b54] hover:bg-[#0d163b] text-white text-sm font-bold py-3.5 rounded-xl cursor-pointer shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  {carregando ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    "Atualizar Senha"
                  )}
                </button>
              </form>
            </>
          ) : (
            /* Tela de Sucesso */
            <div className="text-center py-4">
              <div className="flex justify-center mb-4">
                <CheckCircle2 size={60} className="text-green-500 animate-bounce" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Senha Alterada!</h2>
              <p className="text-slate-600 mt-2">
                Sua senha foi redefinida com sucesso. Redirecionando para o login...
              </p>
            </div>
          )}

          <div className="text-center mt-8">
            <Link
              href="/login"
              className="text-xs text-[#0f35a0] font-bold hover:underline uppercase tracking-wider"
            >
              Voltar para o login
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}