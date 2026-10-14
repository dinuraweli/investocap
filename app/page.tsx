"use client";
import { useState } from "react";
import AllocationCard from "@/components/AllocationCard";
import ImportModal from "@/components/ImportModal";
import HoldingsTable from "@/components/HoldingsTable";
import MarketSnapshotCard from "@/components/MarketSnapshotCard";
import PerformanceCard from "@/components/PerformanceCard";
import PortfolioValueCard from "@/components/PortfolioValueCard";
import RequireAuth from "@/components/RequireAuth";
import { ErrorNote, StaleBanner } from "@/components/ui";
import type { MarketResponse, PortfolioResponse } from "@/lib/api-types";
import { useApi } from "@/lib/useApi";

function Dashboard() {
  const portfolio = useApi<PortfolioResponse>("/api/portfolio", { refreshMs: 15000 });
  const market = useApi<MarketResponse>("/api/market", { refreshMs: 15000 });
  const [importing, setImporting] = useState(false);
  return (
    <div className="space-y-4">
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {portfolio.error && <ErrorNote message={portfolio.error.message} onRetry={portfolio.reload} />}
      <StaleBanner stale={portfolio.data?.stale || market.data?.stale} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <PortfolioValueCard portfolio={portfolio.data} market={market.data} onImport={() => setImporting(true)} />
          <HoldingsTable holdings={portfolio.data?.holdings ?? null} onImport={() => setImporting(true)} />
        </div>
        <div className="space-y-4">
          <MarketSnapshotCard market={market.data} />
          <AllocationCard portfolio={portfolio.data} />
          <PerformanceCard portfolio={portfolio.data} />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return <RequireAuth><Dashboard /></RequireAuth>;
}
