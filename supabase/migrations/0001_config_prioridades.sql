-- Tabela de configuração dos níveis de risco por tipo de ocorrência.
-- Usada pela tela "Níveis de Risco" do painel da equipe Pluvite (/Adm) e lida
-- pelo painel da prefeitura (/Prefeituras) para colorir/priorizar os chamados.
--
-- Antes desta tabela existir, o mapeamento tipo -> prioridade era fixo no
-- código (PRIORIDADE_POR_TIPO em web/app/Prefeituras/page.tsx). Agora ele
-- pode ser editado pela equipe Pluvite sem precisar mexer em código.
--
-- Rode este arquivo no SQL Editor do seu projeto Supabase (Dashboard >
-- SQL Editor > New query > cole e execute). Depois, se quiser manter o
-- histórico versionado, mova este arquivo pra dentro do controle de
-- migrations oficial do Supabase CLI (ver ROADMAP.md, Fase 0).

create table if not exists public.config_prioridades (
  tipo text primary key,
  prioridade text not null check (
    prioridade in ('Zona Segura', 'Atenção Crítica', 'Estado de Alerta', 'Alerta Máximo')
  ),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id)
);

comment on table public.config_prioridades is
  'Mapeamento editável de tipo de ocorrência -> nível de prioridade/risco. Gerenciado pela equipe Pluvite em /Adm.';

-- Valores padrão — os mesmos que já estavam fixos no código.
insert into public.config_prioridades (tipo, prioridade) values
  ('Deslizamento de terra', 'Alerta Máximo'),
  ('Alagamento', 'Estado de Alerta'),
  ('Via interditada', 'Atenção Crítica'),
  ('Árvore caída', 'Atenção Crítica'),
  ('Buraco na via', 'Atenção Crítica'),
  ('Outros', 'Zona Segura')
on conflict (tipo) do nothing;

-- RLS: qualquer pessoa logada pode ler (o painel da prefeitura precisa disso
-- pra colorir os chamados); só a equipe Pluvite (tabela "admin") pode editar.
-- As rotas de API em web/app/api/admin/* já usam a service role key e
-- ignoram RLS, então essas políticas são uma segunda camada de proteção
-- caso algum código passe a consultar a tabela direto pelo cliente do navegador.
alter table public.config_prioridades enable row level security;

drop policy if exists "config_prioridades_leitura_autenticados" on public.config_prioridades;
create policy "config_prioridades_leitura_autenticados"
  on public.config_prioridades for select
  to authenticated
  using (true);

drop policy if exists "config_prioridades_escrita_admin" on public.config_prioridades;
create policy "config_prioridades_escrita_admin"
  on public.config_prioridades for all
  to authenticated
  using (exists (select 1 from public.admin a where a.auth_id = auth.uid()))
  with check (exists (select 1 from public.admin a where a.auth_id = auth.uid()));