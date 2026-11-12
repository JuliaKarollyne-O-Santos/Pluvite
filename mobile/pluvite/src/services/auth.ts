/**
 * Login social (Google / Facebook) pelo navegador, sem SDK nativo.
 *
 * Fluxo: o Supabase gera a URL do provedor → o app abre no navegador → depois do login o
 * Supabase redireciona para pluvite://auth com os tokens → o Android devolve a URL ao app
 * (intent-filter no AndroidManifest) → a sessão é criada aqui.
 *
 * Pré-requisitos manuais (ver README do mobile):
 *   - Provedores Google/Facebook ativos no Supabase (já usados pelo site);
 *   - "pluvite://auth" em Supabase → Authentication → URL Configuration → Redirect URLs.
 */

import { Linking } from "react-native";

import { REDIRECT_LOGIN_SOCIAL } from "../lib/configuracao";
import { supabase } from "../pages/lib/supabase";

export type ProvedorSocial = "google" | "facebook";

/** Abre o navegador no login do provedor. A sessão chega depois por `tratarRetornoLogin`. */
export async function entrarComProvedor(provedor: ProvedorSocial) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provedor,
    options: {
      redirectTo: REDIRECT_LOGIN_SOCIAL,
      skipBrowserRedirect: true,
      queryParams:
        provedor === "facebook" ? { auth_type: "rerequest" } : { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error("O Supabase não devolveu o endereço de login.");
  await Linking.openURL(data.url);
}

/** Lê "a=1&b=2" (query ou fragmento) num objeto. */
function lerParametros(texto: string): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const par of texto.split("&")) {
    if (!par) continue;
    const [chave, ...resto] = par.split("=");
    resultado[decodeURIComponent(chave)] = decodeURIComponent(resto.join("=").replace(/\+/g, " "));
  }
  return resultado;
}

/**
 * Cria a sessão a partir da URL pluvite://auth?... ou pluvite://auth#access_token=...
 * Devolve true se a URL era do login social (com ou sem sucesso).
 */
export async function tratarRetornoLogin(url: string | null): Promise<boolean> {
  if (!url || !url.startsWith(REDIRECT_LOGIN_SOCIAL)) return false;

  const [semFragmento, fragmento = ""] = url.split("#");
  const query = semFragmento.split("?")[1] ?? "";
  const parametros = { ...lerParametros(query), ...lerParametros(fragmento) };

  if (parametros.error_description || parametros.error) {
    throw new Error(parametros.error_description || parametros.error);
  }

  // Fluxo PKCE: troca o código pela sessão
  if (parametros.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(parametros.code);
    if (error) throw error;
    return true;
  }

  // Fluxo implícito (padrão do supabase-js): tokens no fragmento
  if (parametros.access_token && parametros.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: parametros.access_token,
      refresh_token: parametros.refresh_token,
    });
    if (error) throw error;
    return true;
  }

  throw new Error("O retorno do login não trouxe a sessão.");
}
