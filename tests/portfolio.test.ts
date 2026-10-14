import { test } from "node:test";
import assert from "node:assert/strict";
import { computePositions, OversellError, valueSeries, type Tx } from "../lib/portfolio.ts";

const tx = (id: number, side: "buy" | "sell", quantity: number, price: number, tradedOn: string, fees = 0, symbol = "JKH.N0000"): Tx => ({ id, symbol, side, quantity, price, fees, tradedOn });

test("average cost includes buy fees", () => {
  const { positions } = computePositions([tx(1, "buy", 100, 10, "2026-01-01", 5), tx(2, "buy", 100, 20, "2026-01-02", 5)]);
  assert.equal(positions[0].quantity, 200);
  assert.equal(positions[0].costBasis, 3010);
  assert.equal(positions[0].avgCost, 15.05);
});

test("sell realises gain against average cost, net of fees, and keeps avg cost", () => {
  const { positions, realisedTotal } = computePositions([tx(1, "buy", 100, 10, "2026-01-01"), tx(2, "buy", 100, 20, "2026-01-02"), tx(3, "sell", 50, 30, "2026-02-01", 10)]);
  assert.equal(realisedTotal, 50 * 30 - 10 - 50 * 15); // 740
  assert.equal(positions[0].quantity, 150);
  assert.equal(positions[0].avgCost, 15);
});

test("selling everything closes the position but keeps realised P&L", () => {
  const r = computePositions([tx(1, "buy", 10, 100, "2026-01-01"), tx(2, "sell", 10, 120, "2026-01-05")]);
  assert.equal(r.positions.length, 0);
  assert.equal(r.realisedTotal, 200);
});

test("overselling throws", () => {
  assert.throws(() => computePositions([tx(1, "buy", 10, 100, "2026-01-01"), tx(2, "sell", 11, 100, "2026-01-02")]), OversellError);
});

test("order is by trade date, not insertion id", () => {
  assert.throws(() => computePositions([tx(1, "sell", 5, 100, "2026-01-01"), tx(2, "buy", 10, 100, "2026-01-02")]), OversellError);
  const r = computePositions([tx(1, "sell", 5, 100, "2026-01-03"), tx(2, "buy", 10, 100, "2026-01-02")]);
  assert.equal(r.positions[0].quantity, 5);
});

test("value series carries last close over gaps and ignores pre-purchase dates", () => {
  const txs = [tx(1, "buy", 10, 100, "2026-01-02")];
  const closes = { "JKH.N0000": [["2026-01-01", 90], ["2026-01-02", 100], ["2026-01-05", 110]] as [string, number][] };
  const s = valueSeries(txs, closes, ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-05"]);
  assert.deepEqual(s.map((p) => p.value), [0, 1000, 1000, 1100]);
});

import { modifiedDietz } from "../lib/portfolio.ts";

test("modified Dietz treats a mid-window buy as a cash flow, not a gain", () => {
  // Start 1000. Day 5 of 10: buy 500 of stock. End value 1600 => gain 100, base 1000 + 500*0.5.
  const txs = [tx(1, "buy", 50, 10, "2026-01-06")];
  const r = modifiedDietz(txs, "2026-01-01", "2026-01-11", 1000, 1600);
  assert.equal(r.netFlow, 500);
  assert.equal(r.gain, 100);
  assert.equal(r.returnPct, 8);
});

test("modified Dietz: selling out is not a loss", () => {
  const txs = [tx(1, "buy", 100, 10, "2025-12-01"), tx(2, "sell", 100, 10, "2026-01-06")];
  const r = modifiedDietz(txs, "2026-01-01", "2026-01-11", 1000, 0);
  assert.equal(r.gain, 0);
  assert.equal(r.returnPct, 0);
});
