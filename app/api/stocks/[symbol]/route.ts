import type { NextRequest } from "next/server";
import { findQuote, getStockDetail } from "@/lib/cse/service";
import { sectorOf } from "@/lib/cse/sectors";
import { handle, json, NotFound } from "@/lib/http";

export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) => {
  const { symbol } = await params;
  const quote = await findQuote(decodeURIComponent(symbol));
  if (!quote) throw new NotFound(`Unknown symbol "${symbol}"`);
  const detail = await getStockDetail(quote.symbol).catch(() => null); // quote alone is still useful
  return json({ quote: { ...quote, sector: sectorOf(quote.symbol) }, detail: detail?.value ?? null, stale: detail?.stale ?? false });
});
