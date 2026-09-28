---
name: supabase-data
description: Pluvite Supabase conventions — client import, known tables/columns, query and error-handling pattern, storage uploads, auth user to cidadao mapping, realtime channels and row mapping. Use for any database, auth, storage or realtime code (web, mobile or backend).
---

# Supabase data access

## Client

| Where | Import |
|-------|--------|
| Web (browser) | `import { supabase } from "@/app/lib/banco";` |
| Mobile | `import { supabase } from "../lib/supabase";` (`src/pages/lib/supabase.ts`) |
| Backend | `import { supabase } from './supabase.js'` (`web/app/backend/supabase.js`, env + anon fallback) |
| Python | `create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))` |

Never create another client in a page. Target state: URL/key from env
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_*`); the anon key is
public by design, so **security depends on Row Level Security** — every new table needs RLS policies.
The service-role key may only live in the backend `.env`.

## Tables in use

- `cidadao` — profile keyed by `auth_id` (= `auth.users.id`). Write with
  `upsert({...}, { onConflict: "auth_id" })`, always including `auth_id`, `email`, `nome_completo`.
  Contains sensitive health data (LGPD): never select `*` for public views; only the owner reads it.
- `ocorrencias` — `autor_id, tipo, cidade, bairro, endereco, descricao, imagem_url, status, criado_em`,
  `latitude, longitude` (nullable, always in pair; migration
  `supabase/migrations/20260923120000_ocorrencias_localizacao.sql`, which also adds the table to the
  `supabase_realtime` publication). The routing backend reads it; `/Rotas` listens to it in realtime.
  Insert lat/lng only when the user marked the point; on `PGRST204` (column missing) retry without them.
- `curtidas` — `ocorrencia_id`, `usuario_id`; `comentarios` — child rows by `ocorrencia_id`.
- `alertas_tempo_real` — `tipo, prioridade, municipio, endereco, descricao, statusatual, criado_em`,
  FK `fk_cidadao` → `cidadao`.
- Storage buckets: `ocorrencias` (photos), `avatars`.

Confirm columns in the Supabase dashboard before using a table not listed here, and document new
tables/columns in the root `CLAUDE.md` table.

## Query pattern

```ts
const { data, error } = await supabase
  .from("ocorrencias")
  .select("id, tipo, cidade, status, criado_em")   // explicit columns
  .eq("cidade", cidade)
  .order("criado_em", { ascending: false });

if (error) {
  console.error("Erro ao carregar ocorrências:", {
    message: error.message, details: error.details, hint: error.hint, code: error.code,
  });
  setErro("Não foi possível carregar as ocorrências.");   // Portuguese, user-facing
  return;
}
```

- Use `.maybeSingle()` when a row may not exist (profile), `.single()` only when it must.
- Joins use the FK name: `cidadao!fk_cidadao ( nome_completo, bairro )`.
- Load related data in parallel with `Promise.all` instead of sequential awaits when independent.
- Normalise DB rows (snake_case) into the page's camelCase interface in one mapping function
  (see `carregarFeed` in `Feed/page.tsx`); UI code never reads raw snake_case fields.
- Normalise free-text statuses once (`"em_andamento"`, `"concluido"` → canonical values from
  `pluvite-domain`).

## Auth

```ts
const { data: { user } } = await supabase.auth.getUser();   // prefer getUser over getSession
if (!user) { router.push("/login"); return; }
```

- Display name fallback chain: `cidadao.nome_completo` → `user_metadata.nome_completo` →
  `full_name` → `name`. Avatar: `cidadao.avatar_url` → `user_metadata.avatar_url` → `/PluviteIcon.jpg`.
- OAuth: `signInWithOAuth({ provider, options: { redirectTo: \`${window.location.origin}/Mapa\` } })`.
- Password reset redirects to `/redefinir-senha`.
- Subscribe with `supabase.auth.onAuthStateChange` and unsubscribe in the effect cleanup.
- Sign-up (mobile/web) = `auth.signUp` then insert/upsert the `cidadao` row.

## Storage upload

```ts
const caminho = `${usuarioId}/${Date.now()}-${arquivo.name}`;       // folder per user
const { error: erroUpload } = await supabase.storage.from("ocorrencias").upload(caminho, arquivo);
if (erroUpload) { /* log + feedback, stop */ }
const { data: urlPublica } = supabase.storage.from("ocorrencias").getPublicUrl(caminho);
```

Validate type (`image/*`) and size (≤ 5 MB) before uploading. On mobile, read the file with
`expo-file-system` and upload the decoded `ArrayBuffer` (`base64-arraybuffer` is installed).

## Realtime

```ts
useEffect(() => {
  const canal = supabase
    .channel("ocorrencias-feed")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "ocorrencias" },
        (payload) => { /* map payload.new and prepend */ })
    .subscribe();
  return () => { supabase.removeChannel(canal); };
}, []);
```

A table only emits events if it is in the `supabase_realtime` publication — add it in the migration and
keep a polling fallback for anything safety-related (see `lib/rotas/useOcorrencias.ts`). Callbacks that
touch component state go through `useEffectEvent`. Filter city names client-side with `normalizar`
(DELETE payloads only carry the id).

Filter by the logged user / municipality from the session — never hardcode ids
(`Mapa/page.tsx` still has `idCidadaoLogado = 1`, which is a known bug). Prefer realtime over
`setInterval` polling for new features.

## Optimistic updates

Likes/comments update local state first, then call Supabase (`handleCurtir` in `Feed/page.tsx`).
Keep that approach for cheap, reversible actions only, and in new code **revert the local change when
`error` is set** (the current `handleCurtir` only logs it — a known gap).
