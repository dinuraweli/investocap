import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const GET = handle(async (_req: NextRequest) => json({ user: await currentUser() }));
