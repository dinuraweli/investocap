import type { NextRequest } from "next/server";
import { getFund, getFundHistory } from "@/lib/funds/service";
import { handle, json, NotFound } from "@/lib/http";

/** One fund's current NAV plus the NAV history we've snapshotted. */
export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) => {
  const slug = decodeURIComponent((await params).slug);
  const fund = (await getFund(slug)).value;
  if (!fund) throw new NotFound("Unknown fund");
  const history = (await getFundHistory(slug)).value;
  return json({ fund, history });
});
