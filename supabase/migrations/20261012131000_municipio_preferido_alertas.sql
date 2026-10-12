alter table public.cidadao
  add column if not exists municipio_alertas text;

create index if not exists idx_cidadao_municipio_alertas
  on public.cidadao (municipio_alertas)
  where municipio_alertas is not null;
