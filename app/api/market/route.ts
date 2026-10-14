import type { NextRequest } from "next/server";
import { getMarket, getSectors } from "@/lib/cse/service";
import { handle, json } from "@/lib/http";

export const GET = handle(async (_req: NextRequest) => {
  const [market, sectors] = await Promise.all([getMarket(), getSectors().catch(() => null)]);
  return json({ ...market, sectors: sectors?.value ?? [] });
});
