"use client";
import AuthForm from "./AuthForm";
import { useAuth } from "./Providers";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="card h-64 animate-pulse" />;
  if (!user) return <AuthForm />;
  return <>{children}</>;
}
