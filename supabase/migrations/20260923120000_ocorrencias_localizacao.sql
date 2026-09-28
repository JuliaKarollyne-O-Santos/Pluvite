-- Localização exata das ocorrências do Feed.
-- O mapa de rotas (/Rotas, backend/rotas/ocorrencias.js) usa latitude/longitude para desviar só
-- do trecho afetado; sem elas, cai para a rua citada em `endereco` (a rua inteira).
-- Idempotente: pode rodar mais de uma vez no SQL Editor do Supabase.

alter table public.ocorrencias
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- Coordenadas válidas e sempre em par
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

-- O backend de rotas busca as ocorrências recentes de uma cidade
create index if not exists ocorrencias_cidade_criado_em_idx
  on public.ocorrencias (cidade, criado_em desc);

-- Realtime: o mapa de rotas recalcula o trajeto assim que uma ocorrência é publicada
-- (sem isso ele ainda percebe, pela consulta periódica, em até 20 s durante a navegação)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ocorrencias'
  ) then
    alter publication supabase_realtime add table public.ocorrencias;
  end if;
end $$;
