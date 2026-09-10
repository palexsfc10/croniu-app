import { describe, expect, it } from "vitest";
import { pickTrackedParams } from "./utm";

describe("pickTrackedParams", () => {
  it("keeps only the allowlisted campaign params", () => {
    const picked = pickTrackedParams(
      "?utm_source=instagram&utm_medium=social&next=/app&ref=abc123&gclid=xyz",
    );
    expect(picked).toEqual({ utm_source: "instagram", utm_medium: "social", gclid: "xyz" });
  });

  it("returns an empty object when there is nothing to track", () => {
    expect(pickTrackedParams("")).toEqual({});
    expect(pickTrackedParams("?foo=bar")).toEqual({});
  });
});
