import type { RatioItem } from "./reports/ratios.ts";

/** Display a ratio value: 12.3%, 1.52x, 45 days, LKR 300.0M. null shows an en dash. */
export function fmtRatio(v: number | null, format: RatioItem["format"]): string {
  if (v === null || !Number.isFinite(v)) return "–";
  switch (format) {
    case "pct": return `${v.toFixed(1)}%`;
    case "x": return `${v.toFixed(2)}x`;
    case "days": return `${Math.round(v)} days`;
    case "amount": return `${v < 0 ? "-" : ""}LKR ${Math.abs(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
  }
}

/** Compact number for chart labels: 1,250 / 12.5 / 0.07. */
export function fmtChart(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 100) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 10) return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
