"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { HoldingRow } from "@/lib/api-types";
import { fmtLKR, fmtPct, fmtPrice, fmtSigned, shortSymbol, toneText } from "@/lib/format";
import { sectorColor } from "@/lib/colors";
import { Segmented, Skeleton } from "./ui";

export function SparkBars({ data, up }: { data: number[]; up?: boolean }) {
  if (data.length < 2) return <span className="text-xs text-muted">–</span>;
  const min = Math.min(...data), max = Math.max(...data);
  return (
    <div className="flex h-8 items-end gap-[3px]" aria-hidden>
      {data.map((v, i) => {
        const rising = up ?? (i === 0 ? true : v >= data[i - 1]);
        return <span key={i} className={`w-[4px] rounded-[1px] ${rising ? "bg-gain" : "bg-loss"}`} style={{ height: `${25 + ((v - min) / (max - min || 1)) * 75}%`, opacity: 0.45 + (i / data.length) * 0.55 }} />;
      })}
    </div>
  );
}

export function Badge({ symbol, sector }: { symbol: string; sector?: string }) {
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold text-white" style={{ background: sectorColor(sector ?? symbol) }}>{shortSymbol(symbol).slice(0, 2)}</span>;
}

export default function HoldingsTable({ holdings }: { holdings: HoldingRow[] | null }) {
  const [filter, setFilter] = useState("All");
  const sectors = useMemo(() => ["All", ...new Set((holdings ?? []).map((h) => h.sector))], [holdings]);
  const rows = (holdings ?? []).filter((h) => filter === "All" || h.sector === filter);
  const active = sectors.includes(filter) ? filter : "All";

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">Holdings</h2>
          <p className="mt-0.5 text-sm text-muted">{holdings ? `${rows.length} Position${rows.length === 1 ? "" : "s"}` : "Loading"}</p>
        </div>
        {holdings && holdings.length > 0 && <Segmented options={sectors} value={active} onChange={setFilter} />}
      </div>

      {!holdings ? (
        <div className="space-y-3 p-5 pt-0"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : holdings.length === 0 ? (
        <p className="border-t border-line px-5 py-10 text-center text-sm text-muted">Your positions will appear here once you record a trade.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="bg-subtle text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 text-left font-medium">Asset</th>
                <th className="px-3 py-3 text-right font-medium">Price</th>
                <th className="px-3 py-3 text-right font-medium">24H</th>
                <th className="px-3 py-3 text-right font-medium">Shares</th>
                <th className="px-3 py-3 text-right font-medium">Avg cost</th>
                <th className="px-3 py-3 text-right font-medium">Value</th>
                <th className="px-3 py-3 text-right font-medium">Alloc</th>
                <th className="px-3 py-3 text-center font-medium">7D</th>
                <th className="px-5 py-3 text-right font-medium">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.symbol} className="border-t border-line hover:bg-subtle/60">
                  <td className="px-5 py-4">
                    <Link href={`/stocks/${encodeURIComponent(h.symbol)}`} className="flex items-center gap-3">
                      <Badge symbol={h.symbol} sector={h.sector} />
                      <span className="leading-tight">
                        <span className="block font-semibold">{shortSymbol(h.symbol)}</span>
                        <span className="mt-0.5 block max-w-[200px] truncate text-xs text-muted">{h.name}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="money px-3 py-4 text-right font-semibold">{fmtPrice(h.price)}{h.priceMissing && <span title="No live price; using your cost" className="ml-1 text-warn">*</span>}</td>
                  <td className={`px-3 py-4 text-right font-medium ${toneText(h.changePct)}`}>{fmtPct(h.changePct)}</td>
                  <td className="px-3 py-4 text-right text-muted">{fmtLKR(h.quantity)}</td>
                  <td className="money px-3 py-4 text-right text-muted">{fmtPrice(h.avgCost)}</td>
                  <td className="money px-3 py-4 text-right font-semibold">{fmtLKR(h.value)}</td>
                  <td className="px-3 py-4 text-right text-muted">{h.allocPct.toFixed(1)}%</td>
                  <td className="px-3 py-4"><div className="flex justify-center"><SparkBars data={h.trend7d} /></div></td>
                  <td className="px-5 py-4 text-right">
                    <div className={`money font-semibold ${toneText(h.unrealised)}`}>{fmtSigned(h.unrealised)}</div>
                    <div className={`text-xs ${toneText(h.unrealised)}`}>{fmtPct(h.unrealisedPct)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
