import { describe, expect, it } from "vitest";
import { isSensitiveTokenRoute, sanitizeReferrer } from "./sensitive-routes";

describe("isSensitiveTokenRoute", () => {
  it("flags the client portal magic-link entry route", () => {
    expect(isSensitiveTokenRoute("/entrar/abc123.def456")).toBe(true);
  });

  it("flags the client portal route", () => {
    expect(isSensitiveTokenRoute("/c/abc123.def456")).toBe(true);
  });

  it("does not flag ordinary routes", () => {
    expect(isSensitiveTokenRoute("/register")).toBe(false);
    expect(isSensitiveTokenRoute("/app/clients")).toBe(false);
    expect(isSensitiveTokenRoute("/")).toBe(false);
  });

  it("does not false-positive on a route that merely starts with the same letters", () => {
    expect(isSensitiveTokenRoute("/entrarada")).toBe(false);
    expect(isSensitiveTokenRoute("/cycles")).toBe(false);
  });
});

describe("sanitizeReferrer", () => {
  const origin = "https://app.croniu.com.br";

  it("drops a same-origin referrer that carries a portal token", () => {
    expect(sanitizeReferrer("https://app.croniu.com.br/c/eyJhbGciOi", origin)).toBeUndefined();
    expect(sanitizeReferrer("https://app.croniu.com.br/entrar/eyJhbGciOi", origin)).toBeUndefined();
  });

  it("keeps a same-origin referrer for ordinary routes", () => {
    expect(sanitizeReferrer("https://app.croniu.com.br/login", origin)).toBe(
      "https://app.croniu.com.br/login",
    );
  });

  it("keeps a cross-origin referrer untouched (e.g. the institutional site)", () => {
    expect(sanitizeReferrer("https://croniu.com.br/", origin)).toBe("https://croniu.com.br/");
  });

  it("returns undefined for an empty referrer", () => {
    expect(sanitizeReferrer("", origin)).toBeUndefined();
  });
});
