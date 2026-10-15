// Everything numeric that is derived from extracted figures lives here, never in the AI: unit handling,
// ratios, trailing-twelve-month earnings, valuation against the live price, the revenue-to-profit bridge and
// trend series. Pure functions, no I/O.
import type { ReportAnalysis } from "./analysis.ts";

export interface AnalysisLike {
  analysis: ReportAnalysis;
  kind: "annual" | "quarterly" | "other";
  reportDate: string | null;
}

// ---- units ---------------------------------------------------------------------------------------

/** Multiplier that turns a printed amount into rupees ("LKR million" -> 1e6). null if the unit is not a money scale. */
export function unitMultiplier(unit: string): number | null {
  const u = unit.toLowerCase();
  if (/%|percent|\bratio\b|\btimes\b|\bx\b|\bdays?\b/.test(u)) return null;
  if (/billion|\bbn\b/.test(u)) return 1e9;
  if (/million|\bmn\b|\bmio\b|\bm\b/.test(u)) return 1e6;
  if (/'000|’000|\b000s?\b|thousand|\bk\b/.test(u)) return 1e3;
  if (/\b(lkr|rs|rupees?)\b/.test(u)) return 1;
  return null;
}

/** Keys that are already per-share or percentages and must not be scaled by the report's money unit. */
const UNSCALED = new Set(["eps", "dividend_per_share", "nav_per_share", "npl_ratio", "total_capital_ratio"]);

export type Which = "current" | "previous";

/** Reads one analysis in plain rupees, whatever unit each line was printed in. */
export function reader(a: ReportAnalysis) {
  const byKey = new Map(a.metrics.map((m) => [m.key, m]));
  // If a line has no recognisable unit, assume the report's most common money unit.
  const counts = new Map<number, number>();
  for (const m of a.metrics) {
    if (UNSCALED.has(m.key)) continue;
    const mult = unitMultiplier(m.unit);
    if (mult !== null) counts.set(mult, (counts.get(mult) ?? 0) + 1);
  }
  const fallback = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  return (key: string, which: Which): number | null => {
    const m = byKey.get(key);
    const v = m ? m[which] : null;
    if (!m || v === null) return null;
    if (UNSCALED.has(key)) return v;
    const mult = unitMultiplier(m.unit) ?? fallback;
    return mult === null ? null : v * mult;
  };
}

// ---- small maths helpers -------------------------------------------------------------------------

export const growthPct = (current: number | null, previous: number | null): number | null => {
  if (current === null || previous === null || previous === 0) return null;
  if (previous < 0 || current < 0) return null; // % change across losses is misleading; show the raw figures
  return ((current - previous) / previous) * 100;
};
const div = (n: number | null, d: number | null): number | null => (n === null || d === null || d === 0 ? null : n / d);
const pct = (n: number | null, d: number | null): number | null => {
  const r = div(n, d);
  return r === null ? null : r * 100;
};
const sub = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a - b);
const abs = (v: number | null): number | null => (v === null ? null : Math.abs(v));

// ---- ratio groups --------------------------------------------------------------------------------

export type RatioFormat = "pct" | "x" | "days" | "amount";
export interface RatioItem {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  format: RatioFormat; // "amount" values are in rupees
  note?: string;
}
export interface RatioGroup {
  id: "profitability" | "leverage" | "efficiency" | "bank";
  title: string;
  items: RatioItem[];
}

type Get = (key: string) => number | null;
interface Def { id: RatioGroup["id"]; key: string; label: string; format: RatioFormat; note?: string; fn: (g: Get, c: { af: number | null; days: number | null }) => number | null }

const grossProfit = (g: Get) => g("gross_profit") ?? (g("revenue") !== null && g("cost_of_sales") !== null ? g("revenue")! - Math.abs(g("cost_of_sales")!) : null);
const equity = (g: Get) => g("equity_attributable_to_owners") ?? g("total_equity");
const profitToOwners = (g: Get) => g("net_profit_attributable_to_owners") ?? g("net_profit");
const ebitda = (g: Get) => g("ebitda") ?? (g("operating_profit") !== null && g("depreciation_amortisation") !== null ? g("operating_profit")! + Math.abs(g("depreciation_amortisation")!) : null);
const annualised = (v: number | null, af: number | null) => (v === null || af === null ? null : v * af);

