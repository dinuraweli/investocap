"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { HoldingPoint } from "@/lib/holding";
import { holdingMetrics, sliceByDays } from "@/lib/holding";
import { fmtIsoDate, fmtLKR, fmtPct, fmtPrice, fmtSigned, toneBg, toneText } from "@/lib/format";
import { useGeminiKey } from "@/lib/geminiKey";
import { apiPost, useApi } from "@/lib/useApi";
import MultiLineChart from "../charts/MultiLineChart";
import { useAuth } from "../Providers";
import { ErrorNote, Segmented, Skeleton } from "../ui";

interface PositionResponse {
  symbol: string; name: string; held: boolean;
  firstPurchase?: string | null;
  holding?: { quantity: number; avgCost: number; costBasis: number };
  current?: { price: number; previousClose: number; change: number; changePct: number; priceMissing: boolean; marketValue: number; unrealised: number; unrealisedPct: number; dayPL: number };
  timeline?: HoldingPoint[];
  stale?: boolean;
}
interface Explanation { summary: string; points: string[]; model: string; generatedAt: string }

const RANGES = ["1M", "3M", "6M", "YTD", "1Y", "All"] as const;
type Range = (typeof RANGES)[number];
const DAYS: Record<Range, number | null> = { "1M": 30, "3M": 91, "6M": 182, YTD: 0, "1Y": 365, All: null };
const BRAND = "#3b2fe0", GREEN = "#0f9d6b", ORANGE = "#e8730c";

