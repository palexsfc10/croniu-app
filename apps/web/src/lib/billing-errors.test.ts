import { describe, expect, it } from "vitest";
import {
  CHECKOUT_TEMPORARY_ERROR,
  isAllowedAsaasCheckoutUrl,
  sanitizeBillingErrorMessage,
} from "./billing-errors";

describe("sanitizeBillingErrorMessage", () => {
  it("replaces Cloudflare English HTML/text with a friendly PT message", () => {
    const raw =
      "The origin web server returned an invalid or incomplete response to Cloudflare. This typically indicates the origin is overloaded or misconfigured.";
    expect(sanitizeBillingErrorMessage(raw)).toBe(CHECKOUT_TEMPORARY_ERROR);
  });

  it("replaces HTML bodies", () => {
    expect(sanitizeBillingErrorMessage("<html><body>Error 502</body></html>")).toBe(
      CHECKOUT_TEMPORARY_ERROR,
    );
  });

  it("keeps short Portuguese product messages", () => {
    expect(
      sanitizeBillingErrorMessage(
        "Não foi possível abrir o checkout agora. Aguarde alguns instantes e tente novamente.",
      ),
    ).toContain("checkout");
  });
});

describe("isAllowedAsaasCheckoutUrl", () => {
  it("accepts https Asaas hosts only", () => {
    expect(isAllowedAsaasCheckoutUrl("https://asaas.com/checkout/xyz")).toBe(true);
    expect(isAllowedAsaasCheckoutUrl("https://sandbox.asaas.com/c/1")).toBe(true);
    expect(isAllowedAsaasCheckoutUrl("http://asaas.com/c/1")).toBe(false);
    expect(isAllowedAsaasCheckoutUrl("https://evil.example/phish")).toBe(false);
    expect(isAllowedAsaasCheckoutUrl("javascript:alert(1)")).toBe(false);
  });
});
