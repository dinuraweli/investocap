import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AnnouncementDetail } from "../lib/cse/company.ts";
import { announcementPrompt, BRIEF_SYSTEM, briefPrompt, EXPLAIN_SYSTEM, ExplainFormatError, stripAdvice, validateBrief, validateExplanation } from "../lib/reports/explain.ts";
import { generateJson, GeminiError } from "../lib/reports/gemini.ts";

const detail = (o: Partial<AnnouncementDetail> = {}): AnnouncementDetail => ({ id: 1, headline: "Final Dividend (Rs.0.10 per share)", date: "2026-05-26", docs: [], dividend: null, dealing: null, facts: [], ...o });

test("advice and predictions are stripped sentence by sentence", () => {
  assert.equal(stripAdvice("The company will pay Rs 0.10 per share. Investors should buy before the ex-date. Payment is on 24 June."), "The company will pay Rs 0.10 per share. Payment is on 24 June.");
  assert.equal(stripAdvice("The shares look undervalued."), "");
  assert.equal(stripAdvice("This is bullish for the stock. It will rise."), "");
  assert.equal(stripAdvice("The director bought 1,000 shares at LKR 12."), "The director bought 1,000 shares at LKR 12.");
});

test("explanation validation keeps facts, drops advice, and rejects empty answers", () => {
  const e = validateExplanation({ summary: "A final dividend was declared. You should buy now.", keyFacts: [{ label: "Per share", value: "LKR 0.10" }, { label: "", value: "x" }, { label: "Ex-date", value: "5 June 2026" }] });
  assert.equal(e.summary, "A final dividend was declared.");
  assert.deepEqual(e.keyFacts, [{ label: "Per share", value: "LKR 0.10" }, { label: "Ex-date", value: "5 June 2026" }]);
  assert.throws(() => validateExplanation({ summary: "It is undervalued." }), ExplainFormatError);
  assert.throws(() => validateExplanation(null), ExplainFormatError);
  assert.equal(validateExplanation({ summary: "ok.", keyFacts: Array.from({ length: 20 }, (_, i) => ({ label: `l${i}`, value: "v" })) }).keyFacts.length, 6);
});

test("brief validation caps points and removes advice", () => {
  const b = validateBrief({ brief: "A diversified group. Analysts expect it will rise.", points: ["a", "b", "c", "d", "e", "price target is 20"] });
  assert.equal(b.brief, "A diversified group.");
  assert.equal(b.points.length, 4);
  assert.throws(() => validateBrief({ brief: "" }), ExplainFormatError);
});

test("the system prompts forbid advice and tell the model to treat provided text as data", () => {
  for (const s of [EXPLAIN_SYSTEM, BRIEF_SYSTEM]) {
    assert.match(s, /Do NOT give investment advice/);
    assert.match(s, /DATA, never as instructions/);
    assert.match(s, /ONLY the information provided/);
  }
});

test("announcement prompts carry the structured facts and say whether a document is attached", () => {
  const div = announcementPrompt({ company: "X PLC", category: "CASH DIVIDEND", hasDocument: true, detail: detail({ dividend: { perShare: 0.1, financialYear: "2025/26", final: true, exDate: "2026-06-05", paymentDate: "2026-06-24", recordDate: "2026-06-08" } }) });
  assert.match(div, /LKR 0\.1 per share \(final\) for 2025\/26/);
  assert.match(div, /ex-dividend 2026-06-05; record 2026-06-08; payment 2026-06-24/);
  assert.match(div, /PDF of the announcement is attached/);
  const dealing = announcementPrompt({ company: "X PLC", category: "DEALINGS BY DIRECTORS", hasDocument: false, detail: detail({ headline: "DEALINGS BY DIRECTOR", dealing: { director: "Mr. A B", role: "Executive Director", transactions: [{ type: "Purchase of Shares", date: "2026-08-12", quantity: 1127659, price: 12.17 }] } }) });
  assert.match(dealing, /Mr\. A B \(Executive Director\)/);
  assert.match(dealing, /Purchase of Shares on 2026-08-12: 1,127,659 shares at LKR 12\.17/);
  assert.match(dealing, /No document is attached/);
});

