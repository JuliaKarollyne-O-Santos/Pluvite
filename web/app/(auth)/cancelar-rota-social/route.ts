import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Rota de servidor (nunca roda no navegador) usada pelo /auth/callback pra
// apagar uma conta que acabou de ser criada por engano num login social
// (quando a pessoa tentou ENTRAR mas ainda não tinha cadastro). Usa a
// service role key, que tem permissão de admin no Supabase — por isso isso
// não pode rodar no cliente.
export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId ausente" }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // A linha correspondente em "cidadao" é apagada junto automaticamente
    // (FK auth_id -> auth.users.id com ON DELETE CASCADE).
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      console.error("Erro ao cancelar cadastro social:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro inesperado ao cancelar cadastro social:", error);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}