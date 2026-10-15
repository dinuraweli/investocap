import { requireSession } from "@/lib/auth";
import { fail, handle, json } from "@/lib/http";
import { checkKey, GeminiError } from "@/lib/reports/gemini";
import { readGeminiKey } from "@/lib/reports/request";

/** Verify a Gemini key and report which model will be used. The key is used for this one call and discarded. */
export const POST = handle(async (req: Request) => {
  await requireSession();
  const key = readGeminiKey(req);
  try {
    return json({ ok: true, ...(await checkKey(key)) });
  } catch (e) {
    if (e instanceof GeminiError) return fail(e.status, e.message);
    throw e;
  }
});
