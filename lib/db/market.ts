// Shared market-data cache in Supabase Postgres (instruments, daily closes, index closes, last quote
// snapshot). Server-only via the service-role key; these tables have RLS on and no user policies.
import { supabaseAdmin } from "../supabase/admin.ts";
import { sectorOf } from "../cse/sectors.ts";
import type { Quote } from "../cse/types.ts";

type Res<T> = { data: T | null; error: { message: string } | null };
function ok<T>(res: Res<T>): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data as T;
}

const DAY = 86400000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ---- instruments + quote snapshot -----------------------------------------

export async function upsertInstruments(quotes: Quote[]): Promise<void> {
  const now = new Date().toISOString();
  ok(await supabaseAdmin().from("instruments").upsert(quotes.map((q) => ({ id: q.id, symbol: q.symbol, name: q.name, sector: sectorOf(q.symbol), updated_at: now }))));
}

export async function saveQuoteSnapshot(quotes: Quote[]): Promise<void> {
  ok(await supabaseAdmin().from("kv").upsert({ key: "quotes", value: quotes, updated_at: new Date().toISOString() }));
}

export async function readQuoteSnapshot(): Promise<Quote[] | null> {
  const row = ok(await supabaseAdmin().from("kv").select("value").eq("key", "quotes").maybeSingle()) as { value: Quote[] } | null;
  return row?.value ?? null;
}

/** Pre-market fallback built from stored daily closes. */
export async function quotesFromHistory(): Promise<Quote[]> {
  const rows = ok(await supabaseAdmin().rpc("latest_quotes_from_history")) as
    | { id: number; symbol: string; name: string; close: number; high: number | null; low: number | null; volume: number | null; prev_close: number | null }[]
    | null;
  return (rows ?? []).map((r) => {
    const close = Number(r.close);
    const prev = r.prev_close === null ? close : Number(r.prev_close);
    return {
      id: r.id, symbol: r.symbol, name: r.name, price: close, change: close - prev, changePct: prev > 0 ? ((close - prev) / prev) * 100 : 0,
      previousClose: prev, high: r.high === null ? close : Number(r.high), low: r.low === null ? close : Number(r.low), volume: Number(r.volume ?? 0),
      trades: 0, turnover: 0, marketCap: 0, lastTradedAt: null,
    };
  });
}

// ---- daily prices ----------------------------------------------------------

export interface DailyRow {
  date: string;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export async function saveDaily(instrumentId: number, rows: DailyRow[]): Promise<void> {
  if (rows.length === 0) return;
  ok(await supabaseAdmin().from("daily_prices").upsert(rows.map((r) => ({ instrument_id: instrumentId, ...r })), { onConflict: "instrument_id,date" }));
}

/** One row per instrument for a trading day (end-of-day snapshot). */
export async function saveSessionCloses(date: string, quotes: Quote[]): Promise<number> {
  const rows = quotes.filter((q) => q.price > 0).map((q) => ({ instrument_id: q.id, date, high: q.high || q.price, low: q.low || q.price, close: q.price, volume: q.volume }));
  if (rows.length) ok(await supabaseAdmin().from("daily_prices").upsert(rows, { onConflict: "instrument_id,date" }));
  return rows.length;
}

export async function saveIndexClose(code: "ASPI" | "SL20", date: string, value: number): Promise<void> {
  ok(await supabaseAdmin().from("index_daily").upsert({ code, date, value }, { onConflict: "code,date" }));
}

export async function lastIndexClose(code: "ASPI" | "SL20"): Promise<number | null> {
  const r = ok(await supabaseAdmin().from("index_daily").select("value").eq("code", code).order("date", { ascending: false }).limit(1).maybeSingle()) as { value: number } | null;
  return r ? Number(r.value) : null;
}

export async function countDaily(instrumentId: number): Promise<number> {
  const res = await supabaseAdmin().from("daily_prices").select("instrument_id", { count: "exact", head: true }).eq("instrument_id", instrumentId);
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.count ?? 0;
}

export async function latestStoredDate(): Promise<string | null> {
  const r = ok(await supabaseAdmin().from("daily_prices").select("date").order("date", { ascending: false }).limit(1).maybeSingle()) as { date: string } | null;
  return r?.date ?? null;
}

/** Stored daily rows older than `before`, oldest first (extends the 1-year CSE history for "All"). */
export async function olderDaily(instrumentId: number, before: string): Promise<(DailyRow & { t: number })[]> {
  const rows = ok(await supabaseAdmin().from("daily_prices").select("date, close, high, low, volume").eq("instrument_id", instrumentId).lt("date", before).order("date")) as
    | { date: string; close: number; high: number | null; low: number | null; volume: number | null }[]
    | null;
  return (rows ?? []).map((r) => ({ date: r.date, close: Number(r.close), high: r.high === null ? null : Number(r.high), low: r.low === null ? null : Number(r.low), volume: r.volume === null ? null : Number(r.volume), t: Date.parse(`${r.date}T00:00:00+05:30`) }));
}

// ---- per-symbol series for the portfolio views -----------------------------

async function seriesFor(symbol: string, sinceDate: string): Promise<[string, number][]> {
  const rows = ok(
    await supabaseAdmin().from("daily_prices").select("date, close, instruments!inner(symbol)").eq("instruments.symbol", symbol).gte("date", sinceDate).order("date"),
  ) as { date: string; close: number }[] | null;
  return (rows ?? []).map((r): [string, number] => [r.date, Number(r.close)]);
}

/** Last `n` daily closes per symbol, oldest first (for 7-day sparklines). */
export async function recentCloses(symbols: string[], n: number): Promise<Record<string, number[]>> {
  const since = isoDate(Date.now() - 21 * DAY);
  const entries = await Promise.all(symbols.map(async (s) => [s, (await seriesFor(s, since)).slice(-n).map(([, c]) => c)] as const));
  return Object.fromEntries(entries);
}

/** Date-sorted closes since `from` per symbol, plus the last close before it so early dates carry a price. */
export async function closesSince(symbols: string[], from: string): Promise<Record<string, [string, number][]>> {
  const lookback = isoDate(Date.parse(from) - 14 * DAY);
  const entries = await Promise.all(
    symbols.map(async (s) => {
      const rows = await seriesFor(s, lookback);
      const prior = [...rows].reverse().find(([d]) => d < from);
      const series: [string, number][] = [...(prior ? [prior] : []), ...rows.filter(([d]) => d >= from)];
      return [s, series] as const;
    }),
  );
  return Object.fromEntries(entries);
}
