// Service-role client: bypasses RLS. SERVER ONLY. Used exclusively for the shared market-data cache
// (instruments, daily prices), never for user data, which always goes through the user's own session.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const g = globalThis as unknown as { __sbAdmin?: SupabaseClient };

export function supabaseAdmin(): SupabaseClient {
  if (!g.__sbAdmin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the market-data cache (see .env.example)");
    g.__sbAdmin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return g.__sbAdmin;
}
