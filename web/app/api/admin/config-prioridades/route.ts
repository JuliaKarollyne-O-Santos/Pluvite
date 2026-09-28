import { NextResponse } from "next/server";
import { exigirAdmin, supabaseAdminClient } from "../_auth";
import { PRIORIDADE_POR_TIPO_PADRAO, PRIORIDADES } from "@/app/lib/constantes";

// Rota ADMIN da tela "Níveis de Risco" — lê e atualiza o mapeamento
// tipo de ocorrência -> prioridade guardado em "config_prioridades"
// (ver supabase/migrations/20260923200000_painel_admin.sql). Se a tabela ainda
// não tiver sido criada no Supabase, cai de volta pros valores padrão que
// já estavam fixos no código, pra a tela nunca ficar vazia.

export async function GET(request: Request) {
  const verificacao = await exigirAdmin(request);
  if (!verificacao.ok) {
    return NextResponse.json(
      { error: verificacao.mensagem },
      { status: verificacao.status },
    );
  }

  try {
    const supabaseAdmin = supabaseAdminClient();

    const { data, error } = await supabaseAdmin
      .from("config_prioridades")
      .select("tipo, prioridade, atualizado_em");

    if (error) {
      // Tabela ainda não existe (migration não rodada) — devolve os padrões
      // com um aviso, em vez de quebrar a tela.
      console.error(
        "Erro ao ler config_prioridades (rodou a migration?):",
        error,
      );
      return NextResponse.json({
        usandoPadrao: true,
        config: PRIORIDADE_POR_TIPO_PADRAO,
      });
    }

    const config = { ...PRIORIDADE_POR_TIPO_PADRAO };
    (data || []).forEach((linha) => {
      (config as Record<string, string>)[linha.tipo] = linha.prioridade;
    });

    return NextResponse.json({ usandoPadrao: false, config });
  } catch (error) {
    console.error("Erro inesperado ao ler config de prioridades:", error);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}

// Body: { tipo: string, prioridade: string }
export async function PUT(request: Request) {
  const verificacao = await exigirAdmin(request);
  if (!verificacao.ok) {
    return NextResponse.json(
      { error: verificacao.mensagem },
      { status: verificacao.status },
    );
  }

  try {
    const { tipo, prioridade } = await request.json();

    if (!tipo || !prioridade) {
      return NextResponse.json(
        { error: "Informe o tipo e a nova prioridade." },
        { status: 400 },
      );
    }

    if (!(PRIORIDADES as readonly string[]).includes(prioridade)) {
      return NextResponse.json(
        { error: "Prioridade inválida." },
        { status: 400 },
      );
    }

    const supabaseAdmin = supabaseAdminClient();

    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: usuarioData } = await supabaseAdmin.auth.getUser(token);

    const { error } = await supabaseAdmin.from("config_prioridades").upsert(
      {
        tipo,
        prioridade,
        atualizado_em: new Date().toISOString(),
        atualizado_por: usuarioData.user?.id ?? null,
      },
      { onConflict: "tipo" },
    );

    if (error) {
      console.error("Erro ao salvar prioridade:", error);
      return NextResponse.json(
        {
          error:
            "Não foi possível salvar. A tabela 'config_prioridades' existe no Supabase? Veja supabase/migrations/20260923200000_painel_admin.sql.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro inesperado ao salvar prioridade:", error);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}