const DEFS: Def[] = [
  { id: "profitability", key: "gross_margin", label: "Gross margin", format: "pct", fn: (g) => pct(grossProfit(g), g("revenue")) },
  { id: "profitability", key: "operating_margin", label: "Operating margin", format: "pct", fn: (g) => pct(g("operating_profit"), g("revenue")) },
  { id: "profitability", key: "ebitda_margin", label: "EBITDA margin", format: "pct", fn: (g) => pct(ebitda(g), g("revenue")) },
  { id: "profitability", key: "net_margin", label: "Net margin", format: "pct", fn: (g) => pct(g("net_profit"), g("revenue")) },
  { id: "profitability", key: "roe", label: "Return on equity", format: "pct", note: "Profit to owners over closing equity; quarters are annualised", fn: (g, c) => pct(annualised(profitToOwners(g), c.af), equity(g)) },
  { id: "profitability", key: "roa", label: "Return on assets", format: "pct", note: "Net profit over closing assets; quarters are annualised", fn: (g, c) => pct(annualised(g("net_profit"), c.af), g("total_assets")) },
  { id: "profitability", key: "roce", label: "Return on capital employed", format: "pct", note: "Operating profit over (assets minus current liabilities); quarters are annualised", fn: (g, c) => pct(annualised(g("operating_profit"), c.af), sub(g("total_assets"), g("current_liabilities"))) },

  { id: "leverage", key: "debt_to_equity", label: "Borrowings to equity", format: "x", fn: (g) => div(g("borrowings"), equity(g)) },
  { id: "leverage", key: "net_debt", label: "Net debt", format: "amount", note: "Borrowings minus cash. Negative means more cash than debt", fn: (g) => sub(g("borrowings"), g("cash_and_equivalents")) },
  { id: "leverage", key: "net_debt_to_equity", label: "Net debt to equity", format: "x", fn: (g) => div(sub(g("borrowings"), g("cash_and_equivalents")), equity(g)) },
  { id: "leverage", key: "liabilities_to_equity", label: "Liabilities to equity", format: "x", fn: (g) => div(g("total_liabilities"), equity(g)) },
  { id: "leverage", key: "interest_cover", label: "Interest cover", format: "x", note: "Operating profit over finance costs", fn: (g) => div(g("operating_profit"), abs(g("finance_costs"))) },
  { id: "leverage", key: "current_ratio", label: "Current ratio", format: "x", fn: (g) => div(g("current_assets"), g("current_liabilities")) },
  { id: "leverage", key: "quick_ratio", label: "Quick ratio", format: "x", note: "Current assets excluding inventories, over current liabilities", fn: (g) => div(sub(g("current_assets"), g("inventories")), g("current_liabilities")) },

  { id: "efficiency", key: "free_cash_flow", label: "Free cash flow", format: "amount", note: "Operating cash flow minus capital expenditure", fn: (g) => (g("operating_cash_flow") !== null && g("capital_expenditure") !== null ? g("operating_cash_flow")! - Math.abs(g("capital_expenditure")!) : null) },
  { id: "efficiency", key: "cash_conversion", label: "Cash conversion", format: "x", note: "Operating cash flow per rupee of net profit", fn: (g) => (g("net_profit") !== null && g("net_profit")! > 0 ? div(g("operating_cash_flow"), g("net_profit")) : null) },
  { id: "efficiency", key: "receivable_days", label: "Receivable days", format: "days", fn: (g, c) => (c.days === null ? null : div(g("trade_receivables"), g("revenue")) === null ? null : (g("trade_receivables")! / g("revenue")!) * c.days) },
  { id: "efficiency", key: "inventory_days", label: "Inventory days", format: "days", fn: (g, c) => (c.days === null || g("inventories") === null || g("cost_of_sales") === null || g("cost_of_sales") === 0 ? null : (g("inventories")! / Math.abs(g("cost_of_sales")!)) * c.days) },
  { id: "efficiency", key: "asset_turnover", label: "Asset turnover", format: "x", note: "Annualised revenue over closing assets", fn: (g, c) => div(annualised(g("revenue"), c.af), g("total_assets")) },

  { id: "bank", key: "cost_to_income", label: "Cost to income", format: "pct", fn: (g) => pct(abs(g("operating_expenses")), g("total_operating_income")) },
  { id: "bank", key: "loan_to_deposit", label: "Loans to deposits", format: "pct", fn: (g) => pct(g("loans_and_advances"), g("deposits")) },
  { id: "bank", key: "npl_ratio", label: "Non-performing loans (as reported)", format: "pct", fn: (g) => g("npl_ratio") },
  { id: "bank", key: "total_capital_ratio", label: "Total capital ratio (as reported)", format: "pct", fn: (g) => g("total_capital_ratio") },
];

