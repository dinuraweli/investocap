import { BadRequest } from "../http.ts";

/** Read the user's Gemini key from the request header. It is never read from a URL or body, and never logged. */
export function readGeminiKey(req: Request): string {
  const key = req.headers.get("x-gemini-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(key)) throw new BadRequest("Add your Gemini API key first (Reports → Gemini key).");
  return key;
}
