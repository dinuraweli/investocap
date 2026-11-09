// Market-sentiment maths. Pure (no I/O): breadth internals + a descriptive 0-100 "mood" score, aggregation of
// director dealings into a net insider buy/sell signal, and the price reaction after a company announcement.
// Everything here is DESCRIPTIVE — it reports what the market did, never what anyone should do.

// ---- breadth & mood score ------------------------------------------------------------------------

export interface BreadthQuote { change: number; volume: number; turnover: number; price: number }
export interface BreadthSector { change: number }

export interface Breadth {
  advancers: number;
  decliners: number;
  unchanged: number;
  adRatio: number | null; // advancers / decliners
  upVolume: number;
  downVolume: number;
  upVolumeShare: number | null; // share of traded volume in rising stocks (0..1)
  upTurnover: number;
  downTurnover: number;
  upTurnoverShare: number | null; // share of turnover (money) in rising stocks
  sectorsUp: number;
  sectorsDown: number;
  sectorsTotal: number;
  score: number; // 0..100 composite
  label: "Broadly positive" | "Mixed" | "Broadly negative";
}

const share = (up: number, down: number): number | null => (up + down > 0 ? up / (up + down) : null);

export function moodLabel(score: number): Breadth["label"] {
  return score >= 60 ? "Broadly positive" : score >= 40 ? "Mixed" : "Broadly negative";
}

/**
 * Breadth from the day's quotes and sector moves. The composite score blends four breadth measures, each the
 * "rising share" of its pair (a neutral 0.5 when nothing is comparable), so a flat market sits near 50.
 * Weights: advance/decline 30%, up-volume 25%, up-turnover 25%, sector breadth 20%.
 */
export function computeBreadth(quotes: BreadthQuote[], sectors: BreadthSector[]): Breadth {
  const traded = quotes.filter((q) => q.price > 0);
  const up = traded.filter((q) => q.change > 0);
  const down = traded.filter((q) => q.change < 0);
  const unchanged = traded.filter((q) => q.change === 0);
  const sum = (list: BreadthQuote[], k: "volume" | "turnover") => list.reduce((s, q) => s + (q[k] || 0), 0);

  const upVolume = sum(up, "volume"), downVolume = sum(down, "volume");
  const upTurnover = sum(up, "turnover"), downTurnover = sum(down, "turnover");
  const sectorsUp = sectors.filter((s) => s.change > 0).length;
  const sectorsDown = sectors.filter((s) => s.change < 0).length;

  const adShare = share(up.length, down.length);
  const volShare = share(upVolume, downVolume);
  const turnShare = share(upTurnover, downTurnover);
  const secShare = share(sectorsUp, sectorsDown);
  const n = (v: number | null) => (v === null ? 0.5 : v); // neutral when a pair has no data
  const score = Math.round(100 * (0.3 * n(adShare) + 0.25 * n(volShare) + 0.25 * n(turnShare) + 0.2 * n(secShare)));

  return {
    advancers: up.length, decliners: down.length, unchanged: unchanged.length,
    adRatio: down.length > 0 ? up.length / down.length : null,
    upVolume, downVolume, upVolumeShare: volShare,
    upTurnover, downTurnover, upTurnoverShare: turnShare,
    sectorsUp, sectorsDown, sectorsTotal: sectors.length,
    score, label: moodLabel(score),
  };
}

// ---- director dealings ---------------------------------------------------------------------------

export interface DealingTx { type: string; quantity: number | null; price: number | null }
export interface DealingRecord {
  announcementId: number;
  company: string;
  symbol: string | null;
  date: string | null; // YYYY-MM-DD
  director: string | null;
  transactions: DealingTx[];
}

export interface DealingLine {
  announcementId: number;
  company: string;
  symbol: string | null;
  date: string | null;
  director: string | null;
  side: "buy" | "sell" | "mixed";
  value: number; // net LKR for this announcement (purchases positive)
}

export interface DealingsSummary {
  buyValue: number;
  sellValue: number;
  netValue: number; // buyValue - sellValue
  buyCount: number; // announcements that were net purchases
  sellCount: number;
  lines: DealingLine[]; // one per announcement, largest absolute value first
  bias: "buying" | "selling" | "balanced";
}

const isBuy = (type: string) => /purchase|buy|acqui|subscri/i.test(type) && !/sale|sell|dispos/i.test(type);
const isSell = (type: string) => /sale|sell|dispos/i.test(type);

/** A signed value for one transaction: purchases positive, sales negative, unknown types ignored. */
export function txValue(t: DealingTx): number {
  const v = (t.quantity ?? 0) * (t.price ?? 0);
  if (!Number.isFinite(v) || v === 0) return 0;
  return isBuy(t.type) ? v : isSell(t.type) ? -v : 0;
}

/** Aggregate recent director-dealing announcements into a net insider buy/sell signal. */
export function aggregateDealings(records: DealingRecord[]): DealingsSummary {
  const lines: DealingLine[] = [];
  let buyValue = 0, sellValue = 0, buyCount = 0, sellCount = 0;
  for (const r of records) {
    const signed = r.transactions.map(txValue);
    const net = signed.reduce((s, v) => s + v, 0);
    if (net === 0 && !signed.some((v) => v !== 0)) continue; // nothing quantifiable
    const anyBuy = signed.some((v) => v > 0), anySell = signed.some((v) => v < 0);
    const side: DealingLine["side"] = anyBuy && anySell ? "mixed" : net >= 0 ? "buy" : "sell";
    if (net > 0) { buyValue += net; buyCount++; } else if (net < 0) { sellValue += -net; sellCount++; }
    lines.push({ announcementId: r.announcementId, company: r.company, symbol: r.symbol, date: r.date, director: r.director, side, value: net });
  }
  lines.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const netValue = buyValue - sellValue;
  const bias = netValue > 0 && buyValue > sellValue * 1.2 ? "buying" : netValue < 0 && sellValue > buyValue * 1.2 ? "selling" : "balanced";
  return { buyValue, sellValue, netValue, buyCount, sellCount, lines, bias };
}

// ---- event impact (price reaction after an announcement) ------------------------------------------

export interface Reaction {
  baselineDate: string; // the close used as the "before" (prior trading day)
  baseline: number;
  afterDate: string;
  after: number;
  pct: number; // % change from baseline to after
  settled: boolean; // true once holdDays trading days have passed
}

/**
 * Price reaction to an announcement: from the close the trading day BEFORE it to the close `holdDays` trading
 * days after (or the latest close if fewer days have passed). `closes` is date-sorted [date, close]. null if
 * there isn't a usable before/after pair.
 */
export function reactionTo(closes: [string, number][], announcementDate: string, holdDays = 5): Reaction | null {
  if (closes.length < 2) return null;
  let annIdx = closes.findIndex(([d]) => d >= announcementDate);
  if (annIdx === -1) annIdx = closes.length - 1; // announcement after our last close: compare to latest
  const baseIdx = annIdx > 0 ? annIdx - 1 : 0;
  if (baseIdx === annIdx) return null; // no prior trading day to baseline against
  const afterIdx = Math.min(annIdx + holdDays, closes.length - 1);
  const [baselineDate, baseline] = closes[baseIdx];
  const [afterDate, after] = closes[afterIdx];
  if (!(baseline > 0) || afterIdx <= baseIdx) return null;
  return { baselineDate, baseline, afterDate, after, pct: ((after - baseline) / baseline) * 100, settled: afterIdx - annIdx >= holdDays };
}
