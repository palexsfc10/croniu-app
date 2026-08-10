"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { apiFetch, type MeResponse } from "@/lib/api";

type AuthContextValue = {
  me: MeResponse | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await apiFetch<MeResponse>("/api/v1/auth/me");
    if (result.data) {
      setMe(result.data);
    } else {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setLoading(true);
      try {
        const result = await apiFetch<MeResponse>("/api/v1/auth/me");
        if (cancelled) return;
        if (result.data) {
          setMe(result.data);
        } else {
          setMe(null);
          router.replace("/login");
        }
      } catch {
        if (cancelled) return;
        setMe(null);
        router.replace("/login");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = useCallback(async () => {
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
    setMe(null);
    router.replace("/login");
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({ me, loading, refresh, logout }),
    [me, loading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
