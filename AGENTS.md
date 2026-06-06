# Dastarkhwan Recommendations - Agent Guide

## Project Goal

Dastarkhwan Recommendations is a community food notebook: curated place recommendations from the Dastarkhwan WhatsApp group, browsable by city with maps, short editorial descriptors, and optional quotes from the original messages.

- Browse-first: visitors discover cities and places without signing in.
- Voice preserved: testimonials stay in `note` / `snippet`; factual place summaries stay in `cuisine_summary`.
- Privacy: raw WhatsApp zips/text, parsed chat, checkpoints, extraction outputs, logs, previews, and review CSVs stay local and gitignored under `data/`.
- Production: https://dastarkhwan-reccs.vercel.app

## Next.js Note

This repo uses Next.js 16 with breaking changes vs older docs. Before changing routing, caching, middleware/proxy, or app structure, read the relevant guides under `node_modules/next/dist/docs/` and heed deprecation notices.

## Core Tech

| Layer | Choice |
| --- | --- |
| App | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4 and custom CSS in `src/app/globals.css` |
| Data | Supabase Postgres, RLS, Auth magic links |
| Maps | Google Maps Places and Maps JS |
| Extraction | Local WhatsApp zip parse plus contextual mini-thread extraction |
| Local LLM | Ollama `qwen3:4b`, fallback `llama3.2:3b` |
| Deploy | Vercel |

## Local Extraction Pipeline

`pnpm extract:preview "data\WhatsApp Chat - Dastarkhwan.zip"` is the main pipeline command.

It writes only local review artifacts under `data/extraction-runs/<run-id>/`:

- `summary.json`
- `candidates.json`
- `review.csv`
- `rejected.json`
- `clusters.json`

Default preview behavior:

- No Supabase writes.
- No Vercel deploys.
- No Google Maps calls.
- Raw chat stays local.
- City context is bounded to mini-threads.
- Unknown city is `Unsorted`.
- Precision beats recall.

Relevant files:

- `src/lib/importer/whatsapp.ts`: WhatsApp zip/text parsing, date auto-detection, impossible-date rejection, chronological ordering.
- `src/lib/importer/contextual.ts`: canonical contextual extractor, mini-thread segmentation, deterministic extraction, Ollama extraction, checkpoints, review artifacts.
- `src/lib/importer/whatsapp-heuristic.ts`: deterministic helper only.
- `src/lib/importer/dedupe.ts`: deterministic dedupe helper.
- `scripts/extract-preview.ts`: local-only preview command.
- `src/lib/importer/schemas.ts`: lightweight candidate shape used by helpers.

Do not reintroduce `window-v2`, `session-v1`, rolling window classification, or direct import scripts as active extraction paths unless the user explicitly asks.

## Import Boundary

`POST /api/import` and the Supabase schema remain for eventual approved `RecommendationInput[]` payloads. The preview pipeline stops at review files. Only after human review should approved candidates be fed into import code.

Do not run these while working on local extraction preview:

```powershell
pnpm import:whatsapp
vercel
vercel --prod
```

## Google Maps

Maps/geocode/enrichment are separate from extraction. Use them only when explicitly requested after review approval.

- `src/lib/geocode.ts`: Places text search and details.
- `src/lib/enrich-location.ts`: resolves place/location on create/update.
- `src/lib/place-metadata.ts`: Google place types/reviews.
- `src/lib/google-maps-budget.ts`: request caps.
- `pnpm resolve:locations`, `pnpm enrich:places`, `pnpm audit:cuisine`: explicit post-import/admin scripts.

## App Surfaces

| Route | Behavior |
| --- | --- |
| `/` | City tiles and recent recommendations |
| `/city/[citySlug]` | City recommendation list |
| `/city/[citySlug]/map` | Clustered city map |
| `/recommendation/[id]` | Detail view; edit UI for contributors |
| `/login`, `/join`, `/add` | Contributor flows, currently hidden from public nav |

Keep browse surfaces clean: no dish/tag chips on cards unless the product direction changes.

## Secrets

Never commit API keys. Use `.env.local` and Vercel env vars only. `.env.example` should list variable names without secrets.

Never commit:

- `.env`, `.env*.local`
- `mapskey*.txt`
- raw WhatsApp exports
- extracted or parsed chat data
- extraction runs/checkpoints/logs/review CSVs

## Commands

```powershell
pnpm install
pnpm dev
pnpm extract:preview "data\WhatsApp Chat - Dastarkhwan.zip"
pnpm test
pnpm lint
pnpm build
pnpm resolve:locations
pnpm enrich:places
pnpm audit:cuisine
pnpm invite:create --label="Community invite" --max=10
```

## Agent Conventions

1. Match existing patterns; avoid new abstractions unless the current task needs them.
2. Keep extraction local and review-first.
3. Preserve provenance: sender, timestamp, source snippet, line refs, and thread id.
4. Put cuisines/topics in `tags`; put specific foods in `dishes`.
5. Reject event/admin/name-list chatter, recipes, generic food opinions, and request-only messages.
6. Use `Unsorted` when city is genuinely unclear.
7. Read `PROJECT_STATUS.md` before deploy/ops tasks.