const GROUP_TITLES: Record<RatioGroup["id"], string> = { profitability: "Profitability and returns", leverage: "Leverage and liquidity", efficiency: "Cash flow and efficiency", bank: "Bank measures" };

export function periodFactors(a: ReportAnalysis): { af: number | null; days: number | null } {
  const months = a.periodMonths ?? (a.reportType === "annual" ? 12 : null); // analyses saved before periodMonths existed have it undefined
  return { af: months ? 12 / months : null, days: months ? (months / 12) * 365 : null };
}

/** All ratios computable from one analysis, with the comparative period alongside. */
export function computeRatios(a: ReportAnalysis): RatioGroup[] {
  const read = reader(a);
  const ctx = periodFactors(a);
  const cur: Get = (k) => read(k, "current");
  const prev: Get = (k) => read(k, "previous");
  const groups = new Map<RatioGroup["id"], RatioItem[]>();
  for (const d of DEFS) {
    const value = d.fn(cur, ctx);
    const previous = d.fn(prev, ctx);
    if (value === null && previous === null) continue;
    const list = groups.get(d.id) ?? [];
    list.push({ key: d.key, label: d.label, value, previous, format: d.format, note: d.note });
    groups.set(d.id, list);
  }
  return (["profitability", "leverage", "efficiency", "bank"] as const).filter((id) => groups.has(id)).map((id) => ({ id, title: GROUP_TITLES[id], items: groups.get(id)! }));
}

// ---- trailing earnings and valuation -------------------------------------------------------------

export interface Earnings {
  basis: "annual" | "ttm" | "annualised";
  label: string;
  periodEnd: string | null;
  eps: number | null;
  profit: number | null; // rupees, to owners where reported
  revenue: number | null; // rupees
}

const monthsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (30.4375 * 86400000);
// `?? null` matters: analyses saved before periodMonths existed have it undefined, not null.
const isQuarter = (x: AnalysisLike) => (x.analysis.periodMonths ?? null) === 3 || ((x.analysis.periodMonths ?? null) === null && x.kind === "quarterly");
const isYear = (x: AnalysisLike) => (x.analysis.periodMonths ?? null) === 12 || ((x.analysis.periodMonths ?? null) === null && x.analysis.reportType === "annual");
const sum = (xs: (number | null)[]): number | null => (xs.some((v) => v === null) ? null : (xs as number[]).reduce((s, v) => s + v, 0));

/** The best available "last twelve months" earnings: four consecutive quarters, else the latest annual, else one quarter annualised. */
export function trailingEarnings(items: AnalysisLike[]): Earnings | null {
  const dated = items.filter((x) => x.analysis.periodEnd).sort((a, b) => (a.analysis.periodEnd! < b.analysis.periodEnd! ? 1 : -1));
  const annual = dated.find(isYear);
  const quarters = dated.filter(isQuarter);

  const figures = (x: AnalysisLike) => {
    const r = reader(x.analysis);
    return { eps: r("eps", "current"), profit: r("net_profit_attributable_to_owners", "current") ?? r("net_profit", "current"), revenue: r("revenue", "current") };
  };

  // newest run of consecutive quarters
  let run: AnalysisLike[] = [];
  for (const q of quarters) {
    if (run.length === 0) { run = [q]; continue; }
    const gap = monthsBetween(q.analysis.periodEnd!, run[run.length - 1].analysis.periodEnd!);
    if (gap >= 2 && gap <= 4) run.push(q);
    else if (run.length < 4) run = [q];
    if (run.length === 4) break;
  }
  const newestQuarter = quarters[0];
  if (run.length === 4 && (!annual || run[0].analysis.periodEnd! > annual.analysis.periodEnd!)) {
    const f = run.map(figures);
    return { basis: "ttm", label: `Last 4 quarters to ${run[0].analysis.periodEnd}`, periodEnd: run[0].analysis.periodEnd, eps: sum(f.map((x) => x.eps)), profit: sum(f.map((x) => x.profit)), revenue: sum(f.map((x) => x.revenue)) };
  }
  if (annual) {
    const f = figures(annual);
    return { basis: "annual", label: `Year to ${annual.analysis.periodEnd}`, ...f, periodEnd: annual.analysis.periodEnd };
  }
  if (newestQuarter) {
    const f = figures(newestQuarter);
    const k = 4;
    return { basis: "annualised", label: `Latest quarter (${newestQuarter.analysis.periodEnd}) x 4, an estimate`, periodEnd: newestQuarter.analysis.periodEnd, eps: f.eps === null ? null : f.eps * k, profit: f.profit === null ? null : f.profit * k, revenue: f.revenue === null ? null : f.revenue * k };
  }
  return null;
}

