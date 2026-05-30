# Supabase Auth redirect URLs

Configure in [Supabase Dashboard](https://supabase.com/dashboard/project/cohywpgcqfwlxyhyjqhc/auth/url-configuration) → **Authentication** → **URL configuration**.

| Setting | Value |
|---------|--------|
| **Site URL** | `https://dastarkhwan-reccs.vercel.app` |
| **Redirect URLs** | `http://localhost:3000/auth/callback` |
| | `https://dastarkhwan-reccs.vercel.app/auth/callback` |

Magic links from [`src/components/AuthForm.tsx`](../src/components/AuthForm.tsx) use `${origin}/auth/callback?next=...`, which must match one of the redirect URLs above.