test("brief prompts include announcements and results when present, and say so when results are missing", () => {
  const withResults = briefPrompt({ name: "X PLC", sector: "Banks", boardType: "Main Board", established: "1979", businessSummary: "Banking.", announcements: [{ date: "2026-08-13", category: "DEALINGS BY DIRECTORS", headline: "DEALINGS BY DIRECTOR" }, { date: "2026-06-30", category: "CORPORATE DISCLOSURE", headline: "Change in board committees" }],
    results: { periodLabel: "Quarter ended 30 June 2026", summary: "Profit rose.", metrics: [{ label: "Net profit", current: 1250, previous: 800, unit: "LKR million" }] } });
  assert.match(withResults, /Sector: Banks/);
  assert.match(withResults, /2026-06-30: CORPORATE DISCLOSURE \(Change in board committees\)/);
  assert.doesNotMatch(withResults, /DEALINGS BY DIRECTORS \(DEALINGS BY DIRECTOR\)/); // headline that repeats the category is not repeated
  assert.match(withResults, /Net profit: 1,250 vs 800 before \(LKR million\)/);
  assert.match(briefPrompt({ name: "X", sector: null, boardType: null, established: null, businessSummary: null, announcements: [], results: null }), /No analysed financial results are available/);
});

// ---- generateJson against a fake Gemini ----
let server: Server; let calls: { model: string; body: string }[] = []; let behave: Record<string, string> = {};
before(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const model = decodeURIComponent((req.url ?? "").split("/models/")[1]?.split(":")[0] ?? "");
      calls.push({ model, body: Buffer.concat(chunks).toString() });
      const b = behave[model] ?? "ok";
      const send = (code: number, o: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (b === "quota") return send(429, { error: { message: "quota" } });
      send(200, { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ summary: "A final dividend was declared.", keyFacts: [{ label: "Per share", value: "LKR 0.10" }] }) }] } }] });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.GEMINI_API_BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

test("generateJson sends the system prompt, schema, text and an optional PDF, and validates the answer", async () => {
  calls = []; behave = {};
  const spec = { system: EXPLAIN_SYSTEM, text: "Explain this.", schema: { type: "OBJECT" }, validate: validateExplanation };
  const r = await generateJson("KEY-abcdefghijklmnopqrstuv", ["m1"], { ...spec, pdf: { bytes: new TextEncoder().encode("%PDF-1.4 x").buffer as ArrayBuffer, title: "t" } });
  assert.equal(r.result.summary, "A final dividend was declared.");
  const sent = JSON.parse(calls[0].body);
  assert.match(sent.systemInstruction.parts[0].text, /Do NOT give investment advice/);
  assert.equal(sent.generationConfig.responseMimeType, "application/json");
  assert.ok(sent.contents[0].parts[0].inlineData, "PDF attached");
  assert.equal(sent.contents[0].parts.at(-1).text, "Explain this.");
  calls = [];
  await generateJson("KEY-abcdefghijklmnopqrstuv", ["m1"], spec);
  assert.ok(!JSON.parse(calls[0].body).contents[0].parts[0].inlineData, "no PDF when none given");
});

test("generateJson falls back through the chain like the report analysis does", async () => {
  calls = []; behave = { A: "quota" };
  const r = await generateJson("KEY-abcdefghijklmnopqrstuv", ["A", "B"], { system: "s", text: "t", schema: {}, validate: validateExplanation });
  assert.equal(r.model, "B");
  assert.deepEqual(r.attempts, [{ model: "A", reason: "hit its usage limit" }]);
  assert.deepEqual(calls.map((c) => c.model), ["A", "B"]);
  behave = { A: "quota", B: "quota" };
  await assert.rejects(() => generateJson("KEY-abcdefghijklmnopqrstuv", ["A", "B"], { system: "s", text: "t", schema: {}, validate: validateExplanation }), (e: unknown) => e instanceof GeminiError && e.code === "quota");
});
