# Dastarkhwan Recommendations

A city-wise food recommendations notebook built with Next.js, Supabase, local WhatsApp extraction, and Google Maps clustering.

Raw WhatsApp exports stay local. The app and Supabase store only cleaned recommendation records.

## Local Setup

```powershell
pnpm install
pnpm setup:env
```

Add Supabase values to `.env.local` (see `.env.example`). The project uses:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public reads)
- `SUPABASE_SERVICE_ROLE_KEY` (imports, invite admin, location resolve)
- `INVITE_CODE_SALT`

Apply schema from `supabase/schema.sql`, then RLS from `supabase/migrations/002_auth_invites_rls.sql` in the Supabase SQL editor (or use Supabase MCP migrations). Do not seed or import extraction output until the review artifacts have been approved.

```powershell
pnpm dev
```

## Extraction Workflow

Preview the WhatsApp zip locally:

```powershell
pnpm extract:preview "data\WhatsApp Chat - Dastarkhwan.zip"
```

This writes review artifacts only under `data/extraction-runs/<run-id>/`:

- `summary.json`
- `candidates.json`
- `review.csv`
- `rejected.json`
- `clusters.json`

The preview command does not write to Supabase, Google Maps, or Vercel. Review and approve candidates before feeding them into any import flow.

Resolve pending geocodes:

```powershell
pnpm resolve:locations
```

Create an invite code (admin):

```powershell
pnpm invite:create --label="Friends batch" --max=20
```

## Access model

- Anyone can browse cities, lists, maps, and detail pages.
- Sign in via magic link at `/login`.
- Redeem an invite at `/join` to unlock `/add` and edits.

## App Routes

- `/` city index and global search
- `/city/[citySlug]` city recommendation list
- `/city/[citySlug]/map` clustered Google Maps view
- `/add` quick add form (sign-in + invite required)
- `/recommendation/[id]` detail view (edit for contributors)
- `/login`, `/join`

## Verification

```powershell
pnpm test
pnpm lint
pnpm build
```
