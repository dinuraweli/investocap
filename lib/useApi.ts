"use client";
import { useCallback, useEffect, useRef, useState } from "react";

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

export const apiPost = <T = unknown>(url: string, data: unknown = {}) =>
  request<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
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
