import { NextResponse } from "next/server";
import { exigirAdmin, supabaseAdminClient } from "../_auth";

// Rota ADMIN de moderação do Feed — lista ocorrências de todos os municípios
// (o Feed público já mostra isso pro cidadão; aqui é só leitura/remoção pela
// equipe Pluvite) e permite remover uma publicação imprópria, falsa ou spam.

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
      .from("ocorrencias")
      .select(
        "id, tipo, cidade, bairro, endereco, descricao, imagem_url, status, criado_em, cidadao!ocorrencias_autor_id_fkey(nome_completo, email)",
      )
      .order("criado_em", { ascending: false })
      .limit(300);

    if (error) {
      console.error("Erro ao listar ocorrências (admin):", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro inesperado ao listar ocorrências (admin):", error);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}

// Remove uma ocorrência (e os registros dependentes: curtidas, comentários e,
// se houver, a foto no Storage). O id vem via query string:
// DELETE /api/admin/ocorrencias?id=<uuid>
export async function DELETE(request: Request) {
  const verificacao = await exigirAdmin(request);
  if (!verificacao.ok) {
    return NextResponse.json(
      { error: verificacao.mensagem },
      { status: verificacao.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Informe o id da ocorrência." },
      { status: 400 },
    );
  }

  try {
    const supabaseAdmin = supabaseAdminClient();

    const { data: ocorrencia, error: erroBusca } = await supabaseAdmin
      .from("ocorrencias")
      .select("id, imagem_url")
      .eq("id", id)
      .maybeSingle();

    if (erroBusca || !ocorrencia) {
      return NextResponse.json(
        { error: "Ocorrência não encontrada." },
        { status: 404 },
      );
    }

    // Apaga primeiro os registros dependentes (comentários e curtidas) pra
    // não esbarrar em constraint de chave estrangeira ao apagar a ocorrência.
    await supabaseAdmin.from("comentarios").delete().eq("ocorrencia_id", id);
    await supabaseAdmin.from("curtidas").delete().eq("ocorrencia_id", id);

    const { error: erroDelete } = await supabaseAdmin
      .from("ocorrencias")
      .delete()
      .eq("id", id);

    if (erroDelete) {
      console.error("Erro ao remover ocorrência:", erroDelete);
      return NextResponse.json({ error: erroDelete.message }, { status: 500 });
    }

    // Melhor esforço: remove a foto do Storage, se houver. Não falha a
    // requisição se isso der errado (a ocorrência já foi removida do banco).
    if (ocorrencia.imagem_url) {
      try {
        const url = new URL(ocorrencia.imagem_url);
        const marcador = "/object/public/ocorrencias/";
        const indice = url.pathname.indexOf(marcador);
        if (indice !== -1) {
          const caminhoArquivo = url.pathname.slice(
            indice + marcador.length,
          );
          await supabaseAdmin.storage
            .from("ocorrencias")
            .remove([decodeURIComponent(caminhoArquivo)]);
        }
      } catch (erroStorage) {
        console.error(
          "Não foi possível remover a foto da ocorrência do Storage:",
          erroStorage,
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro inesperado ao remover ocorrência:", error);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}