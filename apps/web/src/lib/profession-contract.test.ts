import { describe, expect, it } from "vitest";
import {
  PROFESSION_OPTIONS,
  SPORTS_SPECIALTIES,
  TUTOR_SPECIALTIES,
  USE_CASE_OPTIONS,
} from "@/lib/nomenclature";

/** Must stay equal to backend/app/services/profession.py catalogs. */
const BACKEND_PROFESSIONS = [
  "personal_trainer",
  "private_tutor",
  "sports_teacher",
  "physiotherapist",
  "nutritionist",
  "therapist",
  "consultant",
  "coach_mentor",
  "aesthetics",
  "other",
] as const;

const BACKEND_USE_CASES = [
  "appointments_agenda",
  "classes",
  "workouts",
  "evaluations",
  "plans_cycles",
  "protocols",
  "periodic_feedback",
  "consulting",
  "other",
] as const;

describe("profession contract", () => {
  it("web profession codes match the backend catalog", () => {
    expect(PROFESSION_OPTIONS.map((o) => o.code)).toEqual([...BACKEND_PROFESSIONS]);
  });

  it("web use-case codes match the backend catalog", () => {
    expect(USE_CASE_OPTIONS.map((o) => o.code)).toEqual([...BACKEND_USE_CASES]);
  });

  it("specialty catalogs use codes not labels", () => {
    expect(SPORTS_SPECIALTIES.map((o) => o.code)).not.toContain("Musculação");
    expect(TUTOR_SPECIALTIES.map((o) => o.code)).toContain("idiomas");
  });
});
