import { requireSession } from "@/lib/auth";
import { CseError, fetchReportPdf } from "@/lib/cse/client";
import { findQuote, getCompanyReports } from "@/lib/cse/service";
import { getAnalysis, saveAnalysis } from "@/lib/db/user-data";
import { BadRequest, Conflict, fail, handle, json, NotFound, readJson, reqNumber, reqString } from "@/lib/http";
import { analysePdf, checkKey, GeminiError } from "@/lib/reports/gemini";
import { NDJSON, type ProgressEvent } from "@/lib/reports/progress";
import { readGeminiKey } from "@/lib/reports/request";

export const maxDuration = 300; // reading a long report can take a minute or more

// One analysis at a time per user+report, and a modest hourly cap so a runaway client cannot burn the user's quota.
const g = globalThis as unknown as { __inflight?: Set<string>; __runs?: Map<string, number[]> };
const inflight: Set<string> = (g.__inflight ??= new Set<string>());
const runs: Map<string, number[]> = (g.__runs ??= new Map<string, number[]>());
const HOURLY_CAP = 20;

/** Turn an expected failure into an HTTP-style status and message; unexpected ones become a generic message. */
function describe(e: unknown): { status: number; message: string } {
  // Log the reason for expected failures too, so a bad run can be diagnosed. Messages are already scrubbed of the API key.
  if (e instanceof GeminiError) { console.warn("[analyse] gemini failure", { code: e.code, status: e.status, message: e.message }); return { status: e.status, message: e.message }; }
  if (e instanceof CseError) { console.warn("[analyse] cse failure", { message: e.message }); return { status: 502, message: e.message }; }
  console.error("[analyse]", e);
  return { status: 502, message: "Something went wrong while analysing. Please try again." };
}

/**
 * Analyse one CSE report with the caller's own Gemini key (sent in the x-gemini-key header, used once, never
 * stored or logged). The best available model is tried first; if it hits its limit, is overloaded or unavailable,
 * up to three backup models are tried in turn. If this user already analysed the report, the saved result is
 * returned without calling Gemini unless `force` is true.
 *
 * With `Accept: application/x-ndjson` the response streams progress events (see lib/reports/progress.ts)
 * and ends with a "done" or "error" event; otherwise it returns plain JSON.
 */
export const POST = handle(async (req: Request) => {
  const { user, db } = await requireSession();
  const b = await readJson(req);
  const symbolInput = reqString(b, "symbol", 30);
  const reportId = reqNumber(b, "reportId", { min: 0, minExclusive: true });
  const force = b.force === true;
  const wantsStream = req.headers.get("accept")?.includes(NDJSON) ?? false;

  const quote = await findQuote(symbolInput);
  if (!quote) throw new NotFound("Unknown symbol");

  if (!force) {
    const saved = await getAnalysis(db, reportId);
    if (saved) return json({ ...saved, cached: true, attempts: [] });
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

  const work = async (emit: (e: ProgressEvent) => void) => {
    try {
      emit({ type: "stage", stage: "checking", pct: 5, message: "Checking your Gemini key" });
      const { models } = await checkKey(key); // also proves the key works before downloading a large PDF
      emit({ type: "stage", stage: "downloading", pct: 15, message: "Downloading the report from the CSE" });
      const pdf = await fetchReportPdf(report.path);
      const { analysis, model, attempts } = await analysePdf(key, models, pdf, { company: quote.name, title: report.title, date: report.date }, (e) => {
        if (e.type === "uploading") emit({ type: "stage", stage: "uploading", pct: 30, message: "Sending the large report to Gemini" });
        else if (e.type === "trying") emit({ type: "stage", stage: "analysing", pct: 40, model: e.model, message: e.attempt === 1 ? `Reading the report with ${e.model}` : `Trying ${e.model} (backup ${e.attempt - 1} of ${e.of - 1})` });
        else {
          console.info("[analyse] fallback", { from: e.from, to: e.to, reason: e.reason });
          emit({ type: "fallback", from: e.from, to: e.to, reason: e.reason, message: `${e.from} ${e.reason}.${e.to ? ` Switching to ${e.to}.` : ""}` });
        }
      });
      console.info("[analyse] ok", { reportId, model, backupsUsed: attempts.length });
      emit({ type: "stage", stage: "saving", pct: 95, message: "Saving your analysis" });
      const saved = { reportId, symbol: quote.symbol, kind: report.kind, title: report.title, reportDate: report.date, pdfPath: report.path, model, analysis };
      await saveAnalysis(db, saved);
      return { ...saved, createdAt: new Date().toISOString(), attempts };
    } finally {
      inflight.delete(lock);
    }
  };

  if (!wantsStream) {
    try {
      return json({ ...(await work(() => {})), cached: false });
    } catch (e) {
      const d = describe(e);
      return fail(d.status, d.message);
    }
  }

  const enc = new TextEncoder();
  let ping: ReturnType<typeof setInterval> | undefined;
  return new Response(
    new ReadableStream({
      async start(controller) {
        let open = true;
        const emit = (e: ProgressEvent) => { if (open) { try { controller.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { open = false; } } };
        ping = setInterval(() => emit({ type: "ping" }), 10_000); // keeps the connection alive during the long Gemini call
        try {
          const result = await work(emit);
          emit({ type: "done", result: { ...result, cached: false } });
        } catch (e) {
          emit({ type: "error", ...describe(e) });
        } finally {
          clearInterval(ping);
          if (open) controller.close();
        }
      },
      cancel() { clearInterval(ping); }, // the page was closed; the analysis still finishes and is saved
    }),
    { headers: { "content-type": `${NDJSON}; charset=utf-8`, "cache-control": "no-store", "x-accel-buffering": "no" } },
  );
});
