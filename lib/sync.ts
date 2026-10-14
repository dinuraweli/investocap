// Buy/open prices are deliberately NOT rounded: quantity x price must reproduce the broker's total cost exactly.
// Works out which transactions would bring InvestoCap's holdings in line with a broker export.
// The broker file has no trade history, only a snapshot, so the plan is expressed as the minimal
// buys/sells that explain the difference. Pure functions; no I/O.
import type { Position } from "./portfolio.ts";
import type { ImportPosition } from "./import/atrad.ts";

export type ChangeKind = "open" | "buy" | "sell" | "close" | "unchanged" | "review";

export interface Change {
  symbol: string;
  kind: ChangeKind;
  currentQty: number;
  targetQty: number;
  quantity: number; // shares to buy/sell (0 for unchanged/review)
  price: number; // per-share price to record (0 for unchanged/review)
  estimated: boolean; // true when the price is our estimate (a sale price the export does not contain)
  optional: boolean; // true for changes the user must opt in to (selling something missing from the file)
  note: string;
}

const COST_TOLERANCE = 1; // LKR: ignore rounding differences in total cost
const round2 = (n: number) => Math.round(n * 100) / 100; // for display text and estimated sale prices only

export function planSync(current: Position[], target: ImportPosition[], livePrice: (symbol: string) => number | null): Change[] {
  const cur = new Map(current.map((p) => [p.symbol, p]));
  const seen = new Set<string>();
  const out: Change[] = [];

  for (const t of target) {
    seen.add(t.symbol);
    const c = cur.get(t.symbol);
    const q0 = c?.quantity ?? 0;
    const base = { symbol: t.symbol, currentQty: q0, targetQty: t.quantity, optional: false };

    if (!c) {
      out.push({ ...base, kind: "open", quantity: t.quantity, price: t.totalCost / t.quantity, estimated: false, note: "New position at your ATrad average cost." });
    } else if (t.quantity > q0) {
      const delta = t.quantity - q0;
      const costDelta = t.totalCost - c.costBasis;
      if (costDelta > 0) {
        out.push({ ...base, kind: "buy", quantity: delta, price: costDelta / delta, estimated: false, note: "Extra shares bought, priced so your average cost matches ATrad." });
      } else {
        out.push({ ...base, kind: "review", quantity: 0, price: 0, estimated: false, note: "Quantity went up but the total cost did not. Check this one by hand." });
      }
    } else if (t.quantity < q0) {
      const delta = q0 - t.quantity;
      const live = livePrice(t.symbol);
      out.push({ ...base, kind: "sell", quantity: delta, price: live ?? round2(c.avgCost), estimated: true, note: "Shares sold. The export has no sale price, so today's price is used as an estimate." });
    } else if (Math.abs(t.totalCost - c.costBasis) > COST_TOLERANCE) {
      out.push({ ...base, kind: "review", quantity: 0, price: 0, estimated: false, note: `Same quantity but ATrad's cost differs by LKR ${round2(t.totalCost - c.costBasis).toLocaleString("en-US")}. Nothing changed.` });
    } else {
      out.push({ ...base, kind: "unchanged", quantity: 0, price: 0, estimated: false, note: "Already matches." });
    }
  }

  // Held here but absent from the file: probably sold, but it could also be a holding ATrad does not list
  // (e.g. added by hand), so this is opt-in.
  for (const c of current) {
    if (seen.has(c.symbol)) continue;
    out.push({
      symbol: c.symbol, kind: "close", currentQty: c.quantity, targetQty: 0, quantity: c.quantity, price: livePrice(c.symbol) ?? round2(c.avgCost),
      estimated: true, optional: true, note: "Not in this ATrad file. Tick to record it as sold at today's price.",
    });
  }
  return out.sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
}
