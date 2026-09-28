# CLAUDE.md

Guidance for Claude Code (and humans) working in the **Pluvite** repository.

## Project

Pluvite is a final-year academic project (TCC / Projeto Integrador) for **natural-disaster prevention
and public-situation monitoring** in the **Vale do Paraíba and Litoral Norte (SP, Brazil) — 39 municipalities**.

- **Citizens** check weather, receive risk alerts, report urban occurrences (flooding, landslides,
  fallen trees, potholes, blocked roads) with photo + location, and find safe routes / emergency contacts.
- **Public servants** (Defesa Civil / Prefeitura) monitor occurrences on a dashboard, change their
  status and dispatch alerts.

All UI copy, variable names, DB columns and commit messages are in **Brazilian Portuguese**.
Keep that convention; only documentation for tooling (this file, `SKILLS/`) is in English.

## Repository layout

```
Pluvite/
├── web/                     Next.js 16 app (App Router) — citizen site + public-servant panel
│   ├── app/
│   │   ├── (auth)/          login, cadastro-cidadao, redefinir-senha (no navbar)
│   │   ├── Mapa/            Leaflet map of the Vale + realtime alert popup
│   │   ├── Clima2/          Weather page (WeatherAPI)
│   │   ├── Feed/            Community occurrence feed (Supabase CRUD, likes, comments)
│   │   ├── perfil/          Citizen profile (medical data, emergency contact, notification prefs)
│   │   ├── Servidor/        Public-servant dashboard (Recharts; talks to Express backend)
│   │   ├── Rotas/           Waze-like routing + real-time GPS navigation avoiding Feed occurrences (/api/rotas)
│   │   ├── components/      navbar (landing), navbar2 (citizen), sidebar (servidor), Mapa*Component, SeletorLocalMapa
│   │   ├── lib/banco.ts     Supabase browser client (single instance — always import this)
│   │   ├── lib/rotas/       Routing client: api.ts, navegacao.ts (pure), useNavegacao.ts, useOcorrencias.ts
│   │   ├── lib/             Also constantes.ts (domain lists), geo.ts, localizacao.ts (GPS hook), api.ts
│   │   ├── backend/         Express 5 API (plain JS, ESM) on :3001
│   │   └── python/          Prototypes: SMS + WhatsApp (Twilio), desktop popup, rain test, SSE chat alert
│   └── public/              Images, map.json / bairros.json (GeoJSON)
├── mobile/pluvite/          Expo 54 / React Native 0.81 app (React Navigation 7)
│   └── src/{pages,navigation,assets}
├── Rotas/                   Road graphs per municipality (*.json, OSM + SRTM elevation) + gerar_grafos.py
├── supabase/migrations/     SQL migrations (apply in the Supabase SQL Editor; idempotent)
├── Sprints/                 Sprint review PDFs and results
├── SKILLS/                  Coding standards for generated code (read before coding!)
└── ROADMAP.md               Feature checklist — update when finishing an item
```

Note: the web `app/` folder mixes routes and non-route code (`backend/`, `python/`, `lib/`,
`components/`). Folders without `page.tsx` are not routes; do not add `page.tsx` inside them.

## ⚠️ Core requirement: realistic route travel time

Safe routing is a central deliverable of the TCC. **A route ETA is never `length ÷ speed limit`.**
The model in `web/app/backend/rotas/modeloTempo.js` (spec: `SKILLS/rotas-tempo-viagem`) must always
account for:

- **Speed limits** — OSM `maxspeed`, else CTB art. 61 by road class and urban/rural area; drivers run
  at 80% of the limit (OSRM); pavement (`surface`/`smoothness`) caps speed.
- **Geometry** — curve speed `√(g·R·(e+f))` (AASHTO) with acceleration/braking profile.
- **Elevation** — SRTM 1″ grades per edge; climbs/descents above 4%/6% slow the vehicle.
- **Signals & intersections** — Webster/HCM signal delay, PARE, yield by road hierarchy, right-hand
  priority, roundabouts, railway crossings, speed bumps (CONTRAN), pedestrian crossings.
