// Cached, app-facing access to unit-trust data. Routes use this, never the client/db directly.
import { cached } from "../cse/cache.ts";
import { colomboDate } from "../time.ts";
import { fetchUnitPrices } from "./client.ts";
import * as store from "../db/funds.ts";
import type { Fund } from "./utasl.ts";

const TTL = 30 * 60 * 1000; // NAVs update once a day; 30 min is plenty

/** All funds with current NAVs. Falls back to the last stored snapshot if UTASL is unreachable. */
export function getFunds() {
  return cached("funds", TTL, loadFunds);
}

async function loadFunds(): Promise<Fund[]> {
  try {
    return await fetchUnitPrices();
  } catch (e) {
    const stored = await store.latestFundsFromDb();
    if (stored.length > 0) { console.warn("[funds] using stored NAVs:", (e as Error).message); return stored; }
    throw e;
  }
}

// Persist the fund list and today's NAV snapshot, at most once an hour (NAVs change daily). Call this via the
// route's after() hook so the write is NOT cut off when the serverless function freezes after responding.
const g = globalThis as unknown as { __fundsPersist?: number };
export async function persistFunds(funds: Fund[]): Promise<void> {
  const now = Date.now();
  if (funds.length === 0 || (g.__fundsPersist && now - g.__fundsPersist < 3600_000)) return;
  g.__fundsPersist = now;
  try {
    await store.upsertFunds(funds);
    await store.saveNavSnapshot(colomboDate(now), funds);
  } catch (e) {
    g.__fundsPersist = undefined;
    console.error("[funds persist]", (e as Error).message);
  }
}

export const getFund = (slug: string) => cached(`fund:${slug}`, TTL, async () => {
  const funds = (await getFunds()).value;
  return funds.find((f) => f.slug === slug) ?? (await store.fundBySlug(slug));
});

export const getFundHistory = (slug: string) => cached(`fundhist:${slug}`, TTL, () => store.navHistory(slug));

/** End-of-day: snapshot today's NAV for every fund (called by the cron). */
export async function snapshotFunds() {
  const funds = await fetchUnitPrices();
  await store.upsertFunds(funds);
  const rows = await store.saveNavSnapshot(colomboDate(Date.now()), funds);
  return { funds: funds.length, rows };
}
