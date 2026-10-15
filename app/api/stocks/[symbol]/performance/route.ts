import type { NextRequest } from "next/server";
import { findQuote, getPerformance } from "@/lib/cse/service";
import { handle, json, NotFound } from "@/lib/http";

/** Price returns over 1 week to 1 year, next to the ASPI over the same periods. Price only: dividends are not included. */
export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) => {
  const quote = await findQuote(decodeURIComponent((await params).symbol));
  if (!quote) throw new NotFound("Unknown symbol");
  return json({ symbol: quote.symbol, ...(await getPerformance(quote)) });
});
