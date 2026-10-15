"use client";
// The user's Gemini API key lives ONLY in this browser (localStorage). It is sent in a request header when the
// user asks for an analysis and is never saved on InvestoCap's servers.
import { useEffect, useState } from "react";

const KEY = "ic_gemini_key";
const MODEL = "ic_gemini_model";
const MODELS = "ic_gemini_models";
const EVENT = "ic-gemini-key-changed";

export interface StoredKey { key: string; model: string | null; models: string[] }

export function readKey(): StoredKey | null {
  try {
    const key = localStorage.getItem(KEY);
    if (!key) return null;
    let models: string[] = [];
    try { models = JSON.parse(localStorage.getItem(MODELS) ?? "[]"); } catch {}
    return { key, model: localStorage.getItem(MODEL), models: Array.isArray(models) ? models : [] };
  } catch {
    return null; // storage blocked (private mode, etc.)
  }
}
export function saveKey(key: string, model: string | null, models: string[] = []) {
  try {
    localStorage.setItem(KEY, key);
    if (model) localStorage.setItem(MODEL, model);
    localStorage.setItem(MODELS, JSON.stringify(models));
    window.dispatchEvent(new Event(EVENT));
  } catch {}
}
export function clearKey() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(MODEL);
    localStorage.removeItem(MODELS);
    window.dispatchEvent(new Event(EVENT));
  } catch {}
}

/** undefined until the browser has been checked (avoids a flash of "no key" on load). */
export function useGeminiKey(): StoredKey | null | undefined {
  const [k, setK] = useState<StoredKey | null | undefined>(undefined);
  useEffect(() => {
    const update = () => setK(readKey());
    update();
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener(EVENT, update); window.removeEventListener("storage", update); };
  }, []);
  return k;
}
