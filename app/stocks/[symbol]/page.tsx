"use client";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import AreaChart from "@/components/AreaChart";
import { useAuth, useTrade } from "@/components/Providers";
import WatchButton from "@/components/WatchButton";
import AboutTab from "@/components/company/AboutTab";
import AnnouncementsTab from "@/components/company/AnnouncementsTab";
import FinancialsTab from "@/components/company/FinancialsTab";
import PeersCard from "@/components/company/PeersCard";
import PerformanceCard from "@/components/company/PerformanceCard";
import { ErrorNote, Segmented, Skeleton, StaleBanner } from "@/components/ui";
import type { HistoryResponse, MarketResponse, PortfolioResponse, StockResponse } from "@/lib/api-types";
import { compact, fmtLKR, fmtPct, fmtPrice, fmtSigned, shortSymbol, toneBg, toneText } from "@/lib/format";
import { useApi } from "@/lib/useApi";

const RANGES = ["1D", "1W", "1M", "3M", "1Y", "All"] as const;
const TABS = ["Overview", "Financials", "Announcements", "About"] as const;
type Tab = (typeof TABS)[number];

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-4 border-b border-line py-2.5 text-sm"><dt className="text-muted">{label}</dt><dd className="money text-right font-semibold">{value}</dd></div>;
}

function RangeBar({ label, low, high, price }: { label: string; low: number | null; high: number | null; price: number }) {
  if (low === null || high === null || high <= low) return null;
  const pos = Math.min(Math.max(((price - low) / (high - low)) * 100, 0), 100);
  return (
    <div className="py-3">
      <div className="mb-2 text-sm text-muted">{label}</div>
      <div className="relative h-1.5 rounded-full bg-[#eceef2]"><span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow" style={{ left: `${pos}%` }} /></div>
      <div className="money mt-2 flex justify-between text-sm font-semibold"><span>{fmtPrice(low)}</span><span>{fmtPrice(high)}</span></div>
    </div>
  );
}

