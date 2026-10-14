import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteWatchlist } from "@/lib/db/user-data";
import { handle, json, NotFound } from "@/lib/http";

export const DELETE = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { db } = await requireSession();
  if (!(await deleteWatchlist(db, Number((await params).id)))) throw new NotFound("Watchlist not found");
  return json({ ok: true });
});
