import type { NextRequest } from "next/server";
import { findQuote, getPeers } from "@/lib/cse/service";
import { handle, json, NotFound } from "@/lib/http";

/** Other companies in the same CSE sector, largest first. The sector list fills in over time (`known` of `all` companies). */
export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) => {
  const quote = await findQuote(decodeURIComponent((await params).symbol));
  if (!quote) throw new NotFound("Unknown symbol");
  try {
    return json({ ...(await getPeers(quote)), unavailable: false });
  } catch (e) {
    // Sector data lives in our database; if that is unreachable the rest of the page should still work.
    console.error("[peers]", (e as Error).message);
    return json({ sector: null, peers: [], total: 0, known: 0, all: 0, unavailable: true });
  }
});