- **Turns** — angle-based turn cost and U-turns (OSRM), via edge-based A*.
- **Peak hours** — CET-SP windows (weekdays 7–10h, 17–20h).
- **Preferences** — change the chosen path only, never the reported ETA.
- **Feed occurrences** — active `ocorrencias` become blocked/restricted edges (`rotas/ocorrencias.js`);
  like preferences they change the path only. Navigation re-routes when one hits the remaining path.

Every constant lives in `PARAMETROS` with its source; unmeasured values are labelled "estimativa".
These factors are **calculation logic only** — the map shows just the route and endpoints. Any
routing change must re-run the reference scenarios in the skill and keep urban averages at
20–40 km/h and highways at 70–95 km/h.

## Tech stack

| Layer    | Tech |
|----------|------|
| Web      | Next.js 16.2 (App Router, **webpack** build), React 19, TypeScript 5.9 (strict), Tailwind CSS 4 |
| UI libs  | lucide-react (icons), react-leaflet 4 + Leaflet (maps), Recharts 3 (charts), framer-motion |
| Backend  | Node + Express 5 (JavaScript ESM), `@supabase/supabase-js` |
| Mobile   | Expo SDK 54, React Native 0.81, React Navigation 7 (native-stack + bottom-tabs), lucide-react-native |
| Data     | Supabase: Postgres, Auth (email + Google/Facebook OAuth), Storage, Realtime |
| Weather  | WeatherAPI (web Clima), OpenWeather (web Mapa), Open-Meteo (mobile) — see ROADMAP to unify |
| Scripts  | Python 3 (osmnx, networkx, twilio, supabase-py, pyautogui) |

**Framework versions differ from training data.** Before writing Next.js code read
`web/node_modules/next/dist/docs/` (see `web/AGENTS.md`); before writing Expo code check
https://docs.expo.dev/versions/v54.0.0/ (see `mobile/pluvite/AGENTS.md`).

## Commands

```bash
# Web + backend together (Next on :3000, Express on :3001)
cd web && npm install && npm run dev

npm run build        # next build --webpack (turbopack is NOT used for production)
npm run lint         # eslint (next core-web-vitals + typescript)

# Backend alone
cd web/app/backend && npm install && npm start

# Mobile
cd mobile/pluvite && npm install && npx expo start   # scan QR with Expo Go

# Regenerate road graphs with OSM tags + SRTM elevation (Python, needs osmnx; run from repo root)
python Rotas/gerar_grafos.py                 # all 39 cities
python Rotas/gerar_grafos.py Taubaté         # one city (OVERPASS_URL=... to use a mirror)
```

There is no test suite yet. Validate changes with `npm run lint` and `npm run build` in `web/`,
and by running the affected screen.

## Supabase data model (current, inferred from code)

| Table / bucket          | Key columns | Used by |
|-------------------------|-------------|---------|
| `cidadao`               | `auth_id` (= auth.users.id, upsert conflict key), `email`, `nome_completo`, `avatar_url`, `telefone`, `data_nascimento`, `cidade`, `bairro`, `cep`, `pcd`, `tipo_deficiencia`, `tipo_sanguineo`, `alergias`, `condicoes_medicas`, `medicamentos_uso`, `contato_emergencia_*`, `notif_*` | perfil, navbar2, Feed, mobile |
| `ocorrencias`           | `id`, `autor_id`, `tipo`, `cidade`, `bairro`, `endereco`, `descricao`, `imagem_url`, `status`, `criado_em`, `latitude`, `longitude` (nullable — migration `20260923120000`) | Feed, Rotas (backend + Realtime) |
| `curtidas`              | `ocorrencia_id`, `usuario_id` | Feed |
| `comentarios`           | `ocorrencia_id`, author, text | Feed |
| `alertas_tempo_real`    | `id`, `tipo`, `prioridade`, `municipio`, `endereco`, `descricao`, `statusatual`, `criado_em`, FK `fk_cidadao` → `cidadao` | backend, Mapa realtime, Python scripts |
| Storage `ocorrencias`   | path `${userId}/${Date.now()}-${fileName}` | Feed photo upload |
| Storage `avatars`       | profile pictures | perfil |

