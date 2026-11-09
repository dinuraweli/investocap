# InvestoCap — Changelog

All notable changes to InvestoCap. Newest first.

---

## 2026-11-09 — Market Sentiment

- **New page `/sentiment`:** market-mood score (0–100) with a plain-English label (e.g. "Broadly positive")
- Breadth internals: advancers vs decliners, A/D ratio, up/down volume share, up/down turnover share, sector breadth
- **Net director dealings:** insider buy/sell totals across the market for the past ~9 days, with the biggest individual trades listed
- **Event impact on your holdings:** each holding's most recent announcement and how the share price moved in the five trading days after it
- Mood score is snapshotted daily and will build into a trend chart over time

---

## 2026-11-04 — Unit Trusts

- **New page `/funds`:** browse all 65 Sri Lankan unit trust funds across 13 fund managers
- Buying and selling (NAV) prices sourced daily from UTASL
- **Per-fund page `/funds/[slug]`:** NAV history chart (builds up as daily snapshots accrue), fund details
- Unit trust prices are snapshotted every evening alongside the stock EOD cron

---

## 2026-11-03 — My Position

- **New tab on each stock page:** "My Position" — appears only for stocks you hold
- Dashboard Holdings rows now deep-link directly to the tab
- Stat tiles: total invested, current market value, unrealised P&L, return %
- Today's price movement in context (day P&L, day % change)
- Range selector (1 M → All) with three charts:
  - Investment vs Market Value over time
  - Total Gains (green above zero, red below)
  - Price vs Average Cost (shows how your avg cost stepped down/up with each trade)
- Best and worst single-day P&L since you first bought
- **"Explain my position" (AI):** plain-English write-up of your holding using your own Gemini key — facts only, no advice

---

## 2026-10-21 — Portfolio P&L Dashboard

- Portfolio Value card now shows **unrealised P&L**, **overall return %**, **amount invested**, and **realised P&L** alongside the total value
- Day-change figure already on the card; now the full picture is visible at a glance

---

## 2026-10-15 — Company Pages & Report Analyser

**Company pages:**
- Stock page now has five tabs: Overview, Financials, Announcements, About, My Position
- **Announcements feed** grouped by category (dividends, director dealings, board changes, capital actions…) with an "Explain this" AI button per announcement
- **About tab:** business summary, board & senior leadership, share structure, short AI brief

**Report analyser (AI, own Gemini key):**
- Analyse CSE company reports (quarterly and annual) in plain English
- Key figures with page references, management summary, auditor opinion, risk flags
- Financial charts: this period vs last, revenue → profit waterfall bridge
- Ratio groups: profitability, liquidity, efficiency, gearing
- Valuation at live share price (P/E, P/B, EV/EBITDA where data allows)
- Trend view across all analysed periods for a company
- **Compare mode:** side-by-side comparison of 2–3 companies

---

## 2026-10-14 — Launch

- **Portfolio dashboard:** total value, day change, holdings table, allocation donut, performance tiles
- **Markets page:** ASPI, S&P SL20, turnover, breadth, sector indices, top gainers/losers/most active, all-stocks table with search and sort
- **Stock pages:** live price, 1D–1Y chart, key stats, Watch button, Add Trade modal
- **Watchlists:** create multiple named lists, add/remove stocks, live prices
- **Auth:** email + password sign-in via Supabase; all data isolated per user
- **ATrad import:** upload your broker's portfolio Excel export to populate your holdings in one step; re-sync after each trade
- End-of-day price cron runs every evening; live prices poll every 15 seconds during market hours
- Deployed on Vercel (Mumbai region) at [investocap.vercel.app](https://investocap.vercel.app)
