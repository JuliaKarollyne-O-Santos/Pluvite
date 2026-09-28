"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/banco";

// Página de destino do login social (Google/Facebook), tanto vindo do /login
// quanto do /cadastro-cidadao. Serve pra distinguir os dois casos:
//
// - intent=cadastro -> a pessoa QUERIA criar conta. Deixa passar sempre.
// - intent=login -> a pessoa só queria ENTRAR. Se a conta acabou de ser criada
//   agora mesmo (created_at e last_sign_in_at praticamente iguais), significa
//   que ela não existia antes do clique -> desloga e manda pro /login com aviso.
export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent");

  useEffect(() => {
    const verificar = async () => {
      const { data, error } = await supabase.auth.getUser();
      const usuario = data.user;

      if (error || !usuario) {
        router.replace("/login");
        return;
      }

      const criadoEm = new Date(usuario.created_at).getTime();
      const ultimoLogin = usuario.last_sign_in_at
        ? new Date(usuario.last_sign_in_at).getTime()
        : criadoEm;
      // Diferença pequena entre os dois timestamps = primeiro login dessa conta,
      // ou seja, ela acabou de ser criada agora (não existia antes).
      const contaAcabouDeSerCriada = Math.abs(ultimoLogin - criadoEm) < 10000;

      if (intent === "login" && contaAcabouDeSerCriada) {
        const email = usuario.email;

        // A conta acabou de ser criada por engano (a pessoa só queria
        // ENTRAR, não se cadastrar). Apaga ela de verdade no servidor pra
        // não deixar uma conta fantasma que permitiria entrar da próxima vez.
        try {
          await fetch("/api/cancelar-cadastro-social", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: usuario.id }),
          });
        } catch (erroCancelamento) {
          console.error("Erro ao cancelar cadastro social:", erroCancelamento);
        }

        await supabase.auth.signOut();
        router.replace(
          `/conta-nao-encontrada${email ? `?email=${encodeURIComponent(email)}` : ""}`,
        );
        return;
      }

      router.replace("/Mapa");
    };

    verificar();
  }, [intent, router]);

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-slate-50">
      <p className="text-sm font-semibold text-slate-500">Entrando...</p>
    </main>
  );
}