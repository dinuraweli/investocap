"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedAnalysis } from "./api-types.ts";
import { NDJSON, parseNdjson, type ProgressEvent } from "./reports/progress.ts";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const listeners = new Set<() => void>();
/** Refetch every mounted useApi (call after a mutation such as adding a trade). */
export const revalidateAll = () => listeners.forEach((f) => f());

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const apiPost = <T = unknown>(url: string, data: unknown = {}, headers: Record<string, string> = {}) =>
  request<T>(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data) });
/**
 * POST that streams progress events (newline-delimited JSON). Resolves with the finished result. A plain JSON
 * reply (an already-saved analysis, or an up-front error such as "sign in") is handled too.
 */
export async function apiPostStream(url: string, data: unknown, headers: Record<string, string>, onEvent: (e: ProgressEvent) => void): Promise<SavedAnalysis> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: NDJSON, ...headers }, body: JSON.stringify(data) });
  if (!(res.headers.get("content-type") ?? "").includes("ndjson") || !res.body) {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
    return body as SavedAnalysis;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: SavedAnalysis | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseNdjson(buffer);
    buffer = rest;
    for (const e of events) {
      if (e.type === "done") result = e.result;
      else if (e.type === "error") throw new ApiError(e.status, e.message);
      else onEvent(e);
    }
  }
  if (!result) throw new ApiError(0, "The connection dropped before the analysis finished. It may still have been saved, so reload this page in a minute.");
  return result;
}

export const apiDelete = <T = unknown>(url: string) => request<T>(url, { method: "DELETE" });

export function useApi<T>(url: string | null, { refreshMs }: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const mine = ++seq.current;
    try {
      const d = await request<T>(url);
      if (mine === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(e instanceof ApiError ? e : new ApiError(0, "Network error"));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    setData(null);
    setLoading(!!url);
    load();
    listeners.add(load);
    const timer = refreshMs ? setInterval(() => !document.hidden && load(), refreshMs) : undefined;
    return () => {
      listeners.delete(load);
      if (timer) clearInterval(timer);
    };
  }, [url, load, refreshMs]);

  return { data, error, loading, reload: load };
}
