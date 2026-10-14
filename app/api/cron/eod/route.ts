import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { snapshotEndOfDay } from "@/lib/cse/service";
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
  return json(await snapshotEndOfDay());
});

export const GET = run;
export const POST = run;
