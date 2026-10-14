import { requireSession } from "@/lib/auth";
import { ensureDailyHistory, getQuotes } from "@/lib/cse/service";
import { insertTransactions, listTransactions } from "@/lib/db/user-data";
import { BadRequest, Conflict, handle, json, readJson } from "@/lib/http";
import type { ImportPosition } from "@/lib/import/atrad";
import { computePositions, OversellError } from "@/lib/portfolio";
import { planSync } from "@/lib/sync";
import { colomboDate } from "@/lib/time";

const SYMBOL_RE = /^[A-Z0-9]+\.[A-Z]\d{4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readPositions(v: unknown): ImportPosition[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 500) throw new BadRequest('"positions" must be a list of 1 to 500 holdings');
  const seen = new Set<string>();
  return v.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const symbol = typeof o.symbol === "string" ? o.symbol.trim().toUpperCase() : "";
    if (!SYMBOL_RE.test(symbol)) throw new BadRequest(`Invalid symbol "${String(o.symbol)}"`);
    if (seen.has(symbol)) throw new BadRequest(`Duplicate symbol ${symbol}`);
    seen.add(symbol);
    if (typeof o.quantity !== "number" || !Number.isFinite(o.quantity) || o.quantity <= 0) throw new BadRequest(`Invalid quantity for ${symbol}`);
    if (typeof o.totalCost !== "number" || !Number.isFinite(o.totalCost) || o.totalCost < 0) throw new BadRequest(`Invalid cost for ${symbol}`);
    return { symbol, quantity: o.quantity, totalCost: o.totalCost, unsettledBuy: 0, unsettledSell: 0 };
  });
}

/**
 * Sync holdings from a broker export. Without `apply` it only previews the changes; with `apply: true`
 * it records them as transactions (all or nothing). The file itself never reaches the server: the browser
 * sends just symbol / quantity / total cost.
 */
export const POST = handle(async (req: Request) => {
  const { db } = await requireSession();
  const b = await readJson(req);
  const target = readPositions(b.positions);

  const { value: quotes } = await getQuotes();
  const priceOf = new Map(quotes.map((q) => [q.symbol, q.price]));
  const known = target.filter((p) => priceOf.has(p.symbol));
  const unknown = target.filter((p) => !priceOf.has(p.symbol)).map((p) => p.symbol);

  const txs = await listTransactions(db);
  const { positions: current } = computePositions(txs);
  const plan = planSync(current, known, (s) => {
    const p = priceOf.get(s);
    return p && p > 0 ? p : null;
  });

  const today = colomboDate(Date.now());
  const minDate = txs.length ? txs[txs.length - 1].tradedOn : null; // listTransactions is date-ordered
  if (b.apply !== true) return json({ plan, unknown, today, minDate, existing: txs.length > 0 });

  const asOf = typeof b.asOf === "string" ? b.asOf : today;
  if (!DATE_RE.test(asOf) || Number.isNaN(Date.parse(asOf))) throw new BadRequest('"asOf" must be YYYY-MM-DD');
  if (asOf > today) throw new BadRequest('"asOf" cannot be in the future');
  if (minDate && asOf < minDate) throw new BadRequest(`"asOf" cannot be before your latest recorded trade (${minDate})`);

  const closeSymbols = new Set(Array.isArray(b.closeSymbols) ? b.closeSymbols.filter((s): s is string => typeof s === "string") : []);
  const chosen = plan.filter((c) => c.kind === "open" || c.kind === "buy" || c.kind === "sell" || (c.kind === "close" && closeSymbols.has(c.symbol)));
  if (chosen.length === 0) return json({ applied: 0 });

  const rows = chosen.map((c) => ({
    symbol: c.symbol,
    side: (c.kind === "sell" || c.kind === "close" ? "sell" : "buy") as "buy" | "sell",
    quantity: c.quantity,
    price: c.price,
    fees: 0,
    tradedOn: asOf,
    note: "ATrad sync" as string | null,
  }));
  try {
    computePositions([...txs, ...rows.map((r, i) => ({ ...r, id: Number.MAX_SAFE_INTEGER - rows.length + i }))]); // would anything oversell?
  } catch (e) {
    if (e instanceof OversellError) throw new Conflict(e.message);
    throw e;
  }
  await insertTransactions(db, rows);

  // Backfill price history for the new holdings so charts work straight away (best effort).
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  await Promise.allSettled([...new Set(rows.map((r) => r.symbol))].map((s) => ensureDailyHistory(bySymbol.get(s)!)));
  return json({ applied: rows.length });
});
