import type { NextRequest } from "next/server";
import { findQuote, getStockHistory, isRange } from "@/lib/cse/service";
import { BadRequest, handle, json, NotFound } from "@/lib/http";

export const GET = handle(async (req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) => {
  const { symbol } = await params;
  const range = (req.nextUrl.searchParams.get("range") ?? "1M").toUpperCase();
  if (!isRange(range)) throw new BadRequest("range must be one of 1D, 1W, 1M, 3M, 1Y, ALL");
  const quote = await findQuote(decodeURIComponent(symbol));
  if (!quote) throw new NotFound(`Unknown symbol "${symbol}"`);
  const { points, stale } = await getStockHistory(quote, range);
  return json({ symbol: quote.symbol, range, stale, points });
});
