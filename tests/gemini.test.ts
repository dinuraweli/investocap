import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { analysePdf, buildRequest, checkKey, GeminiError, isPlausibleKey, parseGenerateResponse, pickModel, rankModels, type AnalysisEvent } from "../lib/reports/gemini.ts";
import { isReportPath } from "../lib/cse/client.ts";
import { parseNdjson } from "../lib/reports/progress.ts";

const KEY = "AIzaFAKE-test-key-123";
const META = { company: "Test Co PLC", title: "Interim Financial Statements Q1", date: "2026-07-28" };
const ANALYSIS = {
  reportType: "interim", periodLabel: "Quarter ended 30 June 2026", periodEnd: "2026-06-30", scope: "Group", currency: "LKR", summary: "Profit rose.",
  metrics: [{ key: "revenue", label: "Revenue", current: 10, previous: 8, unit: "LKR million", page: 2 }],
  highlights: [{ text: "Up", page: 2 }], risks: [], auditor: { opinion: "not_included" }, outlook: null, notes: [],
};

// ---- a tiny fake Gemini ----
interface Seen { method: string; url: string; key: string | undefined; body: string; headers: IncomingMessage["headers"] }
let server: Server; let base = ""; let seen: Seen[] = []; let mode = "ok";
let behave: Record<string, string> = {}; // model name -> ok | quota | overloaded | notfound | garbage | badkey
before(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      seen.push({ method: req.method!, url: req.url!, key: req.headers["x-goog-api-key"] as string | undefined, body, headers: req.headers });
      const json = (code: number, obj: unknown, h: Record<string, string> = {}) => { res.writeHead(code, { "content-type": "application/json", ...h }); res.end(JSON.stringify(obj)); };
      if (req.url!.startsWith("/v1beta/models?")) {
        if (mode === "badkey") return json(400, { error: { message: `API key not valid. Please pass a valid API key. (${KEY})` } });
        return json(200, { models: [
          { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
        ] });
      }
      if (req.url === "/upload/v1beta/files") return json(200, {}, { "x-goog-upload-url": `${base}/upload-target` });
      if (req.url === "/upload-target") return json(200, { file: { name: "files/abc", uri: `${base}/files/abc`, state: "ACTIVE" } });
      if (req.method === "DELETE") return json(200, {});
      if (req.url!.includes(":generateContent")) {
        const model = decodeURIComponent(req.url!.split("/models/")[1].split(":")[0]);
        const b = mode === "quota" ? "quota" : behave[model] ?? "ok";
        if (b === "quota") return json(429, { error: { message: "quota" } });
        if (b === "overloaded") return json(503, { error: { message: "The model is overloaded." } });
        if (b === "notfound") return json(404, { error: { message: "not found" } });
        if (b === "badkey") return json(401, { error: { message: "bad key" } });
        if (b === "garbage") return json(200, { candidates: [{ content: { parts: [{ text: "this is not json" }] }, finishReason: "STOP" }] });
        return json(200, { candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: JSON.stringify(ANALYSIS) }] }, finishReason: "STOP" }] });
      }
      json(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.GEMINI_API_BASE = base;
});
after(() => server.close());

test("picks the newest stable flash model and skips lite/pro/older", () => {
  assert.equal(pickModel([
    { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash-image", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3-flash-preview", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
  ]), "gemini-2.5-flash");
  assert.equal(pickModel([{ name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }]), "gemini-3.6-flash");
  assert.equal(pickModel([{ name: "models/text-bison", supportedGenerationMethods: ["generateContent"] }]), null);
});

test("request carries the PDF, the schema, and a no-advice system prompt", () => {
  const first = (r: ReturnType<typeof buildRequest>) => r.contents[0].parts[0] as { inlineData?: { mimeType: string }; fileData?: { fileUri: string } };
  const inline = buildRequest({ kind: "inline", base64: "QUJD" }, META);
  assert.equal(first(inline).inlineData?.mimeType, "application/pdf");
  assert.equal(inline.generationConfig.responseMimeType, "application/json");
  assert.match(inline.systemInstruction.parts[0].text, /Do NOT give investment advice/);
  const file = buildRequest({ kind: "file", uri: "https://x/files/1" }, META);
  assert.equal(first(file).fileData?.fileUri, "https://x/files/1");
});

test("parses a response, ignoring thought parts and code fences", () => {
  const a = parseGenerateResponse({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "hmm", thought: true }, { text: "```json\n" + JSON.stringify(ANALYSIS) + "\n```" }] } }] });
  assert.equal(a.metrics[0].key, "revenue");
});

