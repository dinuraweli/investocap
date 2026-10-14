"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import SearchBox from "./SearchBox";
import { useAuth, useTrade } from "./Providers";

const TABS = [
  { href: "/", label: "Portfolio" },
  { href: "/markets", label: "Markets" },
  { href: "/watchlist", label: "Watchlist" },
] as const;

export function NavTabs() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav aria-label="Primary" className="inline-flex rounded-xl bg-subtle p-1">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors sm:px-4 ${active(t.href) ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export default function TopNav() {
  const { user, logout } = useAuth();
  const { openTrade } = useTrade();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const initials = user?.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="border-b border-line bg-surface">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l5-6 4 3 7-9" /><path d="M15 5h5v5" /></svg>
          </div>
          <span className="hidden text-lg font-semibold tracking-tight sm:block">InvestoCap</span>
        </Link>

        <div className="ml-4 hidden md:block"><NavTabs /></div>

        <div className="ml-auto flex items-center gap-2">
          <SearchBox className="w-40 sm:w-64" placeholder="Search stocks" onPick={(s) => router.push(`/stocks/${encodeURIComponent(s)}`)} />
          <button onClick={() => openTrade()} className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-semibold text-white hover:opacity-90 sm:px-5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <span className="hidden sm:inline">New Trade</span>
          </button>

          {user && (
            <div className="relative ml-1">
              <button onClick={() => setMenu((m) => !m)} aria-label="Account menu" aria-expanded={menu} className="flex items-center gap-3 rounded-xl p-1 hover:bg-subtle lg:border-l lg:border-line lg:pl-4">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{initials}</span>
                <span className="hidden text-left leading-tight lg:block">
                  <span className="block text-sm font-semibold">{user.name}</span>
                  <span className="block text-xs text-muted">{user.email}</span>
                </span>
              </button>
              {menu && (
                <div className="absolute right-0 z-40 mt-2 w-48 rounded-xl border border-line bg-surface p-1 shadow-lg">
                  <div className="truncate px-3 py-2 text-xs text-muted lg:hidden">{user.email}</div>
                  <button onClick={() => { setMenu(false); logout().then(() => router.push("/")); }} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle">Sign out</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="px-4 pb-3 md:hidden"><NavTabs /></div>
    </header>
  );
}
