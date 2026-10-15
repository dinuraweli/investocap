# InvestoCap

Track the Colombo Stock Exchange (CSE): delayed live prices, charts, watchlists and a personal portfolio with P&L. Responsive web app.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Auth + Postgres with row-level security)

**Live:** https://investocap.vercel.app

> Prices come from the unofficial cse.lk API and may be delayed. For information only, not investment advice.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

### Environment (`.env.local`, never committed)
| Variable | What |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key. Used with each user's session, so row-level security applies |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret**, server only. Used for the shared market-data cache |
| `CRON_SECRET` | Protects `POST /api/cron/eod` |

### Database
Schema lives in Supabase (user tables with RLS: `watchlists`, `watchlist_items`, `transactions`; server-only cache tables: `instruments`, `daily_prices`, `index_daily`, `kv`). In the Supabase dashboard, turn **Confirm email** off for local development (the built-in email sender is heavily rate-limited), and enable leaked-password protection.

### Commands
| | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Portfolio maths unit tests |
| `npm run verify:cse` | Live contract check against cse.lk (fails loudly if the API shape changes) |

Schedule `POST /api/cron/eod` with `Authorization: Bearer $CRON_SECRET` after 14:30 Sri Lanka time to record daily closes (CSE only serves one year of history).

### Importing a portfolio from ATrad
On the Portfolio page choose **Import from ATrad** (or **Sync from ATrad** once you have holdings) and pick the `.xlsx` you download from ATrad (Portfolio, Excel). The file is parsed in the browser; only symbol, quantity and total cost are sent. Costs come from ATrad's Total Cost (which already includes buying charges), and the export has no trade dates, so holdings start on the date you choose. After that, prices update automatically; sync again (or use New Trade) only after you buy or sell. Sales found by a re-sync are priced at today's price as an estimate, because the export has no sale prices.

### Report analyser
**Reports** in the nav lists every annual report, quarterly statement and press release a company has filed with the CSE (fetched from the CSE, PDFs from `cdn.cse.lk`). **Analyse** has Google Gemini read one and returns a plain-English summary, key numbers with PDF page references, highlights, things to check and the auditor's opinion. Margins, growth and ratios are calculated by the app, not the AI.

- **Bring your own key.** Users paste their own Gemini API key (free tier available at https://aistudio.google.com/apikey). It is stored only in their browser, sent in a request header, used once and never stored or logged on the server. No server-side Gemini key is needed.
- **Model fallback.** From the models the user's own key can use, the app ranks the newest stable "flash" models first (then flash-lite, then pro) and uses the best as the primary with up to 3 backups. If a model hits its usage limit, is overloaded, is unavailable or returns an unreadable answer, the next one is tried automatically; a rejected key or blocked content stops immediately. The page shows which model was used and why a backup was needed.
- **Live progress.** `POST /api/reports/analyse` streams progress events (checking key, downloading, uploading, analysing with model X, saving), which drive the progress bar.
- Analyses are saved privately per user (row-level security) so reopening costs nothing. Reports over about 10 MB are sent through Gemini's Files API and deleted afterwards.
- The AI is told never to give investment advice, ratings or price targets, and every analysis carries an "AI-generated, verify against the PDF" notice.
- Tests run against a fake Gemini server (`tests/gemini.test.ts`), so no key is needed to run `npm test`.

See [API.md](API.md) for the HTTP API.

## Deploying (Vercel)
The repo is linked to Vercel: every push to `main` deploys to production. `vercel.json` pins functions to Mumbai (`bom1`, next to the Supabase database) and schedules the end-of-day job (`/api/cron/eod`, Mon-Fri 10:00 UTC = 15:30 Sri Lanka time).

Set these in Vercel (Project Settings → Environment Variables): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (mark it Sensitive), `CRON_SECRET`. In Supabase, set Authentication → URL Configuration → Site URL to the production address.
