"use client";
import Link from "next/link";
import type { QuoteWithSector } from "@/lib/api-types";
import { compact, fmtLKR, fmtPct, fmtPrice, shortSymbol, toneText } from "@/lib/format";
import { Badge } from "./HoldingsTable";

export default function StockTable({ stocks, onRemove, empty = "No stocks to show." }: { stocks: QuoteWithSector[]; onRemove?: (symbol: string) => void; empty?: string }) {
  if (stocks.length === 0) return <p className="border-t border-line px-5 py-10 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="bg-subtle text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-3 text-left font-medium">Stock</th>
            <th className="px-3 py-3 text-right font-medium">Price</th>
            <th className="px-3 py-3 text-right font-medium">Change</th>
            <th className="px-3 py-3 text-right font-medium">%</th>
            <th className="px-3 py-3 text-right font-medium">Volume</th>
            <th className="px-3 py-3 text-right font-medium">Turnover</th>
            <th className={`px-3 py-3 text-right font-medium ${onRemove ? "" : "pr-5"}`}>Mkt cap</th>
            {onRemove && <th className="w-12 px-3 py-3" />}
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => (
            <tr key={s.symbol} className="border-t border-line hover:bg-subtle/60">
              <td className="px-5 py-3.5">
                <Link href={`/stocks/${encodeURIComponent(s.symbol)}`} className="flex items-center gap-3">
                  <Badge symbol={s.symbol} sector={s.sector} />
                  <span className="leading-tight">
                    <span className="block font-semibold">{shortSymbol(s.symbol)}</span>
                    <span className="mt-0.5 block max-w-[220px] truncate text-xs text-muted">{s.name}</span>
                  </span>
                </Link>
              </td>
              <td className="money px-3 py-3.5 text-right font-semibold">{fmtPrice(s.price)}</td>
              <td className={`px-3 py-3.5 text-right ${toneText(s.change)}`}>{s.change > 0 ? "+" : ""}{fmtPrice(s.change)}</td>
              <td className={`px-3 py-3.5 text-right font-medium ${toneText(s.changePct)}`}>{fmtPct(s.changePct)}</td>
              <td className="px-3 py-3.5 text-right text-muted">{fmtLKR(s.volume)}</td>
              <td className="px-3 py-3.5 text-right text-muted">{compact(s.turnover)}</td>
              <td className={`px-3 py-3.5 text-right text-muted ${onRemove ? "" : "pr-5"}`}>{compact(s.marketCap)}</td>
              {onRemove && <td className="px-3 py-3.5 text-right"><button onClick={() => onRemove(s.symbol)} aria-label={`Remove ${shortSymbol(s.symbol)}`} className="rounded-lg p-1.5 text-muted hover:bg-loss-soft hover:text-loss">✕</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
