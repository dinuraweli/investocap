import { requireSession } from "@/lib/auth";
import { CseError, fetchReportPdf } from "@/lib/cse/client";
import { findQuote, getCompanyReports } from "@/lib/cse/service";
import { getAnalysis, saveAnalysis } from "@/lib/db/user-data";
import { BadRequest, Conflict, fail, handle, json, NotFound, readJson, reqNumber, reqString } from "@/lib/http";
import { analysePdf, checkKey, GeminiError } from "@/lib/reports/gemini";
import { readGeminiKey } from "@/lib/reports/request";

export const maxDuration = 300; // reading a long report can take a minute or more

// One analysis at a time per user+report, and a modest hourly cap so a runaway client cannot burn the user's quota.
const g = globalThis as unknown as { __inflight?: Set<string>; __runs?: Map<string, number[]> };
const inflight: Set<string> = (g.__inflight ??= new Set<string>());
const runs: Map<string, number[]> = (g.__runs ??= new Map<string, number[]>());
const HOURLY_CAP = 20;

/**
 * Analyse one CSE report with the caller's own Gemini key (sent in the x-gemini-key header, used once, never
 * stored or logged). If this user already analysed the report, the saved result is returned without calling
 * Gemini unless `force` is true.
 */
export const POST = handle(async (req: Request) => {
  const { user, db } = await requireSession();
  const b = await readJson(req);
  const symbolInput = reqString(b, "symbol", 30);
  const reportId = reqNumber(b, "reportId", { min: 0, minExclusive: true });
  const force = b.force === true;

  const quote = await findQuote(symbolInput);
  if (!quote) throw new NotFound("Unknown symbol");

  if (!force) {
    const saved = await getAnalysis(db, reportId);
    if (saved) return json({ ...saved, cached: true });
  }

  const key = readGeminiKey(req);
  // The PDF location comes from CSE's own listing, never from the client.
  const { value: reports } = await getCompanyReports(quote.symbol);
  const report = reports.find((r) => r.id === reportId);
  if (!report) throw new NotFound("That report was not found for this company");

  const lock = `${user.id}:${reportId}`;
  if (inflight.has(lock)) throw new Conflict("This report is already being analysed. Please wait.");
  const recent = (runs.get(user.id) ?? []).filter((t) => Date.now() - t < 3600_000);
  if (recent.length >= HOURLY_CAP) throw new BadRequest(`You've analysed ${HOURLY_CAP} reports in the last hour. Please wait a while.`);
  runs.set(user.id, [...recent, Date.now()]);

  inflight.add(lock);
  try {
    const { model } = await checkKey(key); // also proves the key works before downloading a large PDF
    const pdf = await fetchReportPdf(report.path);
    const analysis = await analysePdf(key, model, pdf, { company: quote.name, title: report.title, date: report.date });
    const saved = { reportId, symbol: quote.symbol, kind: report.kind, title: report.title, reportDate: report.date, pdfPath: report.path, model, analysis };
    await saveAnalysis(db, saved);
    return json({ ...saved, createdAt: new Date().toISOString(), cached: false });
  } catch (e) {
    if (e instanceof GeminiError) return fail(e.status, e.message);
    if (e instanceof CseError) return fail(502, e.message);
    throw e;
  } finally {
    inflight.delete(lock);
  }
});
