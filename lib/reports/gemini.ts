// Minimal Gemini REST client (no SDK). The user's API key is passed in per call, used once, and never
// stored or logged: it travels in a header, and every error message is scrubbed of it before it leaves here.
import { RESPONSE_SCHEMA, SYSTEM_PROMPT, USER_PROMPT, validateAnalysis, type ReportAnalysis } from "./analysis.ts";

const BASE = () => process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com"; // overridable for tests
const INLINE_LIMIT = 10 * 1024 * 1024; // PDFs above this go through the Files API (inline requests cap at ~20 MB incl. base64)

export class GeminiError extends Error {
  status: number;
  code: "bad_key" | "quota" | "model" | "blocked" | "too_large" | "truncated" | "format" | "upstream";
  constructor(code: GeminiError["code"], message: string, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Loose sanity check on a pasted key: Google has issued several formats ("AIza..." and newer "AQ.…" keys that
 * contain dots), so we only reject things that are clearly not a key (spaces, quotes, newlines, wrong length).
 * Whether it actually works is decided by Gemini itself.
 */
export const isPlausibleKey = (key: string) => /^[A-Za-z0-9._~+/=-]{20,300}$/.test(key);

const scrub = (text: string, key: string) => (key ? text.split(key).join("[key]") : text);

// ---- model selection (pure) -------------------------------------------------------------------

export interface ModelInfo {
  name: string; // "models/gemini-2.5-flash"
  supportedGenerationMethods?: string[];
}

/**
 * Choose the best general "flash" model from the key's own model list: newest version first, stable over
 * preview/experimental, and never image/audio/tts/embedding/live/lite variants.
 */
export function pickModel(models: ModelInfo[]): string | null {
  const candidates = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini-[\d.]+-flash(-\d+)?$/.test(n)) // exact family: excludes -lite, -image, -tts, -live, -preview-...
    .map((n) => {
      const v = n.match(/^gemini-([\d.]+)-flash/)![1].split(".").map(Number);
      return { n, v: v[0] * 1000 + (v[1] ?? 0), pinned: /-\d+$/.test(n) };
    });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.v - a.v || Number(a.pinned) - Number(b.pinned)); // newest first; alias before dated copy
  return candidates[0].n;
}

// ---- request / response shaping (pure) ---------------------------------------------------------

type PdfRef = { kind: "inline"; base64: string } | { kind: "file"; uri: string };

export function buildRequest(pdf: PdfRef, meta: { company: string; title: string; date: string | null }) {
  const part = pdf.kind === "inline" ? { inlineData: { mimeType: "application/pdf", data: pdf.base64 } } : { fileData: { mimeType: "application/pdf", fileUri: pdf.uri } };
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [part, { text: USER_PROMPT(meta) }] }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, maxOutputTokens: 16384 },
  };
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** Pull the JSON text out of a generateContent response and validate it. */
export function parseGenerateResponse(res: GenerateResponse): ReportAnalysis {
  if (res.promptFeedback?.blockReason) throw new GeminiError("blocked", `Gemini declined to read this document (${res.promptFeedback.blockReason}).`);
  const cand = res.candidates?.[0];
  if (!cand) throw new GeminiError("format", "Gemini returned no answer.");
  if (cand.finishReason === "MAX_TOKENS") throw new GeminiError("truncated", "The analysis was cut off because the report is very large. Try a shorter report.");
  if (cand.finishReason && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(cand.finishReason)) {
    throw new GeminiError("blocked", `Gemini stopped early (${cand.finishReason}).`);
  }
  const text = (cand.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("").trim();
  if (!text) throw new GeminiError("format", "Gemini returned an empty answer.");
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new GeminiError("format", "Gemini's answer was not valid JSON. Please try again.");
  }
  try {
    return validateAnalysis(json);
  } catch (e) {
    throw new GeminiError("format", (e as Error).message);
  }
}

// ---- network -----------------------------------------------------------------------------------

