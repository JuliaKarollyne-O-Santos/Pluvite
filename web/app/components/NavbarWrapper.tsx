"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/app/lib/banco";
import Navbar from "./navbar";
import Navbar2 from "./navbar2";
import Navbar3 from "./sidebar";

type Papel = "admin" | "servidor" | "cidadao";
const CHAVE_CACHE = "pluvite-papel";

const lerCache = (): { id: string; papel: Papel } | null => {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_CACHE) || "null");
  } catch {
    return null;
  }
};

// Descobre se a conta logada é da equipe (admin), de uma prefeitura (servidor) ou cidadão.
// Guarda no sessionStorage por usuário para não consultar o banco a cada troca de página.
async function descobrirPapel(): Promise<Papel> {
  const { data } = await supabase.auth.getSession();
  const usuario = data.session?.user;
  if (!usuario) {
    sessionStorage.removeItem(CHAVE_CACHE);
    return "cidadao";
  }

  const cache = lerCache();
  if (cache?.id === usuario.id) return cache.papel;

  const [{ data: admin }, { data: servidor }] = await Promise.all([
    supabase.from("admin").select("id").eq("auth_id", usuario.id).maybeSingle(),
    supabase.from("servidor").select("id").eq("auth_id", usuario.id).maybeSingle(),
  ]);
  const papel: Papel = admin ? "admin" : servidor ? "servidor" : "cidadao";
  sessionStorage.setItem(CHAVE_CACHE, JSON.stringify({ id: usuario.id, papel }));
  return papel;
}

const SEM_NAVBAR = ["/login", "/cadastro-cidadao", "/redefinir-senha", "/conta-nao-encontrada"];
const COM_NAVBAR = ["/"];

// Fica no layout, então NÃO é recriado ao trocar de página: a sidebar das contas de prefeitura
// e da equipe é sempre a mesma instância (sem piscar e sem perder o expandir/recolher).
export default function NavbarWrapper() {
  const pathname = usePathname();
  const [papel, setPapel] = useState<Papel | null>(null);
  const [sidebarExpandida, setSidebarExpandida] = useState(false);

  // Antes da primeira pintura: usa o papel já conhecido nesta sessão, para a sidebar
  // aparecer junto com a página (sem um quadro sem menu). Depois confirma com o banco.
  useLayoutEffect(() => {
    const cache = lerCache();
    if (cache) setPapel(cache.papel);
  }, []);

  useEffect(() => {
    descobrirPapel().then(setPapel);
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") {
        // Esquece também o que os painéis guardaram desta conta
        ["pluvite-papel", "pluvite-servidor", "pluvite-admin"].forEach((k) => sessionStorage.removeItem(k));
        setPapel("cidadao");
      } else if (evento === "SIGNED_IN") {
        descobrirPapel().then(setPapel);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const paginaDePainel =
    pathname?.startsWith("/Prefeituras") || pathname?.startsWith("/Adm");
  const contaDePainel = papel === "admin" || papel === "servidor";

  // Contas de prefeitura e da equipe navegam sempre com a sidebar (painel, Mapa, Feed,
  // Perfil, Emitir alerta...), em vez da navbar do cidadão
  const modoPainel =
    contaDePainel && !SEM_NAVBAR.includes(pathname) && !COM_NAVBAR.includes(pathname);

  // Classes no <html> que ajustam a altura da barra e o recuo do conteúdo (globals.css).
  // useLayoutEffect: aplicadas antes da pintura, então o conteúdo não "pula" ao trocar de página.
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("modo-painel", modoPainel);
    html.classList.toggle("sidebar-expandida", modoPainel && sidebarExpandida);
  }, [modoPainel, sidebarExpandida]);

  if (SEM_NAVBAR.includes(pathname)) return null;
  if (COM_NAVBAR.includes(pathname)) return <Navbar />;

  if (modoPainel) {
    return (
      <Navbar3
        expandida={sidebarExpandida}
        onToggle={setSidebarExpandida}
        papel={papel === "admin" ? "admin" : "servidor"}
      />
    );
  }

  // Painéis sem conta de painel (ainda verificando ou acesso negado): sem menu
  if (paginaDePainel || papel === null) return null;

  return <Navbar2 />;
}
