import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteTransaction, listTransactions } from "@/lib/db/user-data";
import { Conflict, handle, json, NotFound } from "@/lib/http";
import { computePositions, OversellError } from "@/lib/portfolio";

export const DELETE = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { db } = await requireSession();
  const id = Number((await params).id);
  const all = await listTransactions(db);
  if (!all.some((t) => t.id === id)) throw new NotFound("Transaction not found");
  try {
    computePositions(all.filter((t) => t.id !== id)); // removing a buy must not invalidate a later sell
  } catch (e) {
    if (e instanceof OversellError) throw new Conflict(`Cannot delete: it would leave a later sale unfunded (${e.message})`);
    throw e;
  }
  await deleteTransaction(db, id);
  return json({ ok: true });
});
