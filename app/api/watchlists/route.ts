import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getQuotes } from "@/lib/cse/service";
import { sectorOf } from "@/lib/cse/sectors";
import { createWatchlist, getWatchlists } from "@/lib/db/user-data";
import { Conflict, handle, json, readJson, reqString } from "@/lib/http";

export const GET = handle(async (_req: NextRequest) => {
  const { db } = await requireSession();
  const [lists, { value: quotes, fetchedAt, stale }] = await Promise.all([getWatchlists(db), getQuotes()]);
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const watchlists = lists.map((w) => ({
    id: w.id,
    name: w.name,
    stocks: w.symbols.flatMap((s) => {
      const q = bySymbol.get(s);
      return q ? [{ ...q, sector: sectorOf(q.symbol) }] : [];
    }),
  }));
  return json({ fetchedAt, stale, watchlists });
});

export const POST = handle(async (req: Request) => {
  const { db } = await requireSession();
  const name = reqString(await readJson(req), "name", 60);
  const id = await createWatchlist(db, name);
  if (id === null) throw new Conflict("You already have a watchlist with that name");
  return json({ id, name }, { status: 201 });
});
