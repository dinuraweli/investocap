// Normalised shapes returned by lib/cse/client.ts. These are InvestoCap's own types;
// the raw cse.lk payloads never leave the client module.

export interface Quote {
  id: number; // CSE stock id (also the id used by the chart endpoints)
  symbol: string; // e.g. "JKH.N0000"
  name: string;
  price: number;
  change: number;
  changePct: number;
  previousClose: number;
  high: number;
  low: number;
  volume: number;
  trades: number;
  turnover: number;
  marketCap: number;
  lastTradedAt: number | null; // epoch ms
}

export interface IndexValue {
  value: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  at: number; // epoch ms
}

export interface MarketSummary {
  turnover: number; // LKR
  shareVolume: number;
  trades: number;
  at: number;
}

export interface Mover {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
}

export interface ActiveStock {
  symbol: string;
  shareVolume: number;
  trades: number;
  turnover: number;
}

export interface SectorIndex {
  code: string;
  name: string;
  value: number;
  change: number;
  changePct: number;
  turnover: number;
}

export interface StockDetail {
  symbol: string;
  name: string;
  isin: string | null;
  issueDate: string | null;
  sharesIssued: number | null;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  high52w: number | null;
  low52w: number | null;
  ytdHigh: number | null;
  ytdLow: number | null;
  allTimeHigh: number | null;
  allTimeLow: number | null;
  marketCap: number;
  marketCapPct: number | null;
  volumeToday: number;
  turnoverToday: number;
  beta: number | null;
}

export interface PricePoint {
  t: number; // epoch ms
  price: number;
  high?: number;
  low?: number;
  volume?: number;
}

export type PeriodCode = 1 | 2 | 3 | 4 | 5; // 1D 1W 1M 3M 1Y (1Y is the CSE maximum)
