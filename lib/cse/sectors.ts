// Ticker-root -> sector. The CSE API exposes sector indices but not membership, so this
// is a hand-maintained map (ported from the old cse-dashboard). Unknown tickers are "Other".
const SECTOR_MAP: Record<string, string> = {
  COMB: "Banking", HNB: "Banking", SAMP: "Banking", NDB: "Banking", DFCC: "Banking", SEYB: "Banking", PABC: "Banking", UBC: "Banking",
  LOLC: "Finance", CFIN: "Finance", CINS: "Insurance", AINS: "Insurance",
  JKL: "Diversified", HAYL: "Diversified", SPEN: "Diversified", RICH: "Diversified",
  DIAL: "Telecom", SLTL: "Telecom",
  LION: "Beverage", DIST: "Beverage",
  CARG: "Consumer", CTC: "Consumer",
  JKH: "Conglomerate",
  AHPL: "Hotels", HOPL: "Hotels", MELS: "Hotels", AHUN: "Hotels",
  ASHO: "Manufacturing", TKYO: "Manufacturing",
  ACL: "Trading",
  LLUB: "Oil & Gas", COCR: "Oil & Gas",
};

export const symbolRoot = (symbol: string) => symbol.split(".")[0].trim().toUpperCase();
export const sectorOf = (symbol: string) => SECTOR_MAP[symbolRoot(symbol)] ?? "Other";
