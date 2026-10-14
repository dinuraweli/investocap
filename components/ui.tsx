"use client";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-xl bg-subtle p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`whitespace-nowrap rounded-lg font-medium transition-colors ${
            size === "sm" ? "px-3 py-1.5 text-sm" : "px-3.5 py-2 text-sm sm:px-4"
          } ${value === o ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function MoreButton() {
  return (
    <button aria-label="More options" className="-m-1 rounded-lg p-1 text-ink hover:bg-subtle">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        <circle cx="4" cy="10" r="1.5" />
        <circle cx="10" cy="10" r="1.5" />
        <circle cx="16" cy="10" r="1.5" />
      </svg>
    </button>
  );
}

export function LinkAction({ children }: { children: React.ReactNode }) {
  return <button className="text-sm font-medium text-brand hover:underline">{children}</button>;
}


export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-subtle ${className}`} />;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-loss-soft px-4 py-3 text-sm text-loss">
      <span>{message}</span>
      {onRetry && <button onClick={onRetry} className="shrink-0 font-semibold underline">Retry</button>}
    </div>
  );
}

export function StaleBanner({ stale }: { stale?: boolean }) {
  if (!stale) return null;
  return <div className="rounded-xl bg-[#fff4e5] px-4 py-2.5 text-sm text-warn">Live prices are temporarily unavailable. Showing the last known values.</div>;
}
