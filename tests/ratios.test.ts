import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReportAnalysis, Metric } from "../lib/reports/analysis.ts";
import { buildBridge, buildTrends, computeRatios, computeValuation, growthPct, inferPeriodEnd, reader, trailingEarnings, unitMultiplier, type AnalysisLike } from "../lib/reports/ratios.ts";

// ---- builders (synthetic data only) ----
type M = [key: string, current: number | null, previous?: number | null, unit?: string];
const metrics = (rows: M[]): Metric[] => rows.map(([key, current, previous = null, unit = "LKR million"]) => ({ key, label: key, current, previous, previousLabel: null, unit, page: null }));
const analysis = (rows: M[], o: Partial<ReportAnalysis> = {}): ReportAnalysis => ({
  reportType: "interim", periodLabel: "p", periodEnd: "2026-06-30", periodMonths: 3, scope: "Group", currency: "LKR", summary: "s", metrics: metrics(rows),
  highlights: [], risks: [], auditor: { opinion: "not_included", note: null }, outlook: null, notes: [], history: [], ...o,
});
const like = (rows: M[], o: Partial<ReportAnalysis> = {}, kind: AnalysisLike["kind"] = "quarterly"): AnalysisLike => ({ analysis: analysis(rows, o), kind, reportDate: null });
const item = (g: ReturnType<typeof computeRatios>, key: string) => g.flatMap((x) => x.items).find((i) => i.key === key);

// ---- units ----
test("recognises money scales and rejects non-money units", () => {
  assert.equal(unitMultiplier("LKR million"), 1e6);
  assert.equal(unitMultiplier("Rs. Mn"), 1e6);
  assert.equal(unitMultiplier("Rs. '000"), 1e3);
  assert.equal(unitMultiplier("LKR billion"), 1e9);
  assert.equal(unitMultiplier("LKR"), 1);
  assert.equal(unitMultiplier("%"), null);
  assert.equal(unitMultiplier("times"), null);
  assert.equal(unitMultiplier(""), null);
});

test("reads lines printed in different units on one common scale, and falls back for a missing unit", () => {
  const r = reader(analysis([["revenue", 1200, 1000, "LKR million"], ["total_equity", 500000, 450000, "LKR '000"], ["borrowings", 7, 6, ""], ["eps", 0.5, 0.4, "LKR"]]));
  assert.equal(r("revenue", "current"), 1.2e9);
  assert.equal(r("total_equity", "current"), 5e8); // 500,000 thousand
  assert.equal(r("borrowings", "current"), 7e6); // no unit: assumes the report's most common scale (tied -> first seen wins)
  assert.equal(r("eps", "current"), 0.5); // per-share is never scaled
  assert.equal(r("nope", "current"), null);
});

// ---- ratios ----
test("margins use mixed units correctly and show the comparative period", () => {
  const g = computeRatios(analysis([["revenue", 1200, 1000], ["gross_profit", 360, 250], ["operating_profit", 180, 120], ["net_profit", 120, 90, "LKR million"]]));
  assert.equal(item(g, "gross_margin")!.value, 30);
  assert.equal(item(g, "gross_margin")!.previous, 25);
  assert.equal(item(g, "net_margin")!.value, 10);
  assert.equal(item(g, "net_margin")!.previous, 9);
});

test("gross margin falls back to revenue minus cost of sales", () => {
  const g = computeRatios(analysis([["revenue", 1000], ["cost_of_sales", -700]]));
  assert.equal(item(g, "gross_margin")!.value, 30);
});

test("returns are annualised for a quarter and not for a full year", () => {
  const rows: M[] = [["net_profit", 100], ["total_equity", 2000], ["total_assets", 5000]];
  const q = computeRatios(analysis(rows, { periodMonths: 3 }));
  assert.equal(item(q, "roe")!.value, 20); // 100 x 4 / 2000
  assert.equal(item(q, "roa")!.value, 8);
  const y = computeRatios(analysis(rows, { periodMonths: 12, reportType: "annual" }));
  assert.equal(item(y, "roe")!.value, 5); // 100 / 2000
  assert.equal(item(computeRatios(analysis(rows, { periodMonths: null })), "roe"), undefined); // unknown period length: do not guess
});

test("ROE prefers profit and equity attributable to owners", () => {
  const g = computeRatios(analysis([["net_profit", 100], ["net_profit_attributable_to_owners", 80], ["total_equity", 2000], ["equity_attributable_to_owners", 1600]], { periodMonths: 12 }));
  assert.equal(item(g, "roe")!.value, 5); // 80 / 1600
});

