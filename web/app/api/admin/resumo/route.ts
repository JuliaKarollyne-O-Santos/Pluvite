import { NextResponse } from "next/server";
import { exigirAdmin, supabaseAdminClient } from "../_auth";

// Números gerais da plataforma para o topo do painel /Adm.
// GET /api/admin/resumo  (mesma verificação de admin das outras rotas)
export async function GET(request: Request) {
  const verificacao = await exigirAdmin(request);
  if (!verificacao.ok) {
    return NextResponse.json({ error: verificacao.mensagem }, { status: verificacao.status });
  }

  try {
    const db = supabaseAdminClient();
    const contar = async (tabela: string, filtro?: (q: any) => any) => {
      let q = db.from(tabela).select("*", { count: "exact", head: true });
      if (filtro) q = filtro(q);
      const { count, error } = await q;
      if (error) console.error(`Erro ao contar ${tabela}:`, error.message);
      return count ?? 0;
    };
    const ultimas24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [cidadaos, prefeituras, ocorrencias, ocorrenciasAtivas, alertas24h, dispositivos] =
      await Promise.all([
        contar("cidadao"),
        contar("servidor"),
        contar("ocorrencias"),
        contar("ocorrencias", (q) => q.neq("status", "Concluído")),
        contar("alertas_tempo_real", (q) => q.gte("criado_em", ultimas24h)),
        contar("dispositivos", (q) => q.eq("ativo", true)),
      ]);

    return NextResponse.json({ cidadaos, prefeituras, ocorrencias, ocorrenciasAtivas, alertas24h, dispositivos });
  } catch (error) {
    console.error("Erro inesperado no resumo (admin):", error);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}
