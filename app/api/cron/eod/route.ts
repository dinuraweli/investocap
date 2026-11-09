import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { snapshotEndOfDay, snapshotSentiment } from "@/lib/cse/service";
import { snapshotFunds } from "@/lib/funds/service";
import { fail, handle, json } from "@/lib/http";

// Runs after market close (14:30 SLT). vercel.json schedules it daily (Mon-Fri 10:00 UTC = 15:30 SLT);
// Vercel Cron calls GET with "Authorization: Bearer $CRON_SECRET". Manual trigger:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/eod
const run = handle(async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(503, "CRON_SECRET is not configured");
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return fail(401, "Unauthorized");
  // Unit-trust NAVs are independent of the stock market; a UTASL failure must not fail the stock snapshot.
  const [market, funds, sentiment] = await Promise.allSettled([snapshotEndOfDay(), snapshotFunds(), snapshotSentiment()]);
  return json({
    market: market.status === "fulfilled" ? market.value : { error: (market.reason as Error).message },
    funds: funds.status === "fulfilled" ? funds.value : { error: (funds.reason as Error).message },
    sentiment: sentiment.status === "fulfilled" ? sentiment.value : { error: (sentiment.reason as Error).message },
  });
});

export const GET = run;
export const POST = run;
