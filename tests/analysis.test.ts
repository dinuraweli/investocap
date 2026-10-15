import { test } from "node:test";
import assert from "node:assert/strict";
import { AnalysisFormatError, derivedRatios, growthPct, validateAnalysis } from "../lib/reports/analysis.ts";

const good = () => ({
  reportType: "interim", periodLabel: "Quarter ended 30 June 2026", periodEnd: "2026-06-30", scope: "Group", currency: "lkr",
  summary: "Revenue grew and profit improved.",
  metrics: [
    { key: "Revenue", label: "Revenue", current: 1200, previous: 1000, previousLabel: "Quarter ended 30 June 2025", unit: "LKR million", page: 3 },
    { key: "net_profit", label: "Net profit", current: 120, previous: 90, unit: "LKR million", page: 3.5 },
    { key: "borrowings", label: "Borrowings", current: 500, previous: 450, unit: "LKR million", page: 5 },
    { key: "total_equity", label: "Equity", current: 1000, previous: 900, unit: "LKR million", page: 5 },
  ],
  highlights: [{ text: "Profit up 33%", page: 3 }, { text: "" }],
  risks: [{ text: "Rising borrowings", severity: "weird" }],
  auditor: { opinion: "not_included" }, outlook: null, notes: ["Figures are unaudited"],
});

test("accepts a good response and normalises it", () => {
  const a = validateAnalysis(good());
  assert.equal(a.currency, "LKR");
  assert.equal(a.metrics[0].key, "revenue"); // lower-cased
  assert.equal(a.metrics[1].page, null); // non-integer page dropped
  assert.equal(a.highlights.length, 1); // empty highlight dropped
  assert.equal(a.risks[0].severity, "medium"); // unknown severity repaired
  assert.equal(a.auditor.opinion, "not_included");
});

test("drops metrics with no readable number and de-duplicates keys", () => {
  const raw = good();
  raw.metrics.push({ key: "eps", label: "EPS", current: null as never, previous: null as never, unit: "LKR", page: 1 });
  raw.metrics.push({ key: "revenue", label: "Revenue again", current: 5, previous: 5, unit: "LKR million", page: 1 });
  const a = validateAnalysis(raw);
  assert.deepEqual(a.metrics.map((m) => m.key), ["revenue", "net_profit", "borrowings", "total_equity"]);
});

test("rejects unusable responses", () => {
  assert.throws(() => validateAnalysis("nope"), AnalysisFormatError);
  assert.throws(() => validateAnalysis({ summary: "" }), AnalysisFormatError);
});

test("bad enums and dates fall back safely instead of failing", () => {
  const a = validateAnalysis({ ...good(), reportType: "??", periodEnd: "June 2026", auditor: { opinion: "great" } });
  assert.equal(a.reportType, "other");
  assert.equal(a.periodEnd, null);
  assert.equal(a.auditor.opinion, "unclear");
});

test("growth is only computed when meaningful", () => {
  assert.equal(growthPct(120, 100), 20);
  assert.equal(growthPct(80, 100), -20);
  assert.equal(growthPct(10, 0), null);
  assert.equal(growthPct(-5, 10), null); // swing into loss
  assert.equal(growthPct(10, -5), null); // swing out of loss
  assert.equal(growthPct(null, 10), null);
});

test("derived ratios are computed by the app, and skipped when units differ", () => {
  const a = validateAnalysis({ ...good(), metrics: [
    { key: "revenue", label: "Revenue", current: 1200, previous: 1000, unit: "LKR million" },
    { key: "net_profit", label: "Net profit", current: 120, previous: 90, unit: "LKR million" },
    { key: "borrowings", label: "Borrowings", current: 500, previous: 450, unit: "LKR million" },
    { key: "total_equity", label: "Equity", current: 1000, previous: 900, unit: "LKR '000" }, // different unit
  ] });
  const r = derivedRatios(a);
  const net = r.find((x) => x.key === "net_margin")!;
  assert.equal(net.current, 10);
  assert.equal(net.previous, 9);
  assert.equal(r.find((x) => x.key === "debt_to_equity"), undefined);
});
