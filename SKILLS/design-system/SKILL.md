---
name: design-system
description: Pluvite visual language — brand colors, status/priority colors, typography, spacing, Tailwind component recipes for web and StyleSheet tokens for mobile. Use before writing or changing any UI.
---

# Pluvite design system

Clean, institutional, "public safety" look: white cards on a light slate background, deep navy brand,
rounded corners everywhere, color used mainly to signal risk/status. All copy in pt-BR.

## Color tokens

| Token | Hex | Use |
|-------|-----|-----|
| `navy-900` | `#091c4b` | Navbar (`navbar2`), sidebar background |
| `navy-800` (primary) | `#091f75` | Most-used brand color: headings accents, dropdown lists, hero cards, focus |
| `navy-btn` | `#0d1b54` → hover `#0d163b` | Primary submit buttons (login/cadastro) |
| `blue-700` | `#0f35a0` → hover `#091f75` | Secondary brand buttons, links (`text-[#0f35a0]`) |
| `focus` | `#0f2a8f` | Input focus border + `ring-[#0f2a8f]/10` |
| `blue-accent` | `#1447c4` / `#2a68e2` | Mobile accents, weather gradients |
| Mobile tab bar | `#19316e` | Bottom tab background |
| Neutrals | Tailwind `slate-*` | Text `slate-800/700/500`, borders `slate-200`, page bg `slate-50` |

Status (occurrence) — keep these exact pairs:

| Status | Web badge classes | Icon |
|--------|-------------------|------|
| Aguardando | `bg-red-50 text-red-700 border-red-200` | `AlertTriangle` |
| Visualizado | `bg-emerald-50 text-emerald-700 border-emerald-200` | `Eye` |
| Em Andamento | `bg-amber-50 text-amber-800 border-amber-200` | `Wrench` |
| Concluído | `bg-slate-100 text-slate-600 border-slate-200` | `CheckCircle` |

Alert priority: Zona Segura `#0a9667`, Atenção Crítica `#f59e0b`, Estado de Alerta `#ef4444`,
Alerta Máximo `#653dc2`. UV/risk scales use green → yellow → orange → red → purple.

Brand opacity tints are written as `bg-[#091f75]/[0.08]`, `bg-[#0f35a0]/10`, `bg-white/15` (on navy).

## Typography

- Font: Geist (set in `layout.tsx`); mobile uses system font.
- Page title: `text-2xl sm:text-3xl font-black text-slate-900 tracking-tight`.
- Card title: `font-bold text-slate-800`; subtitle `text-xs text-slate-500`.
- Micro labels: `text-[10px]/text-[11px] font-bold uppercase tracking-wider text-slate-500`.
- Body: `text-sm text-slate-700`. Use `font-bold` / `font-black` generously for numbers (KPIs).

## Shape, spacing, elevation

- Radius: inputs/buttons `rounded-xl` (Feed inputs `rounded-2xl`), cards `rounded-2xl`, hero `rounded-3xl`,
  avatars `rounded-full`, logo `rounded-xl`.
- Card: `bg-white rounded-2xl border border-slate-200 shadow-sm p-5` (p-4 compact, p-6 roomy).
- Inner tile: `bg-slate-50 p-3 rounded-xl border border-slate-100`.
- Page container: `max-w-6xl mx-auto px-4 sm:px-6`; content is pushed below the fixed navbar
  (`layout.tsx` wraps navbar in `mb-15`).
- Z-index scale: navbar/sidebar `z-[10000]`, modals `z-[10001]`–`z-[10003]`, page loader `z-[99999]`.
  Leaflet panes are high, so overlays on the map need these values.

## Component recipes (web / Tailwind)

```tsx
// Primary button
<button className="w-full bg-[#0d1b54] hover:bg-[#0d163b] text-white text-sm font-bold py-2.5 rounded-xl
  shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
  {carregando ? <Loader2 size={16} className="animate-spin" /> : "Salvar"}
</button>

// Secondary / ghost button
<button className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs
  px-4 py-2 rounded-xl transition-all shadow-sm">Cancelar</button>

// Destructive
<button className="text-xs font-bold text-red-500 hover:text-white bg-red-50 hover:bg-red-500
  border border-red-100 hover:border-red-500 rounded-xl py-2.5 transition-all">Excluir</button>

// Input (reuse as a constant, like CAMPO_CLASSE in Feed)
const CAMPO_CLASSE = "w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-sm " +
  "text-slate-800 outline-none transition focus:border-[#0f2a8f] focus:ring-2 focus:ring-[#0f2a8f]/10";

// Status badge
<span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold
  ${STATUS_ESTILO[status].badge}`}><Icon size={12} />{status}</span>

// Modal
<div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[10001] flex items-center justify-center p-4">
  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">…</div>
</div>

// Empty state
<div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center text-center gap-3">
```

Error inline message: `bg-red-50 border border-red-200 text-red-600 text-sm font-medium px-4 py-2.5 rounded-xl`.

Dropdowns: do **not** use native `<select>` in new UI; reuse the `MenuSuspenso` pattern from
`web/app/Feed/page.tsx` (navy list `bg-[#091f75] border-[#3d5cc9]`, keyboard support, ARIA combobox).
If you need it in a second page, extract it to `web/app/components/MenuSuspenso.tsx` first.

## Icons

- Web: `lucide-react`; mobile: `lucide-react-native` — same icon names on both platforms.
- Sizes: 12–14 in badges, 16–18 in buttons/nav, 20–24 in section headers.
- Icon tile: `w-10 h-10 rounded-xl bg-[#091f75]/[0.08] text-[#091f75] flex items-center justify-center`.
- Brand SVGs (Google/Facebook) are inline `<svg>`; images come from `/public` via `<img>`
  (the project does not use `next/image`; keep `draggable="false"` on logos).

## Loading & feedback

- Page-level: `app/loading.tsx` (three bouncing `bg-blue-600` dots). Map/async sections: dark
  `bg-slate-900` placeholder with `animate-pulse` text.
- In-button: `Loader2` + `animate-spin`, and `disabled={carregando}` on every input of the form.
- User feedback currently uses `alert()`; prefer an inline message or toast for new flows, in Portuguese.

## Mobile (StyleSheet) tokens

Mirror the web palette with literal hex values in `StyleSheet.create`:
page bg `#f1f5f9`, card `#ffffff` + border `#e2e8f0`, text `#0f172a` / `#334155` / `#64748b` / `#94a3b8`,
primary `#0f35a0` / `#0d1b54`, accent `#1447c4`, radius 12–16, padding 16. Status configs use
`{ label, bg, border, text, icon }` objects (see `mobile/pluvite/src/pages/feed/page.tsx`).

## Accessibility

- Icon-only buttons need `aria-label` (web) / `accessibilityLabel` (mobile).
- Keep contrast: never grey text lighter than `slate-500` on white for content.
- The profile stores PCD info — new UI must stay usable with keyboard and at 200% zoom.
