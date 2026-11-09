# InvestoCap — Feature Roadmap

Tracker for everything built and planned. Live at https://investocap.vercel.app

**Legend:** ✅ Shipped · 🔨 In progress · 🔜 Next up · 💡 Planned · ⚠️ Correctness/risk · 🔬 Needs a data-source spike

Guiding principle: **track and inform, don't recommend** — descriptive facts and figures only, never buy/sell advice (keeps us out of regulated-advice territory). All AI uses the user's own Gemini key.

---

## 1. Accounts & platform
- ✅ Email + password auth (Supabase), sessions, login throttle
- ✅ Per-user data isolation (Postgres row-level security)
- ✅ Hosted on Vercel (Mumbai region) with auto-deploy from `main`
- ✅ End-of-day price snapshot cron; server-side market-data cache
- 💡 Google sign-in
- 💡 Email confirmation + real mail provider (SMTP) for public sign-ups
- 💡 Account self-service: **export my data**, **delete my account** (needed before inviting others)
- 💡 Installable mobile app (PWA) + offline; **dark mode**
- ⚠️ Next.js security upgrade (16.4.0 has a known advisory) — tech debt, do independently

## 2. Markets & discovery
- ✅ Market overview: ASPI, S&P SL20, turnover, breadth, gainers/losers/most active, sector indices
- ✅ All-stocks table: search, sort, filter
- ✅ Stock page tabs: Overview, Financials, Announcements, About, My Position
- ✅ Price performance vs ASPI (1W–1Y); sector peers
- 💡 **Stock screener** (filter by sector, yield, 52-week position, P/E from analysed reports)
- 💡 Lists: 52-week highs/lows, top dividend yielders, S&P SL20 constituents
- 💡 Sector heatmap

## 3. Portfolio & holdings
- ✅ Transactions (add/delete), average-cost P&L, realised + unrealised
- ✅ ATrad Excel import & re-sync
- ✅ Dashboard: value, day change, **unrealised P&L + return %**, holdings, allocation donut, performance tiles
- ✅ Portfolio value history (Modified Dietz money-weighted return)
- ✅ **My Position** per-holding insights: invested/value/P&L tiles, daily movement, 3 charts (Investment vs Market Value, Total Gains, Price vs Avg Cost), best/worst day, "Explain my position" (AI)
- ⚠️ **Corporate actions**: auto-handle share splits, bonus issues & rights (currently would break quantity & avg cost) — HIGH priority for data correctness; detectable from the announcements feed
- 💡 Portfolio vs ASPI / S&P SL20 benchmark chart
- 💡 XIRR since inception; volatility, portfolio beta, max drawdown
- 💡 Concentration / diversification warnings
- 💡 Multiple portfolios; cash-balance tracking
- 💡 Transaction editing, notes & tags; generic CSV import
- 💡 1-day intraday chart for the whole portfolio

## 4. Watchlists
- ✅ Multiple named watchlists with live quotes; add/remove; watch button on stock pages

## 5. Research & reports (AI, own Gemini key)
- ✅ Report analyser: plain-English summary, key numbers with page refs, ratios, auditor opinion
- ✅ Charts (this-vs-last, revenue→profit bridge), valuation at live price, trends, build-history, compare 2–3 companies
- ✅ Company About: business summary, board & leadership, share structure, short AI brief
- ✅ Announcements feed grouped (dividends, directors' dealings, board, meetings, capital…) + "Explain this"
- 💡 Whole-portfolio AI review (concentration, risks, news digest across holdings)
- 💡 Earnings calendar (when each holding's next quarterly report is due)

## 6. Dividends & income  💡
- 💡 Dividend tracker: total received, yield-on-cost, projected annual income
- 💡 Dividend calendar across holdings (ex-date / payment-date reminders) — dates already parsed from announcements

## 7. Alerts & notifications  💡
- 💡 Price alerts (target / % move)
- 💡 Announcement alerts for holdings & watchlist (new dividend, dealing, report)
- 💡 Dividend ex-date / payment reminders
- 💡 Delivery: in-app centre first; email/web-push later (cron infra already exists)

## 8. Market sentiment & news impact
Descriptive only (no predictions). Lives at `/sentiment`.
- ✅ **Market-mood score** (0–100) + breadth internals: advancers/decliners, A/D ratio, up vs down volume & turnover, sector breadth
- ✅ **Net director dealings** across the market (insider buy/sell value + biggest trades, from the approved-announcement feed)
- ✅ **Event impact**: each holding's most recent announcement and the share-price reaction after it
- ✅ Daily mood-score snapshot → trend chart (builds up over time)
- 💡 % of stocks above 50-day avg, new 52-week highs vs lows (need more price history; fill in as it grows)
- 🔬 Optional: announcement tone via Gemini; external news feed (Daily FT / EconomyNext RSS)

## 9. Unit trusts (trust funds)
Source: **utasl.lk** `/unit-prices/` — daily NAVs for ~65 funds across 13 managers (parseable HTML). The 3 CSE-listed closed-end funds (`.U`) already come free via the CSE feed.
- ✅ UTASL NAV parser + service + daily snapshot storage
- ✅ Browse page (`/funds`) + per-fund NAV-history page: buying/selling price, manager, search & filter
- 🔜 **Manual unit-trust holdings** in the portfolio (units + cost; value at current NAV; gain/loss) — unlocks "whole net worth in one place"
- 🔬 Historical NAV before our snapshots start (monthly UTASL performance-report PDFs)

## 10. Wider wealth tracking  💡
(Natural extension — this is where most Sri Lankan retail money sits.)
- 💡 Fixed deposits (manual: principal, rate, maturity; accrued interest)
- 💡 EPF / ETF projection

---

_Last updated: 2026-11-09. Edit this file as items ship; tick ✅ and move things between sections._
