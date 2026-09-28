"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { UserRound, Menu, X } from "lucide-react";
import { useState } from "react";

export default function navbar() {
  const pathname = usePathname();
  // Iniciando o estado vazio para nenhum botão começar marcado
  const [activeAnchor, setActiveAnchor] = useState<string>("");
  const [menuAberto, setMenuAberto] = useState(false);

  const navItems = [
    { anchor: "painel", label: "Chamados" },
    { anchor: "recursos", label: "Recursos" },
    { anchor: "comunicacao", label: "Comunicação" },
    { anchor: "riscos", label: "Categorização" },
    { anchor: "emergencia", label: "Emergência" },
    { anchor: "app", label: "Aplicativo" },
  ];

  const handleAnchorClick = (anchor: string) => {
    setActiveAnchor(anchor); // Só marca o fundo após o clique
    setMenuAberto(false); // Fecha o menu mobile ao navegar

    const scrollContainer = document.querySelector(".overflow-y-auto");
    const el = document.getElementById(anchor);
    if (el && scrollContainer) {
      const containerTop = scrollContainer.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      const top = scrollContainer.scrollTop + elTop - containerTop - 70;
      scrollContainer.scrollTo({ top, behavior: "smooth" });
    } else if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav
      className="fixed top-0 right-0 left-0 z-[10000] shadow-[0_2px_10px_rgba(0,0,0,0.15)] w-full"
      style={{ backgroundColor: "#091c4b" }}
    >
      <div className="pt-3 pb-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 ml-4 sm:ml-10 group">
          <img
            src="/PluviteIcon.jpg"
            alt="Logo"
            className="w-10 h-10 mt-1 rounded-xl shadow-sm group-hover:scale-105 transition-transform"
          />
          <span className="text-xl font-bold tracking-tight text-white">
            PLUVITE
          </span>
        </Link>

        {/* Navegação desktop */}
        <div className="hidden lg:flex items-center gap-2 mr-10">
          {navItems.map(({ anchor, label }) => {
            const isActive = activeAnchor === anchor;

            return (
              <button
                key={anchor}
                onClick={() => handleAnchorClick(anchor)}
                className={`px-4 py-2 rounded-xl font-medium transition-all duration-150 cursor-pointer text-white
                  ${isActive ? "bg-white/15 shadow-sm font-bold" : "hover:bg-white/10"}`}
              >
                {label}
              </button>
            );
          })}

          <div className="w-[1px] h-6 bg-white/25 mx-3" />

          <Link
            href="/login"
            className="flex items-center gap-2 bg-slate-50 text-back hover:bg-zinc-200
              transition-all duration-150 px-5 py-2 rounded-xl font-bold
              tracking-wide active:black shadow-md"
          >
            <UserRound size={18} />
            <span>Entrar</span>
          </Link>
        </div>

        {/* Botão hamburguer (mobile/tablet) */}
        <button
          onClick={() => setMenuAberto((v) => !v)}
          className="lg:hidden flex items-center justify-center w-10 h-10 mr-4 sm:mr-10 rounded-lg text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
        >
          {menuAberto ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Painel mobile */}
      <div
        className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out
          ${menuAberto ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="flex flex-col gap-1 px-4 pb-4">
          {navItems.map(({ anchor, label }) => {
            const isActive = activeAnchor === anchor;

            return (
              <button
                key={anchor}
                onClick={() => handleAnchorClick(anchor)}
                className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-all duration-150 cursor-pointer text-white
                  ${isActive ? "bg-white/15 shadow-sm font-bold" : "hover:bg-white/10"}`}
              >
                {label}
              </button>
            );
          })}

          <div className="h-[1px] bg-white/15 my-2" />

          <Link
            href="/login"
            onClick={() => setMenuAberto(false)}
            className="flex items-center justify-center gap-2 bg-slate-50 text-back hover:bg-zinc-200
              transition-all duration-150 px-5 py-3 rounded-xl font-bold tracking-wide shadow-md"
          >
            <UserRound size={18} />
            <span>Entrar</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}