async function call(path: string, key: string, init: RequestInit = {}, timeoutMs = 240_000): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE()}${path}`, { ...init, headers: { "x-goog-api-key": key, ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (e) {
    throw new GeminiError("upstream", scrub(`Could not reach Gemini: ${(e as Error).message}`, key));
  }
  if (res.ok) return res;
  const body = scrub(await res.text().catch(() => ""), key);
  let detail = "";
  try { detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? ""; } catch {}
  if (res.status === 400 && /api key|API_KEY/i.test(body)) throw new GeminiError("bad_key", "Gemini rejected this API key. Check it and try again.", 401);
  if (res.status === 401 || res.status === 403) throw new GeminiError("bad_key", "This API key is not allowed to use Gemini. Check the key and that the Gemini API is enabled for it.", 401);
  if (res.status === 429) throw new GeminiError("quota", "Your Gemini quota or rate limit was reached. Wait a minute, or check your plan in Google AI Studio.", 429);
  if (res.status === 404) throw new GeminiError("model", "That Gemini model isn't available for this key.", 502);
  if (res.status === 413) throw new GeminiError("too_large", "This report is too large for Gemini to read.", 413);
  throw new GeminiError("upstream", `Gemini error (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
}

/** Verify a key and choose a model, by asking Gemini which models this key can use. */
export async function checkKey(key: string): Promise<{ model: string }> {
  const res = await call("/v1beta/models?pageSize=200", key, {}, 20_000);
  const { models } = (await res.json()) as { models?: ModelInfo[] };
  const model = pickModel(models ?? []);
  if (!model) throw new GeminiError("model", "No suitable Gemini model was found for this key.");
  return { model };
}

async function uploadFile(key: string, bytes: ArrayBuffer, displayName: string): Promise<{ uri: string; name: string }> {
  const start = await call("/upload/v1beta/files", key, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength), "X-Goog-Upload-Header-Content-Type": "application/pdf", "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 100) } }),
  }, 30_000);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new GeminiError("upstream", "Gemini did not return an upload address.");
  const up = await fetch(uploadUrl, { method: "POST", headers: { "Content-Length": String(bytes.byteLength), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" }, body: bytes, signal: AbortSignal.timeout(180_000) })
    .catch((e) => { throw new GeminiError("upstream", scrub(`Upload to Gemini failed: ${(e as Error).message}`, key)); });
  if (!up.ok) throw new GeminiError("upstream", `Upload to Gemini failed (${up.status}).`);
  let file = ((await up.json()) as { file?: { uri?: string; name?: string; state?: string } }).file;
  // PDFs can take a moment to become ACTIVE.
  for (let i = 0; i < 20 && file?.state === "PROCESSING" && file.name; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    file = ((await (await call(`/v1beta/${file.name}`, key, {}, 15_000)).json()) as { uri?: string; name?: string; state?: string });
  }
  if (!file?.uri || !file.name) throw new GeminiError("upstream", "Gemini did not accept the uploaded file.");
  if (file.state === "FAILED") throw new GeminiError("upstream", "Gemini could not process this PDF.");
  return { uri: file.uri, name: file.name };
}

/** Analyse one PDF. Large files are uploaded and deleted afterwards (best effort; Gemini also expires them in 48h). */
export async function analysePdf(key: string, model: string, pdf: ArrayBuffer, meta: { company: string; title: string; date: string | null }): Promise<ReportAnalysis> {
  let ref: PdfRef;
  let uploaded: string | null = null;
  if (pdf.byteLength <= INLINE_LIMIT) {
    ref = { kind: "inline", base64: Buffer.from(pdf).toString("base64") };
  } else {
    const f = await uploadFile(key, pdf, meta.title);
    ref = { kind: "file", uri: f.uri };
    uploaded = f.name;
  }
  try {
    const res = await call(`/v1beta/models/${encodeURIComponent(model)}:generateContent`, key, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildRequest(ref, meta)) });
    return parseGenerateResponse((await res.json()) as GenerateResponse);
  } finally {
    if (uploaded) call(`/v1beta/${uploaded}`, key, { method: "DELETE" }, 15_000).catch(() => {});
  }
}
