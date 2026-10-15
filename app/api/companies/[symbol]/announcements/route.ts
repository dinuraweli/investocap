import type { NextRequest } from "next/server";
import { GROUP_LABEL, type AnnouncementGroup } from "@/lib/cse/company";
import { findQuote, getCompanyAnnouncements } from "@/lib/cse/service";
import { BadRequest, handle, json, NotFound } from "@/lib/http";

/** A company's announcements, newest first. `group` filters by type; counts always cover everything. */
export const GET = handle(async (req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) => {
  const quote = await findQuote(decodeURIComponent((await params).symbol));
  if (!quote) throw new NotFound("Unknown symbol");
  const group = req.nextUrl.searchParams.get("group");
  if (group && !(group in GROUP_LABEL)) throw new BadRequest("Unknown group");
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 40, 1), 200);

  const { value: all, stale } = await getCompanyAnnouncements(quote.symbol);
  const counts: Record<string, number> = {};
  for (const a of all) counts[a.group] = (counts[a.group] ?? 0) + 1;
  const filtered = group ? all.filter((a) => a.group === (group as AnnouncementGroup)) : all;
  return json({ symbol: quote.symbol, stale, total: all.length, counts, shown: Math.min(limit, filtered.length), matching: filtered.length, items: filtered.slice(0, limit) });
});
