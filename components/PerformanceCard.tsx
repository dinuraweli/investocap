"use client";
import type { PortfolioHistoryResponse, PortfolioResponse } from "@/lib/api-types";
import { fmtLKR, fmtSigned, toneText } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { CardHeader, Skeleton } from "./ui";

export default function PerformanceCard({ portfolio }: { portfolio: PortfolioResponse | null }) {
  const month = useApi<PortfolioHistoryResponse>("/api/portfolio/history?range=1M", { refreshMs: 60000 });
  const year = useApi<PortfolioHistoryResponse>("/api/portfolio/history?range=1Y", { refreshMs: 60000 });

  const has = (portfolio?.holdings.length ?? 0) > 0;
  const enough = (h: PortfolioHistoryResponse | null) => (has && h && h.points.length > 1 ? h : null); // a return needs two points
  const tiles = portfolio ? [
    { label: "Today", pct: has ? portfolio.totals.dayChangePct : undefined, amount: has ? portfolio.totals.dayChange : undefined },
    { label: "1 Month", pct: enough(month.data)?.returnPct, amount: enough(month.data)?.gain },
    { label: "1 Year", pct: enough(year.data)?.returnPct, amount: enough(year.data)?.gain },
  ] : [];

  // Per-sector unrealised return on cost.
  const bySector = new Map<string, { value: number; cost: number }>();
  for (const h of portfolio?.holdings ?? []) {
    const s = bySector.get(h.sector) ?? { value: 0, cost: 0 };
    bySector.set(h.sector, { value: s.value + h.value, cost: s.cost + h.costBasis });
  }
  const sectors = [...bySector].map(([label, s]) => ({ label, pct: s.cost > 0 ? ((s.value - s.cost) / s.cost) * 100 : 0 })).sort((a, b) => b.pct - a.pct);
  const maxAbs = Math.max(...sectors.map((s) => Math.abs(s.pct)), 1);

  return (
    <section className="card p-5">
      <CardHeader title="Performance" />
      {!portfolio ? <Skeleton className="mt-4 h-40" /> : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl bg-subtle px-2 py-3 text-center sm:px-3">
                <div className="text-xs text-muted">{t.label}</div>
                <div className={`money mt-1 text-base font-semibold sm:text-xl ${t.pct === undefined ? "text-muted" : ""}`}>{t.pct === undefined ? "–" : `${t.pct >= 0 ? "+" : ""}${t.pct.toFixed(2)}%`}</div>
                <div className={`mt-1 truncate text-xs font-medium sm:text-sm ${t.amount === undefined ? "text-muted" : toneText(t.amount)}`}>{t.amount === undefined ? " " : `${t.amount >= 0 ? "↑" : "↓"} ${fmtLKR(Math.abs(t.amount))}`}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Returns exclude money you added or withdrew. Sector bars show gain on cost.</p>
          {sectors.length > 0 && (
            <ul className="mt-4 space-y-3.5 text-sm">
              {sectors.map((s) => (
                <li key={s.label} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-muted">{s.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#eceef2]"><div className={`h-full rounded-full ${s.pct >= 0 ? "bg-gain" : "bg-loss"}`} style={{ width: `${Math.max((Math.abs(s.pct) / maxAbs) * 100, 4)}%` }} /></div>
                  <span className={`w-16 text-right font-semibold ${toneText(s.pct)}`}>{s.pct >= 0 ? "+" : ""}{s.pct.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
