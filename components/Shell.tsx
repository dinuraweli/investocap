import Link from "next/link";
import TopNav from "./TopNav";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1440px] p-0 sm:p-4 lg:p-6">
      <div className="min-h-[calc(100vh-3rem)] overflow-hidden bg-subtle sm:rounded-[28px] sm:shadow-[0_30px_80px_-30px_rgba(18,20,29,0.25)]">
        <TopNav />
        <main className="p-4 sm:p-5">{children}</main>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 pb-5 text-center text-xs text-muted">
          <span>Prices come from the Colombo Stock Exchange and may be delayed. For information only, not investment advice.</span>
          <Link href="/changelog" className="shrink-0 font-medium text-brand hover:underline">What&apos;s new</Link>
        </div>
      </div>
    </div>
  );
}
