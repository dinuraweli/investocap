import type { NextRequest } from "next/server";
import { getFunds } from "@/lib/funds/service";
import { handle, json } from "@/lib/http";

/** All Sri Lankan unit trusts with current NAVs (public, from UTASL). Optional ?q= and ?type= filters. */
export const GET = handle(async (req: NextRequest) => {
  const { value, fetchedAt, stale } = await getFunds();
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const type = req.nextUrl.searchParams.get("type")?.trim() ?? "";
  let funds = value;
  if (type) funds = funds.filter((f) => f.type === type);
  if (q) funds = funds.filter((f) => f.name.toLowerCase().includes(q) || f.manager.toLowerCase().includes(q));

  const counts: Record<string, number> = {};
  for (const f of value) counts[f.type] = (counts[f.type] ?? 0) + 1;
  return json({ fetchedAt, stale, total: value.length, counts, managers: [...new Set(value.map((f) => f.manager))].length, funds });
});
