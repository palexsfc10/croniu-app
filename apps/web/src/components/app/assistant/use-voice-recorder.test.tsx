import { describe, expect, it } from "vitest";
import { mapMediaError } from "@/components/app/assistant/use-voice-recorder";

describe("mapMediaError", () => {
  it("maps insecure context before exception name", () => {
    expect(
      mapMediaError(new DOMException("denied", "NotAllowedError"), {
        insecureContext: true,
      }),
    ).toMatch(/HTTPS/);
  });

  it("maps NotAllowedError without implying settings only", () => {
    const msg = mapMediaError(new DOMException("Permission denied", "NotAllowedError"));
    expect(msg).toMatch(/bloqueado/i);
    expect(msg).not.toMatch(/Libere a permissão nas configurações/);
  });

  it("maps NotFoundError, NotReadableError, OverconstrainedError, AbortError, SecurityError", () => {
    expect(mapMediaError(new DOMException("", "NotFoundError"))).toMatch(/Nenhum microfone/);
    expect(mapMediaError(new DOMException("", "NotReadableError"))).toMatch(/ocupado/);
    expect(mapMediaError(new DOMException("", "OverconstrainedError"))).toMatch(/compatível/);
    expect(mapMediaError(new DOMException("", "AbortError"))).toMatch(/interrompida/);
    expect(mapMediaError(new DOMException("", "SecurityError"))).toMatch(/política de segurança/);
  });

  it("never surfaces DOMException details", () => {
    const msg = mapMediaError(
      new DOMException("Permission denied by Permissions Policy", "NotAllowedError"),
    );
    expect(msg).not.toMatch(/Permissions Policy/i);
    expect(msg).not.toMatch(/DOMException/);
  });
});
