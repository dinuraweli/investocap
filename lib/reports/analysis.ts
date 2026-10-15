// The structured result we ask Gemini for, a strict validator for whatever comes back, and the maths
// the app does itself (growth, margins, ratios), so the model only has to READ numbers, never calculate.

export type ReportType = "annual" | "interim" | "other";
export type Severity = "low" | "medium" | "high";
export type AuditorOpinion = "unqualified" | "qualified" | "adverse" | "disclaimer" | "not_included" | "unclear";

export interface Metric {
  key: string; // e.g. "revenue", "net_profit", "eps"
  label: string;
  current: number | null;
  previous: number | null; // comparative period shown in the same report
  previousLabel: string | null; // e.g. "Quarter ended 30 June 2025"
  unit: string; // e.g. "LKR million", "LKR", "%"
  page: number | null; // PDF page the figure was read from
}

export interface Finding {
  text: string;
  page: number | null;
}

export interface Risk extends Finding {
  severity: Severity;
}

export interface ReportAnalysis {
  reportType: ReportType;
  periodLabel: string;
  periodEnd: string | null; // YYYY-MM-DD
  scope: string | null; // "Group" / "Company" / "Group and Company"
  currency: string;
  summary: string;
  metrics: Metric[];
  highlights: Finding[];
  risks: Risk[];
  auditor: { opinion: AuditorOpinion; note: string | null };
  outlook: string | null;
  notes: string[]; // caveats about the data (units, restatements, missing pages ...)
}

export class AnalysisFormatError extends Error {}

// ---- what we send Gemini ----------------------------------------------------------------------

/** Metric keys the model should use when the report contains them, so results compare across companies. */
export const METRIC_KEYS = [
  "revenue", "gross_profit", "operating_profit", "profit_before_tax", "net_profit", "net_profit_attributable_to_owners", "eps",
  "total_assets", "total_liabilities", "total_equity", "borrowings", "cash_and_equivalents", "operating_cash_flow",
  "dividend_per_share", "nav_per_share",
  // banks and finance companies
  "net_interest_income", "impairment_charges", "loans_and_advances", "deposits", "npl_ratio", "total_capital_ratio",
] as const;

export const SYSTEM_PROMPT = `You are a careful financial-statement reader for retail investors in Sri Lanka (Colombo Stock Exchange).
You read ONE company report (a PDF) and return a structured analysis as JSON.

Rules:
- Use ONLY information in the document. Never use outside knowledge, never guess, never estimate. If a figure is not in the document, use null.
- Copy figures exactly as printed, in the units printed. Do NOT convert units or do arithmetic: report the unit in "unit" (for example "LKR million" or "LKR '000"). Negative values (losses, brackets) must be negative numbers.
- Prefer the Group column when both Group and Company are shown, and say which you used in "scope".
- "current" is the period this report is about; "previous" is the comparative column printed in the same report (prior year or prior period) with its description in "previousLabel".
- "page" is the PDF page number (the Nth page of the file, counting from 1) where the figure appears; use null if unsure.
- Use these metric keys when present: ${METRIC_KEYS.join(", ")}. Use another short snake_case key only for an important figure not on the list.
- "summary": 3 to 5 plain-English sentences for a non-expert: what happened this period and the main reasons. No jargon, no hype.
- "highlights": the most important positives and notable facts (max 6). "risks": concerns a careful reader should check (max 6), each with a severity: high only for serious issues such as an auditor qualification, going-concern doubt, covenant breach, large losses or large unusual items.
- "auditor": the auditor's opinion type if an audit report is included; interim statements are usually unaudited, so use "not_included".
- Do NOT give investment advice, ratings, price targets or any buy/sell/hold view. Describe facts only.
- "notes": short caveats a reader should know (restated comparatives, missing pages, unclear units).`;

export const USER_PROMPT = (meta: { company: string; title: string; date: string | null }) =>
  `Company: ${meta.company}\nReport: ${meta.title}${meta.date ? `\nFiled: ${meta.date}` : ""}\n\nRead the attached report and return the JSON analysis.`;

const NUM = { type: "NUMBER", nullable: true } as const;
const INT = { type: "INTEGER", nullable: true } as const;
const STR = { type: "STRING" } as const;
const NSTR = { type: "STRING", nullable: true } as const;

/** Gemini `responseSchema` (OpenAPI subset). */
export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reportType: { type: "STRING", enum: ["annual", "interim", "other"] },
    periodLabel: STR,
    periodEnd: { ...NSTR, description: "YYYY-MM-DD of the period end, or null" },
    scope: NSTR,
    currency: { type: "STRING", description: "ISO code, normally LKR" },
    summary: STR,
    metrics: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { key: STR, label: STR, current: NUM, previous: NUM, previousLabel: NSTR, unit: STR, page: INT },
        required: ["key", "label", "current", "previous", "unit"],
      },
    },
    highlights: { type: "ARRAY", items: { type: "OBJECT", properties: { text: STR, page: INT }, required: ["text"] } },
    risks: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { text: STR, severity: { type: "STRING", enum: ["low", "medium", "high"] }, page: INT }, required: ["text", "severity"] },
    },
    auditor: {
      type: "OBJECT",
      properties: { opinion: { type: "STRING", enum: ["unqualified", "qualified", "adverse", "disclaimer", "not_included", "unclear"] }, note: NSTR },
      required: ["opinion"],
    },
    outlook: NSTR,
    notes: { type: "ARRAY", items: STR },
  },
  required: ["reportType", "periodLabel", "currency", "summary", "metrics", "highlights", "risks", "auditor", "notes"],
} as const;

