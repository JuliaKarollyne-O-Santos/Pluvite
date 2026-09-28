"use client";

import { supabase } from "@/app/lib/banco";
import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function CadastroCidadao() {
  const router = useRouter();

  // Estados do Formulário de Cadastro
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");

  // Estados de Controle Visual
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmarSenha, setMostrarConfirmarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (senha !== confirmarSenha) {
      alert("As senhas não coincidem!");
      return;
    }

    setCarregando(true);

    try {
      // Cria a conta de autenticação enviando o nome nos metadados.
      // O trigger handle_new_user() no banco já cria a linha em "cidadao" automaticamente.
      const { error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { nome_completo: nome } },
      });

      if (error) {
        alert("Erro ao criar conta: " + error.message);
        return;
      }

      alert("Cadastro realizado com sucesso!");
      router.push("/perfil");
    } catch (error) {
      console.error("Erro inesperado no cadastro:", error);
      alert("Ocorreu um erro no servidor. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  };

  // Cadastro/Login Social via OAuth
  // Vai pro /auth/callback com intent=cadastro: aqui a intenção é criar conta
  // mesmo, então o callback nunca desloga, só manda pro /Mapa.
  const handleSocialLogin = async (provedor: "google" | "facebook") => {
    setCarregando(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provedor,
        options: {
          redirectTo: `${window.location.origin}/callback?intent=cadastro`,
        },
      });

      if (error) throw error;
    } catch (error: any) {
      alert(`Erro ao cadastrar com o ${provedor}: ${error.message || error}`);
      setCarregando(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center -mt-15 bg-slate-50 p-4 sm:p-6 md:p-7 font-sans antialiased relative overflow-hidden">
      {/* BOTÃO VOLTAR */}
      <Link
        href="/"
        className="absolute top-4 left-4 z-20 flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#0f35a0] bg-white/80 hover:bg-white px-3 py-1.5 rounded-lg border border-slate-200/80 shadow-sm transition-all"
      >
        <ArrowLeft size={15} />
        Voltar ao início
      </Link>
      {/* Elementos Visuais de Fundo */}
      <div className="absolute -top-[50px] -left-15 w-72 h-72 bg-[#1447f2]/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute top-[400px] -left-35 w-96 h-96 bg-[#1447c4]/8 rounded-full pointer-events-none" />
      <div className="absolute bottom-10 left-1/3 w-48 h-48 bg-[#1447c4]/5 rounded-full blur-xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-[#1447c4]/5 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute top-10 right-[560px] w-32 h-32 bg-[#1447c4]/5 rounded-full pointer-events-none" />
      <div className="absolute top-1/2 right-10 w-24 h-24 bg-[#1447c4]/8 rounded-full blur-sm pointer-events-none" />
      <div className="absolute top-8 right-5 w-16 h-16 bg-[#1447f2]/6 rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-5 right-1/3 w-28 h-28 bg-[#1447c4]/3 rounded-full blur-md pointer-events-none" />

      <div className="w-full max-w-[58rem] grid grid-cols-1 md:grid-cols-2 gap-7 items-center relative z-10">
        {/* Textos Informativos Laterais */}
        <div className="text-slate-900 space-y-5 pr-0 md:pr-7 text-center md:text-left flex flex-col items-center md:items-start">
          <h1 className="text-[2.4rem] uppercase lg:text-[3.15rem] font-black tracking-tight leading-tight text-black">
            Plataforma
            <div className="flex flex-row">
              <img
                src="/pluvite-xl.png"
                alt="Pluvite"
                className="w-[3.25rem] h-[3.25rem] -ml-2.5 mt-1.5 -mr-1.5 rounded-xl select-none object-cover flex-row flex"
                draggable="false"
              />
              luvite
            </div>
          </h1>

          <p className="text-slate-700 text-sm sm:text-[17px] max-w-[26rem] font-medium leading-relaxed">
            Monitore, previna e gerencie dados pluviais com precisão em tempo
            real. Apoiando a gestão pública e a segurança do cidadão.
          </p>

          <div className="hidden md:flex items-center gap-3.5 text-xs text-[#1447c4] font-bold uppercase tracking-wider">
            <span>• Monitoramento Inteligente</span>
            <span>• Dados Precisos</span>
          </div>
        </div>

        {/* Card do Formulário */}
        <div className="flex justify-center md:justify-end w-full relative z-10">
          <div className="w-full max-w-[400px] bg-white rounded-2xl shadow-2xl shadow-slate-900/60 border border-slate-200 p-5.5 sm:p-6.5 transition-all duration-300">
            <Link href="/">
              <img
                src="/PluviteIcon.jpg"
                alt="Pluvite Icon"
                className="absolute top-4 right-4 w-10 h-10 rounded-lg object-cover select-none cursor-pointer hover:opacity-90 transition-opacity"
                draggable="false"
              />
            </Link>
            <div className="mb-4.5 text-center md:text-left">
              <h2 className="text-[1.35rem] font-bold text-slate-800">
                Crie sua conta
              </h2>
              <p className="text-[13px] text-black mt-1">
                Preencha os campos abaixo para se cadastrar
              </p>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="relative">
                <input
                  type="text"
                  required
                  disabled={carregando}
                  placeholder="Nome completo"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-slate-50 text-sm text-black rounded-xl px-4 py-2.75 border border-slate-200 focus:border-blue-900 focus:bg-white outline-none placeholder:text-slate-500 disabled:opacity-60"
                />
              </div>

              <div className="relative">
                <input
                  type="email"
                  required
                  disabled={carregando}
                  placeholder="E-mail institucional ou pessoal"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 text-sm text-black rounded-xl px-4 py-2.75 border border-slate-200 focus:border-blue-900 focus:bg-white outline-none placeholder:text-slate-500 disabled:opacity-60"
                />
              </div>

              <div className="relative flex items-center">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  required
                  disabled={carregando}
                  placeholder="Criar uma senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full bg-slate-50 text-sm text-black rounded-xl px-4 py-2.75 pr-12 border border-slate-200 focus:border-blue-900 focus:bg-white outline-none placeholder:text-slate-500 disabled:opacity-60"
                />
                <button
                  type="button"
                  disabled={carregando}
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-4 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className="relative flex items-center">
                <input
                  type={mostrarConfirmarSenha ? "text" : "password"}
                  required
                  disabled={carregando}
                  placeholder="Confirmar senha"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  className="w-full bg-slate-50 text-sm text-black rounded-xl px-4 py-2.75 pr-12 border border-slate-200 focus:border-blue-900 focus:bg-white outline-none placeholder:text-slate-500 disabled:opacity-60"
                />
                <button
                  type="button"
                  disabled={carregando}
                  onClick={() =>
                    setMostrarConfirmarSenha(!mostrarConfirmarSenha)
                  }
                  className="absolute right-4 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  {mostrarConfirmarSenha ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="w-full bg-[#0d1b54] hover:bg-[#0d163b] active:bg-blue-800 text-white text-sm font-bold py-2.75 rounded-xl transition-all cursor-pointer shadow-md shadow-blue-500/10 flex items-center justify-center gap-2"
              >
                {carregando ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Cadastrar"
                )}
              </button>
            </form>

            {/* Divisor */}
            <div className="flex items-center gap-3 my-3.5">
              <hr className="flex-1 border-slate-200" />
              <span className="text-[10px] text-slate-700 font-bold uppercase tracking-widest">
                OU
              </span>
              <hr className="flex-1 border-slate-200" />
            </div>

            {/* Login Social */}
            <div className="space-y-2">
              <button
                type="button"
                disabled={carregando}
                onClick={() => handleSocialLogin("facebook")}
                className="w-full bg-[#0f35a0] hover:bg-[#091f75] text-white text-[14.5px] font-semibold py-2.25 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Facebook
              </button>

              <button
                type="button"
                disabled={carregando}
                onClick={() => handleSocialLogin("google")}
                className="w-full bg-zinc-200 hover:bg-slate-300 border border-slate-200 text-black text-[14.5px] font-semibold py-2.25 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Google
              </button>
            </div>

            {/* Rodapé */}
            <div className="text-center mt-4.5 text-sm text-slate-500">
              Já possui uma conta?{" "}
              <Link
                href="/login"
                className="text-[#1447c4] font-bold hover:underline"
              >
                Entre
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}