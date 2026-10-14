import { EMAIL_RE } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { BadRequest, fail, handle, json, readJson, reqString } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const b = await readJson(req);
  const email = reqString(b, "email").toLowerCase();
  const name = reqString(b, "name", 80);
  const password = reqString(b, "password", 200);
  if (!EMAIL_RE.test(email)) throw new BadRequest("Enter a valid email address");
  if (password.length < 8) throw new BadRequest("Password must be at least 8 characters");

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
  if (error) {
    if (/already|registered/i.test(error.message)) return fail(409, "An account with that email already exists");
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return fail(429, "We couldn't send your confirmation email because the email limit was reached. No account was created. Please try again in about an hour.");
    }
    throw new BadRequest(error.message);
  }
  // With "Confirm email" enabled in Supabase there is no session until the link is clicked.
  if (!data.session || !data.user) return json({ needsConfirmation: true }, { status: 202 });
  return json({ user: { id: data.user.id, email, name } }, { status: 201 });
});
