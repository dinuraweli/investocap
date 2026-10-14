// Per-user data (watchlists, transactions) in Supabase Postgres. Every function takes the
// request-scoped client, so RLS restricts results to the signed-in user's own rows.
import type { Db } from "../supabase/server.ts";
import type { Tx } from "../portfolio.ts";

const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";

function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data as T;
}

// ---- watchlists ------------------------------------------------------------

export interface Watchlist {
  id: number;
  name: string;
  symbols: string[];
}

interface WatchlistRow {
  id: number;
  name: string;
  watchlist_items: { symbol: string; added_at: string }[];
}

export async function getWatchlists(db: Db): Promise<Watchlist[]> {
  let rows = check(await db.from("watchlists").select("id, name, watchlist_items(symbol, added_at)").order("id")) as WatchlistRow[];
  if (rows.length === 0) {
    check(await db.from("watchlists").insert({ name: "My Watchlist" })); // user_id defaults to auth.uid()
    rows = check(await db.from("watchlists").select("id, name, watchlist_items(symbol, added_at)").order("id")) as WatchlistRow[];
  }
  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    symbols: [...w.watchlist_items].sort((a, b) => (a.added_at < b.added_at ? -1 : 1)).map((i) => i.symbol),
  }));
}

/** Returns the new id, or null if the user already has a list with that name. */
export async function createWatchlist(db: Db, name: string): Promise<number | null> {
  const res = await db.from("watchlists").insert({ name }).select("id").single();
  if (res.error?.code === UNIQUE_VIOLATION) return null;
  return (check(res) as { id: number }).id;
}

export async function deleteWatchlist(db: Db, id: number): Promise<boolean> {
  const rows = check(await db.from("watchlists").delete().eq("id", id).select("id")) as unknown[];
  return rows.length > 0; // RLS hides other users' lists, so a foreign id deletes nothing
}

/** False if the watchlist does not exist or is not yours (the composite FK rejects it). */
export async function addWatchlistItem(db: Db, id: number, symbol: string): Promise<boolean> {
  const res = await db.from("watchlist_items").upsert({ watchlist_id: id, symbol }, { onConflict: "watchlist_id,symbol", ignoreDuplicates: true });
  if (res.error?.code === FK_VIOLATION) return false;
  check(res);
  return true;
}

export async function removeWatchlistItem(db: Db, id: number, symbol: string): Promise<void> {
  check(await db.from("watchlist_items").delete().eq("watchlist_id", id).eq("symbol", symbol));
}

// ---- transactions ----------------------------------------------------------

interface TxRow {
  id: number; symbol: string; side: "buy" | "sell"; quantity: number; price: number; fees: number; traded_on: string; note: string | null;
}
export interface TxRecord extends Tx {
  note: string | null;
}
const toRecord = (r: TxRow): TxRecord => ({
  id: r.id, symbol: r.symbol, side: r.side, quantity: Number(r.quantity), price: Number(r.price), fees: Number(r.fees), tradedOn: r.traded_on, note: r.note,
});

export async function listTransactions(db: Db): Promise<TxRecord[]> {
  const rows = check(await db.from("transactions").select("id, symbol, side, quantity, price, fees, traded_on, note").order("traded_on").order("id")) as TxRow[];
  return rows.map(toRecord);
}

export async function insertTransaction(db: Db, t: Omit<TxRecord, "id">): Promise<number> {
  const res = await db
    .from("transactions")
    .insert({ symbol: t.symbol, side: t.side, quantity: t.quantity, price: t.price, fees: t.fees, traded_on: t.tradedOn, note: t.note })
    .select("id")
    .single();
  return (check(res) as { id: number }).id;
}

export async function deleteTransaction(db: Db, id: number): Promise<boolean> {
  const rows = check(await db.from("transactions").delete().eq("id", id).select("id")) as unknown[];
  return rows.length > 0;
}

/** Insert several transactions in one request (all-or-nothing). */
export async function insertTransactions(db: Db, rows: Omit<TxRecord, "id">[]): Promise<void> {
  if (rows.length === 0) return;
  check(await db.from("transactions").insert(rows.map((t) => ({ symbol: t.symbol, side: t.side, quantity: t.quantity, price: t.price, fees: t.fees, traded_on: t.tradedOn, note: t.note }))));
}
