"use client";

import type { AnamnesisQuestion } from "@/lib/api";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value) return [value];
  if (value && typeof value === "object" && "value" in value) {
    const inner = (value as { value?: unknown }).value;
    return asList(inner);
  }
  return [];
}

function asScalar(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value[0] != null ? String(value[0]) : "";
  if (typeof value === "object" && "value" in value) {
    return asScalar((value as { value?: unknown }).value);
  }
  return "";
}

export function QuestionField({
  question,
  value,
  onChange,
}: {
  question: AnamnesisQuestion;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const id = `q-${question.id}`;
  const hintId = question.help_text ? `${id}-hint` : undefined;
  const type = question.type || "text";
  const optional = Boolean(question.optional || (!question.required && type !== "single_choice"));
  const options = question.options ?? [];

  if (type === "single_choice" || type === "single" || type === "scale") {
    return (
      <ChoiceGroup
        name={id}
        legend={question.label}
        hint={question.help_text ?? undefined}
        optional={optional && !question.required}
        options={options}
        value={asScalar(value)}
        onChange={onChange}
        describedBy={hintId}
      />
    );
  }

  if (type === "multi") {
    return (
      <ChoiceGroup
        name={id}
        legend={question.label}
        hint={question.help_text ?? undefined}
        optional={optional}
        multiple
        options={options}
        value={asList(value)}
        onChange={onChange}
        describedBy={hintId}
      />
    );
  }

  if (type === "number") {
    return (
      <TextField
        id={id}
        label={`${question.label}${question.required ? "" : ""}`}
        type="number"
        inputMode="decimal"
        value={asScalar(value)}
        onChange={(e) => onChange(e.target.value)}
        hint={question.help_text ?? undefined}
        placeholder={question.placeholder ?? undefined}
      />
    );
  }

  if (type === "text") {
    return (
      <TextField
        id={id}
        label={question.label}
        value={asScalar(value)}
        onChange={(e) => onChange(e.target.value)}
        hint={question.help_text ?? undefined}
        placeholder={question.placeholder ?? undefined}
      />
    );
  }

  return (
    <TextArea
      id={id}
      label={
        optional && !question.required
          ? `${question.label} (opcional)`
          : question.label
      }
      hint={question.help_text ?? undefined}
      placeholder={question.placeholder ?? undefined}
      value={asScalar(value)}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="min-h-[4.5rem]"
    />
  );
}
