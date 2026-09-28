"use client";

import { usePathname } from "next/navigation";
import Navbar from "./navbar";
import Navbar2 from "./navbar2";

export default function NavbarWrapper() {
  const pathname = usePathname();
  const semNavbar = ["/login", "/cadastro-cidadao", "/redefinir-senha", "/conta-nao-encontrada"];
  const comNavbar = ["/"];

  if (semNavbar.includes(pathname)) return null;
  if (comNavbar.includes(pathname)) return <Navbar />;

  // Rotas do painel da prefeitura (/Prefeituras) e do painel da equipe
  // Pluvite (/Adm) têm a própria navegação (a sidebar Navbar3, renderizada
  // dentro de cada page.tsx), então o NavbarWrapper não deve mostrar nada aqui.
  if (pathname?.startsWith("/Prefeituras")) return null;
  if (pathname?.startsWith("/Adm")) return null;

  return <Navbar2 />;
}