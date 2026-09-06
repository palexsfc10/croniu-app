import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetClientProfileCacheForTests,
  clearAllClientProfileSnapshots,
  getClientProfileSnapshot,
  invalidateClientProfileSnapshot,
  setClientProfileSnapshot,
  type ClientProfileSnapshot,
} from "@/lib/client-profile-cache";

function fakeSnapshot(name: string): ClientProfileSnapshot {
  return {
    // Only `item.full_name` is asserted on below — the rest are cheap,
    // type-correct filler values, not meaningful to any test here.
    item: { id: "c", full_name: name, status: "active" } as ClientProfileSnapshot["item"],
    access: null,
    journey: null,
    protocols: [],
    cycles: [],
    todayIso: "2026-01-01",
    evaluations: [],
    routinePendingCount: null,
    routineOverdueCount: 0,
    submissionId: null,
    appointments: [],
    receivables: [],
    renewalCases: [],
  };
}

describe("client-profile-cache", () => {
  beforeEach(() => {
    __resetClientProfileCacheForTests();
  });

  it("returns nothing for a client never cached under this scope", () => {
    expect(getClientProfileSnapshot("org-1:user-1", "c1")).toBeUndefined();
  });

  it("returns what was set under the same scope", () => {
    setClientProfileSnapshot("org-1:user-1", "c1", fakeSnapshot("Pedro"));
    expect(getClientProfileSnapshot("org-1:user-1", "c1")?.item.full_name).toBe("Pedro");
  });

  it("never returns a snapshot written under a different scope — different user, same org", () => {
    setClientProfileSnapshot("org-1:user-1", "c1", fakeSnapshot("Pedro"));
    expect(getClientProfileSnapshot("org-1:user-2", "c1")).toBeUndefined();
  });

  it("never returns a snapshot written under a different scope — different org, same user", () => {
    setClientProfileSnapshot("org-1:user-1", "c1", fakeSnapshot("Pedro"));
    expect(getClientProfileSnapshot("org-2:user-1", "c1")).toBeUndefined();
  });

  it("switching scope discards everything, even entries for a clientId that would otherwise still match", () => {
    setClientProfileSnapshot("org-1:user-1", "c1", fakeSnapshot("Pedro"));
    // Simulate: logout, then a second person logs into the same tab and
    // happens to open a client that shares the same id string.
    getClientProfileSnapshot("org-2:user-2", "c1");
    // Switching back to the original scope must NOT resurrect the old
    // entry either — the whole store was thrown away, not swapped.
    expect(getClientProfileSnapshot("org-1:user-1", "c1")).toBeUndefined();
  });

  it("clearAllClientProfileSnapshots wipes the store immediately, regardless of scope", () => {
    setClientProfileSnapshot("org-1:user-1", "c1", fakeSnapshot("Pedro"));
    clearAllClientProfileSnapshots();
    expect(getClientProfileSnapshot("org-1:user-1", "c1")).toBeUndefined();
  });

  it("invalidateClientProfileSnapshot drops just that one client, not the whole scope", () => {
    setClientProfileSnapshot("org-1:user-1", "c1", fakeSnapshot("Pedro"));
    setClientProfileSnapshot("org-1:user-1", "c2", fakeSnapshot("Ana"));
    invalidateClientProfileSnapshot("org-1:user-1", "c1");
    expect(getClientProfileSnapshot("org-1:user-1", "c1")).toBeUndefined();
    expect(getClientProfileSnapshot("org-1:user-1", "c2")?.item.full_name).toBe("Ana");
  });

  it("evicts the least-recently-used entry once the cache exceeds its cap", () => {
    const scope = "org-1:user-1";
    // MAX_ENTRIES is 20 — fill it exactly, then push one more.
    for (let i = 0; i < 20; i += 1) {
      setClientProfileSnapshot(scope, `c${i}`, fakeSnapshot(`Client ${i}`));
    }

    setClientProfileSnapshot(scope, "c20", fakeSnapshot("Client 20"));

    // c0 was the oldest and untouched since — evicted to make room.
    expect(getClientProfileSnapshot(scope, "c0")).toBeUndefined();
    // Everything else, including the newest, survives.
    expect(getClientProfileSnapshot(scope, "c1")?.item.full_name).toBe("Client 1");
    expect(getClientProfileSnapshot(scope, "c20")?.item.full_name).toBe("Client 20");
  });

  it("reading an entry counts as using it, so it survives being the least-recently-SET once something else is evicted", () => {
    const scope = "org-1:user-1";
    for (let i = 0; i < 20; i += 1) {
      setClientProfileSnapshot(scope, `c${i}`, fakeSnapshot(`Client ${i}`));
    }
    // Touch c0 (the otherwise-oldest) right before the cache overflows.
    getClientProfileSnapshot(scope, "c0");
    setClientProfileSnapshot(scope, "c20", fakeSnapshot("Client 20"));

    // c1 is now the least-recently-used one (never re-read), not c0.
    expect(getClientProfileSnapshot(scope, "c0")?.item.full_name).toBe("Client 0");
    expect(getClientProfileSnapshot(scope, "c1")).toBeUndefined();
  });
});
