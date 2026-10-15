import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { listAnalyses } from "@/lib/db/user-data";
import { handle, json } from "@/lib/http";

/** The signed-in user's saved analyses, optionally for one symbol. */
export const GET = handle(async (req: NextRequest) => {
  const { db } = await requireSession();
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  return json({ analyses: await listAnalyses(db, symbol) });
});
