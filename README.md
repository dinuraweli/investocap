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

See [API.md](API.md) for the HTTP API.

## Deploying (Vercel)
The repo is linked to Vercel: every push to `main` deploys to production. `vercel.json` pins functions to Mumbai (`bom1`, next to the Supabase database) and schedules the end-of-day job (`/api/cron/eod`, Mon-Fri 10:00 UTC = 15:30 Sri Lanka time).

Set these in Vercel (Project Settings → Environment Variables): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (mark it Sensitive), `CRON_SECRET`. In Supabase, set Authentication → URL Configuration → Site URL to the production address.
