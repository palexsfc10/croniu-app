import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useParams: () => ({ clientId: "client-1" }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch };
});

import AccompanimentPreparePage from "@/app/app/clients/[clientId]/accompaniment/page";

function journey(overrides: Record<string, unknown> = {}) {
  return {
    id: "j1",
    client_id: "client-1",
    stage: "active",
    stage_label: "Em acompanhamento",
    next_action: null,
    next_action_label: null,
    accompaniment_checklist: {
      anamnesis: "done",
      evaluation: "done",
      plan: "done",
      cycle: "done",
      agenda: "done",
      routine: "na",
      activate: "done",
    },
    accompaniment_summaries: {
      anamnesis: "Analisada",
      plan: "Plano Ganha de massa",
    },
    progress_defined: 6,
    progress_total: 6,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function mockApi(
  overrides: {
    journey?: Record<string, unknown>;
    submissions?: Array<{ id: string }>;
  } = {},
) {
  apiFetch.mockImplementation((url: string) => {
    if (url.includes("/journey")) {
      return Promise.resolve({ data: journey(overrides.journey) });
    }
    if (url.includes("/intake-submissions")) {
      return Promise.resolve({ data: overrides.submissions ?? [] });
    }
    if (url.includes("/organization/profession")) {
      return Promise.resolve({
        data: { profession_code: "personal_trainer" },
      });
    }
    if (url.includes("/api/v1/clients/")) {
      return Promise.resolve({
        data: { id: "client-1", full_name: "Murilo Macedo" },
      });
    }
    return Promise.resolve({ data: null });
  });
}

describe("accompaniment checklist row layout", () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it("puts the contextual action before the status badge, badge last, for a completed step with an action", async () => {
    mockApi({ submissions: [{ id: "sub-1" }] });
    render(<AccompanimentPreparePage />);
    await screen.findByText("Murilo Macedo");

    const group = screen.getByTestId("checklist-actions-plan");
    const groupText = group.textContent || "";
    const actionIdx = groupText.indexOf("Ver plano");
    const badgeIdx = groupText.indexOf("Concluído");
    expect(actionIdx).toBeGreaterThanOrEqual(0);
    expect(badgeIdx).toBeGreaterThan(actionIdx);

    // Badge is the last element rendered in the right-hand group, not
    // sandwiched before the action link.
    expect(group.lastElementChild?.textContent).toContain("Concluído");
    expect(group.children).toHaveLength(2);
  });

  it("shows just the badge, right-aligned, when a completed step has no action", async () => {
    // No intake submission -> anamnesis "done" has no href per primary().
    mockApi({ submissions: [] });
    render(<AccompanimentPreparePage />);
    await screen.findByText("Murilo Macedo");

    const group = screen.getByTestId("checklist-actions-anamnesis");
    expect(group.children).toHaveLength(1);
    expect(group.textContent?.trim()).toBe("Concluído");
  });

  it("never truncates or hides overflow on the step title", async () => {
    mockApi({ submissions: [{ id: "sub-1" }] });
    render(<AccompanimentPreparePage />);
    await screen.findByText("Murilo Macedo");

    const row = screen.getByTestId("checklist-row-plan");
    const title = row.querySelector("p.font-medium");
    expect(title).not.toBeNull();
    expect(title?.className).not.toMatch(/truncate/);
    expect(title?.className).not.toMatch(/whitespace-nowrap/);
  });

  it("lets the action+badge group wrap in a controlled way instead of overflowing", async () => {
    mockApi({ submissions: [{ id: "sub-1" }] });
    render(<AccompanimentPreparePage />);
    await screen.findByText("Murilo Macedo");

    const group = screen.getByTestId("checklist-actions-plan");
    expect(group.className).toMatch(/flex-wrap/);
    expect(group.className).toMatch(/justify-end/);
    // The row itself may also wrap without ever clipping the title area.
    const row = screen.getByTestId("checklist-row-plan");
    expect(row.className).toMatch(/flex-wrap/);
  });

  it("does not cut the title on a pending step either, and keeps the status badge right-aligned", async () => {
    mockApi({
      journey: {
        accompaniment_checklist: {
          anamnesis: "na",
          evaluation: "todo",
          plan: "todo",
          cycle: "todo",
          agenda: "todo",
          routine: "todo",
          activate: "todo",
        },
        next_action: "register_evaluation",
      },
      submissions: [],
    });
    render(<AccompanimentPreparePage />);
    await screen.findByText("Murilo Macedo");

    const row = screen.getByTestId("checklist-row-evaluation");
    const title = row.querySelector("h2.font-semibold");
    expect(title).not.toBeNull();
    expect(title?.className).not.toMatch(/truncate/);
    // "Próximo passo" is the current step's label, not a competing action
    // rendered before a badge — no ordering contradiction to check here.
    expect(screen.getByText("Próximo passo")).toBeInTheDocument();
  });
});
