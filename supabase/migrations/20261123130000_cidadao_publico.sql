-- PROTEÇÃO DO CIDADÃO — ETAPA 1 DE 2: vitrine pública com só nome e foto.
-- Idempotente: pode rodar mais de uma vez no SQL Editor do Supabase.
--
-- O Feed, os comentários e o painel /Prefeituras mostram o NOME e a FOTO de quem publicou.
-- Hoje eles leem isso direto de `cidadao`, que tem e-mail, telefone, endereço e dados
-- médicos e está aberta para qualquer visitante. Esta view expõe só o necessário;
-- o código passa a ler daqui (`cidadao:cidadao_publico(...)`).
--
-- ORDEM: 1) rode esta migration; 2) publique o código que usa a view; 3) rode a
-- etapa 2 (20261123130100_cidadao_rls.sql), que fecha a tabela `cidadao`.
-- Rodar a etapa 2 antes do código novo não quebra nada, mas o Feed mostra "Cidadão"
-- no lugar dos nomes até o deploy.

-- A view roda com as permissões da dona (security_invoker = false), então continua
-- mostrando nome e foto de todos mesmo depois do RLS da etapa 2. É intencional: só
-- estas três colunas saem por aqui.
create or replace view public.cidadao_publico
with (security_invoker = false) as
  select id, nome_completo, avatar_url
    from public.cidadao;

comment on view public.cidadao_publico is
  'Nome e foto públicos do cidadão (autor no Feed, comentários, /Prefeituras). Sem dados pessoais.';

revoke all on public.cidadao_publico from anon, authenticated;
grant select on public.cidadao_publico to anon, authenticated;

-- Avisa o PostgREST para enxergar a view (e as ligações dela com ocorrencias/comentarios)
notify pgrst, 'reload schema';

-- ───── CONFERÊNCIA ─────
select 'view cidadao_publico criada' as item,
       case when exists (select 1 from pg_views where schemaname = 'public' and viewname = 'cidadao_publico')
            then 'ok' else 'FALTOU' end as resultado
union all
select 'view expõe só 3 colunas',
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'cidadao_publico') = 3
            then 'ok' else 'FALTOU' end;
