-- Proteção da tabela `ocorrencias` (Feed, Mapa, Rotas, painel /Prefeituras).
-- Idempotente: pode rodar mais de uma vez no SQL Editor do Supabase.
--
-- PROBLEMA: com a chave anon (pública, embutida no site e no app) qualquer pessoa
-- conseguia mudar o status, editar ou apagar ocorrências de outras pessoas.
--
-- QUEM PODE O QUÊ, DEPOIS DESTA MIGRATION
--   ler                     → todo mundo (Feed, Mapa, Rotas e chatbot são públicos)
--   publicar                → cidadão logado, em nome dele mesmo, com status "Aguardando"
--   editar/apagar conteúdo  → só o autor (perfil → "minhas publicações")
--   mudar o status          → servidor da cidade da ocorrência (/Prefeituras) ou admin
--   service_role            → tudo (rotas /api/admin, backend, scripts): ignora RLS e a trava
--
-- `ocorrencias.autor_id` guarda `cidadao.id` (não o id do login): Feed e app usam a linha
-- do cidadão. Por isso as regras passam pelas funções abaixo.

-- ───── 1. FUNÇÕES DE APOIO ─────
-- security definer: leem cidadao/servidor/admin mesmo com RLS nessas tabelas.
-- search_path = '' evita que um schema malicioso no caminho sequestre a função.

-- id em `cidadao` de quem está logado (null para visitante ou conta sem cidadão)
create or replace function public.pluvite_cidadao_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select c.id from public.cidadao c where c.auth_id = auth.uid() limit 1;
$$;

-- quem está logado é da equipe Pluvite?
create or replace function public.pluvite_eh_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (select 1 from public.admin a where a.auth_id = auth.uid());
$$;

-- quem está logado é servidor (prefeitura/Defesa Civil) desta cidade?
create or replace function public.pluvite_eh_servidor_de(p_cidade text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.servidor s
     where s.auth_id = auth.uid()
       and lower(trim(s.municipio)) = lower(trim(p_cidade))
  );
$$;

revoke all on function public.pluvite_cidadao_id() from public;
revoke all on function public.pluvite_eh_admin() from public;
revoke all on function public.pluvite_eh_servidor_de(text) from public;
grant execute on function public.pluvite_cidadao_id() to anon, authenticated;
grant execute on function public.pluvite_eh_admin() to anon, authenticated;
grant execute on function public.pluvite_eh_servidor_de(text) to anon, authenticated;

-- ───── 2. RLS: REMOVE AS POLÍTICAS ANTIGAS E CRIA AS NOVAS ─────
-- Políticas do Postgres se SOMAM (basta uma liberar). Se sobrar uma "liberar tudo" criada
-- pelo painel do Supabase, as novas não adiantam nada — por isso todas as antigas saem.
do $$
declare
  politica record;
begin
  for politica in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'ocorrencias'
  loop
    raise notice 'Removendo política antiga de ocorrencias: %', politica.policyname;
    execute format('drop policy if exists %I on public.ocorrencias', politica.policyname);
  end loop;
end $$;

alter table public.ocorrencias enable row level security;

create policy "ocorrencias visiveis a todos" on public.ocorrencias
  for select to anon, authenticated
  using (true);

create policy "cidadao publica em nome proprio" on public.ocorrencias
  for insert to authenticated
  with check (autor_id = public.pluvite_cidadao_id() and status = 'Aguardando');

create policy "autor, servidor da cidade ou admin atualizam" on public.ocorrencias
  for update to authenticated
  using (
    autor_id = public.pluvite_cidadao_id()
    or public.pluvite_eh_servidor_de(cidade)
    or public.pluvite_eh_admin()
  )
  with check (
    autor_id = public.pluvite_cidadao_id()
    or public.pluvite_eh_servidor_de(cidade)
    or public.pluvite_eh_admin()
  );

create policy "autor ou admin apagam" on public.ocorrencias
  for delete to authenticated
  using (autor_id = public.pluvite_cidadao_id() or public.pluvite_eh_admin());

-- ───── 3. TRAVA POR COLUNA ─────
-- A política de UPDATE diz QUEM pode mexer na linha; esta trava diz EM QUÊ:
--   status   → só servidor da cidade ou admin (o autor não "conclui" a própria denúncia)
--   conteúdo → só o autor ou admin (o servidor não reescreve o relato do cidadão)
-- Vale para anon/authenticated (site e app). service_role e o SQL Editor passam direto.
create or replace function public.ocorrencias_trava_colunas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.pluvite_eh_admin() then
    return new;
  end if;

  if new.status is distinct from old.status
     and not public.pluvite_eh_servidor_de(old.cidade) then
    raise exception 'Somente o servidor de % pode mudar o status desta ocorrência.', old.cidade
      using errcode = '42501';
  end if;

  if (new.autor_id, new.tipo, new.cidade, new.bairro, new.endereco, new.descricao,
      new.imagem_url, new.latitude, new.longitude, new.criado_em)
     is distinct from
     (old.autor_id, old.tipo, old.cidade, old.bairro, old.endereco, old.descricao,
      old.imagem_url, old.latitude, old.longitude, old.criado_em)
     and old.autor_id is distinct from public.pluvite_cidadao_id() then
    raise exception 'Somente o autor pode editar o conteúdo desta ocorrência.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists ocorrencias_trava_colunas on public.ocorrencias;
create trigger ocorrencias_trava_colunas
  before update on public.ocorrencias
  for each row execute function public.ocorrencias_trava_colunas();

-- ───── CONFERÊNCIA ─────
-- Roda junto e mostra o resultado. O esperado é 'ok' nas três linhas.
select 'RLS ligado em ocorrencias' as item,
       case when (select relrowsecurity from pg_class where oid = 'public.ocorrencias'::regclass)
            then 'ok' else 'FALTOU' end as resultado
union all
select '4 políticas em ocorrencias',
       case when (select count(*) from pg_policies
                   where schemaname = 'public' and tablename = 'ocorrencias') = 4
            then 'ok' else 'FALTOU' end
union all
select 'trava de colunas ativa',
       case when exists (select 1 from pg_trigger where tgname = 'ocorrencias_trava_colunas')
            then 'ok' else 'FALTOU' end;

-- ───── SE PRECISAR DESFAZER (EMERGÊNCIA) ─────
-- Volta ao comportamento antigo (tabela aberta). Tire os "--" das 2 linhas e rode.
--
-- drop trigger if exists ocorrencias_trava_colunas on public.ocorrencias;
-- alter table public.ocorrencias disable row level security;
