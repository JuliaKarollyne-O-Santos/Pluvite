"use client";

import { useState } from "react";
import { Smartphone, Terminal } from "lucide-react";
import Navbar3 from "@/app/components/sidebar";

export default function WhatsAppAdminPage() {
  const [sidebarExpandida, setSidebarExpandida] = useState(false);

  return (
    <div className="min-h-screen -mt-15 w-full bg-[#f4f5f7] font-sans text-slate-800">
      <Navbar3 expandida={sidebarExpandida} onToggle={setSidebarExpandida} />
      <main
        className={`px-6 pt-24 pb-16 transition-all duration-300 md:pt-8 md:pr-10 ${
          sidebarExpandida ? "md:pl-64" : "md:pl-[84px]"
        }`}
      >
        <div className="mx-auto max-w-3xl space-y-6">
          <header>
            <p className="text-xs font-bold uppercase tracking-widest text-[#0f35a0]">
              Painel Administrativo
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              Conectar WhatsApp
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Vincule o número que enviará os alertas do Pluvite.
            </p>
          </header>

          <section className="flex flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <Terminal size={36} className="text-[#0f35a0]" />
            <h2 className="text-lg font-bold text-slate-900">
              QR Code no terminal
            </h2>
            <p className="max-w-lg text-sm text-slate-600">
              O QR Code não é mais exibido nesta página. Inicie o chatbot em um
              terminal e escaneie o código que aparecer nele.
            </p>
            <div className="w-full max-w-lg space-y-3 rounded-xl bg-slate-50 p-4 text-left text-sm text-slate-700">
              <p>
                <strong>1.</strong> Na pasta{" "}
                <code className="rounded bg-white px-1.5 py-0.5">
                  web/app/python/chatbot
                </code>
                , execute{" "}
                <code className="rounded bg-white px-1.5 py-0.5">
                  node chatbot.js
                </code>
                .
              </p>
              <p>
                <strong>2.</strong> Em outro terminal, na pasta{" "}
                <code className="rounded bg-white px-1.5 py-0.5">web</code>,
                execute{" "}
                <code className="rounded bg-white px-1.5 py-0.5">
                  npm run dev
                </code>
                .
              </p>
              <p>
                <strong>3.</strong> No celular, abra WhatsApp → Aparelhos
                conectados → Conectar aparelho.
              </p>
            </div>
            <p className="flex items-center gap-2 text-xs text-amber-800">
              <Smartphone size={15} />
              Não compartilhe o QR Code. Ele permite vincular sua conta do
              WhatsApp.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
