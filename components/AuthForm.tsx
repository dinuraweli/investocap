"use client";
import { useState } from "react";
import { apiPost, revalidateAll } from "@/lib/useApi";
import { useAuth } from "./Providers";

export default function AuthForm() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const f = new FormData(e.currentTarget);
    try {
      const r = await apiPost<{ needsConfirmation?: boolean }>(`/api/auth/${mode}`, { email: f.get("email"), password: f.get("password"), ...(mode === "register" ? { name: f.get("name") } : {}) });
      if (r.needsConfirmation) {
        setNotice("Almost there! We sent a confirmation link to your email. Click it, then come back and sign in.");
        setMode("login");
        return;
      }
      refresh();
      revalidateAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";
  return (
    <div className="mx-auto w-full max-w-md py-10">
      <form onSubmit={submit} className="card space-y-4 p-6 sm:p-8">
        <div>
          <h1 className="text-xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-muted">Track your Colombo Stock Exchange portfolio with delayed live prices.</p>
        </div>
        {mode === "register" && <input name="name" required maxLength={80} placeholder="Your name" autoComplete="name" className={input} />}
        <input name="email" type="email" required placeholder="Email" autoComplete="email" className={input} />
        <input name="password" type="password" required minLength={mode === "register" ? 8 : 1} placeholder={mode === "register" ? "Password (8+ characters)" : "Password"} autoComplete={mode === "login" ? "current-password" : "new-password"} className={input} />
        {notice && <p role="status" className="rounded-lg bg-gain-soft px-3 py-2 text-sm text-gain">{notice}</p>}
        {error && <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p>}
        <button disabled={busy} className="h-11 w-full rounded-xl bg-brand text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <p className="text-center text-sm text-muted">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }} className="font-medium text-brand hover:underline">
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </form>
    </div>
  );
}
