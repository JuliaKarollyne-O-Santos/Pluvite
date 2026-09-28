-- Tabelas do painel /Adm (equipe Pluvite) e do painel /Prefeituras.
-- Usadas por web/app/api/admin/*, web/app/api/criar-servidor, web/app/Adm/* e pelo login.
-- Idempotente: pode rodar mais de uma vez no SQL Editor do Supabase.
--
-- A foreign key ocorrencias_autor_id_fkey NÃO é criada aqui: o Feed já usa o mesmo
-- embed (web/app/Feed/page.tsx) e funciona, então ela já existe no banco.

-- ───── EQUIPE PLUVITE (acesso ao painel /Adm) ─────
create table if not exists public.admin (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null unique references auth.users (id) on delete cascade,
  nome_completo text,
  email text unique,
  criado_em timestamptz not null default now()
);

-- ───── CONTAS DE PREFEITURA / DEFESA CIVIL (painel /Prefeituras) ─────
-- Criadas pela equipe Pluvite em /Adm; a rota POST /api/criar-servidor cria o
-- usuário no Auth e insere a linha aqui (auth_id, nome_completo, email, municipio).
create table if not exists public.servidor (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null unique references auth.users (id) on delete cascade,
  nome_completo text not null,
  email text not null unique,
  municipio text not null,
  criado_em timestamptz not null default now()
);

-- ───── NÍVEIS DE RISCO (tela "Níveis de Risco" do /Adm) ─────
-- Sobrescreve, por tipo de ocorrência, o PRIORIDADE_POR_TIPO_PADRAO de
-- web/app/lib/constantes.ts. Só os tipos alterados têm linha aqui.
-- `tipo` é a chave do upsert em PUT /api/admin/config-prioridades.
create table if not exists public.config_prioridades (
  tipo text primary key,
  prioridade text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

-- ───── RLS ─────
-- A anon key do projeto está embutida em app/lib/banco.ts e é pública. Sem RLS
-- qualquer pessoa poderia INSERIR a própria linha em `admin` e ganhar acesso ao
-- painel. As rotas de app/api usam a service_role, que ignora RLS — então elas
-- continuam lendo e escrevendo normalmente.
alter table public.admin enable row level security;
alter table public.servidor enable row level security;
alter table public.config_prioridades enable row level security;

-- Cada conta logada enxerga só a própria linha: é o que /Adm, /Prefeituras, o
-- sidebar e o redirecionamento do login precisam para liberar (ou negar) o acesso.
drop policy if exists "admin le a propria linha" on public.admin;
create policy "admin le a propria linha" on public.admin
  for select to authenticated using (auth.uid() = auth_id);

drop policy if exists "servidor le a propria linha" on public.servidor;
create policy "servidor le a propria linha" on public.servidor
  for select to authenticated using (auth.uid() = auth_id);

-- Os níveis de risco não são segredo: qualquer conta logada lê. Escrita só pela
-- rota admin (service_role).
drop policy if exists "niveis de risco visiveis a quem esta logado" on public.config_prioridades;
create policy "niveis de risco visiveis a quem esta logado" on public.config_prioridades
  for select to authenticated using (true);

-- ───── "ESSE E-MAIL EXISTE?" (tela de login) ─────
-- Quando o login falha, o Supabase devolve o mesmo "Invalid login credentials"
-- para senha errada e para e-mail inexistente. A tela precisa distinguir os dois.
-- Antes ela lia cidadao/servidor/admin direto com a anon key — o que, com RLS
-- ligado acima, deixaria de funcionar (e antes do RLS expunha as linhas inteiras).
-- Esta função roda como dona das tabelas (security definer) e devolve só um
-- booleano: quem chama não enxerga nenhum dado, apenas se a conta existe.
-- `search_path = ''` evita que um schema malicioso no caminho sequestre a função.
create or replace function public.conta_existe(p_email text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (select 1 from public.cidadao  where lower(email) = lower(p_email))
      or exists (select 1 from public.servidor where lower(email) = lower(p_email))
      or exists (select 1 from public.admin    where lower(email) = lower(p_email));
$$;

revoke all on function public.conta_existe(text) from public;
grant execute on function public.conta_existe(text) to anon, authenticated;

-- ───── PASSO FINAL, MANUAL ─────
-- Nenhuma linha em `admin` é criada automaticamente (seria uma brecha). Para se
-- cadastrar como admin: troque o e-mail abaixo pelo da SUA conta (a mesma que você
-- usa no login do Pluvite, já criada em Authentication > Users), tire os "--" e rode.
--
-- insert into public.admin (auth_id, nome_completo, email)
-- select id, coalesce(raw_user_meta_data ->> 'nome_completo', email), email
--   from auth.users
--  where email = 'troque-pelo-seu-email@exemplo.com'
-- on conflict (auth_id) do nothing;
