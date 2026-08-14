import { describe, expect, it } from "vitest";
import {
  ageProofValid,
  consentsFromSchema,
  hasAttentionAnswers,
  isQuestionVisible,
  missingRequiredQuestions,
  requiredConsentsAccepted,
  submissionStatusLabel,
} from "@/lib/intake";
import type { AnamnesisSchema } from "@/lib/api";

const schema: AnamnesisSchema = {
  sections: [
    {
      id: "D",
      title: "Saúde",
      questions: [
        {
          id: "d_cardiovascular",
          label: "Cardiovascular",
          type: "single_choice",
          required: true,
          attention: true,
        },
        {
          id: "d_notes",
          label: "Notas",
          type: "text",
          required: false,
        },
      ],
    },
    {
      id: "J",
      title: "Consentimentos",
      questions: [],
      consents: [
        { key: "purpose_science", required: true, label: "Finalidade" },
        { key: "whatsapp_optional", required: false, label: "WhatsApp" },
      ],
    },
  ],
};

describe("intake helpers", () => {
  it("detects attention answers without diagnosing", () => {
    expect(hasAttentionAnswers({ d_cardiovascular: "nao" }, schema)).toBe(false);
    expect(hasAttentionAnswers({ d_cardiovascular: "sim" }, schema)).toBe(true);
    expect(
      hasAttentionAnswers({ d_cardiovascular: { value: "prefiro_detalhar" } }, schema),
    ).toBe(true);
  });

  it("validates required consents and questions", () => {
    expect(requiredConsentsAccepted({ purpose_science: true })).toBe(false);
    expect(
      requiredConsentsAccepted({
        purpose_science: true,
        sensitive_health: true,
        self_declared: true,
        not_medical: true,
        privacy_policy: true,
      }),
    ).toBe(true);
    expect(missingRequiredQuestions({}, schema)).toEqual(["d_cardiovascular"]);
    expect(missingRequiredQuestions({ d_cardiovascular: "nao" }, schema)).toEqual([]);
  });

  it("accepts birth date 18+ or age band confirmation", () => {
    expect(ageProofValid({ ageBand18Plus: true })).toBe(true);
    expect(ageProofValid({ birthDate: "2015-01-01" })).toBe(false);
    expect(ageProofValid({ birthDate: "1990-06-15" })).toBe(true);
  });

  it("reads consents from schema or falls back", () => {
    expect(consentsFromSchema(schema).map((c) => c.key)).toEqual([
      "purpose_science",
      "whatsapp_optional",
    ]);
    expect(consentsFromSchema({}).length).toBeGreaterThanOrEqual(5);
  });

  it("hides complementary questions until Sim", () => {
    const injurySchema: AnamnesisSchema = {
      sections: [
        {
          id: "E",
          title: "Lesões",
          questions: [
            {
              id: "e_prior_injury",
              label: "Você já teve alguma lesão relevante?",
              type: "single_choice",
            },
            {
              id: "e_prior_injury_detail",
              label: "Qual lesão?",
              type: "text",
              visible_if: { question_id: "e_prior_injury", in: ["sim"] },
            },
          ],
        },
      ],
    };
    expect(
      isQuestionVisible(injurySchema.sections![0].questions![1], { e_prior_injury: "nao" }),
    ).toBe(false);
    expect(
      isQuestionVisible(injurySchema.sections![0].questions![1], { e_prior_injury: "sim" }),
    ).toBe(true);
  });

  it("labels submission status in Portuguese", () => {
    expect(submissionStatusLabel("pending_review")).toBe("Aguardando análise");
  });
});
