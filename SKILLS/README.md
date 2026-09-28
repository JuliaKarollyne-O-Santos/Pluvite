# Pluvite SKILLS

Standards extracted from the existing codebase so that new code (written by people or by Claude)
follows the same architecture and look. Each folder holds one `SKILL.md` with YAML frontmatter
(`name`, `description`), so the folders can also be copied/linked into `.claude/skills/` to be
auto-discovered by Claude Code.

| Skill | Scope |
|-------|-------|
| [design-system](design-system/SKILL.md) | Colors, typography, spacing, components (web Tailwind + mobile StyleSheet) |
| [web-page-patterns](web-page-patterns/SKILL.md) | Next.js App Router pages/components structure and naming |
| [supabase-data](supabase-data/SKILL.md) | Supabase queries, storage uploads, auth, realtime, error handling |
| [backend-api](backend-api/SKILL.md) | Express 5 routes in `web/app/backend` |
| [mobile-screens](mobile-screens/SKILL.md) | Expo 54 / React Native screens and navigation |
| [pluvite-domain](pluvite-domain/SKILL.md) | Municipalities, occurrence types, statuses, priorities (canonical lists) |
| [rotas-tempo-viagem](rotas-tempo-viagem/SKILL.md) | **Core requirement:** road graphs, realistic travel-time model, routing API |
| [dev-workflow](dev-workflow/SKILL.md) | Run, validate, commit, update ROADMAP |

Rule of thumb: **when a skill and an existing file disagree, the skill describes the target standard**;
when touching legacy code, move it toward the skill only as far as the task requires.
