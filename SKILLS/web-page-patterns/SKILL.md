---
name: web-page-patterns
description: How Pluvite Next.js 16 App Router pages and components are structured — file layout, "use client", state naming, loaders/handlers, navigation shell, Leaflet dynamic import. Use when creating or editing anything under web/app.
---

# Web page patterns (Next.js 16, App Router)

> Next 16 has breaking changes vs. training data. Check `web/node_modules/next/dist/docs/` before
> using routing/data APIs you are unsure about. Production build uses `--webpack`.

## Where things go

| Kind | Location |
|------|----------|
| Route | `web/app/<rota>/page.tsx` (new routes: lowercase-kebab, e.g. `app/rotas/page.tsx`) |
| Auth routes (no navbar) | `web/app/(auth)/<rota>/page.tsx` + add path to `semNavbar` in `NavbarWrapper.tsx` |
| Public-servant routes | `web/app/Servidor/...` — render `<Navbar3>` (sidebar) inside the page |
| Shared component | `web/app/components/PascalCase.tsx` (legacy files are lowercase: `navbar.tsx`) |
| Shared logic / constants / types | `web/app/lib/*.ts` (e.g. `banco.ts`, `constantes.ts`, `geo.ts`, `localizacao.ts`) |
| Feature logic too big for the page | `web/app/lib/<recurso>/` — API client, pure logic, hooks (see `lib/rotas/`) |
| Static data (GeoJSON, images) | `web/public/` — fetch with `fetch("/map.json")` |

Import with the `@/` alias (`@/app/lib/banco`, `@/app/components/...`); avoid `../` chains.

## Page skeleton

```tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { supabase } from "@/app/lib/banco";

// Tipos da página (linha do Supabase já normalizada)
interface Abrigo {
  id: string;
  nome: string;
  cidade: string;
}

// Constantes do módulo em UPPER_SNAKE_CASE
const LIMITE_POR_PAGINA = 20;

export default function AbrigosPage() {
  const [abrigos, setAbrigos] = useState<Abrigo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // CARREGAMENTO DOS DADOS
  const carregarAbrigos = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("abrigos")
      .select("id, nome, cidade")
      .limit(LIMITE_POR_PAGINA);

    if (error) {
      console.error("Erro ao carregar abrigos:", error);
      setErro("Não foi possível carregar os abrigos.");
    } else {
      setAbrigos(data ?? []);
    }
    setCarregando(false);
  };

  useEffect(() => {
    carregarAbrigos();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 pt-6 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* CABEÇALHO */}
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Abrigos</h1>
        {/* LISTA */}
        …
      </div>
    </main>
  );
}
```

## Conventions

- **Every interactive page starts with `"use client"`.** Current pages fetch on the client with
  Supabase; keep it that way unless the task is explicitly a server-side refactor.
- **Naming (Portuguese)**: state `[carregando, setCarregando]`, `[erro, setErro]`, `[aberto, setAberto]`;
  booleans read as adjectives/participles (`painelAberto`, `sidebarExpandida`, `publicando`).
- **Functions**: `handleXxx` for UI events, `carregarXxx`/`buscarXxx` for data loading,
  `sincronizarXxx` for writes that re-fetch afterwards, pure helpers as `const verbo = (...) => ...`
  (`normalizar`, `tempoRelativo`, `formatarHora`).
- **Derived data** via `useMemo` (filters, charts); never store derived values in state.
- **Lookup maps** typed with `Record<Union, {...}>` (`STATUS_ESTILO`, `CORES_PRIORIDADE`).
- **Sub-components** used by one page live in the same file above the default export
  (`MenuSuspenso`, `CampoModal`, `AnelProgresso`). Move to `components/` when a second page needs it.
- **Comments** in Portuguese; section markers in uppercase (`{/* FILTROS */}`), explain *why*.
- **Effects that subscribe** (auth listener, realtime channel, `setInterval`, document listeners) must
  return a cleanup.
- **Lint (React Compiler rules)**: no synchronous `setState` in an effect body. Set state in the
  subscription callback, wrap callbacks that need fresh props/state in `useEffectEvent`
  (`lib/localizacao.ts`, `lib/rotas/useOcorrencias.ts`), and read browser-only values with
  `useSyncExternalStore` (URL params, `localStorage`) instead of `useEffect` + `setState`.
- **Types**: prefer `interface` for objects, literal unions from `as const` arrays; do not add new `any`
  (legacy `any` in Clima2/Servidor may stay until those files are refactored).

## Navigation shell

`app/layout.tsx` renders `NavbarWrapper`, which decides by pathname:
`["/login","/cadastro-cidadao","/redefinir-senha"]` → nothing; `"/"` → landing `Navbar`;
`/Servidor*` → nothing (page renders the sidebar); anything else → `Navbar2` (citizen).
When adding a citizen page, also add it to `navItems` in `components/navbar2.tsx`.
`layout.tsx` has a "NÃO TIRAR NADA DAQUI" note — only add global, fixed elements there.

## Maps (Leaflet)

Leaflet touches `window`, so always load map components with:

```tsx
const MapaSemSSR = dynamic(() => import("@/app/components/MapaValeComponent"), {
  ssr: false,
  loading: () => <div className="h-screen w-full bg-slate-900 …">A carregar mapa…</div>,
});
```

Pass data and setters as props (`bairrosDados`, `setLocalAberto`); keep weather cache in the parent
(`climaPorCidade`) to avoid refetching per click.

## Calling the Express backend

Today `Servidor/page.tsx` uses `fetch("http://localhost:3001/api/...")`. New code must read the base URL
from `process.env.NEXT_PUBLIC_API_URL` (fallback `http://localhost:3001`) through a small helper in
`web/app/lib/api.ts`, and send `Content-Type: application/json` on writes.

## External APIs

Never put API keys in components. Read `process.env.NEXT_PUBLIC_*` or, better, proxy through the
backend so the key stays server-side. Encode user input in URLs with `encodeURIComponent`.

## Checklist before finishing a page

- [ ] Loading, empty and error states rendered (in Portuguese).
- [ ] Works at 375px width (mobile browser) — use `sm:`/`md:` breakpoints.
- [ ] Route registered in `NavbarWrapper` / `navbar2` if needed; links match folder casing.
- [ ] `npm run lint` and `npm run build` pass in `web/`.
