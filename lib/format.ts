export const fmtLKR = (n: number, digits = 0) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtPrice = (n: number) => fmtLKR(n, 2);
export const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
export const fmtSigned = (n: number, digits = 0) => `${n >= 0 ? "+" : "-"}${fmtLKR(Math.abs(n), digits)}`;
export const toneText = (n: number) => (n > 0 ? "text-gain" : n < 0 ? "text-loss" : "text-muted");
export const toneBg = (n: number) => (n > 0 ? "bg-gain-soft text-gain" : n < 0 ? "bg-loss-soft text-loss" : "bg-subtle text-muted");

export function compact(n: number, digits = 2): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(digits === 0 ? 0 : 1)}K`;
  return fmtLKR(n, a < 100 ? 2 : 0);
}

export const shortSymbol = (symbol: string) => symbol.split(".")[0];

const TZ = "Asia/Colombo";
export const fmtTime = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const fmtDay = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
export const fmtMonth = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: TZ });
export const fmtFullDate = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ });
export const timeAgo = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
};
