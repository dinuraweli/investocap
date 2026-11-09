// Daily market-mood score history, kept as a small JSON array in the shared kv table (one row, ~250 points a
// year), so no extra migration is needed. Server-only (service role).
import { supabaseAdmin } from "../supabase/admin.ts";

export interface SentimentPoint { date: string; score: number; label: string; advancers: number; decliners: number }

const KEY = "sentiment_history";
const MAX = 800; // ~3 years of trading days

type Res<T> = { data: T | null; error: { message: string } | null };
function ok<T>(res: Res<T>): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data as T;
}

export async function readSentimentHistory(): Promise<SentimentPoint[]> {
  const row = ok(await supabaseAdmin().from("kv").select("value").eq("key", KEY).maybeSingle()) as { value: SentimentPoint[] } | null;
  return Array.isArray(row?.value) ? row!.value : [];
}

/** Insert or replace today's point and persist the sorted, capped history. */
export async function saveSentimentPoint(point: SentimentPoint): Promise<void> {
  const history = (await readSentimentHistory()).filter((p) => p.date !== point.date);
  history.push(point);
  history.sort((a, b) => (a.date < b.date ? -1 : 1));
  const trimmed = history.slice(-MAX);
  ok(await supabaseAdmin().from("kv").upsert({ key: KEY, value: trimmed, updated_at: new Date().toISOString() }));
}
