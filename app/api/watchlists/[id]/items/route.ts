import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { findQuote } from "@/lib/cse/service";
import { addWatchlistItem, removeWatchlistItem } from "@/lib/db/user-data";
import { BadRequest, handle, json, NotFound, readJson, reqString } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { db } = await requireSession();
  const quote = await findQuote(reqString(await readJson(req), "symbol", 30));
  if (!quote) throw new NotFound("Unknown symbol");
  if (!(await addWatchlistItem(db, Number((await params).id), quote.symbol))) throw new NotFound("Watchlist not found");
  return json({ ok: true, symbol: quote.symbol }, { status: 201 });
});

export const DELETE = handle(async (req: NextRequest, { params }: Ctx) => {
  const { db } = await requireSession();
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) throw new BadRequest("symbol query parameter is required");
  await removeWatchlistItem(db, Number((await params).id), symbol.toUpperCase());
  return json({ ok: true });
});
