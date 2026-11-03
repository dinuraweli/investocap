import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { findQuote, getStockHistory } from "@/lib/cse/service";
import { colomboDate } from "@/lib/time";
import { listTransactions } from "@/lib/db/user-data";
import { handle, json, NotFound } from "@/lib/http";
import { computeHoldingTimeline, firstPurchaseDate } from "@/lib/holding";
import { computePositions } from "@/lib/portfolio";

/**
 * The signed-in user's position in one stock, with a daily timeline since the first purchase (quantity, cost,
 * average cost, market value and gain) for the "My Position" charts. Returns `held: false` if they don't own it.
 */
export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) => {
  const { db } = await requireSession();
  const quote = await findQuote(decodeURIComponent((await params).symbol));
  if (!quote) throw new NotFound("Unknown symbol");

  const txs = (await listTransactions(db)).filter((t) => t.symbol === quote.symbol);
  const { positions } = computePositions(txs);
  const pos = positions.find((p) => p.symbol === quote.symbol);
  if (!pos || firstPurchaseDate(txs) === null) return json({ symbol: quote.symbol, name: quote.name, held: false });

  const { points, stale } = await getStockHistory(quote, "ALL");
  const today = colomboDate(Date.now());
  // Daily closes since the first purchase, with today's live price as the final point.
  const closes: [string, number][] = [];
  const seen = new Set<string>();
  for (const p of [...points].sort((a, b) => a.t - b.t)) {
    const d = colomboDate(p.t);
    if (seen.has(d)) { closes[closes.length - 1] = [d, p.price]; continue; } // keep the last close for a day
    seen.add(d);
    closes.push([d, p.price]);
  }
  if (quote.price > 0) {
    if (seen.has(today)) closes[closes.length - 1] = [today, quote.price];
    else closes.push([today, quote.price]);
  }

  const timeline = computeHoldingTimeline(txs, closes, quote.symbol);
  const price = quote.price > 0 ? quote.price : pos.avgCost;
  const marketValue = pos.quantity * price;
  const dayPL = pos.quantity * quote.change;
  return json({
    symbol: quote.symbol,
    name: quote.name,
    held: true,
    firstPurchase: firstPurchaseDate(txs),
    holding: { quantity: pos.quantity, avgCost: pos.avgCost, costBasis: pos.costBasis },
    current: {
      price,
      previousClose: quote.previousClose,
      change: quote.change,
      changePct: quote.changePct,
      priceMissing: quote.price <= 0,
      marketValue,
      unrealised: marketValue - pos.costBasis,
      unrealisedPct: pos.costBasis > 0 ? ((marketValue - pos.costBasis) / pos.costBasis) * 100 : 0,
      dayPL,
    },
    timeline,
    stale,
  });
});
