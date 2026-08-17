import { describe, expect, it } from "vitest";
import { portalWhatsAppMessage, whatsappShareHref } from "@/lib/whatsapp-share";

describe("whatsappShareHref", () => {
  it("does not duplicate country code 55", () => {
    const href = whatsappShareHref("5511999999999", "olá https://x/c/v1.a");
    expect(href).toBe(
      "https://wa.me/5511999999999?text=" + encodeURIComponent("olá https://x/c/v1.a"),
    );
  });

  it("prefixes local BR numbers", () => {
    expect(whatsappShareHref("11988887777", "msg")).toContain("https://wa.me/5511988887777?");
  });

  it("opens the selector when there is no phone", () => {
    expect(whatsappShareHref(null, "msg")).toBe(
      "https://wa.me/?text=" + encodeURIComponent("msg"),
    );
  });
});

describe("portalWhatsAppMessage", () => {
  it("always includes the public URL", () => {
    const text = portalWhatsAppMessage("Renata", "https://app/c/v1.abc");
    expect(text).toContain("https://app/c/v1.abc");
    expect(text).toContain("Renata");
  });
});
