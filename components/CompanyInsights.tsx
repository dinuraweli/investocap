"use client";
import { useMemo, useState } from "react";
import type { HistoryResponse, SavedAnalysis } from "@/lib/api-types";
import { fmtChart } from "@/lib/ratioFormat";
import { buildTrends, computeRatios, computeValuation, growthPct, reader } from "@/lib/reports/ratios";
import { useApi } from "@/lib/useApi";
import AnalysisProgress, { type Run } from "./AnalysisProgress";
import AreaChart, { type ChartMarker } from "./AreaChart";
import TrendChart from "./charts/TrendChart";
import RatioTable, { RatioRow } from "./RatioTable";
import { Segmented, Skeleton } from "./ui";

const METRICS: { key: string; label: string; unit: string; fmt?: (v: number) => string }[] = [
  { key: "revenue", label: "Revenue", unit: "LKR million" },
  { key: "net_profit", label: "Net profit", unit: "LKR million" },
  { key: "eps", label: "EPS", unit: "LKR per share" },
  { key: "net_margin", label: "Net margin", unit: "%", fmt: (v) => `${v.toFixed(1)}%` },
  { key: "gross_margin", label: "Gross margin", unit: "%", fmt: (v) => `${v.toFixed(1)}%` },
  { key: "operating_margin", label: "Operating margin", unit: "%", fmt: (v) => `${v.toFixed(1)}%` },
  { key: "operating_cash_flow", label: "Operating cash flow", unit: "LKR million" },
  { key: "total_equity", label: "Equity", unit: "LKR million" },
  { key: "borrowings", label: "Borrowings", unit: "LKR million" },
  { key: "dividend_per_share", label: "Dividend per share", unit: "LKR" },
];

export interface BatchState { total: number; index: number; title: string }