export interface Valuation {
  earnings: Earnings | null;
  items: RatioItem[];
}

/** P/E, P/B, P/S and yields from the saved analyses and today's price. marketCap is in rupees. */
export function computeValuation(items: AnalysisLike[], price: number | null, marketCap: number | null): Valuation {
  const earnings = trailingEarnings(items);
  const out: RatioItem[] = [];
  const add = (key: string, label: string, value: number | null, format: RatioFormat, note?: string) => { if (value !== null && Number.isFinite(value)) out.push({ key, label, value, previous: null, format, note }); };

  if (price !== null && price > 0 && earnings) {
    if (earnings.eps !== null && earnings.eps <= 0) {
      out.push({ key: "pe", label: "Price to earnings (P/E)", value: null, previous: null, format: "x", note: "Not meaningful: the company made a loss over this period" });
    } else {
      const pe = earnings.eps !== null ? price / earnings.eps : marketCap && earnings.profit && earnings.profit > 0 ? marketCap / earnings.profit : null;
      add("pe", "Price to earnings (P/E)", pe, "x", earnings.basis === "annualised" ? "Estimate from a single quarter" : undefined);
    }
    add("earnings_yield", "Earnings yield", earnings.eps !== null ? (earnings.eps / price) * 100 : null, "pct");
  }
  const newest = items.filter((x) => x.analysis.periodEnd).sort((a, b) => (a.analysis.periodEnd! < b.analysis.periodEnd! ? 1 : -1));
  const withEquity = newest.map((x) => { const r = reader(x.analysis); return r("equity_attributable_to_owners", "current") ?? r("total_equity", "current"); }).find((v) => v !== null && v !== undefined) ?? null;
  if (marketCap && marketCap > 0) {
    add("pb", "Price to book (P/B)", withEquity && withEquity > 0 ? marketCap / withEquity : null, "x", "Market value over equity from the latest balance sheet");
    add("ps", "Price to sales (P/S)", earnings?.revenue && earnings.revenue > 0 ? marketCap / earnings.revenue : null, "x");
  }
  const annualDps = newest.filter(isYear).map((x) => reader(x.analysis)("dividend_per_share", "current")).find((v) => v !== null && v !== undefined) ?? null;
  if (price !== null && price > 0 && annualDps !== null) add("dividend_yield", "Dividend yield", (annualDps / price) * 100, "pct", "Last annual dividend per share over today's price");
  return { earnings, items: out };
}

// ---- revenue to profit bridge --------------------------------------------------------------------

export interface BridgeStep {
  label: string;
  value: number; // LKR million; a signed change for "delta" steps, a running level for "total" steps
  kind: "total" | "delta";
}

const LEVELS: { key: string; label: string; get: (g: Get) => number | null }[] = [
  { key: "revenue", label: "Revenue", get: (g) => g("revenue") },
  { key: "gross_profit", label: "Gross profit", get: grossProfit },
  { key: "operating_profit", label: "Operating profit", get: (g) => g("operating_profit") },
  { key: "profit_before_tax", label: "Profit before tax", get: (g) => g("profit_before_tax") },
  { key: "net_profit", label: "Net profit", get: (g) => g("net_profit") },
];
const DELTA_LABEL: Record<string, string> = {
  "revenue>gross_profit": "Cost of sales", "gross_profit>operating_profit": "Operating costs and other income", "operating_profit>profit_before_tax": "Finance costs and other", "profit_before_tax>net_profit": "Tax",
};

/** Waterfall from revenue down to net profit using whichever of the five levels the report gave. null if fewer than three. */
export function buildBridge(a: ReportAnalysis): BridgeStep[] | null {
  const read = reader(a);
  const g: Get = (k) => read(k, "current");
  const known = LEVELS.map((l) => ({ ...l, v: l.get(g) })).filter((l) => l.v !== null) as { key: string; label: string; v: number }[];
  if (known.length < 3 || known[0].key !== "revenue" || known[known.length - 1].key !== "net_profit") return null;
  const M = 1e6;
  const steps: BridgeStep[] = [{ label: known[0].label, value: known[0].v / M, kind: "total" }];
  for (let i = 1; i < known.length; i++) {
    const from = known[i - 1];
    const to = known[i];
    const label = DELTA_LABEL[`${from.key}>${to.key}`] ?? (to.key === "net_profit" ? "Costs, finance and tax" : "Costs and other items");
    steps.push({ label, value: (to.v - from.v) / M, kind: "delta" });
    if (i < known.length - 1) steps.push({ label: to.label, value: to.v / M, kind: "total" });
  }
  steps.push({ label: known[known.length - 1].label, value: known[known.length - 1].v / M, kind: "total" });
  return steps;
}

