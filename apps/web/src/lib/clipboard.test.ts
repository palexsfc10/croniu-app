import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "@/lib/clipboard";

describe("copyTextToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("uses navigator.clipboard.writeText in a secure context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyTextToClipboard("https://app.example/c/v1.abc")).resolves.toEqual({
      ok: true,
    });
    expect(writeText).toHaveBeenCalledWith("https://app.example/c/v1.abc");
  });

  it("falls back to execCommand when clipboard rejects", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const exec = vi.fn().mockReturnValue(true);
    document.execCommand = exec;
    await expect(copyTextToClipboard("https://app.example/c/v1.abc")).resolves.toEqual({
      ok: true,
    });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns error when both clipboard and fallback fail", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    vi.stubGlobal("navigator", { clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(false);
    await expect(copyTextToClipboard("https://app.example/c/v1.abc")).resolves.toEqual({
      ok: false,
      error: "copy_failed",
    });
  });
});
