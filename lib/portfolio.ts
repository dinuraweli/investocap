// Pure portfolio maths. Holdings are always derived from transactions, never stored.
// Cost method: average cost. Fees on a buy are added to cost; fees on a sell reduce proceeds.

export interface Tx {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  tradedOn: string; // YYYY-MM-DD
}

export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number; // per share, includes buy fees
  costBasis: number;
}

export class OversellError extends Error {
  symbol: string;
  held: number;
  attempted: number;
  constructor(symbol: string, held: number, attempted: number) {
    super(`Cannot sell ${attempted} ${symbol}: only ${held} held at that date`);
    this.symbol = symbol;
    this.held = held;
    this.attempted = attempted;
  }
}

const EPS = 1e-9;
const byDate = (a: Tx, b: Tx) => (a.tradedOn === b.tradedOn ? a.id - b.id : a.tradedOn < b.tradedOn ? -1 : 1);

export function computePositions(txs: Tx[]): { positions: Position[]; realisedBySymbol: Record<string, number>; realisedTotal: number } {
  const state = new Map<string, { qty: number; cost: number }>();
  const realisedBySymbol: Record<string, number> = {};

  for (const t of [...txs].sort(byDate)) {
    const s = state.get(t.symbol) ?? { qty: 0, cost: 0 };
    if (t.side === "buy") {
      s.qty += t.quantity;
      s.cost += t.quantity * t.price + t.fees;
    } else {
      if (t.quantity > s.qty + EPS) throw new OversellError(t.symbol, s.qty, t.quantity);
      const avg = s.qty > EPS ? s.cost / s.qty : 0;
      const proceeds = t.quantity * t.price - t.fees;
      realisedBySymbol[t.symbol] = (realisedBySymbol[t.symbol] ?? 0) + proceeds - avg * t.quantity;
      s.qty -= t.quantity;
      s.cost -= avg * t.quantity;
      if (s.qty < EPS) {
        s.qty = 0;
        s.cost = 0;
      }
    }
    state.set(t.symbol, s);
  }

  const positions: Position[] = [];
  for (const [symbol, s] of state) {
    if (s.qty > EPS) positions.push({ symbol, quantity: s.qty, avgCost: s.cost / s.qty, costBasis: s.cost });
  }
  const realisedTotal = Object.values(realisedBySymbol).reduce((a, b) => a + b, 0);
  return { positions, realisedBySymbol, realisedTotal };
}

/** Net quantity per symbol held at the end of `date`. */
export function quantitiesAsOf(txs: Tx[], date: string): Map<string, number> {
  const q = new Map<string, number>();
  for (const t of txs) {
    if (t.tradedOn > date) continue;
    q.set(t.symbol, (q.get(t.symbol) ?? 0) + (t.side === "buy" ? t.quantity : -t.quantity));
  }
  return q;
}

/**
 * Portfolio market value for each date. `closes[symbol]` is a date-sorted array of
 * [date, close]; the last close on or before a date is carried forward over gaps
 * (holidays, suspended trading). Symbols with no price yet contribute nothing.
 */
export function valueSeries(txs: Tx[], closes: Record<string, [string, number][]>, dates: string[]): { date: string; value: number }[] {
  const cursor: Record<string, number> = {};
  return dates.map((date) => {
    let value = 0;
    for (const [symbol, qty] of quantitiesAsOf(txs, date)) {
      if (qty < EPS) continue;
      const series = closes[symbol];
      if (!series?.length) continue;
      let i = cursor[symbol] ?? -1;
      while (i + 1 < series.length && series[i + 1][0] <= date) i++;
      cursor[symbol] = i;
      if (i >= 0) value += qty * series[i][1];
    }
    return { date, value };
  });
}

/**
 * Money-weighted return over (startDate, endDate] using the Modified Dietz method, so buys and
 * sells inside the window are treated as cash flows rather than gains/losses.
 * Flows dated on startDate are already reflected in startValue (values are end-of-day).
 */
export function modifiedDietz(txs: Tx[], startDate: string, endDate: string, startValue: number, endValue: number) {
  const day = 86400000;
  const total = Math.max((Date.parse(endDate) - Date.parse(startDate)) / day, 1);
  let netFlow = 0;
  let weighted = 0;
  for (const t of txs) {
    if (t.tradedOn <= startDate || t.tradedOn > endDate) continue;
    const flow = t.side === "buy" ? t.quantity * t.price + t.fees : -(t.quantity * t.price - t.fees);
    const w = (Date.parse(endDate) - Date.parse(t.tradedOn)) / day / total;
    netFlow += flow;
    weighted += flow * w;
  }
  const gain = endValue - startValue - netFlow;
  const base = startValue + weighted;
  return { gain, returnPct: base > 0 ? (gain / base) * 100 : 0, netFlow };
}