// ---- trends across reports -----------------------------------------------------------------------

export interface TrendPoint {
  periodEnd: string; // YYYY-MM-DD
  label: string; // "Jun 26" or "FY26"
  values: Record<string, number>; // amounts in LKR million; eps / dps / nav in rupees; margins in %
  source: "analysis" | "history";
}
export interface Trends { quarterly: TrendPoint[]; annual: TrendPoint[] }

const TREND_KEYS = ["revenue", "gross_profit", "operating_profit", "net_profit", "eps", "total_assets", "total_equity", "borrowings", "operating_cash_flow", "dividend_per_share", "nav_per_share"] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const quarterLabel = (end: string) => `${MONTHS[Number(end.slice(5, 7)) - 1]} ${end.slice(2, 4)}`;
export const yearLabel = (end: string) => `FY${end.slice(2, 4)}`;

function withMargins(values: Record<string, number>) {
  if (values.revenue) {
    if (values.gross_profit !== undefined) values.gross_margin = (values.gross_profit / values.revenue) * 100;
    if (values.operating_profit !== undefined) values.operating_margin = (values.operating_profit / values.revenue) * 100;
    if (values.net_profit !== undefined) values.net_margin = (values.net_profit / values.revenue) * 100;
  }
  return values;
}

/** Work out a period end for a history column like "2023/24" or "2024", using the report's own year-end month and day. */
export function inferPeriodEnd(period: string, anchorEnd: string | null): string | null {
  if (!anchorEnd) return null;
  const md = anchorEnd.slice(4); // "-03-31"
  const two = period.match(/(\d{4})\s*[\/-]\s*(\d{2,4})/);
  if (two) {
    const endYear = two[2].length === 4 ? two[2] : two[1].slice(0, 2) + two[2];
    return `${endYear}${md}`;
  }
  const one = period.match(/\b(19|20)\d{2}\b/);
  return one ? `${one[0]}${md}` : null;
}

/** Quarterly and annual series from every saved analysis, plus the multi-year tables inside annual reports. */
export function buildTrends(items: AnalysisLike[]): Trends {
  const quarterly = new Map<string, TrendPoint>();
  const annual = new Map<string, TrendPoint>();

  for (const x of items) {
    const a = x.analysis;
    if (!a.periodEnd) continue;
    const bucket = isQuarter(x) ? quarterly : isYear(x) ? annual : null;
    if (!bucket) continue;
    const read = reader(a);
    const values: Record<string, number> = {};
    for (const k of TREND_KEYS) {
      const raw = read(k, "current");
      if (raw === null) continue;
      values[k] = ["eps", "dividend_per_share", "nav_per_share"].includes(k) ? raw : raw / 1e6;
    }
    if (Object.keys(values).length === 0) continue;
    bucket.set(a.periodEnd, { periodEnd: a.periodEnd, label: bucket === quarterly ? quarterLabel(a.periodEnd) : yearLabel(a.periodEnd), values: withMargins(values), source: "analysis" });
  }

  // Earlier years from the summary tables, without overriding a full analysis of the same year.
  for (const x of items) {
    if (!isYear(x)) continue;
    for (const h of x.analysis.history ?? []) {
      const end = h.periodEnd ?? inferPeriodEnd(h.period, x.analysis.periodEnd);
      if (!end || annual.has(end)) continue;
      const values: Record<string, number> = {};
      for (const v of h.values) {
        if (!(TREND_KEYS as readonly string[]).includes(v.key)) continue;
        if (["eps", "dividend_per_share", "nav_per_share"].includes(v.key)) values[v.key] = v.value;
        else { const m = unitMultiplier(v.unit) ?? 1e6; values[v.key] = (v.value * m) / 1e6; }
      }
      if (Object.keys(values).length) annual.set(end, { periodEnd: end, label: yearLabel(end), values: withMargins(values), source: "history" });
    }
  }
  const sort = (m: Map<string, TrendPoint>) => [...m.values()].sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
  return { quarterly: sort(quarterly), annual: sort(annual) };
}
