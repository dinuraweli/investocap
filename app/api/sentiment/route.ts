import { after, type NextRequest } from "next/server";
import { getBreadth, getDirectorDealings, getSentimentHistory, getSessionDate, recordSentiment } from "@/lib/cse/service";
import { handle, json } from "@/lib/http";

// Record today's score at most once an hour per instance (the daily cron is the primary writer).
const g = globalThis as unknown as { __sentSnap?: number };

/** Market sentiment: breadth internals + mood score, net director dealings, and the score's history. Public. */
export const GET = handle(async (_req: NextRequest) => {
  const [breadth, dealings, history] = await Promise.all([
    getBreadth(),
    getDirectorDealings().then((r) => ({ ...r.value, stale: r.stale })).catch((e) => { console.warn("[dealings]", (e as Error).message); return null; }),
    getSentimentHistory().then((r) => r.value).catch(() => []),
  ]);
  if (!breadth.stale && breadth.breadth.advancers + breadth.breadth.decliners > 0 && (!g.__sentSnap || Date.now() - g.__sentSnap > 3600_000)) {
    g.__sentSnap = Date.now();
    const date = await getSessionDate().catch(() => null);
    if (date) after(() => recordSentiment(breadth.breadth, date).catch((e) => { g.__sentSnap = undefined; console.error("[sentiment snapshot]", (e as Error).message); }));
    else g.__sentSnap = undefined;
  }
  return json({ breadth: breadth.breadth, dealings, history, fetchedAt: breadth.fetchedAt, stale: breadth.stale });
});
