# Claude / Cursor instructions

Read **`AGENTS.md`** first — it is the canonical guide for this repository (goal, architecture, tech stack, disabled features, cleanup backlog, and agent rules).

Quick context:

- **What:** City-wise food recommendations from the Dastarkhwan WhatsApp group, deployed at https://dastarkhwan-reccs.vercel.app
- **Public UI today:** Read-only browse (home → cities → list/map → detail). Header is logo-only.
- **Hidden but implemented:** Sign in, add rec, search, contributor invites
- **Data:** Supabase + Google Places; import/enrich scripts run locally or via authenticated API
- **Status & ops:** [`PROJECT_STATUS.md`](PROJECT_STATUS.md)

When editing code:

1. Follow `AGENTS.md` conventions (no secrets in repo, testimonial vs `cuisine_summary` separation, minimal scope).
2. For Next.js 16 changes, use `node_modules/next/dist/docs/` — do not assume older App Router behavior.
3. Do not re-enable disabled nav/search/auth UI unless the user explicitly asks.

@AGENTS.md
