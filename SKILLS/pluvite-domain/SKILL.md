---
name: pluvite-domain
description: Canonical Pluvite domain data — the 39 Vale do Paraíba / Litoral Norte municipalities, occurrence types, occurrence status flow, alert priorities, user roles and emergency numbers. Use whenever code lists cities, filters by status/type, colors a risk level, or validates these values.
---

# Pluvite domain reference

These lists are **duplicated and divergent** in the codebase today (e.g. `Servidor/page.tsx` contains
"Potunduva", which is not in the region, and misses Canas, Lavrinhas and Queluz). The values below are
the source of truth. The first time a task needs one of them on web, create
`web/app/lib/constantes.ts` with these exports and import it; on mobile use `src/lib/constantes.ts`.

## Municipalities (39) — `MUNICIPIOS`

```ts
export const MUNICIPIOS = [
  "Aparecida", "Arapeí", "Areias", "Bananal", "Caçapava", "Cachoeira Paulista",
  "Campos do Jordão", "Canas", "Caraguatatuba", "Cruzeiro", "Cunha", "Guaratinguetá",
  "Igaratá", "Ilhabela", "Jacareí", "Jambeiro", "Lagoinha", "Lavrinhas", "Lorena",
  "Monteiro Lobato", "Natividade da Serra", "Paraibuna", "Pindamonhangaba", "Piquete",
  "Potim", "Queluz", "Redenção da Serra", "Roseira", "Santa Branca",
  "Santo Antônio do Pinhal", "São Bento do Sapucaí", "São José do Barreiro",
  "São José dos Campos", "São Luiz do Paraitinga", "São Sebastião", "Silveiras",
  "Taubaté", "Tremembé", "Ubatuba",
] as const;
export type Municipio = (typeof MUNICIPIOS)[number];
```

Litoral Norte subset: Caraguatatuba, Ilhabela, São Sebastião, Ubatuba (coastal flooding/landslide risk).
Default city when none is chosen: **Taubaté**.

Road graphs in `Rotas/` exist for all 39 cities, named with an ASCII snake_case slug
(`sao_jose_dos_campos_graph.json`, `igarata_graph.json`). The backend matches city names
accent/case-insensitively. Generation and the travel-time model: `rotas-tempo-viagem`.

Search must be accent/case-insensitive — reuse:
```ts
export const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
```

## Occurrence types — `TIPOS_OCORRENCIA` (`web/app/lib/constantes.ts`)

`"Acidente" | "Alagamento" | "Árvore caída" | "Buraco na via" | "Deslizamento de terra" | "Via interditada" | "Outros"`

Each type's effect on routes (block vs. restriction, radius, validity) lives only in the backend:
`web/app/backend/rotas/ocorrencias.js › EFEITO_OCORRENCIA`. Adding a type = add it to both lists.

`CENTRO_MUNICIPIO` (same file) holds the urban center of each municipality, used to open maps on the city.

## Occurrence status — `STATUS_OCORRENCIA`

Flow: `Aguardando` → `Visualizado` → `Em Andamento` → `Concluído`.

- Stored as these exact strings (`ocorrencias.status`, `alertas_tempo_real.statusatual`).
- Normalise legacy input: `visualizado`→Visualizado, `em andamento`/`em_andamento`→Em Andamento,
  `concluído`/`concluido`/`resolvido`→Concluído, anything else→Aguardando.
- Only public servants change status. `Concluído` items leave the public feed (README requirement).
- Badge colors/icons: see `design-system`.

## Alert priority — `PRIORIDADES`

| Priority | Color | Meaning |
|----------|-------|---------|
| Zona Segura | `#0a9667` | No action needed |
| Atenção Crítica | `#f59e0b` | Monitor; possible risk |
| Estado de Alerta | `#ef4444` | Risk likely; prepare / avoid area |
| Alerta Máximo | `#653dc2` | Imminent danger; evacuate / follow Defesa Civil |

Prototype scripts use a color scale (amarelo/laranja/vermelho); map it to the table above
(amarelo→Atenção Crítica, laranja→Estado de Alerta, vermelho→Alerta Máximo).

## Roles

- `cidadao` — citizen: profile, feed, publish occurrences, receive alerts.
- `servidor` — public servant of a `prefeitura` (municipality): dashboard, status changes, dispatch alerts,
  scoped to their municipality. Not enforced yet — see ROADMAP.

## Emergency numbers (Brazil)

Defesa Civil **199**, Bombeiros **193**, SAMU **192**, Polícia Militar **190**.

## Relative time

Use one helper (`tempoRelativo` in Feed): "Agora mesmo", "há N minutos/horas/dias" with singular forms.
Dates with `toLocaleDateString("pt-BR", ...)`, timezone America/Sao_Paulo.
