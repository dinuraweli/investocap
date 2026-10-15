// Progress events streamed from /api/reports/analyse as newline-delimited JSON, so the page can show a real
// progress bar (stages, which model is working, and any switch to a backup model).
import type { SavedAnalysis } from "../api-types.ts";

export type Stage = "checking" | "downloading" | "uploading" | "analysing" | "saving";

export type ProgressEvent =
  | { type: "stage"; stage: Stage; pct: number; message: string; model?: string }
  | { type: "fallback"; from: string; to: string | null; reason: string; message: string }
  | { type: "done"; result: SavedAnalysis & { attempts: { model: string; reason: string }[] } }
  | { type: "error"; status: number; message: string }
  | { type: "ping" };

export const NDJSON = "application/x-ndjson";

/** Split a streamed text buffer into complete events; `rest` is the unfinished tail to prepend to the next chunk. */
export function parseNdjson(buffer: string): { events: ProgressEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: ProgressEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line) as ProgressEvent); } catch { /* ignore a corrupt line rather than break the stream */ }
  }
  return { events, rest };
}
