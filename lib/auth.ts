// Auth is handled by Supabase Auth (email + password). Sessions live in httpOnly cookies managed
// by @supabase/ssr; the server validates them with Supabase on every request (getUser).
import { supabaseServer, type Db } from "./supabase/server.ts";
import { Unauthorized } from "./http.ts";

export interface User {
  id: string; // auth.users uuid
  email: string;
  name: string;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function currentUser(db?: Db): Promise<User | null> {
  const sb = db ?? (await supabaseServer());
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  const email = u.email ?? "";
  return { id: u.id, email, name: (u.user_metadata?.name as string | undefined) ?? email.split("@")[0] };
}

/** The signed-in user plus a Supabase client acting as them. Throws Unauthorized (-> 401) otherwise. */
export async function requireSession(): Promise<{ user: User; db: Db }> {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) throw new Unauthorized();
  return { user, db };
}

// Simple in-memory login throttle: 10 failures / 15 min per key (Supabase also rate-limits server side).
const g = globalThis as unknown as { __loginFails?: Map<string, number[]> };
const fails: Map<string, number[]> = (g.__loginFails ??= new Map<string, number[]>());
const WINDOW = 15 * 60 * 1000;
export function throttled(key: string): boolean {
  const recent = (fails.get(key) ?? []).filter((t) => Date.now() - t < WINDOW);
  fails.set(key, recent);
  return recent.length >= 10;
}
export const recordFailure = (key: string) => fails.set(key, [...(fails.get(key) ?? []), Date.now()]);
export const clearFailures = (key: string) => fails.delete(key);
