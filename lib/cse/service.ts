// Cached, app-facing access to CSE data. Route handlers use this, never client.ts directly.
import * as cse from "./client.ts";
import { cached } from "./cache.ts";
import { sectorOf } from "./sectors.ts";
import { colomboDate } from "../time.ts";
import * as store from "../db/market.ts";
import { computePerformance, type PerfPeriod } from "./performance.ts";
import { selectPeers, type PeerRow, type Peers } from "./peers.ts";
import type { IndexValue, PeriodCode, PricePoint, Quote } from "./types.ts";

const SEC = 1000;
const TTL = { profile: 6 * 3600 * SEC, announcements: 10 * 60 * SEC, announcementDetail: 3600 * SEC, quotes: 15 * SEC, indices: 15 * SEC, status: 30 * SEC, lists: 30 * SEC, detail: 60 * SEC, intraday: 30 * SEC, history: 10 * 60 * SEC, sectors: 60 * SEC };

export const RANGES = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const;
export type RangeKey = (typeof RANGES)[number];
const PERIOD: Record<Exclude<RangeKey, "ALL">, PeriodCode> = { "1D": 1, "1W": 2, "1M": 3, "3M": 4, "1Y": 5 };

export const isRange = (v: string): v is RangeKey => (RANGES as readonly string[]).includes(v);

export async function getQuotes() {
  return cached("quotes", TTL.quotes, loadQuotes);
}

/**
 * Live quotes, or, when CSE has nothing (pre-market, holidays), the last successful snapshot,
 * or the latest stored daily closes. Only throws if we have never seen any prices.
 */
async function loadQuotes(): Promise<Quote[]> {
  const live = await cse.fetchQuotes();
  if (live.length > 0) {
    persistBestEffort(live); // never let a cache-write problem block serving live prices
    return live;
  }
  const snap = await store.readQuoteSnapshot();
  if (snap?.length) return snap;
  const fromHistory = await store.quotesFromHistory();
  if (fromHistory.length > 0) return fromHistory;
  throw new cse.CseError("Prices are not available yet. They appear when trading opens at 9:30 (Sri Lanka time).");
}

// Persisting 278 instruments every 15s would be wasteful: refresh the instrument list hourly, the snapshot each minute.
const g = globalThis as unknown as { __persist?: { instruments: number; snapshot: number } };
const last = (g.__persist ??= { instruments: 0, snapshot: 0 });
function persistBestEffort(quotes: Quote[]) {
  const now = Date.now();
  if (now - last.instruments > 3600_000) {
    last.instruments = now;
    store.upsertInstruments(quotes).catch((e) => { last.instruments = 0; console.error("[persist instruments]", e); });
  }
  if (now - last.snapshot > 60_000) {
    last.snapshot = now;
    store.saveQuoteSnapshot(quotes).catch((e) => { last.snapshot = 0; console.error("[persist snapshot]", e); });
  }
}

/** Resolve "JKH" or "JKH.N0000" (case-insensitive) to a quote. */
export async function findQuote(input: string): Promise<Quote | null> {
  const { value } = await getQuotes();
  const s = input.trim().toUpperCase();
  return value.find((q) => q.symbol === s) ?? value.find((q) => q.symbol.split(".")[0] === s && q.symbol.endsWith(".N0000")) ?? value.find((q) => q.symbol.split(".")[0] === s) ?? null;
}

/** Last stored closing value for an index, used when CSE has no value yet (pre-market). */
async function lastIndex(code: "ASPI" | "SL20"): Promise<IndexValue> {
  const v = (await store.lastIndexClose(code).catch(() => null)) ?? 0;
  return { value: v, high: v, low: v, change: 0, changePct: 0, at: Date.now() };
}

