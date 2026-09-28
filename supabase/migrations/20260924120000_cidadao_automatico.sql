-- CRIA A LINHA EM "cidadao" NO MOMENTO DO CADASTRO (trigger handle_new_user).
-- Cole inteiro no SQL Editor do Supabase e rode uma vez. É idempotente: pode repetir sem risco.
--
-- Problema que isto resolve: web/app/(auth)/cadastro-cidadao/page.tsx diz que "o trigger
-- handle_new_user() no banco já cria a linha em cidadao automaticamente", mas o trigger nunca
-- existiu neste projeto. Só o perfil (upsert com onConflict auth_id) criava a linha — quem
-- entrava com Google/Facebook, ou nunca salvou o perfil, ficava sem cadastro de cidadão.
-- O Feed, que procura o cidadão pelo auth_id para poder publicar, curtir e comentar,
-- não achava nada ("Não foi possível carregar o cidadão logado").

-- ───── 1. auth_id ÚNICO ─────
-- Necessário para o "on conflict (auth_id)" do trigger e para o upsert do perfil.
do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'cidadao' and indexdef like '%UNIQUE%(auth_id)%'
  ) then
    create unique index cidadao_auth_id_key on public.cidadao (auth_id);
  end if;
end $$;

-- ───── 2. TRIGGER DE CADASTRO ─────
-- Roda como dona da tabela (security definer) porque o insert acontece dentro do fluxo do
-- Auth, antes de existir sessão. `search_path = ''` evita sequestro por schema malicioso.
-- Nada aqui pode derrubar o cadastro: qualquer falha vira warning e o usuário é criado
-- mesmo assim (o perfil ainda consegue criar a linha depois, pelo upsert).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Contas de prefeitura/Defesa Civil vêm de POST /api/criar-servidor com tipo = 'servidor'
  -- no metadata; elas moram em public.servidor e não viram cidadão.
  if coalesce(new.raw_user_meta_data ->> 'tipo', '') = 'servidor' then
    return new;
  end if;

  insert into public.cidadao (auth_id, nome_completo, email, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nome_completo', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuário'
    ),
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict do nothing;

  return new;
exception
  when others then
    raise warning 'handle_new_user falhou para %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───── 3. CONTAS ANTIGAS ─────
-- 3a. Linhas de cidadão que ficaram sem auth_id (cadastro antigo, por e-mail) são
-- religadas ao usuário do Auth em vez de virarem uma segunda linha da mesma pessoa.
update public.cidadao c
   set auth_id = u.id
  from auth.users u
 where c.auth_id is null
   and lower(c.email) = lower(u.email)
   and not exists (select 1 from public.cidadao outra where outra.auth_id = u.id);

-- 3b. Quem continua sem linha nenhuma ganha uma agora, com os mesmos dados que o trigger usaria.
insert into public.cidadao (auth_id, nome_completo, email, avatar_url)
select u.id,
       coalesce(
         nullif(u.raw_user_meta_data ->> 'nome_completo', ''),
         nullif(u.raw_user_meta_data ->> 'full_name', ''),
         nullif(u.raw_user_meta_data ->> 'name', ''),
         nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
         'Usuário'
       ),
       coalesce(u.email, ''),
       nullif(u.raw_user_meta_data ->> 'avatar_url', '')
  from auth.users u
 where coalesce(u.raw_user_meta_data ->> 'tipo', '') <> 'servidor'
   and not exists (select 1 from public.cidadao c where c.auth_id = u.id)
   and not exists (select 1 from public.servidor s where s.auth_id = u.id)
   and not exists (select 1 from public.admin a where a.auth_id = u.id)
on conflict do nothing;
