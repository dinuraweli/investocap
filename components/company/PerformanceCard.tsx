"use client";
import { fmtPct, toneText } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { PerfPeriod } from "@/lib/cse/performance";
import { Skeleton } from "../ui";

/** Price returns over 1 week to 1 year, each next to the ASPI over the same period. */
export default function PerformanceCard({ symbol }: { symbol: string }) {
  const perf = useApi<{ periods: PerfPeriod[] }>(`/api/stocks/${encodeURIComponent(symbol)}/performance`, { refreshMs: 60000 });
  const periods = perf.data?.periods ?? [];
  const max = Math.max(...periods.flatMap((p) => [Math.abs(p.stock ?? 0), Math.abs(p.index ?? 0)]), 1);

  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold">Price performance</h2>
      <p className="mt-0.5 text-sm text-muted">How the share price has moved, next to the ASPI. Price only: dividends are not included.</p>
      {perf.loading ? <Skeleton className="mt-4 h-40" /> : perf.error || periods.length === 0 ? <p className="mt-4 text-sm text-muted">Performance isn&apos;t available right now.</p> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead><tr className="text-xs uppercase tracking-wide text-muted"><th className="py-2 text-left font-medium">Period</th><th className="py-2 text-right font-medium">This stock</th><th className="py-2 text-right font-medium">ASPI</th><th className="py-2 text-right font-medium">Difference</th></tr></thead>
            <tbody>
              {periods.map((p) => {
                const diff = p.stock !== null && p.index !== null ? p.stock - p.index : null;
                return (
                  <tr key={p.key} className="border-t border-line">
                    <td className="py-2.5 text-muted">{p.label}</td>
                    <td className="py-2.5 text-right">
                      <div className={`money font-semibold ${p.stock === null ? "text-muted" : toneText(p.stock)}`}>{p.stock === null ? "–" : fmtPct(p.stock)}</div>
                      {p.stock !== null && <div className="ml-auto mt-1 h-1 w-20 overflow-hidden rounded-full bg-[#eceef2]"><div className={`h-full rounded-full ${p.stock >= 0 ? "bg-gain" : "bg-loss"}`} style={{ width: `${Math.max((Math.abs(p.stock) / max) * 100, 3)}%` }} /></div>}
                    </td>
                    <td className={`money py-2.5 text-right ${p.index === null ? "text-muted" : toneText(p.index)}`}>{p.index === null ? "–" : fmtPct(p.index)}</td>
                    <td className={`money py-2.5 text-right font-medium ${diff === null ? "text-muted" : toneText(diff)}`}>{diff === null ? "–" : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} pts`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
