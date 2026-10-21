---
name: rotas-tempo-viagem
description: Pluvite routing and travel-time model (a core project requirement) — road-graph data pipeline (OSM + SRTM elevation), the realistic time model (speed limits, curves, grades, traffic signals, stop signs, intersections, roundabouts, speed bumps, turns, peak hours), edge-based A*, route preferences, Feed occurrences as blocked/restricted edges, real-time GPS navigation (progress, off-route, arrival, re-routing) and the route analysis output. Use whenever touching web/app/backend/rotas/*, routes/rotas.js, Rotas/gerar_grafos.py, web/app/lib/rotas/*, web/app/lib/localizacao.ts or the /Rotas page.
---

# Routing & travel-time model

**Requirement:** a route ETA must never be `length ÷ speed limit`. Every change to routing must keep
the time model below, with each parameter documented with its source. Estimated values are marked
"estimativa" in code and must be replaced by measured data when available — never silently.

## Data pipeline

`Rotas/gerar_grafos.py` (run from the repo root; `python Rotas/gerar_grafos.py [Cidade ...]`):

1. OSMnx `graph_from_place({"city", "state": "São Paulo", "country": "Brazil"}, network_type="drive")`
   — structured query, validated against the Vale bounding box (`LIMITES_VALE`); a free-text query
   once geocoded "Cunha" to another state region.
2. Extra OSM tags kept: nodes `traffic_calming`, `crossing`, `stop`, `direction`,
   `traffic_signals:direction` (+ default `highway`, `railway`, `junction`); ways `surface`,
   `smoothness`, `tracktype`, `toll` (+ default `maxspeed`, `lanes`, `junction`, `bridge`, `tunnel`).
3. Elevation: SRTM 1″ (~30 m) from the public AWS "skadi" tiles, cached in `cache/srtm/`
   (bilinear, voids ignored). Nodes get `elevacao`; edges get `subida`/`descida` (m), sampled every
   25 m with 3 m hysteresis. Bridges/tunnels use endpoints only (SRTM measures the valley).
4. Output: compact node-link JSON `Rotas/<slug>_graph.json` (ASCII slug, no accents).

Overpass can time out: set `OVERPASS_URL` (e.g. `https://overpass.kumi.systems/api`). The OSMnx HTTP
cache lives in the root `cache/` (git-ignored). Always validate a regenerated city (node count,
centroid inside the Vale, plausible elevation range) before replacing it.

## Backend modules (`web/app/backend/rotas/`)

| File | Responsibility |
|------|----------------|
| `modeloTempo.js` | `PARAMETROS` (single source of every constant + source), speed/limit/grade/curve functions, `custoTransicao` (node delays + turns), peak detection |
| `grafo.js` | Load/cache graphs, precompute per-edge free-flow time, signal clustering, road hierarchy per node, urban detection, `arestasPorRua`, spatial index (`arestasProximas`) |
| `roteamento.js` | Point resolution (heading-aware in navigation), edge-based A*, preferences + occurrence penalties, instructions, route analysis |
| `ocorrencias.js` | Feed → routing: read active `ocorrencias`, locate them on the graph, `EFEITO_OCORRENCIA`, penalties |
| `geo.js` | Distance, point-to-segment distance, bearing, curvature radius |
| `../routes/rotas.js` | Express handlers only |

## Time model (what each route second is made of)

`duração = Σ deslocamento das vias + Σ custos nos nós + partida/chegada`

**Per edge (free-flow, precomputed):**
- Limit: OSM `maxspeed` → else CTB art. 61 by class and urban/rural (urban = ≥30 intersections in a
  ~1.5 km window — estimativa).
- Operating speed = limit × 0.8 (OSRM), capped by `surface` / `smoothness` / `tracktype` (OSRM tables;
  `sett`/paralelepípedo 40, dirt 40, earth 20…). `impassable` edges are dropped.
- Speed profile over the geometry: each vertex limited by curve speed `√(g·R·(e+f))` (AASHTO),
  forward/backward passes with acceleration 1.5 m/s² (ITE) and deceleration 3.4 m/s² (AASHTO).
- Grade factor from `subida`/`descida` (no effect below 4% up / 6% down — HCM; slope coefficients
  estimativa; edges < 60 m ignored because of SRTM noise).
- Peak hours (Mon–Fri 7–10h, 17–20h — CET-SP windows): time × 1.05 highway / 1.10 arterial / 1.05 local,
  **calibrated** against TomTom historic times (Wednesday 18:00, 53 comparable trips in 6 cities,
  Oct 2026). The São Paulo-capital values used before (1.25/1.45/1.1) put the peak 21% above
  TomTom; in the Vale TomTom measures only +5% from 14:00 to 18:00.
- Calibration status (Oct 2026, `scripts/calibrar-tempos.js`, 111 comparable trips): overall median
  ratio 1.00, mean error 13.7%, 75% within ±20% (off-peak 0.99 / 79%; peak 1.01 / 71%). City
  spread remains (Jacareí 0.84, Pindamonhangaba 1.15) — not tuned per city with ~20 trips each.

**Per node transition (depends on incoming and outgoing edge):**
- Traffic signal: Webster/HCM uniform delay, cycle 90 s, green share by approach (main 0.55 /
  secondary 0.40 / pedestrian 0.70), saturation 0.7 off-peak / 0.9 peak. Signals within 40 m are one
  intersection; `direction` tags respected; intersection nodes next to a signal are "signalized".
- PARE (`highway=stop`): full stop kinematics + 2 s + gap wait (CTB art. 208).
- Unsignalized intersection: coming from the lower-hierarchy road → yield (slow to 10 km/h + 2–4 s);
  all roads equal → right-hand priority slowdown (CTB art. 29); left turn on the main road → 2 s.
- Roundabout entry (slow to 25 km/h + 2.5 s), mini-roundabout, railway crossing (full stop — CTB art.
  212), speed bumps (20/30 km/h — CONTRAN Res. 600/2016), pedestrian crossing (1 s).
- Turns at intersections: OSRM sigmoid (7.5 s max, right-hand bias 1.075); U-turn 20 s.
- Start: `v/(2a)`; arrival: `v/(2d)`.

## Search

- A* over **edges** (state = arriving edge) so turn and approach costs are exact.
- Heuristic: straight distance ÷ fastest edge speed (admissible, consistent). Keep it admissible
  when adding costs: every new cost must be ≥ 0.
- Preferences (`criterio: rapida|curta`, `evitarTerra`, `evitarRodovias`, `evitarPedagio`,
  `evitarLadeiras`) multiply the **search weight only**. The reported ETA is always the model time
  (plus measured live-traffic delay, the only measured input — see "Live traffic").
- Connectivity fallback: OSMnx keeps the largest *weakly* connected component, so ~0.3–0.7% of
  nodes sit in one-way dead ends. If A* finds no path, both points are re-snapped to the largest
  *strongly* connected component (`resolverPonto(..., { apenasComponentePrincipal: true })`) and the
  search is retried; routes that already worked are unchanged.
- Alternatives (`buscarAlternativas`, opt-in): penalty method (Akgün et al., 2000) — edges of every
  path found get ×`ALTERNATIVAS.fatorPenalidade` and the search is repeated; a candidate is kept only
  with ≤ 70% length shared with accepted routes, ETA ≤ 130% of the main one, no edge penalised by
  an occurrence that the main route avoids, and locally optimal (T-test, Abraham et al. 2013: windows
  of up to 25% of its time are at most 30 s slower than the fastest path between their ends — this
  removes block-circling zigzags). Thresholds are estimativa. Each alternative's ETA is the model time.

## API contract

`POST /api/rotas/:cidade/calcular` — body `{ origem, destino, partida?, preferencias?, alternativas? }`,
points are `{ rua }` or `{ lat, lng, rumo? }` (`rumo` = vehicle heading while navigating: start at the
node ahead and charge the initial turn). Response `{ distanciaMetros, duracaoSegundos, coordenadas,
instrucoes[{ tipo, texto, rua, distancia, tempo, velocidadeMedia, inicio }], arestas[{ id, inicio }],
ocorrencias{ consideradas, evitadas[], naRota[], indisponiveis }, analise, avisos[] }`. `inicio` = index in
`coordenadas` where the instruction/edge starts. `evitadas` comes from a second A* without penalties
(only when some edge is penalised); `naRota` = unavoidable. Occurrence summaries carry `status` and
`criadoEm` (the UI tells "relato de cidadão" from occurrences already seen by the prefeitura).
`avisos` = a `{ lat, lng }` point snapped > 150 m away from the requested coordinate. With
`alternativas: true` (planning only — GPS re-routes skip it) the response also has `alternativas[]`,
up to 2 routes in the same shape. If Supabase fails the route is still returned with
`indisponiveis: true`. `transito` (every route and alternative) is `null` without `TOMTOM_API_KEY`,
`{ disponivel: false, ... }` when the key exists but no data came (failure, daily quota), else
`{ disponivel: true, fonte: 'TomTom', atualizadoEm, atrasoSegundos, naRota[], evitados[] }` with
incidents `{ id, tipo, descricao, efeito, atrasoSegundos, extensao, de, ate, inicio, fim, trecho }`.

`GET /api/rotas/:cidade/ocorrencias` — active occurrences already located on the graph:
`{ id, tipo, endereco, bairro, status, criadoEm, efeito, localizacao, rua, posicao, raio, arestas, trechos }`.

`analise` = `contexto`, `velocidadeMedia`, `composicaoTempo`, `contagens`, `pontosLentos`,
`trechosLentos`, `trechosRapidos`, `relevo`, `limitesVelocidade`, `viasSemAsfalto`.
The analysis is **logic/data only** — do not draw signals, bumps or elevation on the map unless the
team asks for it. Occurrences *are* drawn (red/amber dashed edges + "!" marker) because they explain
detours.

## Feed occurrences (`rotas/ocorrencias.js`)

- Source: `ocorrencias` of the city, status ≠ Concluído, younger than the type's `validadeHoras`.
- Location: `latitude/longitude` → edges within `raio` (`area` = every road, `via` = only the street
  of the address, or the nearest one); no coordinates → the street named in `endereco` (whole street;
  abbreviations like "Av." expanded, text without the road type accepted), always as a **restriction**
  (`FATOR_RUA_SEM_PONTO` = 4, estimativa), never a block — without the point there is no way to know
  which stretch is blocked; nothing → ignored. The `efeito` returned is the one applied to routing.
- `EFEITO_OCORRENCIA` per type: `bloqueio` (+1 h / +50 km on the search weight — finite, so a route
  still exists when origin/destination are inside the area) or `restricao` (weight × `fator`).
  Values are **estimativa**; calibrate them like any other constant.
- `raio` is measured from the point **projected onto the road axis** (`pontoMaisProximo`), so the
  affected stretch is `raio` m each way whatever the GPS offset of whoever published it.
- `trechos` (the geometry drawn in red on the map) is the edge geometry **clipped** to that circle
  (`recortarPorRaio`), not the whole edge: an OSMnx edge runs intersection to intersection and
  reaches 5.6 km in Taubaté, which used to paint a whole street for a single blockage. The **search**
  still penalises the whole edge — it is atomic, with no node in between to turn off at, so any route
  using it does pass the occurrence. Only the `localizacao: 'rua'` fallback still covers a whole street
  (as a restriction).
- Penalties never change the ETA (no measured delay per occurrence).
- Works before the lat/lng migration (`42703` → falls back to the address).

## Live traffic (`rotas/transito.js`, TomTom Traffic Incidents v5)

- Optional: only with `TOMTOM_API_KEY` (in `web/app/backend/.env`, loaded by the module itself).
  One request per city bbox, cached 10 min, at most 80/day (free plan: 2,500/month); after a
  failure it waits 60 s and keeps the last result (the UI shows `atualizadoEm`). The URL carries the
  key: never log it or the raw fetch error.
- Matching: the incident LineString (`[lng, lat]`, in the direction of the affected traffic) is
  sampled every 15 m; each sample takes the nearest edge within 20 m whose local bearing is within
  ±45° (separates the two carriageways and drops crossing streets). `Point` incidents take the
  nearest road within 30 m, both directions. All of these are estimativa.
- Effects: `lentidao` (measured `delay`) is split among the covered edges by covered length and is
  **measured data**, so — unlike preferences and Feed occurrences — it changes the ETA:
  `tempoNaVia = max(model time with peak, tempoLivre + delay share)` (never peak + jam twice);
  `composicaoTempo.transito` holds the extra seconds. `bloqueio` (road closed, or accident/flooding
  with magnitude 4) uses the Feed block penalty; `restricao` (lane closed, road works, accident
  without delay) multiplies the weight by `fatorRestricao[magnitude]`. Weather-only warnings are
  ignored. Only `probabilityOfOccurrence: improbable` is dropped.

## Calibration and field tests

- `web/app/backend/scripts/calibrar-tempos.js` compares model ETAs with TomTom Routing historic
  times (`traffic=false`, `departAt` next Wednesday 14:00/18:00, pairs whose length differs > 25% are
  discarded) or with field logs (`--registros`). It reports ratio (predicted ÷ reference) per period,
  length and city and suggests a starting point for `fatorFluxoLivre` and the peak multiplier; it
  never edits `PARAMETROS`. After a change, re-run it and the reference scenarios above.
- `/Rotas?registrar` records each navigation (`lib/rotas/registroTrajeto.ts`: predicted time, edge
  ids, one GPS reading per second, re-routes) and offers the JSON at arrival. `?simular` logs are
  flagged `simulado` and ignored by the script. Field logs are personal data: keep them out of git.
- `npm run dev:celular` (web) proxies `/api/rotas` through Next and allows tunnel/LAN origins so a
  phone can test over HTTPS — see `GUIA-TESTE-CAMPO-ROTAS.md`.
- `web/app/backend/scripts/ocorrencias-demonstracao.js criar|remover` keeps 8 labelled demo
  occurrences (exact points, status Aguardando) by the fictitious citizen "Demonstração Pluvite".

## Real-time navigation (web, `web/app/lib/`)

| Module | Responsibility |
|--------|----------------|
| `localizacao.ts` | `obterPosicaoAtual()` (one shot) and `useLocalizacao` (`watchPosition`, heading from movement, `?simular` driver) |
| `rotas/api.ts` | Types + fetch helpers for `/api/rotas` |
| `rotas/navegacao.ts` | Pure: `prepararRota`, `calcularProgresso` (snap to polyline, heading-aware), off-route, arrival, remaining edges, `NAVEGACAO` thresholds |
| `rotas/useOcorrencias.ts` | Active occurrences of the city: Supabase Realtime on `ocorrencias` + polling (20 s navigating / 60 s) |
| `rotas/useNavegacao.ts` | State machine planejamento → navegacao → chegada; re-route on off-route (2 readings > 35 m + GPS error, ≥ 8 s apart) and on a new occurrence hitting the remaining edges; in planning keeps every route option (`opcoes`, `selecionarRota`) and re-checks occurrences on all of them; with `registrar` keeps the field-test log (`baixarRegistro`) |
| `rotas/registroTrajeto.ts` | Field-test log format (`pluvite-registro-trajeto` v1) and JSON download |
| `components/MapaRotasComponent.tsx` | Rendering only: travelled (grey) / remaining (blue) polyline, unselected route options (grey, click selects — `bubblingMouseEvents: false` so it does not mark a point), heading arrow, follow camera (drag stops, "Recentralizar" resumes), occurrence layer, live-traffic layer above the route (red = slow, dark red dashed = closed, amber dashed = restricted; "© TomTom" in the tooltip) |

Re-routes from GPS send `{ lat, lng, rumo }` and prepend the GPS point to the polyline so progress
starts on the route. After every new route the progress is recomputed on it (never reuse indices of
the old route). Callbacks from GPS/Realtime run through `useEffectEvent` (React Compiler lint).

## Changing the model

1. Change constants only in `PARAMETROS` / the tables in `modeloTempo.js`, with a source comment.
2. Re-run the reference scenarios (Taubaté Charles Schneider → Independência off-peak/peak, SJC
   north→south, Campos do Jordão, Dutra through Taubaté) and compare average speeds: urban 20–40
   km/h, highway 70–95 km/h. Report before/after in the PR. Occurrence scenario: Taubaté "Avenida de
   Ibéria" → "Rua Alagoinhas" passes the Av. Navrik Feres Aguiar; an Alagamento there must divert it.
3. Update the table in this skill and the requirement block in `CLAUDE.md` if behaviour changes.