`web/app/backend/BD-antigo.sql` is an **obsolete** schema — do not use it as reference.
Always check the real columns in Supabase before writing queries against a table not listed here.

## Domain vocabulary (single source of truth — see `SKILLS/pluvite-domain`)

- **Occurrence status**: `Aguardando` → `Visualizado` → `Em Andamento` → `Concluído`.
- **Occurrence types** (`TIPOS_OCORRENCIA` in `lib/constantes.ts`): Acidente, Alagamento, Árvore caída,
  Buraco na via, Deslizamento de terra, Via interditada, Outros.
- **Alert priority**: `Zona Segura` (#0a9667), `Atenção Crítica` (#f59e0b), `Estado de Alerta` (#ef4444), `Alerta Máximo` (#653dc2).
- **Users**: `cidadao` (citizen) and `servidor` / `prefeitura` (public servant). Role separation is not enforced yet.

## Architecture rules

1. **Supabase client**: web code imports `supabase` from `@/app/lib/banco`; mobile from
   `src/pages/lib/supabase`. Never call `createClient` in a page.
2. **Pages are client components** (`"use client"`) that own their state and data loading
   (`useEffect` + `async` loader). Keep that pattern until a shared data layer exists; do not mix in
   Server Actions ad hoc.
3. **Leaflet only through `next/dynamic` with `ssr: false`** (see `Mapa/page.tsx`).
4. **Navigation shell** is chosen in `components/NavbarWrapper.tsx` by pathname. When adding a route,
   register it there (auth routes → no navbar; `/Servidor*` → sidebar inside the page; else `navbar2`).
5. **Route folder casing is legacy and inconsistent** (`Mapa`, `Clima2`, `Feed`, `Servidor` vs
   `perfil`). URLs are case-sensitive: link exactly to the folder name. New routes use lowercase-kebab.
6. **Backend** routes live in `server.js` under `/api/*`, return JSON, and normalise data to the
   camelCase shape the frontend expects (e.g. `statusatual` → `statusAtual`).
7. **Shared constants** (municipalities, types, statuses, colors) are currently duplicated per page.
   New code must import them from `web/app/lib/` (create the module the first time you need it — see
   `SKILLS/pluvite-domain`) instead of adding another copy.
8. **Secrets**: never add new keys to source. Use `NEXT_PUBLIC_*` in `web/.env.local`, `.env` for the
   backend/Python, and `EXPO_PUBLIC_*` for mobile. `.env*` is git-ignored. (Existing hardcoded keys are
   tracked as tech debt in ROADMAP.)

## Code conventions (summary — details in SKILLS)

- Identifiers in Portuguese camelCase: `carregando`, `setCarregando`, `carregarFeed`, `buscarDadosBanco`.
- Event handlers: `handleXxx` (`handlePublicar`, `handleCurtir`). Loaders: `carregarXxx` / `buscarXxx`.
- Module constants in `UPPER_SNAKE_CASE` (`TIPOS_OCORRENCIA`, `STATUS_ESTILO`, `CAMPO_CLASSE`).
- Literal unions derived from `as const` arrays: `type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number]`.
- Section comments in UPPERCASE Portuguese: `{/* CABEÇALHO */}`, `// CARREGAMENTO DOS DADOS`.
- Supabase calls destructure `{ data, error }`, check `error`, `console.error` with context, then
  give the user feedback in Portuguese.
- Avoid new `any`; type Supabase rows with an `interface` next to the page.
- Tailwind only on web (no CSS modules); `StyleSheet.create` at the bottom of the file on mobile.

## Design language (summary — details in `SKILLS/design-system`)

- Brand navy `#091c4b` (navbars/sidebar), primary action `#0d1b54` / `#0f35a0`, focus `#0f2a8f`.
- Neutral palette is Tailwind `slate`; backgrounds `bg-slate-50` / white cards.
- Rounded everything: inputs/buttons `rounded-xl`–`rounded-2xl`, cards `rounded-2xl`.
- Icons: lucide only, size 14–18 in UI chrome.
- Loading: `Loader2` with `animate-spin` inside buttons; three bouncing dots page loader.

## Skills index

Read the matching skill **before** generating code:

| Skill | When |
|-------|------|
| `SKILLS/design-system/SKILL.md`        | Any UI (web or mobile): colors, spacing, components |
| `SKILLS/web-page-patterns/SKILL.md`    | New/edited Next.js page or component |
| `SKILLS/supabase-data/SKILL.md`        | Queries, inserts, storage uploads, auth, realtime |
| `SKILLS/backend-api/SKILL.md`          | Express routes in `web/app/backend` |
| `SKILLS/mobile-screens/SKILL.md`       | Expo / React Native screens |
| `SKILLS/pluvite-domain/SKILL.md`       | Municipalities, statuses, occurrence types, priorities |
| `SKILLS/rotas-tempo-viagem/SKILL.md`   | Routing, road graphs, travel-time model (core requirement) |
| `SKILLS/dev-workflow/SKILL.md`         | Running, validating, committing, updating the roadmap |

## Known pitfalls

- The backend has one Supabase client, `web/app/backend/supabase.js` (env vars, anon-key fallback).
- `web/app/backend/` lives inside `app/`, so `next build` picks up `backend/node_modules/router/lib/route.js`
  as a route handler. Harmless today; moving the backend out of `app/` fixes it (see ROADMAP).
- Until the `latitude/longitude` migration is applied, the Feed publishes without the exact point and the
  routing backend falls back to the street named in `endereco` (whole street).
- Browser geolocation (Rotas navigation, Feed "usar minha localização") only works on HTTPS or localhost.
  `/Rotas?simular=15` drives the navigation along the route at 15 m/s for demos.
- The Servidor dashboard reads `alertas_tempo_real`, while citizens write to `ocorrencias` — they are
  not connected yet (see ROADMAP).
- `Servidor/page.tsx` polls the backend every 5 s with hardcoded `http://localhost:3001`.
- `Mapa/page.tsx` realtime listener uses a hardcoded citizen id (`1`).
- `components/sidebar.tsx` has placeholder prefeitura data and links with wrong casing.
- `/Rotas` needs the backend running and the untracked root `Rotas/*.json` graphs (override the
  folder with `ROTAS_DIR`). Graphs are loaded lazily and cached (max 4 cities) in `rotas/grafo.js`.
- `Rotas/routs.py` is the legacy generator (no tags/elevation) — use `gerar_grafos.py`.
- Geocoding by free text can hit homonyms (e.g. "Cunha"); the generator validates the Vale bbox.
- `reactStrictMode` is `false` in `next.config.ts` — effects run once in dev.
- `web/package.json` contains unused deps (`expo`, `mysql2`, `bcrypt`, `@expo/vector-icons`).
- `cache/` (root) holds the OSMnx HTTP cache and SRTM tiles (`cache/srtm/`) — never commit it.

## Working agreement

- Make the smallest change that solves the task; match the surrounding file's style.
- When a task completes a ROADMAP item, tick its checkbox in `ROADMAP.md` in the same change.
- Do not commit or push unless asked. Commit messages in Portuguese, imperative/descriptive
  (`Conecta feed mobile ao Supabase`), optional `fix:`/`feat:` prefix.
