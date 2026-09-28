"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MailWarning } from "lucide-react";

// Tela mostrada quando alguém tenta entrar (login social ou tradicional) com
// um e-mail que ainda não tem cadastro no Pluvite. Mesmo layout visual das
// telas de login/cadastro, só que o card mostra o aviso em vez do formulário.
export default function ContaNaoEncontrada() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

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

      {/* Elementos visuais de fundo */}
      <div className="absolute -top-[50px] -left-15 w-72 h-72 bg-[#0f35a0]/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute top-[400px] -left-35 w-96 h-96 bg-[#0f35a0]/8 rounded-full pointer-events-none" />
      <div className="absolute bottom-10 left-1/3 w-48 h-48 bg-[#0f35a0]/5 rounded-full blur-xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-[#0f35a0]/5 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute top-10 right-[560px] w-32 h-32 bg-[#0f35a0]/5 rounded-full pointer-events-none" />
      <div className="absolute top-1/2 right-10 w-24 h-24 bg-[#0f35a0]/8 rounded-full blur-sm pointer-events-none" />
      <div className="absolute top-8 right-5 w-16 h-16 bg-[#0f35a0]/6 rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-5 right-1/3 w-28 h-28 bg-[#0f35a0]/3 rounded-full blur-md pointer-events-none" />

      <div className="w-full max-w-[58rem] grid grid-cols-1 md:grid-cols-2 gap-7 items-center relative z-10">
        {/* LADO ESQUERDO: TEXTOS INFORMATIVOS */}
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

          <div className="hidden md:flex items-center gap-3.5 text-xs text-[#0f35a0] font-bold uppercase tracking-wider">
            <span>• Monitoramento Inteligente</span>
            <span>• Dados Precisos</span>
          </div>
        </div>

        {/* LADO DIREITO: CARD DE AVISO */}
        <div className="flex justify-center md:justify-end w-full relative z-10">
          <div className="w-full max-w-[400px] bg-white rounded-2xl shadow-2xl shadow-slate-900/60 border border-slate-200 p-5.5 sm:p-6.5">
            <Link href="/">
              <img
                src="/PluviteIcon.jpg"
                alt="Pluvite Icon"
                className="absolute top-4 right-4 w-10 h-10 rounded-lg object-cover select-none cursor-pointer hover:opacity-90 transition-opacity"
                draggable="false"
              />
            </Link>

            <div className="flex flex-col items-center text-center py-3">
              <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
                <MailWarning size={26} className="text-amber-500" />
              </div>

              <h2 className="text-[1.25rem] font-bold text-slate-800">
                Conta não encontrada
              </h2>

              <p className="text-[13.5px] text-slate-600 mt-2 leading-relaxed">
                {email ? (
                  <>
                    Não encontramos nenhuma conta cadastrada com o e-mail{" "}
                    <span className="font-semibold text-slate-800">{email}</span>.
                  </>
                ) : (
                  "Não encontramos nenhuma conta cadastrada com esse e-mail."
                )}
                <br />
                Cadastre-se para começar a usar a plataforma.
              </p>

              <div className="w-full flex flex-col gap-2.5 mt-6">
                <Link
                  href="/cadastro-cidadao"
                  className="w-full bg-[#0d1b54] hover:bg-[#0d163b] active:bg-[#061560] text-white text-sm font-bold py-2.75 rounded-xl cursor-pointer shadow-md shadow-blue-500/10 flex items-center justify-center gap-2"
                >
                  Criar minha conta
                </Link>

                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-semibold py-2.75 rounded-xl cursor-pointer border border-slate-200"
                >
                  Voltar para o login
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}