export default function CompanyInsights({
  symbol, analyses, loading, price, marketCap, unanalysedQuarters, hasKey, batch, run, batchError, onBuild, onStop,
}: {
  symbol: string; analyses: SavedAnalysis[]; loading: boolean; price: number | null; marketCap: number | null; unanalysedQuarters: number; hasKey: boolean;
  batch: BatchState | null; run: Run | null; batchError: string | null; onBuild: (n: number) => void; onStop: () => void;
}) {
  const [freq, setFreq] = useState<"Quarterly" | "Annual">("Quarterly");
  const [metric, setMetric] = useState("revenue");
  const trends = useMemo(() => buildTrends(analyses), [analyses]);
  const valuation = useMemo(() => computeValuation(analyses, price, marketCap), [analyses, price, marketCap]);
  const latest = useMemo(() => [...analyses].filter((a) => a.analysis.periodEnd).sort((a, b) => (a.analysis.periodEnd! < b.analysis.periodEnd! ? 1 : -1))[0] ?? analyses[0], [analyses]);
  const ratios = useMemo(() => (latest ? computeRatios(latest.analysis) : []), [latest]);

  const points = freq === "Quarterly" ? trends.quarterly : trends.annual;
  const available = METRICS.filter((m) => points.filter((p) => p.values[m.key] !== undefined).length >= 2);
  const current = available.find((m) => m.key === metric) ?? available[0];

  const prices = useApi<HistoryResponse>(analyses.length ? `/api/stocks/${encodeURIComponent(symbol)}/history?range=ALL` : null);
  const pricePoints = useMemo(() => (prices.data?.points ?? []).map((p) => ({ t: p.t, v: p.price })), [prices.data]);
  const markers: ChartMarker[] = useMemo(() => analyses.filter((a) => a.reportDate).map((a) => {
    const r = reader(a.analysis);
    const g = growthPct(r("net_profit", "current"), r("net_profit", "previous"));
    return { t: Date.parse(`${a.reportDate}T00:00:00+05:30`), label: `${a.analysis.periodLabel}${g === null ? "" : `: net profit ${g >= 0 ? "+" : ""}${g.toFixed(0)}%`}` };
  }), [analyses]);

  return (
    <div className="space-y-4">
      {analyses.length === 0 && loading ? (
        <Skeleton className="h-64" />
      ) : analyses.length === 0 ? (
        <section className="card p-8 text-center">
          <h2 className="text-[15px] font-semibold">Nothing to chart yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Analyse a report on the Reports tab, or build the recent history below. Ratios, valuation and trends are worked out from the reports you have analysed.</p>
        </section>
      ) : (
        <>
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold">Valuation at today&apos;s price</h2>
                <p className="mt-0.5 text-sm text-muted">{valuation.earnings ? `Earnings basis: ${valuation.earnings.label}` : "No earnings figures found in your analysed reports yet."}</p>
              </div>
              {price !== null && <span className="money text-sm text-muted">Price LKR {price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
            </div>
            {valuation.items.length > 0 ? <dl className="mt-3 grid gap-x-8 sm:grid-cols-2">{valuation.items.map((r) => <RatioRow key={r.key} r={r} showPrevious={false} />)}</dl> : <p className="mt-3 text-sm text-muted">Not enough data for a valuation yet.</p>}
            <p className="mt-3 text-xs text-muted">Past results are not a forecast. For information only, not investment advice.</p>
          </section>

          {latest && <RatioTable groups={ratios} title="Latest ratios" subtitle={`From the most recent analysed report: ${latest.analysis.periodLabel}.`} />}

          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-[15px] font-semibold">Trends</h2><p className="mt-0.5 text-sm text-muted">{current ? `${current.label}, ${current.unit}` : "Needs more analysed reports"}</p></div>
              <Segmented options={["Quarterly", "Annual"] as const} value={freq} onChange={setFreq} />
            </div>
            {available.length > 0 && current ? (
              <>
                <div className="mt-3"><Segmented options={available.map((m) => m.label)} value={current.label} onChange={(l) => setMetric(available.find((m) => m.label === l)!.key)} size="sm" /></div>
                <div className="mt-4"><TrendChart points={points} metric={current.key} fmt={current.fmt ?? fmtChart} /></div>
                {freq === "Annual" && points.some((p) => p.source === "history") && <p className="mt-2 text-xs text-muted">Lighter bars come from the multi-year summary table inside an annual report.</p>}
              </>
            ) : <p className="mt-4 rounded-xl bg-subtle px-4 py-6 text-center text-sm text-muted">Each line needs at least two {freq.toLowerCase()} periods. {freq === "Quarterly" ? "Use Build history below, or analyse more quarterly reports." : "Analyse an annual report: most include a five-year summary that fills this in on its own."}</p>}
          </section>

          <section className="card p-5">
            <h2 className="text-[15px] font-semibold">Share price and results</h2>
            <p className="mt-0.5 text-sm text-muted">Triangles mark the day each analysed report was filed. Hover near one to see the result.</p>
            <div className="mt-4">{prices.loading ? <Skeleton className="h-[240px]" /> : pricePoints.length > 1 ? <AreaChart points={pricePoints} decimals={2} markers={markers} /> : <p className="rounded-xl bg-subtle px-4 py-6 text-center text-sm text-muted">Price history isn&apos;t available right now.</p>}</div>
          </section>
        </>
      )}

      <section className="card space-y-3 p-5">
        <div>
          <h2 className="text-[15px] font-semibold">Build history</h2>
          <p className="mt-0.5 text-sm text-muted">Analyse the most recent quarterly reports in one go so the trend charts fill in. Each one is a separate Gemini request on your own key, about 20 to 90 seconds each.</p>
        </div>
        {batch && run ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Report {batch.index} of {batch.total}: <span className="text-muted">{batch.title}</span></p>
            <AnalysisProgress run={run} />
            <button onClick={onStop} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:bg-subtle">Stop after this report</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {[4, 8].map((n) => (
              <button key={n} onClick={() => onBuild(n)} disabled={!hasKey || unanalysedQuarters === 0} title={hasKey ? undefined : "Add your Gemini key first"} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">Analyse last {n} quarters</button>
            ))}
            <span className="text-sm text-muted">{unanalysedQuarters === 0 ? "All recent quarterly reports are already analysed." : `${unanalysedQuarters} quarterly report${unanalysedQuarters === 1 ? "" : "s"} not analysed yet (already-analysed ones are skipped).`}</span>
          </div>
        )}
        {batchError && <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{batchError}</p>}
      </section>
    </div>
  );
}
