// Supabase client bound to the current request's session cookies. Queries run as the signed-in
// user, so Postgres row-level security (not just our code) decides which rows they can see.
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export type Db = SupabaseClient;

export async function supabaseServer(): Promise<Db> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set (see .env.example)");
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        // Route handlers may set cookies; Server Components may not (harmless to ignore there).
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {}
      },
    },
  });
}
