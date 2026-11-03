import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tx } from "../lib/portfolio.ts";
import { computeHoldingTimeline, firstPurchaseDate, holdingMetrics, sliceByDays } from "../lib/holding.ts";

const tx = (id: number, side: "buy" | "sell", quantity: number, price: number, tradedOn: string, fees = 0, symbol = "ABC.N0000"): Tx => ({ id, symbol, side, quantity, price, fees, tradedOn });
const closes = (rows: [string, number][]): [string, number][] => rows;
const at = (pts: ReturnType<typeof computeHoldingTimeline>, date: string) => pts.find((p) => p.date === date)!;

test("first purchase date ignores sells and picks the earliest buy", () => {
  assert.equal(firstPurchaseDate([tx(2, "buy", 5, 10, "2026-02-01"), tx(1, "buy", 5, 10, "2026-01-10"), tx(3, "sell", 2, 12, "2026-01-05")]), "2026-01-10");
  assert.equal(firstPurchaseDate([tx(1, "sell", 1, 1, "2026-01-01")]), null);
});

test("timeline tracks quantity, cost, market value and gain from the first purchase", () => {
  const txs = [tx(1, "buy", 100, 10, "2026-01-02", 50)]; // cost 1050, avg 10.5
  const pts = computeHoldingTimeline(txs, closes([["2026-01-01", 9], ["2026-01-02", 10], ["2026-01-03", 12], ["2026-01-06", 11]]));
  assert.deepEqual(pts.map((p) => p.date), ["2026-01-02", "2026-01-03", "2026-01-06"]); // nothing before the first buy
  assert.equal(at(pts, "2026-01-02").costBasis, 1050);
  assert.equal(at(pts, "2026-01-02").avgCost, 10.5);
  assert.equal(at(pts, "2026-01-03").marketValue, 1200);
  assert.equal(at(pts, "2026-01-03").gain, 150); // 1200 - 1050
  assert.equal(at(pts, "2026-01-06").dayPL, 100 * (11 - 12)); // -100
});

test("buying more updates the average cost; the avg-cost line steps", () => {
  const txs = [tx(1, "buy", 100, 10, "2026-01-02"), tx(2, "buy", 100, 20, "2026-01-05")];
  const pts = computeHoldingTimeline(txs, closes([["2026-01-02", 10], ["2026-01-05", 20], ["2026-01-06", 21]]));
  assert.equal(at(pts, "2026-01-02").avgCost, 10);
  assert.equal(at(pts, "2026-01-05").avgCost, 15); // (1000 + 2000) / 200
  assert.equal(at(pts, "2026-01-06").quantity, 200);
});

test("a partial sell books realised P/L, keeps avg cost, and gain includes realised", () => {
  const txs = [tx(1, "buy", 100, 10, "2026-01-02"), tx(2, "sell", 40, 15, "2026-01-05", 10)]; // realised = 40*15 - 10 - 40*10 = 190
  const pts = computeHoldingTimeline(txs, closes([["2026-01-02", 10], ["2026-01-05", 15], ["2026-01-06", 16]]));
  const d6 = at(pts, "2026-01-06");
  assert.equal(d6.quantity, 60);
  assert.equal(d6.avgCost, 10); // unchanged by the sell
  assert.equal(d6.realised, 190);
  assert.equal(d6.costBasis, 600);
  assert.equal(d6.gain, 60 * 16 - 600 + 190); // unrealised + realised = 550
});

test("a weekend trade lands on the next trading day", () => {
  const txs = [tx(1, "buy", 10, 100, "2026-01-03")]; // a Saturday
  const pts = computeHoldingTimeline(txs, closes([["2026-01-02", 100], ["2026-01-05", 105]]));
  assert.deepEqual(pts.map((p) => p.date), ["2026-01-05"]); // first held day is the Monday
  assert.equal(at(pts, "2026-01-05").quantity, 10);
});

test("filtering by symbol ignores other holdings", () => {
  const txs = [tx(1, "buy", 10, 10, "2026-01-02", 0, "ABC.N0000"), tx(2, "buy", 5, 50, "2026-01-02", 0, "XYZ.N0000")];
  const pts = computeHoldingTimeline(txs, closes([["2026-01-02", 10]]), "ABC.N0000");
  assert.equal(at(pts, "2026-01-02").costBasis, 100);
});

test("metrics: high/low close and the best and worst days", () => {
  const txs = [tx(1, "buy", 10, 100, "2026-01-02")];
  const pts = computeHoldingTimeline(txs, closes([["2026-01-02", 100], ["2026-01-03", 110], ["2026-01-06", 95], ["2026-01-07", 115]]));
  const m = holdingMetrics(pts);
  assert.equal(m.highClose, 115);
  assert.equal(m.lowClose, 95);
  assert.deepEqual(m.bestDay, { date: "2026-01-07", amount: 200 }); // 10 * (115 - 95)
  assert.deepEqual(m.worstDay, { date: "2026-01-06", amount: -150 }); // 10 * (95 - 110)
  assert.deepEqual(holdingMetrics([]), { highClose: null, lowClose: null, bestDay: null, worstDay: null });
});

test("sliceByDays trims to a trailing window; null keeps everything", () => {
  const txs = [tx(1, "buy", 1, 1, "2026-01-01")];
  const pts = computeHoldingTimeline(txs, closes(Array.from({ length: 40 }, (_, i) => [`2026-02-${String(i + 1).padStart(2, "0")}`.slice(0, 10), 1] as [string, number]).filter((_, i) => i < 28)));
  assert.ok(sliceByDays(pts, 7).length < pts.length);
  assert.equal(sliceByDays(pts, null).length, pts.length);
});

test("duplicate and unsorted close rows are normalised: one point per day, in order", () => {
  const txs = [tx(1, "buy", 10, 100, "2026-01-02")];
  const pts = computeHoldingTimeline(txs, [["2026-01-03", 999], ["2026-01-02", 100], ["2026-01-03", 110], ["2026-01-06", 120]]);
  assert.deepEqual(pts.map((p) => p.date), ["2026-01-02", "2026-01-03", "2026-01-06"]);
  assert.equal(at(pts, "2026-01-03").close, 110); // the later close for that day wins
  assert.ok(pts.every((p, i) => i === 0 || p.date > pts[i - 1].date));
});
