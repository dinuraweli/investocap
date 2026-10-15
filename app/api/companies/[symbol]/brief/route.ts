import { requireSession } from "@/lib/auth";
import { CseError } from "@/lib/cse/client";
import { findQuote, getAnnouncementDetail, getCompanyAnnouncements, getCompanyProfile } from "@/lib/cse/service";
import { listAnalyses } from "@/lib/db/user-data";
import { BadRequest, fail, handle, json, NotFound } from "@/lib/http";
import { BRIEF_SCHEMA, BRIEF_SYSTEM, briefPrompt, validateBrief, type BriefInput } from "@/lib/reports/explain";
import { checkKey, GeminiError, generateJson } from "@/lib/reports/gemini";
import { allow } from "@/lib/reports/limits";
import { readGeminiKey } from "@/lib/reports/request";
import { reader } from "@/lib/reports/ratios";

export const maxDuration = 120;

const KEY_LINES: [string, string][] = [["revenue", "Revenue"], ["operating_profit", "Operating profit"], ["net_profit", "Net profit"], ["eps", "Earnings per share"], ["total_equity", "Total equity"]];

/** A short factual company brief from the CSE profile, recent announcements and the user's latest analysed results. Own key, never stored. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ symbol: string }> }) => {
  const { user, db } = await requireSession();
  const quote = await findQuote(decodeURIComponent((await params).symbol));
  if (!quote) throw new NotFound("Unknown symbol");
  const key = readGeminiKey(req);
  if (!allow(user.id, "brief", 20)) throw new BadRequest("You've written 20 briefs in the last hour. Please wait a while.");

  try {
    const [profile, announcements, analyses] = await Promise.all([getCompanyProfile(quote.symbol).catch(() => null), getCompanyAnnouncements(quote.symbol).catch(() => null), listAnalyses(db, quote.symbol).catch(() => [])]);
    // Headlines for the five newest announcements (each detail is cached, so repeats are cheap).
    const recent = (announcements?.value ?? []).slice(0, 8);
    const heads = await Promise.all(recent.slice(0, 5).map((a) => getAnnouncementDetail(a.id).then((d) => d.value?.headline ?? null).catch(() => null)));
    const latest = [...analyses].filter((a) => a.analysis.periodEnd).sort((a, b) => (a.analysis.periodEnd! < b.analysis.periodEnd! ? 1 : -1))[0] ?? analyses[0];
    const read = latest ? reader(latest.analysis) : null;

    const input: BriefInput = {
      name: quote.name, sector: profile?.value.sector ?? null, boardType: profile?.value.boardType ?? null, established: profile?.value.established ?? null, businessSummary: profile?.value.businessSummary ?? null,
      announcements: recent.map((a, i) => ({ date: a.date, category: a.category, headline: heads[i] ?? null })),
      results: latest && read ? {
        periodLabel: latest.analysis.periodLabel, summary: latest.analysis.summary,
        metrics: KEY_LINES.flatMap(([k, label]) => { const c = read(k, "current"), p = read(k, "previous"); return c === null && p === null ? [] : [{ label, current: k === "eps" ? c : c === null ? null : c / 1e6, previous: k === "eps" ? p : p === null ? null : p / 1e6, unit: k === "eps" ? "LKR per share" : "LKR million" }]; }),
      } : null,
    };
    const { models } = await checkKey(key);
    const { result, model, attempts } = await generateJson(key, models, { system: BRIEF_SYSTEM, text: briefPrompt(input), schema: BRIEF_SCHEMA, validate: validateBrief });
    return json({ ...result, model, attempts, usedResults: !!latest, generatedAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof GeminiError) { console.warn("[brief] gemini failure", { code: e.code, status: e.status }); return fail(e.status, e.message); }
    if (e instanceof CseError) return fail(502, e.message);
    throw e;
  }
});
