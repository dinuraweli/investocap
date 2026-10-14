import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { ensureDailyHistory, findQuote, getQuotes, getSessionDate } from "@/lib/cse/service";
import { colomboDate } from "@/lib/time";
import { closesSince } from "@/lib/db/market";
import { listTransactions } from "@/lib/db/user-data";
import { BadRequest, handle, json } from "@/lib/http";
import { computePositions, modifiedDietz, valueSeries } from "@/lib/portfolio";

const DAYS = { "1W": 7, "1M": 30, "3M": 90, "1Y": 365 } as const;

/**
 * Portfolio market value over time, reconstructed from transactions x daily closes.
 * `change` is the raw value change (buys/sells move it); `gain`/`returnPct` strip out cash flows
 * (Modified Dietz) and are the numbers to show as performance.
 */
export const GET = handle(async (req: NextRequest) => {
  const { db } = await requireSession();
  const range = (req.nextUrl.searchParams.get("range") ?? "1M").toUpperCase();
  if (range !== "ALL" && !(range in DAYS)) throw new BadRequest("range must be one of 1W, 1M, 3M, 1Y, ALL (1D is not available for portfolios yet)");

  const txs = await listTransactions(db);
  if (txs.length === 0) return json({ range, points: [], startValue: 0, endValue: 0, change: 0, netFlow: 0, gain: 0, returnPct: 0 });

  const today = colomboDate(Date.now());
  const first = txs[0].tradedOn;
  const from = range === "ALL" ? first : new Date(Date.parse(today) - DAYS[range as keyof typeof DAYS] * 86400000).toISOString().slice(0, 10);
  const start = from > first ? from : first;

  const symbols = [...new Set(txs.map((t) => t.symbol))];
  await Promise.all(symbols.map(async (s) => { const q = await findQuote(s); if (q) await ensureDailyHistory(q).catch(() => {}); }));
  const closes = await closesSince(symbols, start);
  const dates = [...new Set(Object.values(closes).flatMap((rows) => rows.map(([d]) => d)).filter((d) => d >= start))].sort();

  let points = valueSeries(txs, closes, dates).filter((p) => p.value > 0);

  // Replace/append today with the live value.
  const { positions } = computePositions(txs);
  const { value: quotes } = await getQuotes();
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q.price]));
  const live = positions.reduce((s, p) => s + p.quantity * ((bySymbol.get(p.symbol) ?? 0) || p.avgCost), 0);
  const session = await getSessionDate(); // latest trading day, so a closed market never invents a new date
  if (live > 0) points = [...points.filter((p) => p.date !== session), { date: session, value: live }].sort((a, b) => (a.date < b.date ? -1 : 1));

  const startValue = points[0]?.value ?? 0;
  const endValue = points[points.length - 1]?.value ?? 0;
  const perf = points.length > 1 ? modifiedDietz(txs, points[0].date, points[points.length - 1].date, startValue, endValue) : { gain: 0, returnPct: 0, netFlow: 0 };
  return json({ range, points, startValue, endValue, change: endValue - startValue, netFlow: perf.netFlow, gain: perf.gain, returnPct: perf.returnPct });
});
