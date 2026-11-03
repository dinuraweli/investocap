// Pure chart geometry shared by chart components (kept out of .tsx so Node can test it).

export interface SeriesValues { values: (number | null)[] }

/** Shared y-range across every series, padded; spans zero when `includeZero` (for the gain chart). */
export function yRange(series: SeriesValues[], includeZero: boolean): { lo: number; hi: number } {
  const vals = series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length === 0) return { lo: 0, hi: 1 };
  let min = Math.min(...vals), max = Math.max(...vals);
  if (includeZero) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.08;
  return { lo: min - pad, hi: max + pad };
}
