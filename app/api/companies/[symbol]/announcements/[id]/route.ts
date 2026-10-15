import type { NextRequest } from "next/server";
import { findQuote, getAnnouncementDetail, getCompanyAnnouncements } from "@/lib/cse/service";
import { handle, json, NotFound } from "@/lib/http";

/** Details of one of the company's announcements (headline, dividend or dealing specifics, documents). */
export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ symbol: string; id: string }> }) => {
  const p = await params;
  const quote = await findQuote(decodeURIComponent(p.symbol));
  if (!quote) throw new NotFound("Unknown symbol");
  const id = Number(p.id);
  const { value: list } = await getCompanyAnnouncements(quote.symbol);
  const item = list.find((a) => a.id === id); // only this company's announcements can be looked up
  if (!item) throw new NotFound("Announcement not found for this company");
  const detail = (await getAnnouncementDetail(id)).value;
  if (!detail) throw new NotFound("The CSE has no details for this announcement");
  return json({ ...detail, category: item.category, group: item.group, docs: detail.docs.map((d) => ({ ...d, url: `https://cdn.cse.lk/${encodeURI(d.path)}` })) });
});
