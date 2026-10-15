import type { NextRequest } from "next/server";
import { findQuote, getCompanyReports } from "@/lib/cse/service";
import { handle, json, NotFound } from "@/lib/http";

/** CSE reports for a stock (public data). */
export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) => {
  const quote = await findQuote(decodeURIComponent((await params).symbol));
  if (!quote) throw new NotFound("Unknown symbol");
  const { value, stale } = await getCompanyReports(quote.symbol);
  return json({ symbol: quote.symbol, name: quote.name, stale, reports: value });
});