export async function getMarket() {
  const [status, aspi, sl20, summary, gainers, losers, active, quotes] = await Promise.all([
    cached("status", TTL.status, cse.fetchMarketStatus),
    cached("aspi", TTL.indices, async () => (await cse.fetchAspi()) ?? lastIndex("ASPI")),
    cached("sl20", TTL.indices, async () => (await cse.fetchSl20()) ?? lastIndex("SL20")),
    cached("summary", TTL.indices, cse.fetchMarketSummary),
    cached("gainers", TTL.lists, cse.fetchGainers),
    cached("losers", TTL.lists, cse.fetchLosers),
    cached("active", TTL.lists, cse.fetchMostActive),
    getQuotes(),
  ]);
  const traded = quotes.value.filter((q) => q.price > 0);
  const breadth = {
    advancers: traded.filter((q) => q.change > 0).length,
    decliners: traded.filter((q) => q.change < 0).length,
    unchanged: traded.filter((q) => q.change === 0).length,
  };
  const stale = [status, aspi, sl20, summary, gainers, losers, active, quotes].some((c) => c.stale);
  const fetchedAt = Math.min(...[status, aspi, sl20, summary, quotes].map((c) => c.fetchedAt));
  return {
    status: status.value, aspi: aspi.value, sl20: sl20.value, summary: summary.value, breadth,
    gainers: gainers.value, losers: losers.value, active: active.value, stale, fetchedAt,
  };
}

/** CSE reports (annual, quarterly, other) for a symbol. The listing changes rarely, so cache it for 10 minutes. */
export const getCompanyReports = (symbol: string) => cached(`reports:${symbol}`, TTL.history, () => cse.fetchCompanyReports(symbol));

export const getSectors = () => cached("sectors", TTL.sectors, cse.fetchSectors);
export const getStockDetail = (symbol: string) => cached(`detail:${symbol}`, TTL.detail, () => cse.fetchStockDetail(symbol));

/** Price history for a stock. 1D is intraday; ALL merges older rows we snapshotted ourselves. */
export async function getStockHistory(quote: Quote, range: RangeKey): Promise<{ points: PricePoint[]; stale: boolean }> {
  const period = range === "ALL" ? 5 : PERIOD[range];
  const ttl = range === "1D" ? TTL.intraday : TTL.history;
  const r = await cached(`hist:${quote.id}:${period}`, ttl, () => cse.fetchStockHistory(quote.id, period));
  let points = r.value;
  if (range === "ALL" && points.length) {
    // Older rows are a bonus; if our own database is unavailable, still show CSE's year of history.
    const older = await store.olderDaily(quote.id, colomboDate(points[0].t)).catch((e) => { console.error("[history older rows]", e); return []; });
    points = [...older.map((o) => ({ t: o.t, price: o.close, high: o.high ?? undefined, low: o.low ?? undefined, volume: o.volume ?? undefined })), ...points];
  }
  return { points, stale: r.stale };
}

/** Persist up to a year of daily closes for a symbol (used when a user starts tracking it). */
export async function ensureDailyHistory(quote: Quote): Promise<number> {
  if ((await store.countDaily(quote.id)) > 30) return 0;
  await store.upsertInstruments([quote]); // the daily_prices rows reference the instrument
  const { points } = await getStockHistory(quote, "1Y");
  await store.saveDaily(quote.id, points.map((p) => ({ date: colomboDate(p.t), high: p.high ?? null, low: p.low ?? null, close: p.price, volume: p.volume ?? null })));
  return points.length;
}

/** Date (Asia/Colombo) of the latest trading session, from CSE's own timestamp rather than the wall clock. */
export async function getSessionDate(): Promise<string> {
  const s = await cached("summary", TTL.indices, cse.fetchMarketSummary);
  if (s.value.trades > 0) return colomboDate(s.value.at);
  // Nothing traded yet today (pre-market/holiday): the latest session is the last one we stored.
  return (await store.latestStoredDate()) ?? colomboDate(Date.now());
}

/**
 * End-of-day job: snapshot the latest session's close for every traded instrument and both indices.
 * Keyed by the session date, so running it on a weekend/holiday rewrites the last session, never a fake day.
 */
