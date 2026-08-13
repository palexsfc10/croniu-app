import { describe, expect, it } from "vitest";
import { authHref, safeAuthNext } from "@/lib/public-entry";

describe("public-entry helpers", () => {
  it("rejects arbitrary redirects", () => {
    expect(safeAuthNext("/forgot-password")).toBeNull();
    expect(safeAuthNext("app/clients")).toBeNull();
    expect(authHref("/login", "/app/agenda")).toContain("next=");
  });
});
