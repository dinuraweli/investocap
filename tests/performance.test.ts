import { test } from "node:test";
import assert from "node:assert/strict";
import { baselineAt, computePerformance, startOfYear, type Point } from "../lib/cse/performance.ts";
import { selectPeers, type PeerRow } from "../lib/cse/peers.ts";

const DAY = 86400000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00+05:30`);
/** Daily points from `from` for `days` days, price rising by `step` each day from `start`. */
const series = (from: string, days: number, start: number, step: number): Point[] => Array.from({ length: days }, (_, i) => ({ t: at(from) + i * DAY, price: start + i * step }));
const by = (r: ReturnType<typeof computePerformance>, k: string) => r.find((x) => x.key === k)!;

test("measures each period back from the latest close and compares with the index", () => {
  const stock = series("2025-10-01", 380, 100, 1); // +1 per day
  const index = series("2025-10-01", 380, 1000, 2); // +2 per day
  const now = stock[stock.length - 1].t;
  const r = computePerformance(stock, index, now);
  // 1 week: 7 days of +1 on a price of ~479 => (479 - 472)/472
  const end = stock[stock.length - 1].price;
  assert.ok(Math.abs(by(r, "1W").stock! - ((end - (end - 7)) / (end - 7)) * 100) < 1e-9);
  assert.ok(Math.abs(by(r, "1W").index! - ((2 * 7) / (index[index.length - 1].price - 14)) * 100) < 1e-9);
  for (const k of ["1M", "3M", "6M", "1Y", "YTD"]) assert.ok(by(r, k).stock! > 0 && by(r, k).index !== null, k);
  assert.ok(by(r, "1Y").stock! > by(r, "6M").stock! && by(r, "6M").stock! > by(r, "1M").stock!); // longer = bigger for a steady riser
});

test("a fall gives a negative return", () => {
  const down = series("2026-01-01", 200, 200, -0.5);
  const r = computePerformance(down, down, down[down.length - 1].t);
  assert.ok(by(r, "3M").stock! < 0);
});

test("YTD is measured from the last close of the previous year", () => {
  const stock: Point[] = [{ t: at("2025-12-30"), price: 100 }, { t: at("2025-12-31"), price: 110 }, { t: at("2026-01-02"), price: 111 }, { t: at("2026-03-02"), price: 121 }];
  const r = computePerformance(stock, stock, at("2026-03-02"));
  assert.ok(Math.abs(by(r, "YTD").stock! - 10) < 1e-9); // (121 - 110) / 110
  assert.equal(startOfYear(at("2026-03-02")), at("2026-01-01"));
});

test("not enough history gives null for that period only", () => {
  const short = series("2026-09-20", 25, 100, 1); // about 3.5 weeks
  const r = computePerformance(short, short, short[short.length - 1].t);
  assert.notEqual(by(r, "1W").stock, null);
  assert.equal(by(r, "1M").stock, null); // 30 days back is before the data starts by more than 5 days
  assert.equal(by(r, "1Y").stock, null);
  assert.equal(by(r, "YTD").stock, null);
  assert.deepEqual(computePerformance([], [], Date.now()).map((p) => p.stock), [null, null, null, null, null, null]);
});

test("a history that starts just after the target (a weekend) still uses its first point", () => {
  const pts: Point[] = [{ t: at("2026-04-15"), price: 100 }, { t: at("2026-10-14"), price: 130 }];
  assert.equal(baselineAt(pts, at("2026-04-13"))!.price, 100); // 2 days short: acceptable
  assert.equal(baselineAt(pts, at("2026-04-01")), null); // 14 days short: not
});

test("a long period tolerates a history that starts a few days late; a short one does not", () => {
  const now = at("2026-10-15");
  // the CSE's 1-year index series is 240 points and starts about 6 days after a full year
  const late = series("2025-10-21", 360, 100, 0.1);
  const r = computePerformance(late, late, now);
  assert.notEqual(by(r, "1Y").stock, null); // 6 days late on 365: fine
  const lateMonth = series("2026-09-21", 25, 100, 1);
  assert.equal(by(computePerformance(lateMonth, lateMonth, now), "1M").stock, null); // 6 days late on 30: not fine
  const tooLate = series("2025-11-05", 330, 100, 0.1);
  assert.equal(by(computePerformance(tooLate, tooLate, now), "1Y").stock, null); // 21 days late: not fine
});

test("peers: same sector, largest first, never itself, with the sector total", () => {
  const row = (symbol: string, sector: string | null, marketCap: number): PeerRow => ({ symbol, name: symbol, sector, price: 10, changePct: 1, marketCap });
  const rows = [row("A", "Banks", 5), row("B", "Banks", 50), row("C", "Banks", 20), row("D", "Telecom", 99), row("E", null, 1)];
  const p = selectPeers("A", rows, 8);
  assert.equal(p.sector, "Banks");
  assert.deepEqual(p.peers.map((x) => x.symbol), ["B", "C"]);
  assert.equal(p.total, 3);
  assert.deepEqual(selectPeers("A", rows, 1).peers.map((x) => x.symbol), ["B"]);
  assert.deepEqual(selectPeers("E", rows), { sector: null, peers: [], total: 0 }); // unknown sector: no guessing
  assert.deepEqual(selectPeers("ZZ", rows), { sector: null, peers: [], total: 0 });
});
