import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { ensureDailyHistory, findQuote } from "@/lib/cse/service";
import { colomboDate } from "@/lib/time";
import { insertTransaction, listTransactions } from "@/lib/db/user-data";
import { BadRequest, Conflict, handle, json, NotFound, readJson, reqNumber, reqString } from "@/lib/http";
import { computePositions, OversellError } from "@/lib/portfolio";

export const GET = handle(async (_req: NextRequest) => {
  const { db } = await requireSession();
  return json({ transactions: (await listTransactions(db)).reverse() });
});

export const POST = handle(async (req: Request) => {
  const { db } = await requireSession();
  const b = await readJson(req);

  const quote = await findQuote(reqString(b, "symbol", 30));
  if (!quote) throw new NotFound("Unknown symbol");
  if (b.side !== "buy" && b.side !== "sell") throw new BadRequest('"side" must be "buy" or "sell"');
  const side: "buy" | "sell" = b.side;
  const quantity = reqNumber(b, "quantity", { min: 0, minExclusive: true });
  const price = reqNumber(b, "price");
  const fees = b.fees === undefined ? 0 : reqNumber(b, "fees");
  const today = colomboDate(Date.now());
  const tradedOn = b.tradedOn === undefined ? today : reqString(b, "tradedOn", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradedOn) || Number.isNaN(Date.parse(tradedOn))) throw new BadRequest('"tradedOn" must be YYYY-MM-DD');
  if (tradedOn > today) throw new BadRequest('"tradedOn" cannot be in the future');
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 300) : null;

  const candidate = { symbol: quote.symbol, side, quantity, price, fees, tradedOn, note };
  try {
    computePositions([...await listTransactions(db), { ...candidate, id: Number.MAX_SAFE_INTEGER }]); // would this oversell?
  } catch (e) {
    if (e instanceof OversellError) throw new Conflict(e.message);
    throw e;
  }
  const id = await insertTransaction(db, candidate);
  await ensureDailyHistory(quote).catch((e) => console.error("[history backfill]", e)); // best effort
  return json({ id, ...candidate }, { status: 201 });
});
