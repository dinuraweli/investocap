// Shared unit-trust reference data in Supabase (funds + daily NAV snapshots). Server-only (service role);
// these tables have RLS on and no user policies.
import { supabaseAdmin } from "../supabase/admin.ts";
import type { Fund } from "../funds/utasl.ts";

type Res<T> = { data: T | null; error: { message: string } | null };
function ok<T>(res: Res<T>): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data as T;
}

export async function upsertFunds(funds: Fund[]): Promise<void> {
  if (funds.length === 0) return;
  const now = new Date().toISOString();
  ok(await supabaseAdmin().from("unit_trust_funds").upsert(funds.map((f) => ({ slug: f.slug, name: f.name, manager: f.manager, type: f.type, sell: f.sell, buy: f.buy, updated_at: now }))));
}

export async function saveNavSnapshot(date: string, funds: Fund[]): Promise<number> {
  if (funds.length === 0) return 0;
  ok(await supabaseAdmin().from("unit_trust_nav").upsert(funds.map((f) => ({ fund_slug: f.slug, date, sell: f.sell, buy: f.buy })), { onConflict: "fund_slug,date" }));
  return funds.length;
}

/** The last stored list of funds, used when UTASL is unreachable. */
export async function latestFundsFromDb(): Promise<Fund[]> {
  const rows = ok(await supabaseAdmin().from("unit_trust_funds").select("slug, name, manager, type, sell, buy").order("name")) as
    | { slug: string; name: string; manager: string; type: string; sell: number | null; buy: number | null }[]
    | null;
  return (rows ?? []).filter((r) => r.sell !== null).map((r) => ({ slug: r.slug, name: r.name, manager: r.manager, type: r.type as Fund["type"], sell: Number(r.sell), buy: Number(r.buy ?? r.sell) }));
}

export async function fundBySlug(slug: string): Promise<Fund | null> {
  const r = ok(await supabaseAdmin().from("unit_trust_funds").select("slug, name, manager, type, sell, buy").eq("slug", slug).maybeSingle()) as
    | { slug: string; name: string; manager: string; type: string; sell: number | null; buy: number | null } | null;
  return r && r.sell !== null ? { slug: r.slug, name: r.name, manager: r.manager, type: r.type as Fund["type"], sell: Number(r.sell), buy: Number(r.buy ?? r.sell) } : null;
}

/** Date-sorted NAV history (selling price) for one fund. */
export async function navHistory(slug: string): Promise<{ date: string; sell: number; buy: number | null }[]> {
  const rows = ok(await supabaseAdmin().from("unit_trust_nav").select("date, sell, buy").eq("fund_slug", slug).order("date")) as
    | { date: string; sell: number; buy: number | null }[] | null;
  return (rows ?? []).map((r) => ({ date: r.date, sell: Number(r.sell), buy: r.buy === null ? null : Number(r.buy) }));
}
