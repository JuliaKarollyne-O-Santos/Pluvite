---
name: backend-api
description: Conventions for the Pluvite Express 5 backend in web/app/backend (plain JavaScript ESM, port 3001) — route shape, response format, status normalisation, env/config and how the Next.js frontend calls it. Use when adding or changing API endpoints.
---

# Backend API (Express 5, JavaScript ESM)

Location: `web/app/backend/server.js`, started by `npm run dev` in `web/` (via `concurrently`) or
`npm start` inside the backend folder. `package.json` has `"type": "module"` → use `import`, not `require`.
It is **JavaScript**, not TypeScript; add JSDoc types when a shape is non-obvious.

## When to use the backend (vs. calling Supabase from the page)

Use the backend for anything that needs a **secret** (service-role key, Twilio, weather API keys),
**aggregation** for dashboards, **scheduled jobs** (weather thresholds → alerts), or **fan-out**
(SMS/e-mail/push). Plain CRUD owned by the logged user goes directly to Supabase with RLS.

## Route pattern

```js
/**
 * N. ROTA GET: descrição curta em português do que a rota faz
 */
app.get('/api/ocorrencias', async (req, res) => {
  try {
    const { municipio } = req.query;
    let consulta = supabase
      .from('ocorrencias')
      .select('id, tipo, cidade, status, criado_em')
      .order('criado_em', { ascending: false });
    if (municipio) consulta = consulta.eq('cidade', municipio);

    const { data, error } = await consulta;
    if (error) {
      console.error("Erro na consulta do Supabase (Ocorrências):", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data.map(formatarOcorrencia));
  } catch (err) {
    console.error("Erro interno no servidor (Ocorrências):", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});
```

Rules:
- Prefix every route with `/api/`; resources in Portuguese plural (`/api/alertas`, `/api/ocorrencias`).
- Sub-actions as nested paths: `PATCH /api/alertas/:id/status`.
- Always `try/catch`, always `return res...`; errors are `{ error: string }`.
- Status codes: 200 read/update, 201 create, 400 invalid body, 401/403 auth, 404 missing, 500 unexpected.
- Validate `req.body` fields before touching the DB; reject unknown status values (see `pluvite-domain`).
- Response objects are **camelCase** and already normalised (e.g. `statusatual` → `statusAtual`,
  missing name → `'Cidadão Anônimo'`). Put the mapping in a named function (`formatarAlerta`).
- Numbered doc comment above each route (`/** 3. ROTA GET: ... */`) as in the existing file.

## Config & secrets

- Read everything from `process.env` via `dotenv` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `PORT`, `TWILIO_*`, weather keys). Do not add new hardcoded keys; the existing ones are tech debt.
- `const PORT = process.env.PORT || 3001;`
- Keep one Supabase client for the whole server: `import { supabase } from './supabase.js'`
  (reads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`; the anon fallback is tech debt).

## Auth for protected routes

The frontend should send the Supabase access token: `Authorization: Bearer <token>`.
Verify with `supabase.auth.getUser(token)` in a middleware and check the user's role
(servidor/prefeitura) before status changes or alert dispatch. Until this exists, do not expose
new write routes publicly.

## State

`historicoMemoriaLocal` is in-memory and resets on restart — acceptable for demos only. New features
must persist to Supabase.

## Growing the server

When `server.js` passes ~300 lines, split into `routes/<recurso>.js` exporting an `express.Router()`
and mount with `app.use('/api/<recurso>', router)`. Keep helpers in `utils/`.

Reference layout already in use (routing): `routes/rotas.js` holds only the Express handlers
(validation + HTTP status), and the domain logic lives in `rotas/` (`grafo.js`, `modeloTempo.js`,
`roteamento.js`, `geo.js`). Follow the same split for any non-trivial feature: handlers stay thin,
pure functions and tunable constants (with sources) live in a domain folder.
Routing has its own spec: `SKILLS/rotas-tempo-viagem`.

## Frontend call

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
await fetch(`${API_URL}/api/alertas/${id}/status`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status_atual: novoStatus }),
});
```
