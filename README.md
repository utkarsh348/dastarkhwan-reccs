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

Apply schema from `supabase/schema.sql`, then RLS from `supabase/migrations/002_auth_invites_rls.sql` in the Supabase SQL editor (or use Supabase MCP migrations).

Seed preview data:

```powershell
pnpm db:seed
```

```powershell
pnpm dev
```

## Import Workflow

Preview the WhatsApp zip:

```powershell
pnpm import:preview "C:\path\to\WhatsApp Chat - Dastarkhwan reccs.zip"
```

Import into the running local app (requires `SUPABASE_SERVICE_ROLE_KEY`):

```powershell
pnpm import:whatsapp "C:\path\to\WhatsApp Chat - Dastarkhwan reccs.zip"
pnpm import:snippet
```

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
