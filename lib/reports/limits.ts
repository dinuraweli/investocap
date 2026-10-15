// A small in-memory hourly cap per user and bucket, so a runaway client cannot burn someone's own Gemini quota.
const g = globalThis as unknown as { __limits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__limits ??= new Map<string, number[]>());

/** true if the action is allowed (and records it); false once `cap` actions happened in the last hour. */
export function allow(userId: string, bucket: string, cap: number): boolean {
  const key = `${bucket}:${userId}`;
  const recent = (hits.get(key) ?? []).filter((t) => Date.now() - t < 3600_000);
  if (recent.length >= cap) { hits.set(key, recent); return false; }
  hits.set(key, [...recent, Date.now()]);
  return true;
}
