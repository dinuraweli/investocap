// Pick the peers shown for a stock: other companies in the same CSE sector, largest first.

export interface PeerRow {
  symbol: string;
  name: string;
  sector: string | null; // the CSE's own sector name
  price: number;
  changePct: number;
  marketCap: number;
}

export interface Peers {
  sector: string | null;
  peers: PeerRow[]; // up to `limit`, largest by market cap first
  total: number; // companies known to be in the sector (including this one)
}

export function selectPeers(selfSymbol: string, rows: PeerRow[], limit = 8): Peers {
  const self = rows.find((r) => r.symbol === selfSymbol);
  const sector = self?.sector ?? null;
  if (!sector) return { sector: null, peers: [], total: 0 };
  const inSector = rows.filter((r) => r.sector === sector);
  const peers = inSector.filter((r) => r.symbol !== selfSymbol).sort((a, b) => b.marketCap - a.marketCap).slice(0, limit);
  return { sector, peers, total: inSector.length };
}
