-- PROTEÇÃO DO CIDADÃO — ETAPA 2 DE 2: cada pessoa vê e altera só a própria linha.
-- Idempotente. Rode DEPOIS da etapa 1 (20261123130000_cidadao_publico.sql) e do deploy
-- do código que lê nomes e fotos pela view `cidadao_publico`.
--
-- PROBLEMA: com a chave pública (sb_publishable, embutida no site e no app) qualquer
-- visitante conseguia listar a tabela `cidadao` — e-mail, telefone, endereço, contato de
-- emergência e dados médicos (tipo sanguíneo, alergias, medicamentos). LGPD: dados
-- sensíveis de saúde.
--
-- QUEM PODE O QUÊ, DEPOIS DESTA MIGRATION
--   ler/criar/alterar a própria linha → o cidadão logado (perfil, navbar, alertas, app)
--   nome e foto de outras pessoas      → todos, pela view `cidadao_publico` (etapa 1)
--   tudo                               → service_role (rotas /api/admin, scripts,
--                                         backend de alertas): ignora RLS
--   criar a linha no cadastro          → trigger handle_new_user (security definer)
--
-- Todas as consultas diretas a `cidadao` no site e no app já filtram por
-- auth_id = usuário logado (conferido em 23/11/2026), então continuam funcionando.
-- A rota GET /api/alertas do Express (sem tela que a use) passa a mostrar
-- "Cidadão Anônimo" se o backend estiver sem SUPABASE_SERVICE_ROLE_KEY.

-- ───── 1. REMOVE AS POLÍTICAS ANTIGAS ─────
-- Políticas se SOMAM: uma "liberar tudo" esquecida anularia as novas.
do $$
declare
  politica record;
begin
  for politica in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'cidadao'
  loop
    raise notice 'Removendo política antiga de cidadao: %', politica.policyname;
    execute format('drop policy if exists %I on public.cidadao', politica.policyname);
  end loop;
end $$;

-- ───── 2. RLS: SÓ A PRÓPRIA LINHA ─────
alter table public.cidadao enable row level security;

create policy "cidadao le a propria linha" on public.cidadao
  for select to authenticated
  using (auth_id = auth.uid());

create policy "cidadao cria a propria linha" on public.cidadao
  for insert to authenticated
  with check (auth_id = auth.uid());

create policy "cidadao altera a propria linha" on public.cidadao
  for update to authenticated
  using (auth_id = auth.uid())
  with check (auth_id = auth.uid());

-- Sem política de DELETE: apagar a conta passa pela rota do servidor (service_role),
-- e a linha sai junto com o usuário do Auth.

-- ───── CONFERÊNCIA ─────
select 'RLS ligado em cidadao' as item,
       case when (select relrowsecurity from pg_class where oid = 'public.cidadao'::regclass)
            then 'ok' else 'FALTOU' end as resultado
union all
select '3 políticas em cidadao',
       case when (select count(*) from pg_policies
                   where schemaname = 'public' and tablename = 'cidadao') = 3
            then 'ok' else 'FALTOU' end
union all
select 'view cidadao_publico existe (etapa 1)',
       case when exists (select 1 from pg_views where schemaname = 'public' and viewname = 'cidadao_publico')
            then 'ok' else 'FALTOU — rode a etapa 1 antes' end;

-- ───── SE PRECISAR DESFAZER (EMERGÊNCIA) ─────
-- Reabre a tabela como era antes. Tire os "--" da linha e rode.
--
-- alter table public.cidadao disable row level security;
