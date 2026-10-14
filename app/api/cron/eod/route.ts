import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { snapshotEndOfDay } from "@/lib/cse/service";
import { fail, handle, json } from "@/lib/http";

// Call after market close (14:30 SLT), e.g. from Vercel Cron / GitHub Actions:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/eod
export const POST = handle(async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(503, "CRON_SECRET is not configured");
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return fail(401, "Unauthorized");
  return json(await snapshotEndOfDay());
});