export async function snapshotEndOfDay() {
  const { value: quotes } = await getQuotes();
  const [aspi, sl20, summary] = await Promise.all([cse.fetchAspi(), cse.fetchSl20(), cse.fetchMarketSummary()]);
  if (summary.trades === 0) return { date: null, rows: 0, skipped: "no trades in latest session" };
  const date = colomboDate(summary.at);
  await store.upsertInstruments(quotes);
  const rows = await store.saveSessionCloses(date, quotes);
  if (aspi) await store.saveIndexClose("ASPI", date, aspi.value);
  if (sl20) await store.saveIndexClose("SL20", date, sl20.value);
  const sectors = await fillSectors(60); // keep peer data complete without a separate job
  return { date, rows, sectorsFilled: sectors };
}

// ---- company profile, announcements, performance, peers ---------------------------------------------

export const getCompanyProfile = (symbol: string) => cached(`profile:${symbol}`, TTL.profile, () => cse.fetchCompanyProfile(symbol));
export const getCompanyAnnouncements = (symbol: string) => cached(`ann:${symbol}`, TTL.announcements, () => cse.fetchCompanyAnnouncements(symbol));
export const getAnnouncementDetail = (id: number) => cached(`annd:${id}`, TTL.announcementDetail, () => cse.fetchAnnouncementDetail(id));

/** Stock and ASPI returns over 1 week to 1 year, from the cached daily histories. */
export async function getPerformance(quote: Quote): Promise<{ periods: PerfPeriod[]; stale: boolean }> {
  const [stock, index] = await Promise.all([getStockHistory(quote, "1Y"), cached("aspi-1y", TTL.history, () => cse.fetchIndexHistory(1, 5))]);
  const pts = (a: PricePoint[]) => a.map((p) => ({ t: p.t, price: p.price })).sort((x, y) => x.t - y.t);
  return { periods: computePerformance(pts(stock.points), pts(index.value), Date.now()), stale: stock.stale || index.stale };
}

const sectorGlobal = globalThis as unknown as { __sectorFill?: Promise<number> };

/**
 * Look up the CSE sector of up to `limit` companies we have not checked yet, a few at a time. Safe to call from
 * several requests at once (only one fill runs). Returns how many were filled. Never throws.
 */
export function fillSectors(limit: number): Promise<number> {
  if (sectorGlobal.__sectorFill) return sectorGlobal.__sectorFill;
  const run = (async () => {
    let filled = 0;
    try {
      const todo = await store.symbolsNeedingSector(limit);
      for (let i = 0; i < todo.length; i += 6) {
        const batch = await Promise.allSettled(todo.slice(i, i + 6).map(async (symbol) => {
          const p = await cse.fetchCompanyProfile(symbol);
          await store.setCseSector(symbol, p.sector); // also records "no sector" so we do not retry every request
          filled++;
        }));
        batch.forEach((r) => r.status === "rejected" && console.error("[sector fill]", (r.reason as Error).message));
      }
    } catch (e) {
      console.error("[sector fill]", (e as Error).message);
    }
    return filled;
  })().finally(() => { sectorGlobal.__sectorFill = undefined; });
  sectorGlobal.__sectorFill = run;
  return run;
}

/** Companies in the same CSE sector. The sector list fills in gradually; `known` / `all` show how complete it is. */
export async function getPeers(quote: Quote): Promise<Peers & { known: number; all: number }> {
  const profile = await getCompanyProfile(quote.symbol).catch(() => null);
  if (profile?.value.sector) await store.setCseSector(quote.symbol, profile.value.sector).catch(() => {});
  await Promise.race([fillSectors(24), new Promise((r) => setTimeout(r, 7000))]); // learn a few more sectors per visit, without making the page wait long
  const [sectors, quotes] = await Promise.all([store.knownSectors(), getQuotes()]);
  const bySector = new Map(sectors.map((s) => [s.symbol, s.sector]));
  if (profile?.value.sector) bySector.set(quote.symbol, profile.value.sector);
  const rows: PeerRow[] = quotes.value.map((q) => ({ symbol: q.symbol, name: q.name, sector: bySector.get(q.symbol) ?? null, price: q.price, changePct: q.changePct, marketCap: q.marketCap }));
  return { ...selectPeers(quote.symbol, rows), known: bySector.size, all: quotes.value.length };
}