export default function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = use(params);
  const symbol = decodeURIComponent(raw);
  const [range, setRange] = useState<(typeof RANGES)[number]>("1M");
  const [tab, setTab] = useState<Tab>("Overview");
  // Keep the tab in the URL (#financials) so a tab can be linked to and survives a refresh.
  useEffect(() => {
    const h = window.location.hash.slice(1).toLowerCase();
    const match = TABS.find((t) => t.toLowerCase() === h);
    if (match) setTab(match);
  }, []);
  const changeTab = (t: Tab) => { setTab(t); window.history.replaceState(null, "", `#${t.toLowerCase()}`); };
  const { user } = useAuth();
  const { openTrade } = useTrade();

  const stock = useApi<StockResponse>(`/api/stocks/${encodeURIComponent(symbol)}`, { refreshMs: 15000 });
  const hist = useApi<HistoryResponse>(`/api/stocks/${encodeURIComponent(symbol)}/history?range=${range.toUpperCase()}`, { refreshMs: range === "1D" ? 30000 : 0 });
  const market = useApi<MarketResponse>("/api/market", { refreshMs: 30000 });
  const portfolio = useApi<PortfolioResponse>(user ? "/api/portfolio" : null);

  const points = useMemo(() => (hist.data?.points ?? []).map((p) => ({ t: p.t, v: p.price })), [hist.data]);
  const periodChange = points.length > 1 ? { abs: points[points.length - 1].v - points[0].v, pct: ((points[points.length - 1].v - points[0].v) / points[0].v) * 100 } : null;
  const position = portfolio.data?.holdings.find((h) => h.symbol === stock.data?.quote.symbol);

  if (stock.error?.status === 404) return <div className="card p-8 text-center"><h1 className="text-lg font-semibold">We couldn&apos;t find &ldquo;{symbol}&rdquo;</h1><p className="mt-1 text-sm text-muted">Check the symbol and try again, or <Link href="/markets" className="font-medium text-brand">browse the market</Link>.</p></div>;
  if (stock.error && !stock.data) return <ErrorNote message={stock.error.message} onRetry={stock.reload} />;

  const q = stock.data?.quote, d = stock.data?.detail;
  return (
    <div className="space-y-4">
      <StaleBanner stale={stock.data?.stale || hist.data?.stale} />

      <section className="card p-5">
        {q ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted"><Link href="/markets" className="hover:text-ink">Markets</Link> / {q.sector}</p>
                <h1 className="mt-1 text-xl font-semibold">{q.name}</h1>
                <p className="text-sm text-muted">{shortSymbol(q.symbol)} · CSE · LKR</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/reports/${encodeURIComponent(q.symbol)}`} className="flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold hover:bg-subtle">Reports</Link>
                <WatchButton symbol={q.symbol} />
                <button onClick={() => openTrade({ symbol: q.symbol })} className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:opacity-90">Add trade</button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-baseline gap-3">
              <span className="money text-4xl font-semibold sm:text-5xl">{fmtPrice(q.price)}</span>
              <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${toneBg(q.change)}`}>{fmtSigned(q.change, 2)} ({fmtPct(q.changePct)})</span>
              <span className="text-sm text-muted">{market.data?.status.status ?? ""}</span>
            </div>
          </>
        ) : <><Skeleton className="h-6 w-56" /><Skeleton className="mt-3 h-12 w-72" /></>}
      </section>

      <Segmented options={TABS} value={tab} onChange={changeTab} />

      {tab === "Financials" && <FinancialsTab symbol={symbol} price={q?.price ?? null} marketCap={q?.marketCap ?? null} />}
      {tab === "Announcements" && <AnnouncementsTab symbol={symbol} />}
      {tab === "About" && <AboutTab symbol={symbol} />}

      {tab === "Overview" && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><Segmented options={RANGES} value={range} onChange={setRange} />
                {periodChange && <span className={`text-sm font-medium ${toneText(periodChange.abs)}`}>{fmtSigned(periodChange.abs, 2)} ({fmtPct(periodChange.pct)}) over {range === "All" ? "1 year" : range}</span>}
              </div>
              <div className="mt-5">
                {hist.error ? <ErrorNote message={hist.error.message} onRetry={hist.reload} /> : hist.loading ? <Skeleton className="h-[280px]" /> : <AreaChart points={points} intraday={range === "1D"} decimals={2} color={periodChange && periodChange.abs < 0 ? "#d92d3a" : "#0f9d6b"} />}
              </div>
              {range === "All" && <p className="mt-3 text-xs text-muted">CSE provides one year of history; older data builds up as InvestoCap records daily closes.</p>}
            </section>
            <PerformanceCard symbol={symbol} />
            <PeersCard symbol={symbol} />
          </div>

          <div className="space-y-4">
            {position && q && (
              <section className="card p-5">
                <h2 className="text-[15px] font-semibold">Your position</h2>
                <dl className="mt-2">
                  <Stat label="Shares" value={fmtLKR(position.quantity)} />
                  <Stat label="Avg cost" value={fmtPrice(position.avgCost)} />
                  <Stat label="Market value" value={`LKR ${fmtLKR(position.value)}`} />
                  <Stat label="Unrealised P&L" value={<span className={toneText(position.unrealised)}>{fmtSigned(position.unrealised)} ({fmtPct(position.unrealisedPct)})</span>} />
                </dl>
                <button onClick={() => openTrade({ symbol: q.symbol, side: "sell" })} className="mt-3 h-10 w-full rounded-xl border border-line text-sm font-semibold hover:bg-subtle">Record a sale</button>
              </section>
            )}
            <section className="card p-5">
              <h2 className="text-[15px] font-semibold">Key stats</h2>
              {q ? (
                <>
                  <RangeBar label="Day range" low={q.low || null} high={q.high || null} price={q.price} />
                  <RangeBar label="52-week range" low={d?.low52w ?? null} high={d?.high52w ?? null} price={q.price} />
                  <dl>
                    <Stat label="Previous close" value={fmtPrice(q.previousClose)} />
                    <Stat label="Volume" value={fmtLKR(q.volume)} />
                    <Stat label="Turnover" value={`LKR ${compact(q.turnover)}`} />
                    <Stat label="Trades" value={fmtLKR(q.trades)} />
                    <Stat label="Market cap" value={`LKR ${compact(q.marketCap)}`} />
                    {d?.beta != null && <Stat label="Beta (vs S&P SL20)" value={d.beta.toFixed(2)} />}
                    {d?.allTimeHigh != null && <Stat label="All-time high" value={fmtPrice(d.allTimeHigh)} />}
                    {d?.sharesIssued != null && <Stat label="Shares issued" value={compact(d.sharesIssued)} />}
                    {d?.isin && <Stat label="ISIN" value={d.isin} />}
                  </dl>
                </>
              ) : <Skeleton className="mt-3 h-64" />}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
