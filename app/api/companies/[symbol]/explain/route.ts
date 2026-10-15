import { requireSession } from "@/lib/auth";
import { CseError, fetchAnnouncementPdf } from "@/lib/cse/client";
import { findQuote, getAnnouncementDetail, getCompanyAnnouncements } from "@/lib/cse/service";
import { BadRequest, fail, handle, json, NotFound, readJson, reqNumber } from "@/lib/http";
import { announcementPrompt, EXPLAIN_SCHEMA, EXPLAIN_SYSTEM, validateExplanation } from "@/lib/reports/explain";
import { checkKey, GeminiError, generateJson } from "@/lib/reports/gemini";
import { allow } from "@/lib/reports/limits";
import { readGeminiKey } from "@/lib/reports/request";

export const maxDuration = 120;

/**
 * Explain one announcement in plain English with the caller's own Gemini key (header x-gemini-key, used once,
 * never stored). Facts only: the model is told not to give advice and advice-like sentences are removed.
 */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ symbol: string }> }) => {
  const { user } = await requireSession();
  const id = reqNumber(await readJson(req), "announcementId", { min: 0, minExclusive: true });
  const quote = await findQuote(decodeURIComponent((await params).symbol));
  if (!quote) throw new NotFound("Unknown symbol");
  const key = readGeminiKey(req);

  const { value: list } = await getCompanyAnnouncements(quote.symbol);
  const item = list.find((a) => a.id === id);
  if (!item) throw new NotFound("Announcement not found for this company");
  const detail = (await getAnnouncementDetail(id)).value;
  if (!detail) throw new NotFound("The CSE has no details for this announcement");
  if (!allow(user.id, "explain", 40)) throw new BadRequest("You've used 40 explanations in the last hour. Please wait a while.");

  try {
    // Read the attached PDF too when it is small; otherwise explain from the text alone.
    const doc = detail.docs.find((d) => (d.size ?? 0) <= 3 * 1024 * 1024);
    const pdf = doc ? await fetchAnnouncementPdf(doc.path).catch((e: unknown) => { console.warn("[explain] document skipped", (e as Error).message); return null; }) : null;
    const { models } = await checkKey(key);
    const { result, model, attempts } = await generateJson(key, models, {
      system: EXPLAIN_SYSTEM, text: announcementPrompt({ company: quote.name, category: item.category, detail, hasDocument: !!pdf }),
      pdf: pdf && doc ? { bytes: pdf, title: doc.name } : undefined, schema: EXPLAIN_SCHEMA, validate: validateExplanation,
    });
    return json({ explanation: result, model, attempts, usedDocument: !!pdf });
  } catch (e) {
    if (e instanceof GeminiError) { console.warn("[explain] gemini failure", { code: e.code, status: e.status }); return fail(e.status, e.message); }
    if (e instanceof CseError) return fail(502, e.message);
    throw e;
  }
});
