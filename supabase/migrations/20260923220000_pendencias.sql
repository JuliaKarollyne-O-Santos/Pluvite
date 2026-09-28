-- TUDO QUE FALTA APLICAR NO BANCO, NUM ARQUIVO SÓ.
-- Cole inteiro no SQL Editor do Supabase e rode uma vez. É idempotente: pode repetir sem risco.
--
-- Junta o que sobrou das migrations anteriores (só o ALTER TABLE de latitude/longitude e as
-- tabelas do painel chegaram a ser aplicados) mais a correção do CHECK de `tipo`.

-- ───── 1. TIPOS DE OCORRÊNCIA ─────
-- O CHECK do banco foi criado com a lista ANTIGA, de 6 tipos, sem "Acidente" — é o
-- "violates check constraint ocorrencias_tipo_check" ao publicar um acidente.
-- Esta lista é a de TIPOS_OCORRENCIA em web/app/lib/constantes.ts: se um tipo novo for
-- adicionado lá, tem que entrar aqui também.
alter table public.ocorrencias drop constraint if exists ocorrencias_tipo_check;
alter table public.ocorrencias add constraint ocorrencias_tipo_check check (
  tipo in (
    'Acidente',
    'Alagamento',
    'Árvore caída',
    'Buraco na via',
    'Deslizamento de terra',
    'Via interditada',
    'Outros'
  )
);

-- ───── 2. BAIRRO OPCIONAL ─────
-- Rodovias e pontos de referência (Dutra, trevos, pontes) não pertencem a bairro nenhum.
-- O formulário do Feed já deixou de exigir; se o banco tiver NOT NULL, a publicação falha.
alter table public.ocorrencias alter column bairro drop not null;

-- ───── 3. RESTO DA MIGRATION DE LOCALIZAÇÃO ─────
-- As colunas já foram criadas; faltaram a validação, o índice e o Realtime.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ocorrencias_localizacao_valida') then
    alter table public.ocorrencias
      add constraint ocorrencias_localizacao_valida check (
        (latitude is null and longitude is null)
        or (latitude between -90 and 90 and longitude between -180 and 180)
      );
  end if;
end $$;

create index if not exists ocorrencias_cidade_criado_em_idx
  on public.ocorrencias (cidade, criado_em desc);

-- REALTIME: sem isto, uma ocorrência publicada por outra pessoa só aparece no mapa de rotas
-- na próxima consulta periódica (até 60 s parado, 20 s navegando). Com isto, é instantâneo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ocorrencias'
  ) then
    alter publication supabase_realtime add table public.ocorrencias;
  end if;
end $$;

-- ───── 4. "ESSE E-MAIL EXISTE?" (tela de login) ─────
-- O login já foi alterado para chamar esta função em vez de ler cidadao/servidor/admin
-- direto com a anon key. Ver o comentário completo em 20260923200000_painel_admin.sql.
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

-- ───── CONFERÊNCIA ─────
-- Roda junto e mostra se tudo entrou. O esperado é 'ok' nas quatro linhas.
select 'Acidente aceito em ocorrencias.tipo' as item,
       case when exists (
         select 1 from pg_constraint
          where conname = 'ocorrencias_tipo_check'
            and pg_get_constraintdef(oid) like '%Acidente%'
       ) then 'ok' else 'FALTOU' end as situacao
union all
select 'bairro aceita vazio',
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'ocorrencias'
            and column_name = 'bairro' and is_nullable = 'YES'
       ) then 'ok' else 'FALTOU' end
union all
select 'Realtime ligado em ocorrencias',
       case when exists (
         select 1 from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ocorrencias'
       ) then 'ok' else 'FALTOU' end
union all
select 'funcao conta_existe criada',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'conta_existe'
       ) then 'ok' else 'FALTOU' end;
