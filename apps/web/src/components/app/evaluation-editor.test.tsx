import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

    // Both appear twice now — once as the section heading, once as the
    // desktop side nav's quick-jump link to that same section.
    expect(screen.getByRole("heading", { name: /Visível ao cliente/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Anotação privada/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Nunca aparece no portal/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Título$/i), {
      target: { value: "Check-in" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Publicar no portal/i }));
    expect(
      screen.getByText(/ficará disponível na Área do cliente/i),
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

  it("offers a section quick-jump nav (desktop) and a collapsible portal preview (mobile), instead of one long undifferentiated scroll", () => {
    render(<EvaluationEditor clientId="c1" />);
    const nav = screen.getByRole("navigation", { name: "Seções" });
    expect(within(nav).getByRole("link", { name: "Visível ao cliente" })).toHaveAttribute(
      "href",
      "#eval-section-publico",
    );
    expect(within(nav).getByRole("link", { name: "Critérios" })).toHaveAttribute(
      "href",
      "#eval-section-criterios",
    );
    expect(within(nav).getByRole("link", { name: "Anotação privada" })).toHaveAttribute(
      "href",
      "#eval-section-privado",
    );
    expect(screen.getByText("Ver prévia do portal")).toBeInTheDocument();
  });

  it("allows optional criteria", () => {
    render(<EvaluationEditor clientId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar critério/i }));
    expect(screen.getByLabelText(/Critério 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Critérios são opcionais/i)).toBeInTheDocument();
  });

  it("without returnTo (normal create/edit workflow): publishing never navigates away", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        id: "e1",
        client_id: "c1",
        author_user_id: "u1",
        title: "Check-in",
        evaluated_from: null,
        evaluated_to: null,
        summary: null,
        achievements: null,
        attention_points: null,
        next_goals: null,
        client_message: null,
        private_notes: null,
        status: "published",
        published_at: "2026-08-24T00:00:00Z",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
        criteria: [],
      },
      error: null,
    } as never);

    render(<EvaluationEditor clientId="c1" />);
    fireEvent.change(screen.getByLabelText(/^Título$/i), { target: { value: "Check-in" } });
    fireEvent.click(screen.getByRole("button", { name: /Publicar no portal/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar publicação/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
    // The only navigation is saveDraft's existing "new" → "/evaluations/{id}"
    // URL swap — publishing itself must not add a second, returnTo-driven one.
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/app/clients/c1/evaluations/e1");
    // No occurrence context — the routines /decide endpoint must never fire.
    expect(
      vi.mocked(apiFetch).mock.calls.some((c) => String(c[0]).includes("/decide")),
    ).toBe(false);
  });

  it("opened from the 'Realizar avaliação' card (returnTo + occurrenceId): publishing completes the routine pendency and returns", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        id: "e2",
        client_id: "c1",
        author_user_id: "u1",
        title: "Avaliação",
        evaluated_from: null,
        evaluated_to: null,
        summary: null,
        achievements: null,
        attention_points: null,
        next_goals: null,
        client_message: null,
        private_notes: null,
        status: "published",
        published_at: "2026-08-24T00:00:00Z",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
        criteria: [],
      },
      error: null,
    } as never);
    sessionStorage.removeItem("croniu.evaluation-saved-celebrate");

    render(
      <EvaluationEditor clientId="c1" returnTo="/app" occurrenceId="occ-1" />,
    );
    fireEvent.change(screen.getByLabelText(/^Título$/i), { target: { value: "Avaliação" } });
    fireEvent.click(screen.getByRole("button", { name: /Publicar no portal/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar publicação/i }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/app");
    });
    const decideCall = vi
      .mocked(apiFetch)
      .mock.calls.find((c) => String(c[0]).includes("/routines/occurrences/occ-1/decide"));
    expect(decideCall).toBeTruthy();
    expect(JSON.parse(String(decideCall?.[1]?.body))).toEqual({ status: "completed" });
    expect(sessionStorage.getItem("croniu.evaluation-saved-celebrate")).toBe("1");
  });

  it("returnTo without occurrenceId (e.g. accompaniment 'Registrar agora'): returns without calling /decide", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        id: "e3",
        client_id: "c1",
        author_user_id: "u1",
        title: "Avaliação",
        evaluated_from: null,
        evaluated_to: null,
        summary: null,
        achievements: null,
        attention_points: null,
        next_goals: null,
        client_message: null,
        private_notes: null,
        status: "published",
        published_at: "2026-08-24T00:00:00Z",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
        criteria: [],
      },
      error: null,
    } as never);

    render(<EvaluationEditor clientId="c1" returnTo="/app/clients/c1/accompaniment" />);
    fireEvent.change(screen.getByLabelText(/^Título$/i), { target: { value: "Avaliação" } });
    fireEvent.click(screen.getByRole("button", { name: /Publicar no portal/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar publicação/i }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/app/clients/c1/accompaniment");
    });
    expect(
      vi.mocked(apiFetch).mock.calls.some((c) => String(c[0]).includes("/decide")),
    ).toBe(false);
  });
});
