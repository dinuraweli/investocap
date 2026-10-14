import type { ActiveStock, IndexValue, MarketSummary, Mover, PricePoint, Quote, SectorIndex, StockDetail } from "./cse/types.ts";
export type { Quote, StockDetail, PricePoint };

export type QuoteWithSector = Quote & { sector: string };

export interface MarketResponse {
  status: { status: string; open: boolean };
  aspi: IndexValue;
  sl20: IndexValue;
  summary: MarketSummary;
  breadth: { advancers: number; decliners: number; unchanged: number };
  gainers: Mover[];
  losers: Mover[];
  active: ActiveStock[];
  sectors: SectorIndex[];
  stale: boolean;
  fetchedAt: number;
}

export interface StocksResponse { total: number; fetchedAt: number; stale: boolean; stocks: QuoteWithSector[] }
export interface StockResponse { quote: QuoteWithSector; detail: StockDetail | null; stale: boolean }
export interface HistoryResponse { symbol: string; range: string; stale: boolean; points: PricePoint[] }

export interface HoldingRow {
  symbol: string; name: string; sector: string; quantity: number; avgCost: number; costBasis: number;
  price: number; change: number; changePct: number; priceMissing: boolean; value: number; dayChange: number;
  unrealised: number; unrealisedPct: number; trend7d: number[]; allocPct: number;
}
export interface PortfolioResponse {
  fetchedAt: number; stale: boolean;
  totals: { value: number; cost: number; unrealised: number; unrealisedPct: number; realised: number; dayChange: number; dayChangePct: number };
  holdings: HoldingRow[];
  allocation: { sector: string; value: number; pct: number }[];
}
export interface PortfolioHistoryResponse {
  range: string; points: { date: string; value: number }[]; startValue: number; endValue: number;
  change: number; netFlow: number; gain: number; returnPct: number;
}
export interface WatchlistsResponse { fetchedAt: number; stale: boolean; watchlists: { id: number; name: string; stocks: QuoteWithSector[] }[] }
export interface User { id: string; email: string; name: string }
