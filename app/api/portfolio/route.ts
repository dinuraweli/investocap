import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getQuotes } from "@/lib/cse/service";
import { sectorOf } from "@/lib/cse/sectors";
import { recentCloses } from "@/lib/db/market";
import { listTransactions } from "@/lib/db/user-data";
import { handle, json } from "@/lib/http";
import { computePositions } from "@/lib/portfolio";

export const GET = handle(async (_req: NextRequest) => {
  const { db } = await requireSession();
  const { positions, realisedTotal } = computePositions(await listTransactions(db));
  const { value: quotes, fetchedAt, stale } = await getQuotes();
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  // Sparklines are decoration: if the price cache is unavailable, still show the holdings.
  const trends = await recentCloses(positions.map((p) => p.symbol), 7).catch((e) => {
    console.error("[sparklines]", e);
    return {} as Record<string, number[]>;
  });

  const rows = positions.map((p) => {
    const q = bySymbol.get(p.symbol);
    const price = q && q.price > 0 ? q.price : p.avgCost; // unquoted/untraded: fall back to cost
    const value = p.quantity * price;
    return {
      symbol: p.symbol,
      name: q?.name ?? p.symbol,
      sector: sectorOf(p.symbol),
      quantity: p.quantity,
      avgCost: p.avgCost,
      costBasis: p.costBasis,
      price,
      change: q?.change ?? 0,
      changePct: q?.changePct ?? 0,
      priceMissing: !q || q.price <= 0,
      value,
      dayChange: p.quantity * (q?.change ?? 0),
      unrealised: value - p.costBasis,
      unrealisedPct: p.costBasis > 0 ? ((value - p.costBasis) / p.costBasis) * 100 : 0,
      trend7d: trends[p.symbol] ?? [],
    };
  });

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalCost = rows.reduce((s, r) => s + r.costBasis, 0);
  const dayChange = rows.reduce((s, r) => s + r.dayChange, 0);
  const prevValue = totalValue - dayChange;

  const sectors = new Map<string, number>();
  for (const r of rows) sectors.set(r.sector, (sectors.get(r.sector) ?? 0) + r.value);

  return json({
    fetchedAt,
    stale,
    totals: {
      value: totalValue,
      cost: totalCost,
      unrealised: totalValue - totalCost,
      unrealisedPct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
      realised: realisedTotal,
      dayChange,
      dayChangePct: prevValue > 0 ? (dayChange / prevValue) * 100 : 0,
    },
    holdings: rows.map((r) => ({ ...r, allocPct: totalValue > 0 ? (r.value / totalValue) * 100 : 0 })).sort((a, b) => b.value - a.value),
    allocation: [...sectors].map(([sector, value]) => ({ sector, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 })).sort((a, b) => b.value - a.value),
  });
});