test("leverage and liquidity ratios", () => {
  const g = computeRatios(analysis([
    ["borrowings", 500, 450], ["cash_and_equivalents", 200, 100], ["total_equity", 1000, 900], ["operating_profit", 300], ["finance_costs", -60],
    ["current_assets", 800], ["current_liabilities", 400], ["inventories", 200], ["total_liabilities", 1500],
  ]));
  assert.equal(item(g, "debt_to_equity")!.value, 0.5);
  assert.equal(item(g, "net_debt")!.value, 300e6);
  assert.equal(item(g, "net_debt_to_equity")!.value, 0.3);
  assert.equal(item(g, "interest_cover")!.value, 5); // finance cost sign is ignored
  assert.equal(item(g, "current_ratio")!.value, 2);
  assert.equal(item(g, "quick_ratio")!.value, 1.5);
  assert.equal(item(g, "liabilities_to_equity")!.value, 1.5);
  assert.equal(item(g, "net_debt")!.previous, 350e6);
});

test("cash flow and efficiency: capex sign is ignored, days use the period length", () => {
  const g = computeRatios(analysis([["operating_cash_flow", 150], ["capital_expenditure", -40], ["net_profit", 100], ["revenue", 1000], ["trade_receivables", 200], ["inventories", 90], ["cost_of_sales", -600], ["total_assets", 4000]], { periodMonths: 3 }));
  assert.equal(item(g, "free_cash_flow")!.value, 110e6);
  assert.equal(item(g, "cash_conversion")!.value, 1.5);
  assert.ok(Math.abs(item(g, "receivable_days")!.value! - (200 / 1000) * 91.25) < 1e-9);
  assert.ok(Math.abs(item(g, "inventory_days")!.value! - (90 / 600) * 91.25) < 1e-9);
  assert.equal(item(g, "asset_turnover")!.value, 1); // 1000 x 4 / 4000
});

test("cash conversion is not computed on a loss, and groups with no data are omitted", () => {
  const g = computeRatios(analysis([["operating_cash_flow", 50], ["net_profit", -10]]));
  assert.equal(item(g, "cash_conversion"), undefined);
  assert.equal(g.length, 0);
});

test("bank measures", () => {
  const g = computeRatios(analysis([["operating_expenses", -400], ["total_operating_income", 1000], ["loans_and_advances", 800], ["deposits", 1000], ["npl_ratio", 3.1, 3.6, "%"], ["total_capital_ratio", 17.2, 16.9, "%"]]));
  assert.equal(item(g, "cost_to_income")!.value, 40);
  assert.equal(item(g, "loan_to_deposit")!.value, 80);
  assert.equal(item(g, "npl_ratio")!.value, 3.1);
  assert.equal(g.find((x) => x.id === "bank")!.items.length, 4);
});

test("growth is only computed when meaningful", () => {
  assert.equal(growthPct(120, 100), 20);
  assert.equal(growthPct(10, 0), null);
  assert.equal(growthPct(-5, 10), null);
  assert.equal(growthPct(10, -5), null);
  assert.equal(growthPct(null, 10), null);
});

// ---- trailing earnings and valuation ----
const q = (end: string, eps: number, profit: number, revenue = 1000) => like([["eps", eps], ["net_profit", profit], ["revenue", revenue]], { periodEnd: end, periodMonths: 3 });
const annualOf = (end: string, eps: number, profit: number, equityM = 5000, dps: number | null = null) =>
  like([["eps", eps], ["net_profit", profit], ["revenue", 4000], ["total_equity", equityM], ...(dps === null ? [] : ([["dividend_per_share", dps]] as M[]))], { periodEnd: end, periodMonths: 12, reportType: "annual" }, "annual");

test("four consecutive quarters give trailing-twelve-month earnings", () => {
  const e = trailingEarnings([q("2026-06-30", 0.5, 100), q("2026-03-31", 0.4, 90), q("2025-12-31", 0.6, 110), q("2025-09-30", 0.5, 100)])!;
  assert.equal(e.basis, "ttm");
  assert.ok(Math.abs(e.eps! - 2.0) < 1e-9);
  assert.equal(e.profit, 400e6);
  assert.equal(e.revenue, 4000e6);
});

