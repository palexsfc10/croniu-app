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
import { apiFetch, type PlatformMe } from "@/lib/api";

type AuthContextValue = {
  me: PlatformMe | null;
  loading: boolean;
  logoutError: string | null;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<PlatformMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setLoading(true);
      try {
        const result = await apiFetch<PlatformMe>("/api/v1/platform/auth/me");
        if (cancelled) return;
        if (result.data) {
          setMe(result.data);
        } else {
          setMe(null);
          router.replace("/login");
        }
      } catch {
        if (!cancelled) {
          setMe(null);
          router.replace("/login");
        }
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
    setLogoutError(null);
    const result = await apiFetch("/api/v1/platform/auth/logout", { method: "POST" });
    if (result.error) {
      setLogoutError("Não foi possível encerrar a sessão. Tente sair novamente.");
      return;
    }
    setMe(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(() => ({ me, loading, logout, logoutError }), [me, loading, logout, logoutError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
