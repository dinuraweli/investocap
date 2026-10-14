import { supabaseServer } from "@/lib/supabase/server";
import { handle, json, readJson } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  await readJson(req).catch(() => ({})); // logout is idempotent; body is optional
  const sb = await supabaseServer();
  await sb.auth.signOut();
  return json({ ok: true });
});
