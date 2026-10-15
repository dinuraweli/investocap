import { BadRequest } from "../http.ts";
import { isPlausibleKey } from "./gemini.ts";

/** Read the user's Gemini key from the request header. It is never read from a URL or body, and never logged. */
export function readGeminiKey(req: Request): string {
  const key = req.headers.get("x-gemini-key")?.trim() ?? "";
  if (!key) throw new BadRequest("Add your Gemini API key first (Reports → Gemini key).");
  if (!isPlausibleKey(key)) throw new BadRequest("That doesn't look like a Gemini API key. Paste just the key, with no spaces, quotes or line breaks.");
  return key;
}
