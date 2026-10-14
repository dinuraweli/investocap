import { clearFailures, recordFailure, throttled } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { fail, handle, json, readJson, reqString } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const b = await readJson(req);
  const email = reqString(b, "email").toLowerCase();
  const password = reqString(b, "password");
  const key = `${email}|${req.headers.get("x-forwarded-for") ?? "local"}`;
  if (throttled(key)) return fail(429, "Too many attempts. Try again in a few minutes.");

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") return fail(403, "Please confirm your email address first. Check your inbox for the link.");
    recordFailure(key);
    return fail(401, "Incorrect email or password");
  }
  clearFailures(key);
  const u = data.user;
  return json({ user: { id: u.id, email: u.email ?? email, name: (u.user_metadata?.name as string | undefined) ?? email.split("@")[0] } });
});