test("a gap in the quarters falls back to the annual figures", () => {
  const e = trailingEarnings([q("2026-06-30", 0.5, 100), q("2026-03-31", 0.4, 90), q("2025-09-30", 0.5, 100), q("2025-06-30", 0.5, 100), annualOf("2025-03-31", 1.8, 360)])!;
  assert.equal(e.basis, "annual");
  assert.equal(e.eps, 1.8);
});

test("a newer annual report beats older quarters, and a newer quarter run beats an older annual", () => {
  const older4 = [q("2025-12-31", 0.5, 100), q("2025-09-30", 0.5, 100), q("2025-06-30", 0.5, 100), q("2025-03-31", 0.5, 100)];
  assert.equal(trailingEarnings([...older4, annualOf("2026-03-31", 2.5, 500)])!.basis, "annual");
  assert.equal(trailingEarnings([...older4, annualOf("2024-03-31", 2.5, 500)])!.basis, "ttm");
});

test("a single quarter is annualised and labelled as an estimate; nothing gives null", () => {
  const e = trailingEarnings([q("2026-06-30", 0.5, 100)])!;
  assert.equal(e.basis, "annualised");
  assert.equal(e.eps, 2);
  assert.equal(trailingEarnings([]), null);
});

test("valuation: P/E from EPS, P/B and P/S from market cap in rupees, yield from the last annual dividend", () => {
  const items = [annualOf("2026-03-31", 2.0, 400, 5000, 0.5)];
  const v = computeValuation(items, 20, 10e9);
  const by = (k: string) => v.items.find((i) => i.key === k)!;
  assert.equal(by("pe").value, 10);
  assert.equal(by("earnings_yield").value, 10);
  assert.equal(by("pb").value, 2); // 10bn / (5000 million)
  assert.equal(by("ps").value, 2.5); // 10bn / (4000 million)
  assert.equal(by("dividend_yield").value, 2.5);
});

test("a loss gives an explained 'not meaningful' P/E instead of a negative number", () => {
  const v = computeValuation([annualOf("2026-03-31", -0.4, -80)], 20, 10e9);
  const pe = v.items.find((i) => i.key === "pe")!;
  assert.equal(pe.value, null);
  assert.match(pe.note!, /loss/);
});

test("valuation without a price still gives book and sales multiples from market cap, and nothing breaks with no data", () => {
  const v = computeValuation([annualOf("2026-03-31", 2.0, 400)], null, 10e9);
  assert.deepEqual(v.items.map((i) => i.key).sort(), ["pb", "ps"]);
  assert.deepEqual(computeValuation([], 20, 1e9).items, []);
});

// ---- bridge ----
test("bridge goes revenue -> gross -> operating -> pre-tax -> net and its steps add up", () => {
  const b = buildBridge(analysis([["revenue", 1000], ["gross_profit", 400], ["operating_profit", 250], ["profit_before_tax", 200], ["net_profit", 150]]))!;
  assert.deepEqual(b.map((s) => [s.label, s.value, s.kind]), [
    ["Revenue", 1000, "total"], ["Cost of sales", -600, "delta"], ["Gross profit", 400, "total"], ["Operating costs and other income", -150, "delta"], ["Operating profit", 250, "total"],
    ["Finance costs and other", -50, "delta"], ["Profit before tax", 200, "total"], ["Tax", -50, "delta"], ["Net profit", 150, "total"],
  ]);
  const deltas = b.filter((s) => s.kind === "delta").reduce((s, x) => s + x.value, 0);
  assert.equal(b[0].value + deltas, b[b.length - 1].value);
});

test("bridge copes with missing middle levels and refuses when too little is known", () => {
  const b = buildBridge(analysis([["revenue", 1000], ["operating_profit", 250], ["net_profit", 150]]))!;
  assert.deepEqual(b.map((s) => s.label), ["Revenue", "Costs and other items", "Operating profit", "Costs, finance and tax", "Net profit"]);
  assert.equal(buildBridge(analysis([["revenue", 1000], ["net_profit", 150]])), null);
  assert.equal(buildBridge(analysis([["gross_profit", 400], ["operating_profit", 250], ["net_profit", 150]])), null); // must start at revenue
});

test("bridge handles gross profit derived from cost of sales and mixed units", () => {
  const b = buildBridge(analysis([["revenue", 1000], ["cost_of_sales", -600], ["net_profit", 100000, null, "LKR '000"]]))!;
  assert.deepEqual(b.map((s) => s.value), [1000, -600, 400, -300, 100]);
});

