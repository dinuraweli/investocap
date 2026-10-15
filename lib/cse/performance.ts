// Price performance of a stock against the ASPI over standard periods. Pure functions.
// Returns are price returns (they do not include dividends).

export interface Point { t: number; price: number }

export type PeriodKey = "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y";
export interface PerfPeriod {
  key: PeriodKey;
  label: string;
  stock: number | null; // % change
  index: number | null; // % change of the ASPI over the same period
}

const DAY = 86400000;
const PERIODS: { key: PeriodKey; label: string; days?: number }[] = [
  { key: "1W", label: "1 week", days: 7 }, { key: "1M", label: "1 month", days: 30 }, { key: "3M", label: "3 months", days: 91 },
  { key: "6M", label: "6 months", days: 182 }, { key: "YTD", label: "Year to date" }, { key: "1Y", label: "1 year", days: 365 },
];

/** Start of the year (Sri Lanka time) that contains `ms`. */
export function startOfYear(ms: number): number {
  const year = new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" }).slice(0, 4);
  return Date.parse(`${year}-01-01T00:00:00+05:30`);
}

/**
 * The price to measure from: the last close on or before `target`. If the history starts a little after the
 * target (within `tolerance`, 5 days by default, e.g. over a weekend), the first point is used. Otherwise there
 * is not enough history.
 */
export function baselineAt(points: Point[], target: number, tolerance = 5 * DAY): Point | null {
  if (points.length === 0) return null;
  let base: Point | null = null;
  for (const p of points) {
    if (p.t <= target) base = p;
    else break;
  }
  if (base) return base;
  return points[0].t - target <= tolerance ? points[0] : null;
}

const change = (points: Point[], target: number, tolerance: number): number | null => {
  const base = baselineAt(points, target, tolerance);
  const end = points[points.length - 1];
  return base && end && base.price > 0 && end.t > base.t ? ((end.price - base.price) / base.price) * 100 : null;
};

/** Both series must be sorted oldest first. `now` is the moment the periods are measured back from. */
export function computePerformance(stock: Point[], index: Point[], now: number): PerfPeriod[] {
  return PERIODS.map((p) => {
    // YTD is measured from the last close of the previous year: just before 1 January.
    const target = p.days === undefined ? startOfYear(now) - 1 : now - p.days * DAY;
    // A series may start a little after the ideal date (the CSE's "1 year" index history is a fixed 240 points, a few
    // days short of a year). Allow about 12% of the period, between 3 and 10 days, so a short period stays strict.
    const periodDays = p.days ?? Math.max((now - target) / DAY, 1);
    const tolerance = Math.min(Math.max(periodDays * 0.12, 3), 10) * DAY;
    return { key: p.key, label: p.label, stock: change(stock, target, tolerance), index: change(index, target, tolerance) };
  });
}
