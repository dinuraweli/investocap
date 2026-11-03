// Reconstructs how one holding has done over time, for the "My Position" view: quantity held, cost basis,
// average cost, market value and gain on every trading day since the first purchase. Pure (no I/O).
// Cost method is average cost, matching lib/portfolio.ts: a buy adds cost + fees; a sell removes shares at the
// average cost and books the difference as realised. "gain" below is unrealised on the shares still held plus
// realised booked so far, so it is the true profit/loss of the position at that date.
import type { Tx } from "./portfolio.ts";

export interface HoldingPoint {
  date: string; // YYYY-MM-DD (a trading day)
  quantity: number;
  costBasis: number; // cost of the shares still held
  avgCost: number; // per share (0 when nothing is held)
  close: number; // market price that day
  marketValue: number; // quantity x close
  realised: number; // realised P/L booked up to and including this day
  gain: number; // marketValue - costBasis + realised
  dayPL: number; // change in the position's value from the previous trading day, from price alone
}

const EPS = 1e-9;
const byDate = (a: Tx, b: Tx) => (a.tradedOn === b.tradedOn ? a.id - b.id : a.tradedOn < b.tradedOn ? -1 : 1);

/** Earliest buy date among the transactions, or null if there are no buys. */
export function firstPurchaseDate(txs: Tx[]): string | null {
  const buys = txs.filter((t) => t.side === "buy").sort(byDate);
  return buys[0]?.tradedOn ?? null;
}

/**
 * Daily timeline from the first purchase to the last close provided. `closes` is date-sorted [date, price]
 * (trading days; the caller may append today's live price as the final entry). Trades are applied on the first
 * trading day on or after their trade date, so a weekend trade lands on the next session.
 */
export function computeHoldingTimeline(txs: Tx[], closes: [string, number][], symbol?: string): HoldingPoint[] {
  const ordered = [...(symbol ? txs.filter((t) => t.symbol === symbol) : txs)].sort(byDate);
  const firstBuy = firstPurchaseDate(ordered);
  if (firstBuy === null || closes.length === 0) return [];
  // Normalise: date-sorted, one close per day (keep the last seen for a day). The CSE series can repeat a day.
  const byDay = new Map<string, number>();
  for (const [d, price] of closes) if (Number.isFinite(price)) byDay.set(d, price);
  const daily = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const points: HoldingPoint[] = [];
  let qty = 0;
  let cost = 0;
  let realised = 0;
  let ti = 0;
  let prevValue: number | null = null;

  for (const [date, close] of daily) {
    if (date < firstBuy) continue;
    // Apply every trade dated on or before this trading day.
    while (ti < ordered.length && ordered[ti].tradedOn <= date) {
      const t = ordered[ti++];
      if (t.side === "buy") {
        qty += t.quantity;
        cost += t.quantity * t.price + t.fees;
      } else {
        const avg = qty > EPS ? cost / qty : 0;
        const sold = Math.min(t.quantity, qty);
        realised += sold * t.price - t.fees - avg * sold;
        qty -= sold;
        cost -= avg * sold;
        if (qty < EPS) { qty = 0; cost = 0; }
      }
    }
    const marketValue = qty * close;
    const value = marketValue; // value of shares held, before cost; used for the day-on-day price move
    points.push({
      date,
      quantity: qty,
      costBasis: cost,
      avgCost: qty > EPS ? cost / qty : 0,
      close,
      marketValue,
      realised,
      gain: marketValue - cost + realised,
      dayPL: prevValue === null ? 0 : qty * (close - (points[points.length - 1]?.close ?? close)),
    });
    prevValue = value;
  }
  return points;
}

export interface HoldingMetrics {
  highClose: number | null;
  lowClose: number | null;
  bestDay: { date: string; amount: number } | null;
  worstDay: { date: string; amount: number } | null;
}

/** High/low price and the best and worst single days for the position, over the given points. */
export function holdingMetrics(points: HoldingPoint[]): HoldingMetrics {
  if (points.length === 0) return { highClose: null, lowClose: null, bestDay: null, worstDay: null };
  let high = -Infinity, low = Infinity;
  let best: { date: string; amount: number } | null = null;
  let worst: { date: string; amount: number } | null = null;
  points.forEach((p, i) => {
    high = Math.max(high, p.close);
    low = Math.min(low, p.close);
    if (i === 0) return; // the first day has no previous close to compare
    if (!best || p.dayPL > best.amount) best = { date: p.date, amount: p.dayPL };
    if (!worst || p.dayPL < worst.amount) worst = { date: p.date, amount: p.dayPL };
  });
  return { highClose: high, lowClose: low, bestDay: best, worstDay: worst };
}

/** Keep only points within `days` of the last point; `days === null` keeps everything (All). YTD handled by the caller. */
export function sliceByDays(points: HoldingPoint[], days: number | null): HoldingPoint[] {
  if (days === null || points.length === 0) return points;
  const last = Date.parse(points[points.length - 1].date);
  const from = last - days * 86400000;
  return points.filter((p) => Date.parse(p.date) >= from);
}
