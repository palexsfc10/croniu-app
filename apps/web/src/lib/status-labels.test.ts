import { describe, expect, it } from "vitest";
import {
  clientStatusLabel,
  formatPhoneBR,
  journeyStageLabel,
  looksTechnical,
  nextActionLabel,
  protocolStatusLabel,
} from "@/lib/status-labels";

describe("status-labels", () => {
  it("never returns raw technical enums", () => {
    expect(nextActionLabel("continue_onboarding")).toBe("Preparar acompanhamento");
    expect(protocolStatusLabel("draft")).toBe("Rascunho");
    expect(protocolStatusLabel("published")).toBe("Publicado");
    expect(journeyStageLabel("ready_to_start")).toBe("Pronto para iniciar");
    expect(journeyStageLabel("active")).toBe("Em acompanhamento");
    expect(clientStatusLabel("active")).toBe("Ativo");
    expect(looksTechnical("continue_onboarding")).toBe(true);
    expect(looksTechnical("Em acompanhamento")).toBe(false);
  });

  it("formats Brazilian phone numbers", () => {
    expect(formatPhoneBR("11987654321")).toBe("(11) 98765-4321");
  });
});
