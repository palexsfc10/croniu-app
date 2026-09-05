"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/** Read-only requests: abort obsolete searches and never show results from an older query. */
export function useAdminResource<T>(path: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({
    key: "", data: null, error: null,
  });
  const key = `${revision}:${path}`;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await apiFetch<T>(path, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setState({ key, data: result.data ?? null, error: result.error?.message ?? null });
      } catch {
        if (!controller.signal.aborted) {
          setState({ key, data: null, error: "Não foi possível carregar os dados. Verifique sua conexão e tente novamente." });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [path, key]);

  return { data: state.key === key ? state.data : null, error: state.key === key ? state.error : null, loading: state.key !== key, refresh };
}
