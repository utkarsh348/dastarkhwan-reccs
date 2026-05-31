# Local data (not committed)

Keep sensitive WhatsApp exports and import outputs here. Everything under this folder except `.gitkeep` and this README is gitignored.

| File / folder | Purpose |
|---------------|---------|
| `WhatsApp Chat - Dastarkhwan.zip` | Full group export (`_chat.txt` inside) |
| `snippets/` | Optional `.txt` excerpts for `pnpm import:snippet` |
| `import-preview.json` | Output of `pnpm import:preview` |
| `import-sessions.json` | Session debug from the LLM pipeline |
| `import-report.json` | Enrichment gap report from `pnpm import:report` |
| `*.sql` | Local seed dumps (deprecated; use import preview + Supabase) |

Cleaned recommendation rows live in Supabase only—not in this repo.
