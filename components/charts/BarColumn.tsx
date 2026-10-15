/**
 * One bar inside a fixed-height box that may include negative values. `min` and `max` are the shared scale
 * (always spanning zero), so bars in the same chart are comparable. Positions are percentages, so it is
 * fully responsive.
 */
export function scaleOf(values: number[]): { min: number; max: number } {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  return { min, max: max === min ? min + 1 : max };
}

export default function BarColumn({ value, min, max, color, className = "" }: { value: number; min: number; max: number; color: string; className?: string }) {
  const span = max - min;
  const zero = (max / span) * 100; // % from the top where zero sits
  const h = (Math.abs(value) / span) * 100;
  const top = value >= 0 ? zero - h : zero;
  return <div className={`absolute rounded-[3px] ${className}`} style={{ top: `${top}%`, height: `${Math.max(h, 0.8)}%`, background: color }} />;
}

export function ZeroLine({ min, max }: { min: number; max: number }) {
  return <div className="absolute inset-x-0 border-t border-line" style={{ top: `${(max / (max - min)) * 100}%` }} aria-hidden />;
}
