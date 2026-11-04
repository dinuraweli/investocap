// Fetches the UTASL unit-prices page and parses it. The browser never calls UTASL directly; this runs server-side.
import { parseUnitPrices, type Fund } from "./utasl.ts";

export class FundFetchError extends Error {}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Current NAVs for every Sri Lankan unit trust listed on UTASL. */
export async function fetchUnitPrices(): Promise<Fund[]> {
  let html: string;
  try {
    const res = await fetch("https://www.utasl.lk/unit-prices/", { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20000), cache: "no-store" });
    if (!res.ok) throw new FundFetchError(`UTASL returned HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    throw new FundFetchError(`Could not reach UTASL: ${(e as Error).message}`);
  }
  return parseUnitPrices(html); // throws FundParseError if the layout changed
}
