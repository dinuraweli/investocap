import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getCompanyAnnouncements, getQuotes, getStockHistory } from "@/lib/cse/service";
import { colomboDate } from "@/lib/time";
import { listTransactions } from "@/lib/db/user-data";
import { handle, json } from "@/lib/http";
import { computePositions } from "@/lib/portfolio";
import { reactionTo } from "@/lib/sentiment";

const MAX_HOLDINGS = 15;
const WINDOW_DAYS = 90;

/** For the user's holdings, the most recent announcement and the stock's price reaction after it. */
export const GET = handle(async (_req: NextRequest) => {
  const { db } = await requireSession();
  const { positions } = computePositions(await listTransactions(db));
  if (positions.length === 0) return json({ events: [], held: 0 });

  const { value: quotes } = await getQuotes();
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const since = colomboDate(Date.now() - WINDOW_DAYS * 86400000);
  const symbols = positions.map((p) => p.symbol).slice(0, MAX_HOLDINGS);

  const events = (await Promise.all(symbols.map(async (symbol) => {
    const quote = bySymbol.get(symbol);
    if (!quote) return null;
    try {
      const { value: anns } = await getCompanyAnnouncements(symbol);
      const recent = anns.find((a) => a.date && a.date >= since); // list is newest-first
      if (!recent?.date) return null;
      const { points } = await getStockHistory(quote, "ALL");
      const closes: [string, number][] = [...points].sort((a, b) => a.t - b.t).map((p) => [colomboDate(p.t), p.price]);
      if (quote.price > 0) closes.push([colomboDate(Date.now()), quote.price]);
      const reaction = reactionTo(closes, recent.date, 5);
      return reaction ? { symbol, name: quote.name, announcement: { category: recent.category, group: recent.group, date: recent.date }, reaction } : null;
    } catch (e) {
      console.warn("[sentiment holdings]", symbol, (e as Error).message);
      return null;
    }
  }))).filter((e): e is NonNullable<typeof e> => e !== null).sort((a, b) => Math.abs(b.reaction.pct) - Math.abs(a.reaction.pct));

  return json({ events, held: positions.length });
});
