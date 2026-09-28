---
name: dev-workflow
description: Day-to-day development workflow for Pluvite — environment setup, env vars, run/lint/build commands, validation steps, commit style, updating ROADMAP.md and sprint docs. Use when starting a task, before finishing one, or when asked to commit.
---

# Development workflow

## Setup

```bash
cd web && npm install                 # web + Express deps (backend also has its own package.json)
cd web/app/backend && npm install
cd mobile/pluvite && npm install
```

Env files (all git-ignored; never commit them, never print their values):

| File | Variables |
|------|-----------|
| `web/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, weather key(s) |
| `web/app/backend/.env` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`, `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_PHONE` |
| `mobile/pluvite/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| `web/app/python/.env` | `SUPABASE_URL`, `SUPABASE_KEY`, `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_PHONE`, `TWILIO_VERIFIED_NUMBER`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_TO` |

When you introduce a new variable, add it (without value) to the table above and to the README.

## Run

| Goal | Command |
|------|---------|
| Web + API | `cd web && npm run dev` → http://localhost:3000, API http://localhost:3001 |
| Mobile | `cd mobile/pluvite && npx expo start` (Expo Go; phone and PC on the same network) |
| Road graphs | `python Rotas/gerar_grafos.py [Cidade ...]` from the repo root (OSM + SRTM; see `rotas-tempo-viagem`) |

## Deploy (produção)

Web e backend são hospedados **separadamente** — a Vercel não executa `npm run dev` nem mantém um
processo Node de longa duração, então o Express (`web/app/backend`) nunca roda "junto" com o build
da Vercel:

| Serviço | Host | Config |
|---------|------|--------|
| Web (Next.js) | Vercel, root `web/` | Env var `NEXT_PUBLIC_API_URL` = URL pública do backend |
| Backend (Express) | Render, `render.yaml` na raiz do repo (`rootDir: web/app/backend`) | Env var `PORT` já é injetada pelo Render; `ROTAS_DIR` aponta para a pasta com os grafos (ver abaixo) |

Depois de publicar o backend no Render, atualize `NEXT_PUBLIC_API_URL` no projeto da Vercel com a
URL gerada (`https://<serviço>.onrender.com`) e refaça o deploy da web.

**Em aberto** (ver `ROADMAP.md`): onde hospedar os grafos de `Rotas/*.json` (~110 MB, ainda fora do
git) para que o backend em produção tenha `ROTAS_DIR` apontando para dados reais. Sem isso,
`/api/rotas` sobe mas fica sem dados de rota.

## Validate before saying "done"

1. `cd web && npm run lint` — no new errors in touched files.
2. `cd web && npm run build` — must pass (webpack build).
3. Mobile: `npx tsc --noEmit` in `mobile/pluvite` and open the screen in Expo Go.
4. Exercise the flow manually: loading, empty, error, and success states.
5. If the change touches Supabase schema/RLS, describe the SQL in the PR/commit body and add a file
   under `supabase/migrations/` (create the folder the first time).

There are no automated tests yet. When adding pure helpers (formatters, normalisers, status mapping),
prefer placing them in `lib/` so they can be unit-tested later.

## Git

- Branch from `main`: `feat/<assunto>`, `fix/<assunto>`, `docs/<assunto>`.
- Commit messages in Portuguese, short and descriptive, optional prefix:
  `feat: conecta feed mobile ao Supabase`, `fix: corrige link da sidebar`, `Atualiza layout do perfil`.
- Do not commit: `node_modules/`, `.env*`, `cache/` (OSMnx cache), `.next/`, large generated files
  without agreeing with the team (road graphs are several MB each).
- Only commit/push when asked.

## Roadmap & sprints

- `ROADMAP.md` is the checklist of remaining features. When a task finishes an item, change `[ ]` to
  `[x]` in the same change, and add new items discovered along the way under the right phase.
- Sprint deliverables go in `Sprints/Sprint-N/` (PDF + `Resultado.md` with the review video link).

## Asking vs. deciding

Decide yourself on naming, styling and file placement (follow the skills). Ask the team before:
changing DB schema, deleting files/routes, renaming route folders (URLs change), adding paid APIs,
or changing auth/roles behaviour.
