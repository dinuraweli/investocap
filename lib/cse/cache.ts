// In-memory TTL cache with single-flight loading and stale-on-error, so N users
// cost one upstream call per TTL window and a cse.lk outage serves last-good data.

interface Entry<T> {
  value: T;
  fetchedAt: number;
}

export interface Cached<T> {
  value: T;
  fetchedAt: number;
  stale: boolean; // true when the refresh failed and we are serving the last good value
}

const g = globalThis as unknown as { __cseCache?: Map<string, Entry<unknown>>; __cseInflight?: Map<string, Promise<unknown>> };
const store = (g.__cseCache ??= new Map());
const inflight = (g.__cseInflight ??= new Map());

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<Cached<T>> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.fetchedAt < ttlMs) return { ...hit, stale: false };

  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    const value = await p;
    const entry = { value, fetchedAt: Date.now() };
    store.set(key, entry);
    return { ...entry, stale: false };
  } catch (e) {
    if (hit) return { ...hit, stale: true };
    throw e;
  }
}