const fmtRs = (n: number) => `Rs. ${fmtLKR(n)}`;
const epoch = (d: string) => Date.parse(`${d}T00:00:00+05:30`);

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`money mt-1 text-xl font-semibold sm:text-2xl ${tone === undefined ? "" : toneText(tone)}`}>{value}</div>
      {sub !== undefined && <div className="mt-0.5 text-sm">{sub}</div>}
    </div>
  );
}
function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number }) {
  return (
    <div className="rounded-xl bg-subtle px-3 py-3 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className={`money mt-1 font-semibold ${tone === undefined ? "" : toneText(tone)}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function ExplainCard({ symbol }: { symbol: string }) {
  const key = useGeminiKey();
  const [res, setRes] = useState<Explanation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!key) return;
    setBusy(true); setError(null);
    try {
      setRes(await apiPost<Explanation>(`/api/stocks/${encodeURIComponent(symbol)}/position/explain`, {}, { "x-gemini-key": key.key }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-[15px] font-semibold">Explain my position</h2><p className="mt-0.5 text-sm text-muted">A plain-English summary of how this holding has done, written by AI from your own figures.</p></div>
        {key && <button onClick={run} disabled={busy} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:bg-subtle disabled:opacity-60">{busy ? "Writing..." : res ? "Write again" : "Explain"}</button>}
      </div>
      {!key && <p className="mt-3 text-sm text-muted">Uses your own Gemini key. <Link href={`/reports/${encodeURIComponent(symbol)}`} className="font-medium text-brand hover:underline">Add it on the Reports page</Link>, then come back.</p>}
      {error && <div className="mt-3"><ErrorNote message={error} /></div>}
      {res && (
        <div className="mt-3 space-y-2">
          <p className="text-[15px] leading-relaxed">{res.summary}</p>
          {res.points.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{res.points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          <p className="text-xs text-muted">AI-generated on {fmtIsoDate(res.generatedAt.slice(0, 10))} with {res.model}. It can make mistakes and is not investment advice.</p>
        </div>
      )}
    </section>
  );
}

export default function MyPositionTab({ symbol }: { symbol: string }) {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<PositionResponse>(user ? `/api/stocks/${encodeURIComponent(symbol)}/position` : null, { refreshMs: 30000 });
  const [range, setRange] = useState<Range>("All");

  const timeline = data?.timeline ?? [];
  const filtered = useMemo(() => {
    if (timeline.length === 0) return [];
    if (range === "YTD") {
      const year = timeline[timeline.length - 1].date.slice(0, 4);
      return timeline.filter((p) => p.date >= `${year}-01-01`);
    }
    return sliceByDays(timeline, DAYS[range]);
  }, [timeline, range]);
  const metrics = useMemo(() => holdingMetrics(filtered), [filtered]);
  const dates = useMemo(() => filtered.map((p) => epoch(p.date)), [filtered]);

  if (!user) return <section className="card p-6 text-center"><h2 className="text-[15px] font-semibold">Your position</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted">Sign in to see how your holding has performed.</p><Link href="/" className="mt-3 inline-block rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white">Sign in</Link></section>;
  if (loading && !data) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (error) return <ErrorNote message={error.message} onRetry={reload} />;
  if (!data?.held || !data.holding || !data.current) return <section className="card p-8 text-center"><h2 className="text-[15px] font-semibold">You don&apos;t hold this stock</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted">Record a trade and your position insights will appear here.</p></section>;

  const h = data.holding, c = data.current;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Total invested" value={fmtRs(h.costBasis)} sub={<span className="text-muted">{fmtLKR(h.quantity)} @ {fmtPrice(h.avgCost)}</span>} />
        <Tile label="Market value" value={fmtRs(c.marketValue)} sub={<span className="text-muted">at {fmtPrice(c.price)}{c.priceMissing ? " (cost)" : ""}</span>} />
        <Tile label="Unrealised P&L" value={fmtSigned(c.unrealised)} tone={c.unrealised} sub={<span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${toneBg(c.unrealised)}`}>{c.unrealisedPct >= 0 ? "+" : ""}{c.unrealisedPct.toFixed(2)}%</span>} />
        <Tile label="Return" value={`${c.unrealisedPct >= 0 ? "+" : ""}${c.unrealisedPct.toFixed(2)}%`} tone={c.unrealisedPct} sub={<span className="text-muted">since {fmtIsoDate(data.firstPurchase ?? null)}</span>} />
      </div>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">Today&apos;s movement</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Previous close" value={fmtPrice(c.previousClose)} />
          <Metric label="Current price" value={fmtPrice(c.price)} />
          <Metric label="Price change" value={`${c.change >= 0 ? "+" : ""}${fmtPrice(c.change)}`} sub={fmtPct(c.changePct)} tone={c.change} />
          <Metric label="Day's P&L" value={fmtSigned(c.dayPL)} tone={c.dayPL} />
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Since you bought</h2>
        <Segmented options={RANGES} value={range} onChange={setRange} size="sm" />
      </div>

      {filtered.length < 2 ? (
        <section className="card grid h-48 place-items-center px-6 text-center text-sm text-muted">Your charts fill in as trading days pass. They need at least two days of prices in this range.</section>
      ) : (
        <>
          <section className="card p-5">
            <h2 className="text-[15px] font-semibold">Investment vs market value</h2>
            <p className="mt-0.5 text-sm text-muted">What you&apos;ve put in (cost) against what the holding is worth.</p>
            <div className="mt-4"><MultiLineChart dates={dates} formatY={(n) => fmtRs(n)} series={[
              { name: "Total cost", color: BRAND, type: "step", values: filtered.map((p) => p.costBasis) },
              { name: "Market value", color: GREEN, type: "area", values: filtered.map((p) => p.marketValue) },
            ]} /></div>
          </section>

          <section className="card p-5">
            <h2 className="text-[15px] font-semibold">Total gains</h2>
            <p className="mt-0.5 text-sm text-muted">Profit or loss on the holding over time. Green above zero, red below.</p>
            <div className="mt-4"><MultiLineChart dates={dates} gainFill legend={false} formatY={(n) => fmtRs(n)} series={[{ name: "Gain", color: BRAND, values: filtered.map((p) => p.gain) }]} /></div>
          </section>

          <section className="card p-5">
            <h2 className="text-[15px] font-semibold">Price vs your average cost</h2>
            <p className="mt-0.5 text-sm text-muted">The market price against the average price you paid.</p>
            <div className="mt-4"><MultiLineChart dates={dates} formatY={(n) => fmtPrice(n)} series={[
              { name: "Market price", color: ORANGE, values: filtered.map((p) => p.close) },
              { name: "Avg cost", color: BRAND, type: "step", dashed: true, values: filtered.map((p) => p.avgCost) },
            ]} /></div>
          </section>

          <section className="card p-5">
            <h2 className="text-[15px] font-semibold">Performance metrics</h2>
            <p className="mt-0.5 text-sm text-muted">Over the selected period.</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Total return" value={fmtSigned(c.unrealised)} sub={`${c.unrealisedPct >= 0 ? "+" : ""}${c.unrealisedPct.toFixed(2)}%`} tone={c.unrealised} />
              <Metric label="Highest price" value={metrics.highClose === null ? "–" : fmtPrice(metrics.highClose)} />
              <Metric label="Lowest price" value={metrics.lowClose === null ? "–" : fmtPrice(metrics.lowClose)} />
              <Metric label="Current price" value={fmtPrice(c.price)} />
              <Metric label="Best day" value={metrics.bestDay ? fmtSigned(metrics.bestDay.amount) : "–"} sub={metrics.bestDay ? fmtIsoDate(metrics.bestDay.date) : undefined} tone={metrics.bestDay?.amount} />
              <Metric label="Worst day" value={metrics.worstDay ? fmtSigned(metrics.worstDay.amount) : "–"} sub={metrics.worstDay ? fmtIsoDate(metrics.worstDay.date) : undefined} tone={metrics.worstDay?.amount} />
            </div>
          </section>
        </>
      )}

      <ExplainCard symbol={symbol} />
      {data.stale && <p className="text-center text-xs text-warn">Live prices are temporarily unavailable; showing the last known values.</p>}
    </div>
  );
}
