import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateDealings, computeBreadth, moodLabel, reactionTo, txValue, type DealingRecord } from "../lib/sentiment.ts";

const q = (change: number, volume = 0, turnover = 0, price = 10) => ({ change, volume, turnover, price });

test("breadth counts advancers/decliners/unchanged and ignores untraded stocks", () => {
  const b = computeBreadth([q(1), q(2), q(-1), q(0), q(5, 0, 0, 0)], []);
  assert.equal(b.advancers, 2);
  assert.equal(b.decliners, 1);
  assert.equal(b.unchanged, 1); // the price-0 stock is excluded entirely
  assert.equal(b.adRatio, 2);
});

test("volume and turnover shares reflect where the activity is", () => {
  const b = computeBreadth([q(1, 90, 900), q(-1, 10, 100)], [{ change: 1 }, { change: 1 }, { change: -1 }]);
  assert.equal(b.upVolumeShare, 0.9);
  assert.equal(b.upTurnoverShare, 0.9);
  assert.equal(b.sectorsUp, 2);
  assert.equal(b.sectorsDown, 1);
});

test("mood score: a strong broad day scores high, a weak one low, a flat one near 50", () => {
  const strong = computeBreadth([q(1, 96, 920), q(1, 0, 0), q(-1, 4, 80)], [{ change: 1 }, { change: 1 }, { change: -1 }]);
  assert.ok(strong.score >= 75 && strong.label === "Broadly positive", `got ${strong.score}`);
  const weak = computeBreadth([q(-1, 90, 900), q(-1, 0, 0), q(1, 10, 100)], [{ change: -1 }, { change: -1 }]);
  assert.ok(weak.score <= 25 && weak.label === "Broadly negative", `got ${weak.score}`);
  const flat = computeBreadth([q(1, 50, 500), q(-1, 50, 500)], [{ change: 1 }, { change: -1 }]);
  assert.equal(flat.score, 50);
  assert.equal(flat.label, "Mixed");
});

test("empty market gives a neutral 50, not NaN", () => {
  const b = computeBreadth([], []);
  assert.equal(b.score, 50);
  assert.equal(b.adRatio, null);
  assert.equal(b.upVolumeShare, null);
});

test("moodLabel bands", () => {
  assert.equal(moodLabel(60), "Broadly positive");
  assert.equal(moodLabel(59), "Mixed");
  assert.equal(moodLabel(40), "Mixed");
  assert.equal(moodLabel(39), "Broadly negative");
});

test("txValue signs purchases positive, sales negative, ignores unknowns and zeros", () => {
  assert.equal(txValue({ type: "Purchase of Shares", quantity: 100, price: 12 }), 1200);
  assert.equal(txValue({ type: "Sale", quantity: 50, price: 10 }), -500);
  assert.equal(txValue({ type: "Disposal of Shares", quantity: 10, price: 5 }), -50);
  assert.equal(txValue({ type: "Transfer", quantity: 10, price: 5 }), 0);
  assert.equal(txValue({ type: "Purchase", quantity: null, price: 12 }), 0);
});

const rec = (id: number, company: string, txs: { type: string; quantity: number; price: number }[], date = "2026-11-05"): DealingRecord => ({ announcementId: id, company, symbol: null, date, director: "Mr X", transactions: txs });

test("aggregateDealings nets buys vs sells and ranks by absolute value", () => {
  const s = aggregateDealings([
    rec(1, "A PLC", [{ type: "Purchase of Shares", quantity: 1000, price: 10 }]), // +10,000
    rec(2, "B PLC", [{ type: "Sale", quantity: 500, price: 10 }]), // -5,000
    rec(3, "C PLC", [{ type: "Purchase", quantity: 100, price: 2 }, { type: "Sale", quantity: 100, price: 1 }]), // +200 -100 = +100, mixed
    rec(4, "D PLC", [{ type: "Transfer", quantity: 10, price: 10 }]), // nothing quantifiable -> skipped
  ]);
  assert.equal(s.buyValue, 10100);
  assert.equal(s.sellValue, 5000);
  assert.equal(s.netValue, 5100);
  assert.equal(s.buyCount, 2);
  assert.equal(s.sellCount, 1);
  assert.deepEqual(s.lines.map((l) => l.company), ["A PLC", "B PLC", "C PLC"]); // D dropped, sorted by |value|
  assert.equal(s.lines[2].side, "mixed");
  assert.equal(s.bias, "buying");
});

test("dealings bias is balanced when buys and sells are close", () => {
  const s = aggregateDealings([rec(1, "A", [{ type: "Purchase", quantity: 100, price: 10 }]), rec(2, "B", [{ type: "Sale", quantity: 95, price: 10 }])]);
  assert.equal(s.bias, "balanced");
});

const closes = (rows: [string, number][]): [string, number][] => rows;

test("reactionTo measures from the day before the announcement to +holdDays", () => {
  const c = closes([["2026-01-01", 100], ["2026-01-02", 102], ["2026-01-05", 108], ["2026-01-06", 110], ["2026-01-07", 112], ["2026-01-08", 120]]);
  // announcement on 2026-01-05: baseline = 2026-01-02 (102), after +3 trading days = 2026-01-08 (120)
  const r = reactionTo(c, "2026-01-05", 3)!;
  assert.equal(r.baselineDate, "2026-01-02");
  assert.equal(r.baseline, 102);
  assert.equal(r.afterDate, "2026-01-08");
  assert.equal(r.after, 120);
  assert.ok(Math.abs(r.pct - ((120 - 102) / 102) * 100) < 1e-9);
  assert.equal(r.settled, true);
});

test("reactionTo uses the latest close when fewer than holdDays have passed, and marks it unsettled", () => {
  const c = closes([["2026-01-01", 100], ["2026-01-02", 102], ["2026-01-05", 108]]);
  const r = reactionTo(c, "2026-01-05", 5)!;
  assert.equal(r.afterDate, "2026-01-05"); // only the announcement day is available
  assert.equal(r.settled, false);
  assert.equal(r.baseline, 102);
});

test("reactionTo returns null without a usable before/after pair", () => {
  assert.equal(reactionTo([["2026-01-05", 108]], "2026-01-05"), null); // one point
  assert.equal(reactionTo([["2026-01-05", 108], ["2026-01-06", 110]], "2026-01-01", 3), null); // announcement before all data -> no prior day
});
