import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    me: {
      organization: { profession_code: "personal_trainer" },
    },
  }),
}));

import { apiFetch } from "@/lib/api";
import { EvaluationEditor } from "@/components/app/evaluation-editor";

describe("EvaluationEditor", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("separates public and private fields and confirms publish", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        id: "e1",
        client_id: "c1",
        author_user_id: "u1",
        title: "Check-in",
        evaluated_from: null,
        evaluated_to: null,
        summary: "Resumo",
        achievements: null,
        attention_points: null,
        next_goals: null,
        client_message: "Olá",
        private_notes: "privado",
        status: "draft",
        published_at: null,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
        criteria: [],
      },
      error: null,
    } as never);

    render(<EvaluationEditor clientId="c1" />);

    expect(screen.getByText(/Visível ao cliente/i)).toBeInTheDocument();
    expect(screen.getByText(/Anotação privada/i)).toBeInTheDocument();
    expect(screen.getByText(/Nunca aparece no portal/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Título$/i), {
      target: { value: "Check-in" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Publicar no portal/i }));
    expect(
      screen.getByText(/ficará disponível no portal Meu Ciclo/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar publicação/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
    const publishCall = vi
      .mocked(apiFetch)
      .mock.calls.find((c) => String(c[0]).includes("/publish"));
    expect(publishCall).toBeTruthy();
  });

  it("allows optional criteria", () => {
    render(<EvaluationEditor clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar critério/i }));
    expect(screen.getByLabelText(/Critério 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Critérios são opcionais/i)).toBeInTheDocument();
  });
});
