"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, revalidateAll, useApi } from "@/lib/useApi";
import type { User } from "@/lib/api-types";
import TradeModal from "./TradeModal";

interface AuthCtx { user: User | null; loading: boolean; refresh: () => void; logout: () => Promise<void> }
const Auth = createContext<AuthCtx>({ user: null, loading: true, refresh: () => {}, logout: async () => {} });
export const useAuth = () => useContext(Auth);

export interface TradeOpts { symbol?: string; side?: "buy" | "sell" }
const Trade = createContext<{ openTrade: (o?: TradeOpts) => void }>({ openTrade: () => {} });
export const useTrade = () => useContext(Trade);

export default function Providers({ children }: { children: React.ReactNode }) {
  const me = useApi<{ user: User | null }>("/api/auth/me");
  const [trade, setTrade] = useState<TradeOpts | null>(null);
  const router = useRouter();

  const logout = useCallback(async () => {
    await apiPost("/api/auth/logout");
    me.reload();
    revalidateAll();
  }, [me]);

  const auth: AuthCtx = { user: me.data?.user ?? null, loading: me.loading, refresh: me.reload, logout };
  return (
    <Auth.Provider value={auth}>
      <Trade.Provider value={{ openTrade: (o = {}) => (auth.user ? setTrade(o) : router.push("/")) }}>
        {children}
        {trade && auth.user && <TradeModal initial={trade} onClose={() => setTrade(null)} />}
      </Trade.Provider>
    </Auth.Provider>
  );
}
