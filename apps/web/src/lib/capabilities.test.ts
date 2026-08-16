import { describe, expect, it } from "vitest";
import { registerExperienceSummary, resolveCapabilities } from "@/lib/capabilities";

describe("capabilities", () => {
  it("uses profession preset then refines with use cases", () => {
    const trainer = resolveCapabilities("personal_trainer", []);
    expect(trainer).toContain("workouts");
    expect(trainer).toContain("cycles");
    const plusAgenda = resolveCapabilities("nutritionist", ["appointments_agenda"]);
    expect(plusAgenda).toContain("sessions");
    expect(plusAgenda).toContain("agenda");
  });

  it("builds distinct summaries for trainer, nutritionist and tutor", () => {
    const trainer = registerExperienceSummary("personal_trainer", ["evaluations"]);
    const nutri = registerExperienceSummary("nutritionist", ["plans_cycles"]);
    const tutor = registerExperienceSummary("private_tutor", ["classes"]);
    expect(trainer.visible).toBe(true);
    expect(nutri.visible).toBe(true);
    expect(tutor.visible).toBe(true);
    expect(trainer.items.map((i) => i.text).join()).not.toBe(nutri.items.map((i) => i.text).join());
    expect(nutri.blurb).toMatch(/Além do preset|Com base/);
  });

  it("hides the card without a profession", () => {
    expect(registerExperienceSummary(null, ["classes"]).visible).toBe(false);
  });
});
