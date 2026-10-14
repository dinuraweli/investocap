// Contract check against the live cse.lk API. Run: npm run verify:cse
// Exits non-zero if any endpoint is unreachable or its shape has changed.
import * as cse from "../lib/cse/client.ts";

const checks: [string, () => Promise<unknown>, (v: any) => string][] = [
  ["tradeSummary", cse.fetchQuotes, (v) => (v.length ? `${v.length} quotes, e.g. ${v[0].symbol} @ ${v[0].price}` : "0 quotes (pre-market is normal)")],
  ["aspiData", cse.fetchAspi, (v) => (v ? `ASPI ${v.value} (${v.changePct.toFixed(2)}%)` : "no value yet (204, pre-market)")],
  ["snpData", cse.fetchSl20, (v) => (v ? `SL20 ${v.value} (${v.changePct.toFixed(2)}%)` : "no value yet (204, pre-market)")],
  ["marketStatus", cse.fetchMarketStatus, (v) => v.status],
  ["marketSummery", cse.fetchMarketSummary, (v) => `turnover ${v.turnover.toExponential(2)}, trades ${v.trades}`],
  ["topGainers", cse.fetchGainers, (v) => `${v.length} rows`],
  ["topLooses", cse.fetchLosers, (v) => `${v.length} rows`],
  ["mostActiveTrades", cse.fetchMostActive, (v) => `${v.length} rows`],
  ["allSectors", cse.fetchSectors, (v) => `${v.length} sectors`],
  ["companyInfoSummery", () => cse.fetchStockDetail("JKH.N0000"), (v) => `${v.name}, 52w ${v.low52w}-${v.high52w}`],
  ["companyChartDataByStock", () => cse.fetchStockHistory(297, 3), (v) => `${v.length} daily points`],
  ["chartData (ASPI)", () => cse.fetchIndexHistory(1, 3), (v) => `${v.length} daily points`],
];

let failed = 0;
for (const [name, fn, show] of checks) {
  try {
    console.log(`ok    ${name.padEnd(26)} ${show(await fn())}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name.padEnd(26)} ${(e as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
