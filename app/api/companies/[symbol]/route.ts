import type { NextRequest } from "next/server";
import { sectorOf } from "@/lib/cse/sectors";
import { findQuote, getCompanyProfile, getStockDetail } from "@/lib/cse/service";
import { handle, json, NotFound } from "@/lib/http";

/** Profile, board and share structure for a company (public CSE data). Either half may be missing if CSE has nothing. */
export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) => {
  const quote = await findQuote(decodeURIComponent((await params).symbol));
  if (!quote) throw new NotFound("Unknown symbol");
  const [profile, detail] = await Promise.all([getCompanyProfile(quote.symbol).catch(() => null), getStockDetail(quote.symbol).catch(() => null)]);
  if (!profile && !detail) throw new Error("CSE company data is unavailable");
  return json({
    symbol: quote.symbol,
    name: quote.name,
    appSector: sectorOf(quote.symbol),
    profile: profile?.value ?? null,
    structure: detail ? { sharesIssued: detail.value.sharesIssued, marketCap: quote.marketCap, marketCapPct: detail.value.marketCapPct, isin: detail.value.isin, listedOn: detail.value.issueDate, beta: detail.value.beta, allTimeHigh: detail.value.allTimeHigh, allTimeLow: detail.value.allTimeLow } : null,
    stale: !!(profile?.stale || detail?.stale),
  });
});
