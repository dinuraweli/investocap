import { test } from "node:test";
import assert from "node:assert/strict";
import { ImportFormatError, parseAtradRows } from "../lib/import/atrad.ts";
import { planSync } from "../lib/sync.ts";

// Synthetic data in the ATrad layout (not real holdings).
const HEADER = ["Security", "Quantity", "Cleared Balance", "Available Balance", "Unsettled Buy", "Unsettled Sell", "Holding % (Quantity)", "Avg Price", "B.E.S Price", "Total Cost"];
const row = (sym: string, qty: number, avg: number, cost: number, ub = 0, us = 0) => [sym, qty, qty, qty, ub, us, 10, avg, avg, cost];

test("parses the ATrad layout: title row, header, holdings, Total row", () => {
  const rows = [["Portfolio () - EQUITY"], [], HEADER, row("AAAA.N0000", 100, 50.5, 5050), row("BBBB.N0000", 20, 10.25, 205), ["Total", null, null, null, null, null, null, null, null, 5255]];
  const { positions, warnings } = parseAtradRows(rows);
  assert.deepEqual(positions.map((p) => [p.symbol, p.quantity, p.totalCost]), [["AAAA.N0000", 100, 5050], ["BBBB.N0000", 20, 205]]);
  assert.equal(warnings.length, 0);
});

test("finds the header by name even if columns move, and ignores rows after Total", () => {
  const rows = [["x"], ["Quantity", "Total Cost", "Security"], [10, 500, "CCCC.N0000"], ["", "", "Total"], [99, 99, "DDDD.N0000"]];
  const { positions } = parseAtradRows(rows);
  assert.deepEqual(positions.map((p) => p.symbol), ["CCCC.N0000"]);
});

test("falls back to avg price x quantity when total cost is missing", () => {
  const { positions } = parseAtradRows([["Security", "Quantity", "Avg Price"], ["EEEE.N0000", 4, 2.5]]);
  assert.equal(positions[0].totalCost, 10);
});

test("skips junk rows with a warning and flags unsettled trades", () => {
  const rows = [HEADER, row("not a symbol", 5, 1, 5), row("FFFF.N0000", 0, 1, 0), row("GGGG.N0000", 10, 1, 10, 3, 0)];
  const { positions, warnings } = parseAtradRows(rows);
  assert.deepEqual(positions.map((p) => p.symbol), ["GGGG.N0000"]);
  assert.equal(warnings.length, 3);
  assert.match(warnings.join(" "), /unsettled/);
});

test("rejects files that are not an ATrad export", () => {
  assert.throws(() => parseAtradRows([["Name", "Email"], ["a", "b"]]), ImportFormatError);
});

const pos = (symbol: string, quantity: number, costBasis: number) => ({ symbol, quantity, costBasis, avgCost: costBasis / quantity });
const imp = (symbol: string, quantity: number, totalCost: number) => ({ symbol, quantity, totalCost, unsettledBuy: 0, unsettledSell: 0 });
const live = (s: string) => ({ "AAAA.N0000": 60, "BBBB.N0000": 12 } as Record<string, number>)[s] ?? null;
const byKind = (cs: ReturnType<typeof planSync>, s: string) => cs.find((c) => c.symbol === s)!;

test("first import opens every position at ATrad's average cost", () => {
  const cs = planSync([], [imp("AAAA.N0000", 100, 5050)], live);
  assert.equal(cs[0].kind, "open");
  assert.equal(cs[0].price, 50.5);
  assert.equal(cs[0].quantity, 100);
});

test("re-sync: unchanged, buys priced so average cost matches, sells at live estimate", () => {
  const current = [pos("AAAA.N0000", 100, 5050), pos("BBBB.N0000", 20, 205), pos("CCCC.N0000", 10, 100)];
  const target = [imp("AAAA.N0000", 100, 5050), imp("BBBB.N0000", 30, 350), imp("CCCC.N0000", 4, 40)];
  const cs = planSync(current, target, live);
  assert.equal(byKind(cs, "AAAA.N0000").kind, "unchanged");
  const buy = byKind(cs, "BBBB.N0000"); // +10 shares, cost 205 -> 350 => 14.5 each
  assert.deepEqual([buy.kind, buy.quantity, buy.price, buy.estimated], ["buy", 10, 14.5, false]);
  const sell = byKind(cs, "CCCC.N0000"); // -6 shares, no live price => falls back to avg cost 10
  assert.deepEqual([sell.kind, sell.quantity, sell.price, sell.estimated], ["sell", 6, 10, true]);
});

test("holdings missing from the file are an opt-in 'close'", () => {
  const cs = planSync([pos("AAAA.N0000", 100, 5050)], [imp("BBBB.N0000", 5, 50)], live);
  const close = byKind(cs, "AAAA.N0000");
  assert.deepEqual([close.kind, close.quantity, close.optional, close.price], ["close", 100, true, 60]);
});

test("odd data is flagged for review instead of guessed", () => {
  const cs = planSync([pos("AAAA.N0000", 10, 100), pos("BBBB.N0000", 10, 100)], [imp("AAAA.N0000", 15, 90), imp("BBBB.N0000", 10, 130)], live);
  assert.equal(byKind(cs, "AAAA.N0000").kind, "review"); // more shares but lower total cost
  assert.equal(byKind(cs, "BBBB.N0000").kind, "review"); // same shares, different cost
});

test("opening price keeps full precision so cost matches the broker to the cent", () => {
  const cs = planSync([], [imp("AAAA.N0000", 15, 12345.67)], live);
  assert.ok(Math.abs(cs[0].quantity * cs[0].price - 12345.67) < 1e-6);
});

test("sub-rupee cost differences are treated as rounding", () => {
  const cs = planSync([pos("AAAA.N0000", 3, 100.004)], [imp("AAAA.N0000", 3, 100.4)], live);
  assert.equal(cs[0].kind, "unchanged");
});