// ---- validating what comes back ---------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 2000): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pageOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 2000 ? v : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);

/** Validate and clean the model's JSON. Throws AnalysisFormatError if it is unusable; otherwise repairs minor issues. */
export function validateAnalysis(raw: unknown): ReportAnalysis {
  if (!isObj(raw)) throw new AnalysisFormatError("The AI did not return a JSON object.");
  const summary = str(raw.summary, 4000);
  if (!summary) throw new AnalysisFormatError("The AI response had no summary.");

  const metrics: Metric[] = [];
  const seen = new Set<string>();
  for (const m of list(raw.metrics, 60)) {
    if (!isObj(m)) continue;
    const key = str(m.key, 60)?.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "");
    const label = str(m.label, 120);
    if (!key || !label || seen.has(key)) continue;
    const current = numOrNull(m.current);
    const previous = numOrNull(m.previous);
    if (current === null && previous === null) continue; // nothing readable
    seen.add(key);
    metrics.push({ key, label, current, previous, previousLabel: str(m.previousLabel, 120), unit: str(m.unit, 40) ?? "", page: pageOrNull(m.page) });
  }

  const finding = (x: unknown): Finding | null => (isObj(x) && str(x.text, 600) ? { text: str(x.text, 600)!, page: pageOrNull(x.page) } : null);
  const highlights = list(raw.highlights, 8).map(finding).filter((x): x is Finding => !!x);
  const risks: Risk[] = list(raw.risks, 8)
    .map((x) => {
      const f = finding(x);
      return f ? { ...f, severity: oneOf((x as Obj).severity, ["low", "medium", "high"] as const, "medium") } : null;
    })
    .filter((x): x is Risk => !!x);

  const aud = isObj(raw.auditor) ? raw.auditor : {};
  const periodEnd = str(raw.periodEnd, 10);

  return {
    reportType: oneOf(raw.reportType, ["annual", "interim", "other"] as const, "other"),
    periodLabel: str(raw.periodLabel, 160) ?? "Unspecified period",
    periodEnd: periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? periodEnd : null,
    scope: str(raw.scope, 60),
    currency: (str(raw.currency, 8) ?? "LKR").toUpperCase(),
    summary,
    metrics,
    highlights,
    risks,
    auditor: { opinion: oneOf(aud.opinion, ["unqualified", "qualified", "adverse", "disclaimer", "not_included", "unclear"] as const, "unclear"), note: str(aud.note, 400) },
    outlook: str(raw.outlook, 1500),
    notes: list(raw.notes, 8).map((n) => str(n, 300)).filter((n): n is string => !!n),
  };
}

// ---- maths the app does (never the model) -----------------------------------------------------

/** Percentage change from previous to current. null when it is not meaningful (missing, zero, or sign flip). */
export function growthPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  if (previous < 0 || current < 0) return null; // % change across losses is misleading; show the raw figures instead
  return ((current - previous) / previous) * 100;
}

const find = (a: ReportAnalysis, key: string) => a.metrics.find((m) => m.key === key);
const ratio = (num: number | null | undefined, den: number | null | undefined): number | null =>
  num === null || num === undefined || den === null || den === undefined || den === 0 ? null : (num / den) * 100;

export interface DerivedRatio {
  key: string;
  label: string;
  current: number | null;
  previous: number | null;
  suffix: string; // "%" or "x"
}

/** Margins and balance-sheet ratios computed from extracted figures, only when both inputs share a unit. */
export function derivedRatios(a: ReportAnalysis): DerivedRatio[] {
  const out: DerivedRatio[] = [];
  const pair = (label: string, key: string, numKey: string, denKey: string, mode: "pct" | "x") => {
    const n = find(a, numKey);
    const d = find(a, denKey);
    if (!n || !d || n.unit !== d.unit) return;
    const f = (x: number | null, y: number | null) => (mode === "pct" ? ratio(x, y) : x === null || y === null || y === 0 ? null : x / y);
    const cur = f(n.current, d.current);
    const prev = f(n.previous, d.previous);
    if (cur === null && prev === null) return;
    out.push({ key, label, current: cur, previous: prev, suffix: mode === "pct" ? "%" : "x" });
  };
  pair("Gross margin", "gross_margin", "gross_profit", "revenue", "pct");
  pair("Operating margin", "operating_margin", "operating_profit", "revenue", "pct");
  pair("Net margin", "net_margin", "net_profit", "revenue", "pct");
  pair("Borrowings to equity", "debt_to_equity", "borrowings", "total_equity", "x");
  pair("Liabilities to equity", "liabilities_to_equity", "total_liabilities", "total_equity", "x");
  return out;
}
