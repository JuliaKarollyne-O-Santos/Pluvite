import { createClient } from "@supabase/supabase-js";

// Helper compartilhado pelas rotas admin (web/app/api/admin/*) — mesmo padrão
// já usado em web/app/api/criar-servidor/route.ts. Confere se quem está
// chamando a rota está logado E cadastrado na tabela "admin" (equipe Pluvite).
// Não é uma rota (não exporta GET/POST/etc), então o Next não a expõe como
// endpoint — só pode ser importada por outras rotas dentro de app/api.

export function supabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Sem estas variáveis o createClient lança ("supabaseUrl is required") antes de qualquer
// try/catch da rota: o Next devolve um 500 sem corpo JSON e o painel mostra só "Erro
// inesperado", sem pista do que falta. Conferir antes deixa o erro legível.
const configuracaoAusente = () =>
  [
    !process.env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !process.env.SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  ]
    .filter(Boolean)
    .join(" e ");

type ResultadoAuth =
  | { ok: true }
  | { ok: false; status: number; mensagem: string };

export async function exigirAdmin(request: Request): Promise<ResultadoAuth> {
  const faltando = configuracaoAusente();
  if (faltando) {
    console.error(
      `Painel /Adm sem configuração: defina ${faltando} em web/.env.local e reinicie o npm run dev.`,
    );
    return {
      ok: false,
      status: 500,
      mensagem: `O servidor está sem ${faltando}. Configure em web/.env.local e reinicie o servidor.`,
    };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return { ok: false, status: 401, mensagem: "Não autenticado." };
  }

  const supabaseAdmin = supabaseAdminClient();

  const { data: usuarioData, error: erroUsuario } =
    await supabaseAdmin.auth.getUser(token);

  if (erroUsuario || !usuarioData.user) {
    return { ok: false, status: 401, mensagem: "Sessão inválida." };
  }

  const { data: adminRow, error: erroAdmin } = await supabaseAdmin
    .from("admin")
    .select("id")
    .eq("auth_id", usuarioData.user.id)
    .maybeSingle();

  if (erroAdmin || !adminRow) {
    return {
      ok: false,
      status: 403,
      mensagem: "Essa conta não tem acesso ao painel de administração.",
    };
  }

  return { ok: true };
}