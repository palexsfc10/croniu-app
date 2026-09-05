"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Paginated } from "@/lib/api";
import { useAdminResource } from "@/lib/use-admin-resource";

export function useDirectory<T>(route: "/organizations" | "/users") {
  const router = useRouter();
  const params = useSearchParams();
  const rawSearch = (params.get("search") ?? "").trim().slice(0, 100);
  const query = rawSearch.length >= 2 ? rawSearch : "";
  const rawPage = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 1000000 ? rawPage : 1;
  const size = params.get("size") === "50" ? 50 : 20;
  const apiParams = new URLSearchParams({ page: String(page), page_size: String(size) });
  if (query) apiParams.set("search", query);
  const resource = useAdminResource<Paginated<T>>(`/api/v1/platform${route}?${apiParams}`);

  function navigate(next: { search?: string; page?: number; size?: number }) {
    const nextParams = new URLSearchParams();
    const search = (next.search ?? query).trim();
    if (search.length >= 2) nextParams.set("search", search.slice(0, 100));
    if ((next.page ?? 1) > 1) nextParams.set("page", String(next.page));
    if ((next.size ?? size) !== 20) nextParams.set("size", String(next.size ?? size));
    router.push(`${route}${nextParams.size ? `?${nextParams}` : ""}`, { scroll: false });
  }

  return { ...resource, query, page, size, navigate };
}