// ---- trends ----
test("trends split quarters from years, sort by date, convert units and add margins", () => {
  const t = buildTrends([
    like([["revenue", 1200], ["net_profit", 120], ["eps", 0.5]], { periodEnd: "2026-06-30" }),
    like([["revenue", 1000, null, "LKR '000"], ["net_profit", 80000, null, "LKR '000"]], { periodEnd: "2026-03-31" }),
    annualOf("2026-03-31", 2, 400),
    like([["revenue", 5]], { periodEnd: "2026-09-30", periodMonths: 9 }), // cumulative: excluded from trends
  ]);
  assert.deepEqual(t.quarterly.map((p) => p.periodEnd), ["2026-03-31", "2026-06-30"]);
  assert.equal(t.quarterly[0].label, "Mar 26");
  assert.equal(t.quarterly[0].values.revenue, 1); // 1,000 thousand = 1 million
  assert.equal(t.quarterly[1].values.net_margin, 10);
  assert.equal(t.quarterly[1].values.eps, 0.5);
  assert.deepEqual(t.annual.map((p) => p.label), ["FY26"]);
});

test("history tables fill earlier years but never override a fully analysed year", () => {
  const withHistory = like([["eps", 2], ["net_profit", 400], ["revenue", 4000]], {
    periodEnd: "2026-03-31", periodMonths: 12, reportType: "annual", history: [
      { period: "2024/25", periodEnd: null, values: [{ key: "revenue", value: 3500, unit: "LKR million" }, { key: "net_profit", value: 300, unit: "LKR million" }, { key: "eps", value: 1.5, unit: "LKR" }] },
      { period: "2023/24", periodEnd: "2024-03-31", values: [{ key: "revenue", value: 3000000, unit: "LKR '000" }] },
    ],
  }, "annual");
  const analysedOlder = annualOf("2025-03-31", 9.9, 999);
  const t = buildTrends([withHistory, analysedOlder]);
  assert.deepEqual(t.annual.map((p) => [p.periodEnd, p.source]), [["2024-03-31", "history"], ["2025-03-31", "analysis"], ["2026-03-31", "analysis"]]);
  assert.equal(t.annual[0].values.revenue, 3000); // thousands converted
  assert.equal(t.annual[1].values.eps, 9.9); // the real analysis wins over the summary row
});

test("period ends are inferred from history labels using the report's own year-end", () => {
  assert.equal(inferPeriodEnd("2023/24", "2026-03-31"), "2024-03-31");
  assert.equal(inferPeriodEnd("2023-2024", "2026-03-31"), "2024-03-31");
  assert.equal(inferPeriodEnd("2024", "2025-12-31"), "2024-12-31");
  assert.equal(inferPeriodEnd("FY 2022/2023", "2026-03-31"), "2023-03-31");
  assert.equal(inferPeriodEnd("n/a", "2026-03-31"), null);
  assert.equal(inferPeriodEnd("2023/24", null), null);
});

// ---- legacy analyses (saved before periodMonths / history existed): fields are undefined, not null ----
const legacy = (rows: M[], o: Partial<ReportAnalysis> = {}, kind: AnalysisLike["kind"] = "annual"): AnalysisLike => {
  const a = analysis(rows, { reportType: "annual", periodEnd: "2026-03-31", ...o }) as Partial<ReportAnalysis>;
  delete a.periodMonths; delete a.history;
  return { analysis: a as ReportAnalysis, kind, reportDate: null };
};

test("an annual analysis saved before periodMonths existed is still treated as a full year", () => {
  const items = [legacy([["eps", 2], ["net_profit", 400, null, "LKR '000"], ["revenue", 4000000, null, "LKR '000"], ["total_equity", 5000000, null, "LKR '000"], ["borrowings", 900, null, "LKR million"]])];
  assert.equal(trailingEarnings(items)!.basis, "annual");
  assert.equal(computeValuation(items, 20, 10e9).items.find((i) => i.key === "pe")!.value, 10);
  assert.doesNotThrow(() => buildTrends(items)); // no history field must not crash
  assert.equal(buildTrends(items).annual.length, 1);
  const r = computeRatios(items[0].analysis);
  assert.equal(item(r, "debt_to_equity")!.value, 0.18); // 900 million / 5,000,000 thousand = 900m / 5bn, mixed units
  assert.equal(item(r, "roe")!.value, 400e3 / 5e9 * 100);
});
