import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { useAdminResource } from "./use-admin-resource";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("read-only admin requests", () => {
  it("does not let an obsolete search overwrite the current results", async () => {
    const resolvers = new Map<string, (value: { data: { name: string }; status: number }) => void>();
    vi.mocked(apiFetch).mockImplementation((path) => new Promise((resolve) => resolvers.set(path, resolve as never)));
    const { result, rerender } = renderHook(({ path }) => useAdminResource<{ name: string }>(path), { initialProps: { path: "/old" } });
    rerender({ path: "/current" });
    await act(async () => resolvers.get("/current")!({ data: { name: "Current" }, status: 200 }));
    expect(result.current.data?.name).toBe("Current");
    await act(async () => resolvers.get("/old")!({ data: { name: "Obsolete" }, status: 200 }));
    expect(result.current.data?.name).toBe("Current");
  });

  it("can recover after a failed request without keeping the old error", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: { name: "Recovered" }, status: 200 });
    const { result } = renderHook(() => useAdminResource<{ name: string }>("/data"));
    await waitFor(() => expect(result.current.error).toContain("conexão"));
    act(() => result.current.refresh());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.data?.name).toBe("Recovered"));
  });
});
