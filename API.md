# InvestoCap API

All routes are JSON. Mutating routes require `Content-Type: application/json` (this doubles as CSRF protection).
Errors look like `{ "error": "message" }` (400 bad input, 401 sign-in needed, 404, 409 conflict, 429 throttled, 502 upstream).
Market data is cached server-side (quotes/indices ~15s) and served stale (`"stale": true`) if cse.lk is down.
Prices are delayed and for information only.

## Public
| Route | Purpose |
|---|---|
| `GET /api/market` | status, ASPI, S&P SL20, turnover/trades, breadth, gainers/losers/most active, sector indices |
| `GET /api/stocks?q=&sort=turnover\|change\|price\|marketCap\|volume&dir=asc\|desc&limit=` | all quotes / search |
| `GET /api/stocks/:symbol` | quote + detail (52w range, beta, ...). `JKH` or `JKH.N0000` |
| `GET /api/stocks/:symbol/history?range=1D\|1W\|1M\|3M\|1Y\|ALL` | price points `{t, price, high, low, volume}` |

## Auth (Supabase Auth, httpOnly cookie session)
`POST /api/auth/register {email,name,password}` (returns `202 {needsConfirmation:true}` when email confirmation is on) · `POST /api/auth/login {email,password}` · `POST /api/auth/logout` · `GET /api/auth/me`

User data (watchlists, transactions) lives in Supabase Postgres with row-level security: every query runs as the signed-in user, so the database itself only returns that user's rows. The shared market-data cache (instruments, daily closes) is in Supabase too, reachable only by the server with the service-role key.

## Signed-in
| Route | Purpose |
|---|---|
| `GET/POST /api/watchlists` | list with live quotes / create `{name}` |
| `DELETE /api/watchlists/:id` | delete |
| `POST /api/watchlists/:id/items {symbol}` · `DELETE ...?symbol=` | add / remove stock |
| `GET /api/portfolio` | holdings with live price, value, unrealised P&L, day change, 7d trend, allocation by sector |
| `GET/POST /api/portfolio/transactions` | list / add `{symbol, side, quantity, price, fees?, tradedOn?, note?}`; overselling is rejected |
| `DELETE /api/portfolio/transactions/:id` | rejected if it would leave a later sale unfunded |
| `POST /api/portfolio/sync {positions:[{symbol,quantity,totalCost}], apply?, asOf?, closeSymbols?}` | Import or re-sync holdings from a broker (ATrad) export. Without `apply` it previews the buy/sell changes needed; with `apply: true` it records them as transactions (all or nothing) |
| `GET /api/portfolio/history?range=1W\|1M\|3M\|1Y\|ALL` | value series + flow-adjusted `gain`/`returnPct` (Modified Dietz) |

## Reports (Gemini analyser)
| Route | Purpose |
|---|---|
| `GET /api/reports/:symbol` | Public. Reports the CSE holds for a company: `{id, kind: quarterly\|annual\|other, title, date, path}` |
| `GET /api/reports/analyses?symbol=` | Signed in. The user's saved analyses |
| `POST /api/reports/key-check` | Signed in. Header `x-gemini-key`. Verifies the key and returns the model that will be used |
| `POST /api/reports/analyse {symbol, reportId, force?}` | Signed in. Header `x-gemini-key`. Downloads the report from the CSE, has Gemini analyse it, saves the result. Returns the saved copy (without calling Gemini) if it already exists, unless `force`. Capped at 20 per hour per user |

`key-check` also returns `models`: the primary model plus up to 3 backups, best first. `analyse` falls back through them (quota, overloaded, unavailable, or unreadable answer). Send `Accept: application/x-ndjson` to stream progress events (`stage`, `fallback`, `ping`, then `done` or `error`); without it the response is plain JSON.

The Gemini key is only ever read from the `x-gemini-key` header, used for that request, and discarded.

## Ops
`POST /api/cron/eod` with `Authorization: Bearer $CRON_SECRET` snapshots the latest session's closes (run after 14:30 SLT).

## Commands
`npm run verify:cse` live contract check against cse.lk · `npm test` portfolio maths tests
