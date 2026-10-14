import type { NextRequest } from "next/server";
import { getQuotes } from "@/lib/cse/service";
import { sectorOf } from "@/lib/cse/sectors";
import { handle, json } from "@/lib/http";

const SORTS = { turnover: "turnover", change: "changePct", price: "price", marketCap: "marketCap", volume: "volume" } as const;

export const GET = handle(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim().toLowerCase() ?? "";
  const sort = SORTS[(sp.get("sort") ?? "turnover") as keyof typeof SORTS] ?? "turnover";
  const dir = sp.get("dir") === "asc" ? 1 : -1;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 50, 1), 300);

  const { value, fetchedAt, stale } = await getQuotes();
  let rows = value;
  if (q) {
    rows = rows.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    // exact symbol-root matches first
    rows = [...rows].sort((a, b) => Number(b.symbol.toLowerCase().startsWith(q)) - Number(a.symbol.toLowerCase().startsWith(q)));
  } else {
    rows = [...rows].sort((a, b) => (a[sort] - b[sort]) * dir);
  }
  return json({ total: rows.length, fetchedAt, stale, stocks: rows.slice(0, limit).map((s) => ({ ...s, sector: sectorOf(s.symbol) })) });
});
