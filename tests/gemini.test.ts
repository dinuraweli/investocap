import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { analysePdf, buildRequest, checkKey, GeminiError, parseGenerateResponse, pickModel } from "../lib/reports/gemini.ts";
import { isReportPath } from "../lib/cse/client.ts";

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
        if (mode === "quota") return json(429, { error: { message: "quota" } });
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
  assert.deepEqual(await checkKey(KEY), { model: "gemini-2.5-flash" });
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
  const a = await analysePdf(KEY, "gemini-2.5-flash", pdf, META);
  assert.equal(a.summary, "Profit rose.");
  const gen = seen.find((s) => s.url.includes(":generateContent"))!;
  assert.equal(gen.key, KEY);
  assert.ok(gen.body.includes("inlineData"));
  assert.ok(!seen.some((s) => s.url.includes("/upload/")));
});

test("large PDFs are uploaded via the Files API, referenced by uri, then deleted", async () => {
  seen = []; mode = "ok";
  const big = new Uint8Array(11 * 1024 * 1024).buffer as ArrayBuffer; // over the 10 MB inline limit
  await analysePdf(KEY, "gemini-2.5-flash", big, META);
  const gen = seen.find((s) => s.url.includes(":generateContent"))!;
  assert.ok(gen.body.includes("fileData") && !gen.body.includes("inlineData"));
  assert.ok(seen.some((s) => s.url === "/upload/v1beta/files"));
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(seen.some((s) => s.method === "DELETE" && s.url.includes("files/abc")), "uploaded file should be deleted");
});

test("quota errors are reported as such", async () => {
  mode = "quota";
  await assert.rejects(() => analysePdf(KEY, "m", new TextEncoder().encode("%PDF").buffer as ArrayBuffer, META), (e: unknown) => (e as GeminiError).code === "quota" && (e as GeminiError).status === 429);
  mode = "ok";
});

test("only CSE report PDF paths are accepted (no SSRF or traversal)", () => {
  assert.ok(isReportPath("cmt/upload_report_file/508_1785229278745.pdf"));
  assert.ok(isReportPath("upload_report_file/508_1527245600414.pdf"));
  for (const bad of ["http://evil.com/a.pdf", "../etc/passwd", "cmt/upload_report_file/../../x.pdf", "cmt/upload_report_file/a.exe", "//evil.com/upload_report_file/a.pdf", ""]) assert.ok(!isReportPath(bad), bad);
});
