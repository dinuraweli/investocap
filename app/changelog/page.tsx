import type { Metadata } from "next";

export const metadata: Metadata = { title: "What's new — InvestoCap" };

type Entry = {
  date: string;
  title: string;
  items: string[];
};

const ENTRIES: Entry[] = [
  {
    date: "9 Nov 2026",
    title: "Market Sentiment",
    items: [
      "New /sentiment page with a 0–100 market-mood score and plain-English label",
      "Breadth internals: advancers vs decliners, A/D ratio, up/down volume and turnover share, sector breadth",
      "Net director dealings: insider buy/sell totals across the market for the past ~9 days, with the biggest individual trades listed",
      "Event impact on your holdings: each holding's most recent announcement and how the share price moved in the five trading days after it",
      "Mood score is snapshotted daily and will build into a trend chart over time",
    ],
  },
  {
    date: "4 Nov 2026",
    title: "Unit Trusts",
    items: [
      "New /funds page: browse all 65 Sri Lankan unit trust funds across 13 fund managers",
      "Buying and selling (NAV) prices sourced daily from UTASL",
      "Per-fund page with NAV history chart (builds up as daily snapshots accrue)",
      "Unit trust prices are snapshotted every evening alongside the stock EOD cron",
    ],
  },
  {
    date: "3 Nov 2026",
    title: "My Position",
    items: [
      "New 'My Position' tab on each stock page — appears only for stocks you hold",
      "Dashboard Holdings rows now deep-link directly to the tab",
      "Stat tiles: total invested, current market value, unrealised P&L, return %",
      "Three charts — Investment vs Market Value, Total Gains (green/red), Price vs Average Cost — with a 1M–All range selector",
      "Best and worst single-day P&L since you first bought",
      "'Explain my position' AI write-up using your own Gemini key (facts only, no advice)",
    ],
  },
  {
    date: "21 Oct 2026",
    title: "Portfolio P&L Dashboard",
    items: [
      "Portfolio Value card now shows unrealised P&L, overall return %, amount invested, and realised P&L alongside the total value",
    ],
  },
  {
    date: "15 Oct 2026",
    title: "Company Pages & Report Analyser",
    items: [
      "Stock page now has five tabs: Overview, Financials, Announcements, About, My Position",
      "Announcements feed grouped by category (dividends, director dealings, board changes, capital actions…) with an 'Explain this' AI button per announcement",
      "About tab: business summary, board & senior leadership, share structure, short AI brief",
      "Report analyser: analyse CSE company reports in plain English with key figures, ratios, charts, and valuation at live price",
      "Compare mode: side-by-side analysis of 2–3 companies",
      "Trend view across all analysed periods for a company",
    ],
  },
  {
    date: "14 Oct 2026",
    title: "Launch",
    items: [
      "Portfolio dashboard: total value, day change, holdings table, allocation donut, performance tiles",
      "Markets page: ASPI, S&P SL20, turnover, breadth, sector indices, top gainers/losers/most active, full stocks table",
      "Stock pages: live price, 1D–1Y chart, key stats, Watch button, Add Trade modal",
      "Watchlists: create multiple named lists, add/remove stocks, live prices",
      "Email + password sign-in with per-user data isolation",
      "ATrad Excel import: upload your broker portfolio export to populate holdings in one step",
      "End-of-day price cron; live prices poll every 15 seconds during market hours",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">What&apos;s new</h1>
      <p className="mb-10 text-sm text-muted">A running log of everything added to InvestoCap.</p>

      <div className="relative">
        {/* vertical timeline line */}
        <div className="absolute left-[7px] top-2 h-[calc(100%-2rem)] w-px bg-line" aria-hidden />

        <ol className="space-y-10">
          {ENTRIES.map((entry) => (
            <li key={entry.date} className="relative pl-8">
              {/* dot */}
              <span className="absolute left-0 top-[6px] flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-brand bg-surface" aria-hidden />

              <div className="mb-2 flex flex-wrap items-baseline gap-3">
                <h2 className="text-base font-semibold">{entry.title}</h2>
                <time className="text-xs font-medium text-muted">{entry.date}</time>
              </div>

              <ul className="space-y-1.5">
                {entry.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted">
                    <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-soft ring-1 ring-brand/30" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
