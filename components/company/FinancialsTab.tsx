"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { ReportsResponse, SavedAnalysis } from "@/lib/api-types";
import { fmtIsoDate, fmtLKR } from "@/lib/format";
import { computeRatios, computeValuation, growthPct } from "@/lib/reports/ratios";
import { useApi } from "@/lib/useApi";
import { useAuth } from "../Providers";
import { RatioRow } from "../RatioTable";
import { ErrorNote, Skeleton } from "../ui";

const fmtNum = (n: number | null) => (n === null ? "–" : Number.isInteger(n) ? fmtLKR(n, 0) : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const KEY_ROWS = ["revenue", "gross_profit", "operating_profit", "net_profit", "eps", "total_assets", "total_equity", "operating_cash_flow"];

/** The user's latest analysed results for this company, with valuation and key ratios. Links through to the full analysis. */
export default function FinancialsTab({ symbol, price, marketCap }: { symbol: string; price: number | null; marketCap: number | null }) {
  const { user, loading: authLoading } = useAuth();
  const reports = useApi<ReportsResponse>(`/api/reports/${encodeURIComponent(symbol)}`);
  const saved = useApi<{ analyses: SavedAnalysis[] }>(user ? `/api/reports/analyses?symbol=${encodeURIComponent(symbol)}` : null);
  const analyses = useMemo(() => saved.data?.analyses ?? [], [saved.data]);
  const latest = useMemo(() => [...analyses].filter((a) => a.analysis.periodEnd).sort((a, b) => (a.analysis.periodEnd! < b.analysis.periodEnd! ? 1 : -1))[0] ?? analyses[0], [analyses]);
  const valuation = useMemo(() => computeValuation(analyses, price, marketCap), [analyses, price, marketCap]);
  const profitability = useMemo(() => (latest ? computeRatios(latest.analysis).find((g) => g.id === "profitability") : undefined), [latest]);
  const recent = (reports.data?.reports ?? []).filter((r) => r.kind !== "other").slice(0, 4);

  return (
    <div className="space-y-4">
      {authLoading || (user && saved.loading) ? <Skeleton className="h-56" />
        : !user ? (
          <section className="card p-6 text-center"><h2 className="text-[15px] font-semibold">Analysed results</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted">Sign in to see AI-analysed results, ratios and valuation for this company.</p><Link href="/" className="mt-3 inline-block rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white">Sign in</Link></section>
        ) : saved.error ? <ErrorNote message={saved.error.message} onRetry={saved.reload} />
        : !latest ? (
          <section className="card p-6 text-center">
            <h2 className="text-[15px] font-semibold">No analysed results yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">Analyse one of the company&apos;s reports and its summary, key numbers, ratios and valuation will appear here.</p>
            <Link href={`/reports/${encodeURIComponent(symbol)}`} className="mt-3 inline-block rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white">Analyse the latest report</Link>
          </section>
        ) : (
          <>
            <section className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-[15px] font-semibold">{latest.analysis.periodLabel}</h2><p className="mt-0.5 text-sm text-muted">{latest.title} · analysed {fmtIsoDate(latest.createdAt.slice(0, 10))}</p></div>
                <Link href={`/reports/${encodeURIComponent(symbol)}?open=${latest.reportId}`} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:bg-subtle">Full analysis, charts &amp; trends</Link>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed">{latest.analysis.summary}</p>
              <p className="mt-2 text-xs text-muted">AI-generated from the report. Check anything important against the original PDF. Not investment advice.</p>
            </section>

            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
              <section className="card overflow-hidden">
                <div className="p-5 pb-2"><h2 className="text-[15px] font-semibold">Key numbers</h2></div>
                <table className="w-full text-sm">
                  <tbody>
                    {KEY_ROWS.map((k) => latest.analysis.metrics.find((m) => m.key === k)).filter((m): m is NonNullable<typeof m> => !!m).map((m) => {
                      const g = m.unit.trim() === "%" ? null : growthPct(m.current, m.previous);
                      return (
                        <tr key={m.key} className="border-t border-line">
                          <td className="px-5 py-2.5"><span className="font-medium">{m.label}</span><span className="ml-1.5 text-xs text-muted">{m.unit}</span></td>
                          <td className="money py-2.5 text-right font-semibold">{fmtNum(m.current)}</td>
                          <td className={`py-2.5 pl-3 pr-5 text-right text-xs font-semibold ${g === null ? "text-muted" : g >= 0 ? "text-gain" : "text-loss"}`}>{g === null ? "" : `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              <div className="space-y-4">
                <section className="card p-5">
                  <h2 className="text-[15px] font-semibold">Valuation at today&apos;s price</h2>
                  <p className="mt-0.5 text-sm text-muted">{valuation.earnings ? `Earnings basis: ${valuation.earnings.label}` : "Not enough earnings data yet."}</p>
                  {valuation.items.length > 0 && <dl className="mt-2">{valuation.items.map((r) => <RatioRow key={r.key} r={r} showPrevious={false} />)}</dl>}
                </section>
                {profitability && <section className="card p-5"><h2 className="text-[15px] font-semibold">{profitability.title}</h2><dl className="mt-2">{profitability.items.slice(0, 5).map((r) => <RatioRow key={r.key} r={r} />)}</dl></section>}
              </div>
            </div>
          </>
        )}

      <section className="card p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-[15px] font-semibold">Latest reports filed</h2><Link href={`/reports/${encodeURIComponent(symbol)}`} className="text-sm font-medium text-brand hover:underline">All reports</Link></div>
        {reports.loading ? <Skeleton className="mt-3 h-24" /> : recent.length === 0 ? <p className="mt-2 text-sm text-muted">No reports found.</p> : (
          <ul className="mt-2">{recent.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-sm first:border-t-0"><span className="min-w-0"><span className="block truncate font-medium">{r.title}</span><span className="text-xs text-muted">{fmtIsoDate(r.date)}</span></span><a href={`https://cdn.cse.lk/${r.path}`} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-brand hover:underline">PDF</a></li>)}</ul>
        )}
      </section>
    </div>
  );
}
