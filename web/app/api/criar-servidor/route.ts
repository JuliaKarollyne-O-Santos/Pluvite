import { NextResponse } from "next/server";
import { exigirAdmin, supabaseAdminClient } from "../admin/_auth";

// Rota ADMIN — só quem está logado com uma conta cadastrada na tabela "admin"
// (equipe Pluvite) pode usar. O front manda o token de acesso da sessão logada
// no header Authorization; exigirAdmin (em app/api/admin/_auth.ts) confirma
// esse token e confere se o usuário é mesmo um admin antes de deixar ler,
// criar ou remover servidores.

// Lista os servidores já cadastrados
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
      .from("servidor")
      .select("id, nome_completo, email, municipio, criado_em")
      .order("criado_em", { ascending: false });

    if (error) {
      console.error("Erro ao listar servidores:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro inesperado ao listar servidores:", error);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const verificacao = await exigirAdmin(request);
  if (!verificacao.ok) {
    return NextResponse.json(
      { error: verificacao.mensagem },
      { status: verificacao.status },
    );
  }

  try {
    const { nome, email, senha, municipio } = await request.json();

    if (!nome || !email || !senha || !municipio) {
      return NextResponse.json(
        { error: "Preencha nome, e-mail, senha e município." },
        { status: 400 },
      );
    }

    const supabaseAdmin = supabaseAdminClient();

    // Cria o usuário já com e-mail confirmado (loga direto com email+senha,
    // pela mesma tela de login que os cidadãos usam)
    const { data: usuarioCriado, error: erroCriacao } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome_completo: nome, tipo: "servidor" },
      });

    if (erroCriacao || !usuarioCriado.user) {
      console.error("Erro ao criar usuário servidor:", erroCriacao);
      return NextResponse.json(
        { error: erroCriacao?.message || "Não foi possível criar o usuário." },
        { status: 500 },
      );
    }

    const { error: erroInsercao } = await supabaseAdmin.from("servidor").insert({
      auth_id: usuarioCriado.user.id,
      nome_completo: nome,
      email,
      municipio,
    });

    if (erroInsercao) {
      console.error("Erro ao inserir servidor:", erroInsercao);
      // Desfaz a criação do usuário no Auth pra não deixar conta órfã sem linha em "servidor"
      await supabaseAdmin.auth.admin.deleteUser(usuarioCriado.user.id);
      return NextResponse.json({ error: erroInsercao.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: usuarioCriado.user.id });
  } catch (error) {
    console.error("Erro inesperado ao criar servidor:", error);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}

// Remove a conta de uma prefeitura: apaga a linha em "servidor" e o usuário
// correspondente no Auth (assim o login some por completo, não só o acesso
// ao painel). Id vem via query string: DELETE /api/criar-servidor?id=<uuid>
// (id é o id da linha na tabela "servidor", não o auth_id).
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
      { error: "Informe o id do servidor." },
      { status: 400 },
    );
  }

  try {
    const supabaseAdmin = supabaseAdminClient();

    const { data: servidor, error: erroBusca } = await supabaseAdmin
      .from("servidor")
      .select("id, auth_id")
      .eq("id", id)
      .maybeSingle();

    if (erroBusca || !servidor) {
      return NextResponse.json(
        { error: "Servidor não encontrado." },
        { status: 404 },
      );
    }

    const { error: erroDelete } = await supabaseAdmin
      .from("servidor")
      .delete()
      .eq("id", id);

    if (erroDelete) {
      console.error("Erro ao remover servidor:", erroDelete);
      return NextResponse.json({ error: erroDelete.message }, { status: 500 });
    }

    if (servidor.auth_id) {
      const { error: erroAuth } = await supabaseAdmin.auth.admin.deleteUser(
        servidor.auth_id,
      );
      if (erroAuth) {
        // A linha em "servidor" já foi removida — o login pelo Auth pode
        // continuar existindo (órfão), mas sem acesso a nenhum painel.
        // Loga o erro em vez de falhar a requisição, já que o efeito
        // principal (tirar o acesso) já aconteceu.
        console.error(
          "Servidor removido, mas falhou ao apagar o usuário no Auth:",
          erroAuth,
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro inesperado ao remover servidor:", error);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}