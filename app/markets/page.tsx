"use client";
import Link from "next/link";
import { useState } from "react";
import StockTable from "@/components/StockTable";
import { ErrorNote, Segmented, Skeleton, StaleBanner } from "@/components/ui";
import type { MarketResponse, StocksResponse } from "@/lib/api-types";
import { compact, fmtLKR, fmtPct, fmtPrice, shortSymbol, timeAgo, toneBg, toneText } from "@/lib/format";
import { useApi } from "@/lib/useApi";

const moverRow = (r: { symbol: string; price: number; changePct: number }): MoverRow => ({ symbol: r.symbol, mid: fmtPrice(r.price), right: fmtPct(r.changePct), tone: r.changePct });

const SORTS = { Turnover: "turnover", "Top gainers": "change", "Market cap": "marketCap", Price: "price" } as const;

function IndexCard({ name, value, change, pct }: { name: string; value: number; change: number; pct: number }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-muted">{name}</div>
      <div className="money mt-1 text-3xl font-semibold">{fmtLKR(value, 2)}</div>
      <div className={`mt-2 inline-flex gap-2 text-sm font-medium ${toneText(pct)}`}>
        <span>{change > 0 ? "+" : ""}{fmtLKR(change, 2)}</span>
        <span className={`rounded-md px-2 py-0.5 font-semibold ${toneBg(pct)}`}>{fmtPct(pct)}</span>
      </div>
    </div>
  );
}

interface MoverRow { symbol: string; mid: string; right: string; tone: number }
function MoverList({ title, rows }: { title: string; rows: MoverRow[] }) {
  return (
    <div className="card p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <ul className="mt-3 divide-y divide-line">
        {rows.slice(0, 6).map((r) => (
          <li key={r.symbol}>
            <Link href={`/stocks/${encodeURIComponent(r.symbol)}`} className="flex items-center justify-between py-2.5 text-sm hover:opacity-80">
              <span className="font-semibold">{shortSymbol(r.symbol)}</span>
              <span className="flex items-center gap-3"><span className="money">{r.mid}</span><span className={`w-20 text-right font-semibold ${toneText(r.tone)}`}>{r.right}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Markets() {
  const [sort, setSort] = useState<keyof typeof SORTS>("Turnover");
  const [q, setQ] = useState("");
  const market = useApi<MarketResponse>("/api/market", { refreshMs: 15000 });
  const stocks = useApi<StocksResponse>(`/api/stocks?limit=300&sort=${SORTS[sort]}&q=${encodeURIComponent(q.trim())}`, { refreshMs: 15000 });
  const m = market.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-semibold">Markets</h1>
        {m && <p className="text-sm text-muted"><span className={`mr-2 rounded-full px-2.5 py-1 text-xs font-semibold ${m.status.open ? "bg-gain-soft text-gain" : "bg-subtle"}`}>{m.status.status}</span>Updated {timeAgo(m.fetchedAt)}</p>}
      </div>
      {market.error && <ErrorNote message={market.error.message} onRetry={market.reload} />}
      <StaleBanner stale={m?.stale} />

      {m ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <IndexCard name="ASPI" value={m.aspi.value} change={m.aspi.change} pct={m.aspi.changePct} />
          <IndexCard name="S&P SL20" value={m.sl20.value} change={m.sl20.change} pct={m.sl20.changePct} />
          <div className="card p-5"><div className="text-sm text-muted">Turnover</div><div className="money mt-1 text-3xl font-semibold">LKR {compact(m.summary.turnover)}</div><div className="mt-2 text-sm text-muted">{fmtLKR(m.summary.trades)} trades · {compact(m.summary.shareVolume)} shares</div></div>
          <div className="card p-5">
            <div className="text-sm text-muted">Market breadth</div>
            <div className="money mt-1 text-3xl font-semibold"><span className="text-gain">{m.breadth.advancers}</span> <span className="text-muted">/</span> <span className="text-loss">{m.breadth.decliners}</span></div>
            <div className="mt-2 text-sm text-muted">advancing / declining · {m.breadth.unchanged} unchanged</div>
          </div>
        </div>
      ) : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>}

      {m && (
        <div className="grid gap-4 lg:grid-cols-3">
          <MoverList title="Top gainers" rows={m.gainers.map(moverRow)} />
          <MoverList title="Top losers" rows={m.losers.map(moverRow)} />
          <MoverList title="Most active" rows={m.active.map((a) => ({ symbol: a.symbol, mid: `${compact(a.shareVolume)} sh`, right: `LKR ${compact(a.turnover)}`, tone: 0 }))} />
        </div>
      )}

      {m && m.sectors.length > 0 && (
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold">Sectors</h2>
          <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
            {[...m.sectors].sort((a, b) => b.changePct - a.changePct).map((s) => (
              <div key={s.code} className="flex items-center justify-between border-b border-line py-2.5 text-sm">
                <span className="truncate pr-3">{s.name}</span>
                <span className="flex items-center gap-3"><span className="money text-muted">{fmtLKR(s.value, 2)}</span><span className={`w-16 text-right font-semibold ${toneText(s.changePct)}`}>{fmtPct(s.changePct)}</span></span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-[15px] font-semibold">All stocks</h2><p className="mt-0.5 text-sm text-muted">{stocks.data ? `${stocks.data.total} listed` : "Loading"}</p></div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or symbol" aria-label="Filter stocks" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
            <Segmented options={Object.keys(SORTS) as (keyof typeof SORTS)[]} value={sort} onChange={setSort} />
          </div>
        </div>
        {stocks.error ? <div className="p-5 pt-0"><ErrorNote message={stocks.error.message} onRetry={stocks.reload} /></div> : stocks.data ? <StockTable stocks={stocks.data.stocks} empty="No stocks match your filter." /> : <div className="space-y-3 p-5 pt-0"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
      </section>
    </div>
  );
}
