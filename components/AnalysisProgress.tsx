"use client";
import { useEffect, useState } from "react";
import type { Stage } from "@/lib/reports/progress";

export interface Run {
  stage: Stage;
  pct: number; // where the server says we are (5, 15, 30, 40, 95)
  message: string;
  model?: string;
  notes: string[]; // model switches, shown in amber
  startedAt: number;
  uploads: boolean; // whether this report is large enough to need an upload step
}

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "checking", label: "Check key" },
  { stage: "downloading", label: "Download" },
  { stage: "uploading", label: "Upload" },
  { stage: "analysing", label: "Read & analyse" },
  { stage: "saving", label: "Save" },
];
const ORDER: Stage[] = ["checking", "downloading", "uploading", "analysing", "saving"];

/**
 * A real progress bar driven by server events. The long "analysing" stage has no intermediate signal from
 * Gemini, so the bar eases toward 92% during it and only reaches 100% when the result actually arrives.
 */
export default function AnalysisProgress({ run }: { run: Run }) {
  const [shown, setShown] = useState(run.pct);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      setShown((s) => {
        const analysing = run.stage === "analysing";
        const ceiling = analysing ? 92 : run.pct;
        if (s >= ceiling) return Math.max(s, run.pct); // never move backwards
        return s + (ceiling - s) * (analysing ? 0.03 : 0.25);
      });
    }, 400);
    return () => clearInterval(t);
  }, [run.stage, run.pct]);

  const elapsed = Math.max(0, Math.round((now - run.startedAt) / 1000));
  const pct = Math.min(99, Math.round(shown));
  const current = ORDER.indexOf(run.stage);
  const steps = STEPS.filter((s) => s.stage !== "uploading" || run.uploads || run.stage === "uploading");

  return (
    <div role="status" aria-live="polite" className="card space-y-3 p-5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{run.message}…</span>
        <span className="money shrink-0 tabular-nums text-muted">{pct}% · {elapsed}s</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#eceef2]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Analysis progress">
        <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {steps.map((s) => {
          const idx = ORDER.indexOf(s.stage);
          const state = idx < current ? "done" : idx === current ? "active" : "todo";
          return (
            <li key={s.stage} className={state === "done" ? "text-gain" : state === "active" ? "font-semibold text-brand" : "text-muted"}>
              {state === "done" ? "✓" : state === "active" ? "●" : "○"} {s.label}
            </li>
          );
        })}
      </ol>
      {run.notes.map((n, i) => <p key={i} className="rounded-lg bg-[#fff4e5] px-3 py-2 text-sm text-warn">{n}</p>)}
      <p className="text-xs text-muted">Long reports can take a minute or more. Please keep this page open.</p>
    </div>
  );
}