test("maps blocked, truncated, empty and malformed responses to clear errors", () => {
  const code = (r: Parameters<typeof parseGenerateResponse>[0]) => { try { parseGenerateResponse(r); } catch (e) { return (e as GeminiError).code; } return "none"; };
  assert.equal(code({ promptFeedback: { blockReason: "SAFETY" } }), "blocked");
  assert.equal(code({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] }), "truncated");
  assert.equal(code({ candidates: [] }), "format");
  assert.equal(code({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not json" }] } }] }), "format");
  assert.equal(code({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{\"summary\":\"\"}" }] } }] }), "format");
});

test("checkKey picks a model and sends the key in a header, not the URL", async () => {
  seen = []; mode = "ok";
  assert.deepEqual(await checkKey(KEY), { model: "gemini-2.5-flash", models: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"] });
  assert.equal(seen[0].key, KEY);
  assert.ok(!seen[0].url.includes(KEY));
});

test("a rejected key gives a clean error and never echoes the key", async () => {
  mode = "badkey";
  await assert.rejects(() => checkKey(KEY), (e: unknown) => {
    assert.ok(e instanceof GeminiError);
    assert.equal(e.code, "bad_key");
    assert.ok(!e.message.includes(KEY));
    return true;
  });
  mode = "ok";
});

test("small PDFs are sent inline; the key is in the header", async () => {
  seen = []; mode = "ok";
  const pdf = new TextEncoder().encode("%PDF-1.4 small").buffer as ArrayBuffer;
  const { analysis: a, model } = await analysePdf(KEY, ["gemini-2.5-flash"], pdf, META);
  assert.equal(a.summary, "Profit rose.");
  assert.equal(model, "gemini-2.5-flash");
  const gen = seen.find((s) => s.url.includes(":generateContent"))!;
  assert.equal(gen.key, KEY);
  assert.ok(gen.body.includes("inlineData"));
  assert.ok(!seen.some((s) => s.url.includes("/upload/")));
});

test("large PDFs are uploaded via the Files API, referenced by uri, then deleted", async () => {
  seen = []; mode = "ok";
  const big = new Uint8Array(11 * 1024 * 1024).buffer as ArrayBuffer; // over the 10 MB inline limit
  await analysePdf(KEY, ["gemini-2.5-flash"], big, META);
  const gen = seen.find((s) => s.url.includes(":generateContent"))!;
  assert.ok(gen.body.includes("fileData") && !gen.body.includes("inlineData"));
  assert.ok(seen.some((s) => s.url === "/upload/v1beta/files"));
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(seen.some((s) => s.method === "DELETE" && s.url.includes("files/abc")), "uploaded file should be deleted");
});

test("quota errors are reported as such", async () => {
  mode = "quota";
  await assert.rejects(() => analysePdf(KEY, ["m"], new TextEncoder().encode("%PDF").buffer as ArrayBuffer, META), (e: unknown) => (e as GeminiError).code === "quota" && (e as GeminiError).status === 429);
  mode = "ok";
});

test("only CSE report PDF paths are accepted (no SSRF or traversal)", () => {
  assert.ok(isReportPath("cmt/upload_report_file/508_1785229278745.pdf"));
  assert.ok(isReportPath("upload_report_file/508_1527245600414.pdf"));
  for (const bad of ["http://evil.com/a.pdf", "../etc/passwd", "cmt/upload_report_file/../../x.pdf", "cmt/upload_report_file/a.exe", "//evil.com/upload_report_file/a.pdf", ""]) assert.ok(!isReportPath(bad), bad);
});

test("accepts every Google key format (including newer keys with dots) and rejects obvious non-keys", () => {
  for (const ok of ["AIza" + "x".repeat(35), "AQ." + "y".repeat(40), "A".repeat(20)]) assert.ok(isPlausibleKey(ok), ok);
  for (const bad of ["", "short", "has space in the middle 1234567890", "quoted\"key1234567890123456", "new\nline1234567890123456789", "A".repeat(301)]) assert.ok(!isPlausibleKey(bad), bad);
});

// ---- model ranking and fallback ----------------------------------------------------------------

const gen = (names: string[]) => names.map((name) => ({ name: `models/${name}`, supportedGenerationMethods: ["generateContent"] }));
const PDF = () => new TextEncoder().encode("%PDF-1.4 small").buffer as ArrayBuffer;
const generateCalls = () => seen.filter((s) => s.url.includes(":generateContent")).map((s) => decodeURIComponent(s.url.split("/models/")[1].split(":")[0]));

test("ranks the newest flash models first and keeps the primary plus 3 backups", () => {
  const list = gen(["gemini-2.0-flash", "gemini-3.8-flash", "gemini-2.5-flash", "gemini-3.6-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3.8-flash-preview-09-2026", "gemini-2.5-flash-image", "gemini-2.0-flash-live-001", "gemini-embedding-001", "gemini-2.0-flash-001"]);
  assert.deepEqual(rankModels(list), ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash"]);
  assert.equal(pickModel(list), "gemini-3.8-flash");
});

test("with few flash models it falls through to flash-lite then pro", () => {
  assert.deepEqual(rankModels(gen(["gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-2.5-flash"])), ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]);
  assert.deepEqual(rankModels(gen(["gemini-2.0-flash-001"])), ["gemini-2.0-flash-001"]); // dated copy used only when there is no alias
  assert.deepEqual(rankModels([]), []);
});

test("quota on the primary falls back to the next model and reports it", async () => {
  seen = []; mode = "ok"; behave = { A: "quota" };
  const events: AnalysisEvent[] = [];
  const r = await analysePdf(KEY, ["A", "B", "C", "D"], PDF(), META, (e) => events.push(e));
  assert.equal(r.model, "B");
  assert.deepEqual(r.attempts, [{ model: "A", reason: "hit its usage limit" }]);
  assert.deepEqual(generateCalls(), ["A", "B"]); // stopped as soon as one worked
  assert.deepEqual(events.map((e) => e.type), ["trying", "fallback", "trying"]);
  assert.deepEqual(events[1], { type: "fallback", from: "A", to: "B", reason: "hit its usage limit" });
});

test("walks through several failures: quota, overloaded, unavailable, then succeeds on the 4th model", async () => {
  seen = []; behave = { A: "quota", B: "overloaded", C: "notfound" };
  const r = await analysePdf(KEY, ["A", "B", "C", "D"], PDF(), META);
  assert.equal(r.model, "D");
  assert.deepEqual(r.attempts.map((a) => a.reason), ["hit its usage limit", "is overloaded right now", "isn't available for your key"]);
  assert.deepEqual(generateCalls(), ["A", "B", "C", "D"]);
});

test("an unreadable (non-JSON) answer from one model moves on to the next", async () => {
  seen = []; behave = { A: "garbage" };
  const r = await analysePdf(KEY, ["A", "B"], PDF(), META);
  assert.equal(r.model, "B");
  assert.equal(r.attempts[0].reason, "returned an unreadable answer");
});

test("when every model is out of quota the error says so (429) and lists nothing sensitive", async () => {
  seen = []; behave = { A: "quota", B: "quota", C: "quota", D: "quota" };
  await assert.rejects(() => analysePdf(KEY, ["A", "B", "C", "D"], PDF(), META), (e: unknown) => {
    assert.ok(e instanceof GeminiError);
    assert.equal(e.code, "quota");
    assert.equal(e.status, 429);
    assert.match(e.message, /all 4 available models/);
    assert.ok(!e.message.includes(KEY));
    return true;
  });
  assert.equal(generateCalls().length, 4);
});

test("a mix of failures reports each model's problem", async () => {
  seen = []; behave = { A: "quota", B: "overloaded" };
  await assert.rejects(() => analysePdf(KEY, ["A", "B"], PDF(), META), (e: unknown) => {
    assert.ok(e instanceof GeminiError);
    assert.match(e.message, /A hit its usage limit; B is overloaded right now/);
    return true;
  });
});

test("a rejected key does NOT fall back (no other model can fix it)", async () => {
  seen = []; behave = { A: "badkey" };
  await assert.rejects(() => analysePdf(KEY, ["A", "B", "C"], PDF(), META), (e: unknown) => (e as GeminiError).code === "bad_key");
  assert.deepEqual(generateCalls(), ["A"]);
});

test("a large PDF is uploaded once and reused for every attempt, then deleted", async () => {
  seen = []; behave = { A: "quota" };
  const big = new Uint8Array(11 * 1024 * 1024).buffer as ArrayBuffer;
  const events: AnalysisEvent[] = [];
  const r = await analysePdf(KEY, ["A", "B"], big, META, (e) => events.push(e));
  assert.equal(r.model, "B");
  assert.equal(seen.filter((s) => s.url === "/upload/v1beta/files").length, 1);
  assert.deepEqual(generateCalls(), ["A", "B"]);
  assert.equal(events[0].type, "uploading");
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(seen.some((s) => s.method === "DELETE"));
});

test("streamed progress lines are reassembled across chunk boundaries and bad lines are skipped", () => {
  const a = parseNdjson('{"type":"stage","stage":"checking","pct":5,"message":"x"}\n{"type":"pi');
  assert.equal(a.events.length, 1);
  assert.equal(a.rest, '{"type":"pi');
  const b = parseNdjson(a.rest + 'ng"}\nnot json\n{"type":"error","status":429,"message":"m"}\n');
  assert.deepEqual(b.events.map((e) => e.type), ["ping", "error"]);
  assert.equal(b.rest, "");
});
