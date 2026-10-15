"use client";
// The user's Gemini API key lives ONLY in this browser (localStorage). It is sent in a request header when the
// user asks for an analysis and is never saved on InvestoCap's servers.
import { useEffect, useState } from "react";

const KEY = "ic_gemini_key";
const MODEL = "ic_gemini_model";
const EVENT = "ic-gemini-key-changed";

export interface StoredKey { key: string; model: string | null }

export function readKey(): StoredKey | null {
  try {
    const key = localStorage.getItem(KEY);
    return key ? { key, model: localStorage.getItem(MODEL) } : null;
  } catch {
    return null; // storage blocked (private mode, etc.)
  }
}
export function saveKey(key: string, model: string | null) {
  try {
    localStorage.setItem(KEY, key);
    if (model) localStorage.setItem(MODEL, model);
    window.dispatchEvent(new Event(EVENT));
  } catch {}
}
export function clearKey() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(MODEL);
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
