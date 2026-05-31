# Dastarkhwan Project Status

## Live site

- **Production:** https://dastarkhwan-reccs.vercel.app
- **Browse:** public read-only — city tiles, masonry recommendation cards, city list + map views.
- **Data:** Supabase project `dastarkhwan-reccs` (ap-south-1), ~26 recommendations across Srinagar, Kolkata, Ahmedabad.

## Intentionally disabled in the public UI (code still exists)

These were hidden from the header and pages so the experience stays read-only while flows are refined. Routes and APIs remain for local/admin use.

| Feature | Was in UI | Still in codebase | Re-enable when |
|--------|-----------|-------------------|----------------|
| **Sign in / Account** | Nav link → `/login` | Auth, magic link, `/auth/callback`, Supabase SSR | Contributor sign-in is designed and tested; add link back to `AppNav` |
| **Add recc** | Nav button → `/add` | `/add`, `POST /api/recommendations`, middleware guard | Invite + auth flow is ready; restore nav + polish form |
| **Search** | Home + city search box (`?q=`) | `listRecommendations({ q })`, API query param | Restore `SearchBox` on home/city pages when search UX is defined |
| **Cities nav tab** | Nav link → `/` | N/A (redundant with brand logo) | Only if you add other nav items; brand already links home |

## Backend / scripts (not exposed on live UI)

- **WhatsApp import (session LLM pipeline):** requires Ollama running locally (`IMPORT_USE_OLLAMA=true`).
  - `pnpm import:scan "<zip>"` — parse + count recc-request candidates (no LLM)
  - `pnpm import:preview "<zip>"` — Ollama extract → `data/import-preview.json` + `data/import-sessions.json` (**no Maps by default**; opt in with `--geocode`)
  - `pnpm import:report "<zip>"` — gap report → `data/import-report.json` (prefer `--from-preview`; `--geocode` for locked rows missing place_id; `--no-geocode` for flags without Maps)
  - `pnpm import:whatsapp "<zip>"` — POST to `/api/import`; geocodes at persist via `enrichWithLocation`
- **Sensitive data:** `data/**/*.zip`, `data/**/*.txt`, `data/**/*.sql`, import JSON outputs are gitignored. Seed SQL + snippets removed from GitHub history.
- **Invite codes:** `pnpm invite:create`, `/join`, `/api/invites/redeem` (contributor gate for writes).
- **Location resolve:** `pnpm resolve:locations`, `POST /api/locations/resolve`.
- **Place enrich:** `pnpm enrich:places`, `pnpm audit:cuisine` (Google types + review-derived `cuisine_summary` with testimonial gating).
- **Data fixes:** `pnpm fix:uno-parimal` (one-off split example).

## Done (recent)

- Session-anchored LLM import pipeline (detect city recc threads → per-session Ollama extract); privacy: seed SQL/snippets purged from git history.
- Map geocoding hardened; bulk backfill (Ahmedabad 21/22 mapped — **Lolo Roso** still `needs_lookup`).
- Masonry cards: compact vs story; emotional quotes only on story cards; `cuisine_summary` line (no dish chips on browse).
- Multi-place WhatsApp split (e.g. UNO Pizza vs Parimal Garden) + `scopeNoteToRestaurant` for quotes.
- Cuisine summary audit: blocks review language in “Known for” lines (`pnpm audit:cuisine`).
- Brand: peacock feather quill PNG; hero copy “From Dastarkhwan: tried and tasted”.
- Secrets hygiene: removed local `mapskey.txt.txt` from workspace; keys only via `.env.local` / Vercel (see below).

## Needs further development

1. **Re-enable contributor UI** — Sign in, Add recc, invite onboarding copy; confirm Supabase Auth redirect URLs ([`docs/SUPABASE_AUTH_SETUP.md`](docs/SUPABASE_AUTH_SETUP.md)).
2. **Search** — UI removed; define scope (restaurant vs city vs note) before restoring.
3. **Full chat import run** — Start Ollama (`qwen3:4b`), then `pnpm import:preview` + `pnpm import:report --from-preview` on `data/WhatsApp Chat - Dastarkhwan.zip` (~3760 messages, ~21 request candidates). Set `GOOGLE_MAPS_MAX_REQUESTS` (default 500/run) to stay within monthly quota (~10k). Review `import-report.json` before any `import:whatsapp` or DB merge. Existing ~26 Supabase rows stay until you sign off.
4. **Cuisine lines** — Some rows have no `cuisine_summary` after audit (generic Google reviews); optional manual dish tags or editorial pass.
5. **Map** — Resolve **Lolo Roso**; verify Parimal Garden / food-truck park pins.
6. **Ops** — Rotate `IMPORT_TOKEN` on Vercel if still default; add `SUPABASE_SERVICE_ROLE_KEY` to Preview env if using preview deployments.
7. **Assets** — Optional transparent favicon; refine logo crop for circular mark.

### Enrichment gaps (`import:report` flags)

After preview, each row may flag: `missingNote`, `missingPlaceId`, `missingCuisineSummary`, `weakDishesTags`, `noDisplayQuote`, `multiVenueLeakage`. Post-sign-off fixes: tune geocode with LLM `area`/`address`, then `pnpm resolve:locations`, `pnpm enrich:places`, `pnpm audit:cuisine`. No bare-name fallback synthesis until extraction is trusted.

## Secrets & keys (audit before push)

- **No API keys belong in the repo.** Use `.env.local` (gitignored) and Vercel env vars only.
- **`.env.example`** lists variable names with empty values — safe to commit.
- **Never commit:** `.env`, `.env*.local`, `mapskey*.txt`, or paste keys into SQL/seed/chat logs.
- If a Google Maps key was ever stored in a local `mapskey.txt.txt`, **rotate it** in Google Cloud Console and update Vercel + `.env.local`.

Required env vars (see `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (scripts, import, invites, resolve)
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_SERVER_KEY`
- `INVITE_CODE_SALT`, `IMPORT_TOKEN`

## Commands

```powershell
pnpm dev
pnpm test
pnpm lint
pnpm build
pnpm import:scan "data/WhatsApp Chat - Dastarkhwan.zip"
pnpm import:preview "data/WhatsApp Chat - Dastarkhwan.zip"
pnpm import:report "data/WhatsApp Chat - Dastarkhwan.zip"
pnpm db:seed
pnpm resolve:locations
pnpm enrich:places
pnpm audit:cuisine
pnpm invite:create --label="Community invite" --max=10
pnpm fix:uno-parimal
vercel --prod
```
