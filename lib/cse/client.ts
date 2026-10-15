// Thin client for the unofficial cse.lk JSON API. The browser never calls cse.lk
// directly (CORS + required Origin/Referer headers); everything goes through here.
// Normalisers throw CseShapeError when the payload no longer matches what we expect,
// so a CSE-side change fails loudly instead of producing silent garbage.

import type {
  ActiveStock,
  IndexValue,
  MarketSummary,
  Mover,
  PeriodCode,
  PricePoint,
  Quote,
  SectorIndex,
  StockDetail,
} from "./types.ts";

const BASE = "https://www.cse.lk/api";

export class CseError extends Error {}
export class CseShapeError extends CseError {}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/x-www-form-urlencoded",
  Origin: "https://www.cse.lk",
  Referer: "https://www.cse.lk/",
};

async function post(endpoint: string, params?: Record<string, string | number>, opts: { timeoutMs?: number; retries?: number } = {}): Promise<unknown> {
  const { timeoutMs = 15000, retries = 2 } = opts;
  const body = params ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}/${endpoint}`, {
        method: "POST",
        headers: HEADERS,
        body,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (res.status >= 500) throw new CseError(`${endpoint}: HTTP ${res.status}`);
      if (!res.ok) throw new CseError(`${endpoint}: HTTP ${res.status}`);
      if (res.status === 204) return null; // e.g. marketSummery before the first trade of the day
      const json = await res.json();
      const apiError = (json as { apierror?: { message?: string } } | null)?.apierror;
      if (apiError) throw new CseShapeError(`${endpoint}: ${apiError.message ?? "API error"}`);
      return json;
    } catch (e) {
      lastErr = e;
      if (e instanceof CseShapeError) break; // bad request, retrying will not help
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new CseError(String(lastErr));
}

// ---- tiny validators -------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new CseShapeError(`${what}: expected array`);
  return v;
}
function obj(v: unknown, what: string): Obj {
  if (!isObj(v)) throw new CseShapeError(`${what}: expected object`);
  return v;
}
/** Required finite number. */
function num(o: Obj, key: string, what: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new CseShapeError(`${what}: "${key}" is not a number`);
  return v;
}
/** Optional number; null/undefined become the fallback. */
function numOr<T extends number | null>(o: Obj, key: string, fallback: T): number | T {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function str(o: Obj, key: string, what: string): string {
  const v = o[key];
  if (typeof v !== "string" || !v) throw new CseShapeError(`${what}: "${key}" is not a string`);
  return v;
}
const strOrNull = (o: Obj, key: string) => (typeof o[key] === "string" && o[key] ? (o[key] as string) : null);

// ---- endpoints -------------------------------------------------------------

export function normaliseQuote(raw: unknown): Quote {
  const o = obj(raw, "tradeSummary item");
  return {
    id: num(o, "id", "quote"),
    symbol: str(o, "symbol", "quote"),
    name: str(o, "name", "quote"),
    price: numOr(o, "price", 0),
    change: numOr(o, "change", 0),
    changePct: numOr(o, "percentageChange", 0),
    previousClose: numOr(o, "previousClose", 0),
    high: numOr(o, "high", 0),
    low: numOr(o, "low", 0),
    volume: numOr(o, "sharevolume", 0),
    trades: numOr(o, "tradevolume", 0),
    turnover: numOr(o, "turnover", 0),
    marketCap: numOr(o, "marketCap", 0),
    lastTradedAt: numOr(o, "lastTradedTime", null),
  };
}

export async function fetchQuotes(): Promise<Quote[]> {
  const json = obj(await post("tradeSummary"), "tradeSummary");
  const list = arr(json.reqTradeSummery, "tradeSummary.reqTradeSummery");
  // Legitimately empty before the market opens ("Pre Trading"); callers fall back to the last known prices.
  return list.map(normaliseQuote);
}

/** null when CSE has no index value yet (HTTP 204 before the market opens). */
function normaliseIndex(raw: unknown, what: string): IndexValue | null {
  if (raw === null) return null;
  const o = obj(raw, what);
  return {
    value: num(o, "value", what),
    high: numOr(o, "highValue", 0),
    low: numOr(o, "lowValue", 0),
    change: numOr(o, "change", 0),
    changePct: numOr(o, "percentage", 0),
    at: numOr(o, "timestamp", Date.now()),
  };
}
export const fetchAspi = async () => normaliseIndex(await post("aspiData"), "aspiData");
export const fetchSl20 = async () => normaliseIndex(await post("snpData"), "snpData");

export async function fetchMarketStatus(): Promise<{ status: string; open: boolean }> {
  const o = obj(await post("marketStatus"), "marketStatus");
  const status = str(o, "status", "marketStatus");
  // CSE reports "Pre Trading", "Regular Trading" (the live session), "Market Closed"; treat only an active session as open.
  return { status, open: /regular|\bopen\b/i.test(status) && !/closed|pre/i.test(status) };
}

export async function fetchMarketSummary(): Promise<MarketSummary> {
  const raw = await post("marketSummery");
  if (raw === null) return { turnover: 0, shareVolume: 0, trades: 0, at: Date.now() }; // nothing traded yet today
  const o = obj(raw, "marketSummery");
  return {
    turnover: num(o, "tradeVolume", "marketSummery"),
    shareVolume: num(o, "shareVolume", "marketSummery"),
    trades: num(o, "trades", "marketSummery"),
    at: numOr(o, "tradeDate", Date.now()),
  };
}

const mover = (raw: unknown): Mover => {
  const o = obj(raw, "mover");
  return { symbol: str(o, "symbol", "mover"), price: num(o, "price", "mover"), change: numOr(o, "change", 0), changePct: numOr(o, "changePercentage", 0) };
};
export const fetchGainers = async () => arr(await post("topGainers"), "topGainers").map(mover);
export const fetchLosers = async () => arr(await post("topLooses"), "topLooses").map(mover);

export async function fetchMostActive(): Promise<ActiveStock[]> {
  return arr(await post("mostActiveTrades"), "mostActiveTrades").map((raw) => {
    const o = obj(raw, "mostActive");
    return { symbol: str(o, "symbol", "mostActive"), shareVolume: numOr(o, "shareVolume", 0), trades: numOr(o, "tradeVolume", 0), turnover: numOr(o, "turnover", 0) };
  });
}

export async function fetchSectors(): Promise<SectorIndex[]> {
  return arr(await post("allSectors"), "allSectors").map((raw) => {
    const o = obj(raw, "sector");
    return {
      code: str(o, "symbol", "sector"),
      name: str(o, "name", "sector"),
      value: numOr(o, "indexValue", 0),
      change: numOr(o, "change", 0),
      changePct: numOr(o, "percentage", 0),
      turnover: numOr(o, "sectorTurnoverToday", 0),
    };
  });
}

export async function fetchStockDetail(symbol: string): Promise<StockDetail> {
  const json = obj(await post("companyInfoSummery", { symbol }), "companyInfoSummery");
  const o = obj(json.reqSymbolInfo, "companyInfoSummery.reqSymbolInfo");
  const beta = isObj(json.reqSymbolBetaInfo) ? numOr(json.reqSymbolBetaInfo, "betaValueSPSL", null) : null;
  return {
    symbol: str(o, "symbol", "detail"),
    name: str(o, "name", "detail"),
    isin: strOrNull(o, "isin"),
    issueDate: strOrNull(o, "issueDate"),
    sharesIssued: numOr(o, "quantityIssued", null),
    price: numOr(o, "lastTradedPrice", 0),
    previousClose: numOr(o, "previousClose", 0),
    change: numOr(o, "change", 0),
    changePct: numOr(o, "changePercentage", 0),
    dayHigh: numOr(o, "hiTrade", 0),
    dayLow: numOr(o, "lowTrade", 0),
    high52w: numOr(o, "p12HiPrice", null),
    low52w: numOr(o, "p12LowPrice", null),
    ytdHigh: numOr(o, "ytdHiPrice", null),
    ytdLow: numOr(o, "ytdLowPrice", null),
    allTimeHigh: numOr(o, "allHiPrice", null),
    allTimeLow: numOr(o, "allLowPrice", null),
    marketCap: numOr(o, "marketCap", 0),
    marketCapPct: numOr(o, "marketCapPercentage", null),
    volumeToday: numOr(o, "tdyShareVolume", 0),
    turnoverToday: numOr(o, "tdyTurnover", 0),
    beta,
  };
}

/** Per-stock price history. `stockId` is Quote.id. Period codes: 1=1D 2=1W 3=1M 4=3M 5=1Y. */
export async function fetchStockHistory(stockId: number, period: PeriodCode): Promise<PricePoint[]> {
  const json = obj(await post("companyChartDataByStock", { stockId, period }, { timeoutMs: 25000 }), "companyChartDataByStock");
  return arr(json.chartData, "chartData").map((raw) => {
    const o = obj(raw, "chart point");
    const opt = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : undefined);
    return { t: num(o, "t", "point"), price: num(o, "p", "point"), high: opt("h"), low: opt("l"), volume: opt("q") };
  });
}

/** Index history. chartId 1 = ASPI. */
export async function fetchIndexHistory(chartId: number, period: PeriodCode): Promise<PricePoint[]> {
  const list = arr(await post("chartData", { chartId, period }, { timeoutMs: 25000 }), "chartData");
  return list.map((raw) => {
    const o = obj(raw, "index point");
    return { t: num(o, "d", "index point"), price: num(o, "v", "index point") };
  });
}

// ---- company reports (financial statements, annual reports) ---------------------------------

export interface CompanyReport {
  id: number;
  kind: "annual" | "quarterly" | "other";
  title: string;
  date: string | null; // YYYY-MM-DD (the date the report is dated, not the upload time)
  path: string; // relative path under https://cdn.cse.lk/
}

const REPORT_PATH_RE = /^(?:cmt\/)?upload_report_file\/[A-Za-z0-9_.-]+\.pdf$/i;
export const isReportPath = (p: string) => REPORT_PATH_RE.test(p);

/** All annual, quarterly and other reports CSE holds for a symbol, newest first. */
export async function fetchCompanyReports(symbol: string): Promise<CompanyReport[]> {
  // This endpoint wants the symbol in the query string of a POST.
  const json = obj(await post(`financials?symbol=${encodeURIComponent(symbol)}`), "financials");
  const groups: [string, CompanyReport["kind"]][] = [["infoQuarterlyData", "quarterly"], ["infoAnnualData", "annual"], ["infoOtherData", "other"]];
  const out: CompanyReport[] = [];
  for (const [key, kind] of groups) {
    for (const raw of json[key] === undefined || json[key] === null ? [] : arr(json[key], `financials.${key}`)) {
      const o = obj(raw, `financials.${key} item`);
      const path = typeof o.path === "string" ? o.path : "";
      if (!isReportPath(path)) continue; // skip rows without a usable PDF
      const ts = numOr(o, "manualDate", null);
      out.push({ id: num(o, "id", "report"), kind, title: str(o, "fileText", "report"), date: ts === null ? null : new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" }), path });
    }
  }
  return out.sort((a, b) => ((b.date ?? "") < (a.date ?? "") ? -1 : (b.date ?? "") > (a.date ?? "") ? 1 : b.id - a.id));
}

const MAX_PDF_BYTES = 40 * 1024 * 1024;

/** Download a report PDF from the CSE CDN. The path must come from the CSE listing (validated here too). */
export async function fetchReportPdf(path: string): Promise<ArrayBuffer> {
  if (!isReportPath(path)) throw new CseError("Refusing to download an unexpected path");
  // The CSE's CDN can be slow, so allow two minutes for the whole download (the function itself may run for five).
  let res: Response;
  let bytes: ArrayBuffer;
  try {
    res = await fetch(`https://cdn.cse.lk/${path}`, { headers: { "User-Agent": HEADERS["User-Agent"], Referer: "https://www.cse.lk/" }, signal: AbortSignal.timeout(120_000), cache: "no-store" });
    if (!res.ok) throw new CseError(`Could not download the report (HTTP ${res.status})`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_PDF_BYTES) throw new CseError("This report is too large to analyse (over 40 MB).");
    bytes = await res.arrayBuffer();
  } catch (e) {
    if (e instanceof CseError) throw e;
    const timedOut = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError";
    throw new CseError(timedOut ? "The CSE's server was too slow to download this report. Please try again in a moment." : "Could not download the report from the CSE. Please try again.");
  }
  if (bytes.byteLength > MAX_PDF_BYTES) throw new CseError("This report is too large to analyse (over 40 MB).");
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new CseError("The downloaded file is not a PDF.");
  return bytes;
}
